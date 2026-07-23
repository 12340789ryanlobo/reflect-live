import Foundation
import Observation
import Supabase

enum Role: String, Codable {
    case athlete, captain, coach

    /// UI label — a team creator is a "Manager", not necessarily a coach.
    var displayName: String {
        switch self {
        case .athlete: "Athlete"
        case .captain: "Captain"
        case .coach: "Manager"
        }
    }

    var managesTeam: Bool { self == .coach }
}

/// The resolved active membership driving the whole signed-in experience.
struct ActiveMembership: Hashable {
    let teamId: Int
    let teamName: String
    let role: Role
    let playerId: Int?
}

enum SessionPhase {
    case loading
    case signedOut
    case needsTeam                       // signed in, no membership yet
    case pendingApproval(teamId: Int)    // join requested, awaiting a manager
    case ready(ActiveMembership)
}

/// Owns auth state and membership resolution. Mirrors the resolution order the
/// web dashboard used: active membership (prefer default_team) → requested →
/// none. All views read `phase` and call `refresh()` after membership writes.
@MainActor
@Observable
final class SessionController {
    private(set) var phase: SessionPhase = .loading
    private(set) var userId: String?
    private(set) var userEmail: String?

    /// Team code captured from a reflect://join?code=… link, consumed by onboarding.
    private(set) var pendingJoinCode: String?
    private(set) var joinedViaLink = false

    /// Manager-only preview: when set, the shell renders the athlete
    /// experience embodying this player. Writes still work — the coach
    /// RLS policies allow logging on any teammate's behalf.
    var previewPlayer: Player?

    /// The membership the shell should render: the real one, or an athlete
    /// stand-in while a manager previews a player's experience.
    func effectiveMembership(_ membership: ActiveMembership) -> ActiveMembership {
        guard membership.role.managesTeam, let player = previewPlayer else { return membership }
        return ActiveMembership(
            teamId: membership.teamId,
            teamName: membership.teamName,
            role: .athlete,
            playerId: player.id
        )
    }

    func start() async {
        for await change in SupabaseService.client.auth.authStateChanges {
            switch change.event {
            case .initialSession, .signedIn:
                if let session = change.session {
                    // RLS compares against auth.uid()::text, which is lowercase.
                    userId = session.user.id.uuidString.lowercased()
                    userEmail = session.user.email
                    await refresh()
                } else {
                    phase = .signedOut
                }
            case .signedOut:
                userId = nil
                userEmail = nil
                phase = .signedOut
            default:
                break
            }
        }
    }

    func refresh() async {
        guard let userId else {
            phase = .signedOut
            return
        }
        do {
            let rows: [MembershipRow] = try await SupabaseService.client
                .from("team_memberships")
                .select("team_id, role, status, player_id, default_team, teams(name)")
                .eq("user_id", value: userId)
                .execute()
                .value

            let active = rows.filter { $0.status == "active" }
            if let membership = active.first(where: \.defaultTeam) ?? active.first {
                phase = .ready(ActiveMembership(
                    teamId: membership.teamId,
                    teamName: membership.teams?.name ?? "Your Team",
                    role: Role(rawValue: membership.role) ?? .athlete,
                    playerId: membership.playerId
                ))
            } else if let requested = rows.first(where: { $0.status == "requested" }) {
                phase = .pendingApproval(teamId: requested.teamId)
            } else {
                phase = .needsTeam
            }
        } catch {
            // Leave the last phase in place on transient errors, unless we
            // never resolved one — then fall back to needsTeam so the user
            // isn't stuck on a spinner.
            if case .loading = phase { phase = .needsTeam }
        }
    }

    func signOut() async {
        try? await SupabaseService.client.auth.signOut()
    }

    // MARK: - Invite deep links

    func handleDeepLink(_ url: URL) {
        guard url.scheme == AppConfig.urlScheme, url.host() == "join" else { return }
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        guard let code = components?.queryItems?.first(where: { $0.name == "code" })?.value,
              !code.isEmpty else { return }
        pendingJoinCode = code
        joinedViaLink = true
    }

    func consumeJoinCode() -> (code: String, viaLink: Bool)? {
        guard let code = pendingJoinCode else { return nil }
        pendingJoinCode = nil
        let viaLink = joinedViaLink
        joinedViaLink = false
        return (code, viaLink)
    }

    private struct MembershipRow: Decodable {
        let teamId: Int
        let role: String
        let status: String
        let playerId: Int?
        let defaultTeam: Bool
        let teams: TeamRef?

        struct TeamRef: Decodable {
            let name: String
        }

        enum CodingKeys: String, CodingKey {
            case role, status, teams
            case teamId = "team_id"
            case playerId = "player_id"
            case defaultTeam = "default_team"
        }
    }
}
