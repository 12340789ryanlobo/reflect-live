import Foundation
import Observation
import Supabase
import SwiftUI

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
    private(set) var logMoment: LogMomentData?
    private(set) var quietToast = false
    private var myLogDates: [Date] = []

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
            myLogDates = rows.map(\.loggedAt)
            streak = Streaks.compute(logDates: myLogDates)
        } catch {
            // Streak is decorative — keep the last value on transient errors.
        }
    }

    // MARK: - Logging (quick + composer)

    /// One-tap log: insert, then present the Log Moment computed locally from
    /// the cached board — the celebration lands with the insert round-trip.
    func quickLog(kind: String) async {
        await log(kind: kind, note: nil, loggedAt: .now)
    }

    /// Composer path. Backdated logs get no rank theater — a quiet toast,
    /// not a celebration of last Tuesday. Returns success.
    @discardableResult
    func log(kind: String, note: String?, loggedAt: Date) async -> Bool {
        guard let playerId = membership.playerId else {
            errorMessage = "Your account isn't linked to a roster spot yet — ask your team manager."
            return false
        }
        errorMessage = nil
        do {
            let log = try await LogModel.insertLog(
                teamId: membership.teamId,
                playerId: playerId,
                kind: kind,
                description: note,
                loggedAt: loggedAt
            )
            let backdated = loggedAt < RankMath.startOfToday(in: LeaderboardModel.weekTimeZone)
            if !backdated, let content = leaderboard.state.value {
                let streakAfter = Streaks.compute(logDates: myLogDates + [log.loggedAt]).current
                let moment = LogMomentData.make(
                    kind: kind,
                    logId: log.id,
                    playerId: playerId,
                    players: content.players,
                    scoring: content.scoring,
                    weekEntries: content.weekEntries,
                    activeCompetition: content.activeCompetition,
                    newEntry: LeaderboardModel.Entry(playerId: playerId, kind: kind, loggedAt: log.loggedAt),
                    streakBefore: streak.current,
                    streakAfter: streakAfter
                )
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    logMoment = moment
                }
            } else {
                quietToast = true
                Task {
                    try? await Task.sleep(for: .seconds(2))
                    withAnimation { quietToast = false }
                }
            }
            Task { await load() }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func dismissLogMoment() {
        withAnimation(.easeOut(duration: 0.2)) { logMoment = nil }
    }

    /// Undo from the Log Moment: soft-delete (hidden=true) and refresh.
    func undoLogMoment() async {
        guard let moment = logMoment else { return }
        try? await LogModel.hideLog(id: moment.logId)
        dismissLogMoment()
        await load()
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
