import Foundation
import Observation
import Supabase

/// Manager console: pending join requests + roster. Approval is a two-step
/// client write under the 0037 policies: create the players row, then flip
/// the membership to active with the player linked.
@MainActor
@Observable
final class RosterModel {
    struct Content {
        var requests: [JoinRequest]
        var players: [Player]
    }

    let membership: ActiveMembership
    private(set) var state: LoadState<Content> = .idle
    private(set) var errorMessage: String?

    init(membership: ActiveMembership) {
        self.membership = membership
    }

    func load() async {
        if state.value == nil { state = .loading }
        do {
            async let requestsFetch: [JoinRequest] = SupabaseService.client
                .from("team_memberships")
                .select("user_id, team_id, requested_name, requested_email, requested_at")
                .eq("team_id", value: membership.teamId)
                .eq("status", value: "requested")
                .order("requested_at", ascending: false)
                .execute()
                .value
            async let playersFetch: [Player] = SupabaseService.client
                .from("players")
                .select("id, team_id, name, group, active")
                .eq("team_id", value: membership.teamId)
                .eq("active", value: true)
                .order("name")
                .execute()
                .value

            let (requests, players) = try await (requestsFetch, playersFetch)
            state = .loaded(Content(requests: requests, players: players))
        } catch {
            if state.value == nil { state = .failed(error.localizedDescription) }
        }
    }

    func approve(_ request: JoinRequest, deciderUserId: String) async {
        struct NewPlayer: Encodable {
            let team_id: Int
            let name: String
            let phone_e164: String
            let active: Bool
        }
        nonisolated struct PlayerId: Decodable { let id: Int }
        struct Approval: Encodable {
            let status: String
            let player_id: Int
            let decided_at: String
            let decided_by: String
        }
        errorMessage = nil
        do {
            let created: PlayerId = try await SupabaseService.client
                .from("players")
                .insert(NewPlayer(
                    team_id: request.teamId,
                    name: request.requestedName ?? "New Athlete",
                    phone_e164: "",
                    active: true
                ), returning: .representation)
                .select("id")
                .single()
                .execute()
                .value

            try await SupabaseService.client
                .from("team_memberships")
                .update(Approval(
                    status: "active",
                    player_id: created.id,
                    decided_at: SupabaseService.timestamp(.now),
                    decided_by: deciderUserId
                ))
                .eq("user_id", value: request.userId)
                .eq("team_id", value: request.teamId)
                .execute()
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deny(_ request: JoinRequest, deciderUserId: String) async {
        struct Denial: Encodable {
            let status: String
            let decided_at: String
            let decided_by: String
        }
        errorMessage = nil
        do {
            try await SupabaseService.client
                .from("team_memberships")
                .update(Denial(
                    status: "denied",
                    decided_at: SupabaseService.timestamp(.now),
                    decided_by: deciderUserId
                ))
                .eq("user_id", value: request.userId)
                .eq("team_id", value: request.teamId)
                .execute()
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
