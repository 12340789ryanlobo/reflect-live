import Foundation
import Observation
import Supabase

/// Athlete self-logging: composer kinds, own timeline, soft-delete.
/// Writes go straight to activity_logs under the 0037 RLS policies —
/// an athlete can only insert rows for their own player_id.
@MainActor
@Observable
final class LogModel {
    let membership: ActiveMembership

    private(set) var timeline: LoadState<[ActivityLog]> = .idle
    /// Kinds offered in the composer: active competition scoring keys ∪ {workout, rehab}.
    private(set) var kinds: [String] = ["workout", "rehab"]
    private(set) var errorMessage: String?

    init(membership: ActiveMembership) {
        self.membership = membership
    }

    func load() async {
        if timeline.value == nil { timeline = .loading }
        do {
            async let logsFetch: [ActivityLog] = SupabaseService.client
                .from("activity_logs")
                .select("id, team_id, player_id, kind, description, logged_at, hidden")
                .eq("team_id", value: membership.teamId)
                .eq("player_id", value: membership.playerId ?? -1)
                .eq("hidden", value: false)
                .order("logged_at", ascending: false)
                .limit(100)
                .execute()
                .value
            async let competitionsFetch: [Competition] = SupabaseService.client
                .from("competitions")
                .select("id, team_id, name, starts_at, ends_at, scoring, bonus_rules")
                .eq("team_id", value: membership.teamId)
                .is("archived_at", value: nil)
                .execute()
                .value

            let (logs, competitions) = try await (logsFetch, competitionsFetch)
            timeline = .loaded(logs)

            let today = LogModel.todayISO()
            var kindSet: Set<String> = ["workout", "rehab"]
            for competition in competitions where competition.isActive(onDay: today) {
                kindSet.formUnion(competition.scoring.keys)
            }
            kinds = kindSet.sorted()
        } catch {
            if timeline.value == nil { timeline = .failed(error.localizedDescription) }
        }
    }

    /// Shared insert path — the composer and Today's one-tap quick log both
    /// come through here. Returns the created row (for rank recompute + undo).
    nonisolated static func insertLog(
        teamId: Int,
        playerId: Int,
        kind: String,
        description: String?,
        loggedAt: Date
    ) async throws -> ActivityLog {
        struct NewLog: Encodable {
            let team_id: Int
            let player_id: Int
            let kind: String
            let description: String?
            let logged_at: String
            let hidden: Bool
        }
        return try await SupabaseService.client
            .from("activity_logs")
            .insert(NewLog(
                team_id: teamId,
                player_id: playerId,
                kind: kind,
                description: description?.isEmpty == true ? nil : description,
                logged_at: SupabaseService.timestamp(loggedAt),
                hidden: false
            ), returning: .representation)
            .select("id, team_id, player_id, kind, description, logged_at, hidden")
            .single()
            .execute()
            .value
    }

    /// Soft-delete: hidden=true is the only removal path RLS allows.
    nonisolated static func hideLog(id: Int) async throws {
        try await SupabaseService.client
            .from("activity_logs")
            .update(["hidden": true])
            .eq("id", value: id)
            .execute()
    }

    func submit(kind: String, description: String, loggedAt: Date) async -> Bool {
        guard let playerId = membership.playerId else {
            errorMessage = "Your account isn't linked to a roster spot yet — ask your team manager."
            return false
        }
        errorMessage = nil
        do {
            _ = try await Self.insertLog(
                teamId: membership.teamId,
                playerId: playerId,
                kind: kind,
                description: description,
                loggedAt: loggedAt
            )
            await load()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func hide(_ log: ActivityLog) async {
        errorMessage = nil
        do {
            try await Self.hideLog(id: log.id)
            if let current = timeline.value {
                timeline = .loaded(current.filter { $0.id != log.id })
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    static func todayISO(timeZone: TimeZone = TimeZone(identifier: "America/Chicago") ?? .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.year, .month, .day], from: .now)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}
