import Foundation
import Observation
import Supabase

/// The athlete's home screen state: composes the leaderboard (hero card),
/// the team Pulse feed, my streak, and the one-tap quick-log kinds.
@MainActor
@Observable
final class TodayModel {
    struct PulseItem: Identifiable, Hashable {
        let id: Int
        let playerName: String
        let isMe: Bool
        let kind: String
        let loggedAt: Date
    }

    let membership: ActiveMembership
    let leaderboard: LeaderboardModel

    private(set) var pulse: LoadState<[PulseItem]> = .idle
    private(set) var streak = Streaks.Result(current: 0, longest: 0)
    private(set) var kinds: [String] = ["workout", "rehab"]
    private(set) var errorMessage: String?

    init(membership: ActiveMembership) {
        self.membership = membership
        self.leaderboard = LeaderboardModel(membership: membership)
    }

    // MARK: - Derived hero-card values

    var weekRows: [LeaderboardRow] {
        leaderboard.state.value?.weekRows ?? []
    }

    var myIndex: Int? {
        guard let playerId = membership.playerId else { return nil }
        return weekRows.firstIndex { $0.playerId == playerId }
    }

    var myPoints: Double {
        myIndex.map { weekRows[$0].points } ?? 0
    }

    var myMovement: Movement? {
        guard let content = leaderboard.state.value, let playerId = membership.playerId else { return nil }
        let movement = RankMath.movement(
            current: content.weekRows.map(\.playerId),
            previous: content.weekRowsYesterday.map(\.playerId)
        )
        return movement[playerId]
    }

    var myGapLine: String? {
        guard let index = myIndex else { return nil }
        if index == 0 {
            return RankMath.lead(points: weekRows.map(\.points)).map(Copy.leadsBy)
        }
        return RankMath.gapToNext(points: weekRows.map(\.points), index: index)
            .map { Copy.gapToNext($0, rank: index + 1) }
    }

    // MARK: - Loading

    func load() async {
        await leaderboard.load()
        deriveKinds()
        async let pulseLoad: Void = loadPulse()
        async let streakLoad: Void = loadStreak()
        _ = await (pulseLoad, streakLoad)
    }

    private func deriveKinds() {
        var kindSet: Set<String> = ["workout", "rehab"]
        if let scoring = leaderboard.state.value?.activeCompetition?.scoring {
            kindSet.formUnion(scoring.keys)
        }
        kinds = kindSet.sorted()
    }

    func loadPulse() async {
        struct Row: Decodable {
            let id: Int
            let playerId: Int?
            let kind: String
            let loggedAt: Date

            enum CodingKeys: String, CodingKey {
                case id, kind
                case playerId = "player_id"
                case loggedAt = "logged_at"
            }
        }
        do {
            let rows: [Row] = try await SupabaseService.client
                .from("activity_logs")
                .select("id, player_id, kind, logged_at")
                .eq("team_id", value: membership.teamId)
                .eq("hidden", value: false)
                .order("logged_at", ascending: false)
                .limit(20)
                .execute()
                .value
            let playersById = Dictionary(
                uniqueKeysWithValues: (leaderboard.state.value?.players ?? []).map { ($0.id, $0) }
            )
            pulse = .loaded(rows.compactMap { row in
                guard let playerId = row.playerId, let player = playersById[playerId] else { return nil }
                return PulseItem(
                    id: row.id,
                    playerName: player.name,
                    isMe: playerId == membership.playerId,
                    kind: row.kind,
                    loggedAt: row.loggedAt
                )
            })
        } catch {
            if pulse.value == nil { pulse = .failed(error.localizedDescription) }
        }
    }

    private func loadStreak() async {
        guard let playerId = membership.playerId else { return }
        struct Row: Decodable {
            let loggedAt: Date

            enum CodingKeys: String, CodingKey {
                case loggedAt = "logged_at"
            }
        }
        let since = Calendar.current.date(byAdding: .day, value: -60, to: .now) ?? .now
        do {
            let rows: [Row] = try await SupabaseService.client
                .from("activity_logs")
                .select("logged_at")
                .eq("player_id", value: playerId)
                .eq("hidden", value: false)
                .gte("logged_at", value: SupabaseService.timestamp(since))
                .execute()
                .value
            streak = Streaks.compute(logDates: rows.map(\.loggedAt))
        } catch {
            // Streak is decorative — keep the last value on transient errors.
        }
    }

    // MARK: - Quick log

    /// One-tap log. Returns the created row, or nil on failure (error surfaced).
    @discardableResult
    func quickLog(kind: String) async -> ActivityLog? {
        guard let playerId = membership.playerId else {
            errorMessage = "Your account isn't linked to a roster spot yet — ask your team manager."
            return nil
        }
        errorMessage = nil
        do {
            let log = try await LogModel.insertLog(
                teamId: membership.teamId,
                playerId: playerId,
                kind: kind,
                description: nil,
                loggedAt: .now
            )
            await load()
            return log
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    // MARK: - Realtime pulse

    /// Invalidation signal: any teammate insert refetches the pulse (not the
    /// whole board — that refreshes on scenePhase, pull, or own logs).
    func watchPulse() async {
        let client = SupabaseService.client
        let channel = client.channel("pulse-\(membership.teamId)")
        let inserts = channel.postgresChange(
            InsertAction.self,
            schema: "public",
            table: "activity_logs",
            filter: .eq("team_id", value: membership.teamId)
        )
        try? await channel.subscribeWithError()
        for await _ in inserts {
            await loadPulse()
        }
        await client.removeChannel(channel)
    }
}
