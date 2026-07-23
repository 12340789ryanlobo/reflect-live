import Foundation
import Observation
import Supabase

/// Loads roster + activity entries and runs the scoring port. Two boards:
/// the rolling weekly board (legacy teams.scoring_json weights) and, when a
/// competition is running, the competition board with bonus rules.
///
/// Content keeps the raw fetched entries so consumers (TodayModel, the Log
/// Moment) can recompute boards locally — e.g. "as of end-of-yesterday" for
/// movement arrows, or "with my new log appended" for the rank reveal —
/// without extra network round-trips.
@MainActor
@Observable
final class LeaderboardModel {
    /// One activity entry inside the fetched window.
    nonisolated struct Entry: Decodable, Hashable {
        let playerId: Int?
        let kind: String
        let loggedAt: Date

        enum CodingKeys: String, CodingKey {
            case kind
            case playerId = "player_id"
            case loggedAt = "logged_at"
        }
    }

    struct Content {
        var players: [Player]
        var scoring: TeamScoring
        var weekEntries: [Entry]
        var weekRows: [LeaderboardRow]
        var weekRowsYesterday: [LeaderboardRow]
        var activeCompetition: Competition?
        var competitionEntries: [Entry]
        var competitionRows: [CompetitionLeaderboardRow]
        var competitionRowsYesterday: [CompetitionLeaderboardRow]
    }

    let membership: ActiveMembership
    private(set) var state: LoadState<Content> = .idle

    /// Weekly window timezone. teams.timezone isn't client-readable (0035
    /// column grants), so this matches the web app's CT anchor for now.
    static let weekTimeZone = TimeZone(identifier: "America/Chicago") ?? .current

    init(membership: ActiveMembership) {
        self.membership = membership
    }

    // MARK: - Pure recomputes (shared with TodayModel / Log Moment)

    nonisolated static func weekBoard(
        players: [Player],
        entries: [Entry],
        scoring: TeamScoring,
        before cutoff: Date? = nil
    ) -> [LeaderboardRow] {
        let windowed = cutoff.map { cut in entries.filter { $0.loggedAt < cut } } ?? entries
        return Leaderboard.aggregate(
            players: players,
            entries: windowed.compactMap { entry in
                entry.playerId.map { LeaderboardEntry(playerId: $0, kind: entry.kind) }
            },
            scoring: scoring
        )
    }

    nonisolated static func competitionBoard(
        players: [Player],
        entries: [Entry],
        competition: Competition,
        before cutoff: Date? = nil
    ) -> [CompetitionLeaderboardRow] {
        let windowed = cutoff.map { cut in entries.filter { $0.loggedAt < cut } } ?? entries
        return Leaderboard.aggregateCompetition(
            players: players,
            entries: windowed.compactMap { entry in
                entry.playerId.map {
                    CompetitionEntry(playerId: $0, kind: entry.kind, day: Leaderboard.utcDay(of: entry.loggedAt))
                }
            },
            scoring: competition.scoring,
            bonusRules: competition.bonusRules
        )
    }

    // MARK: - Loading

    func load() async {
        if state.value == nil { state = .loading }
        do {
            async let teamFetch: [Team] = SupabaseService.client
                .from("teams")
                .select("id, name, team_code, scoring_json")
                .eq("id", value: membership.teamId)
                .execute()
                .value
            async let playersFetch: [Player] = SupabaseService.client
                .from("players")
                .select("id, team_id, name, group, active")
                .eq("team_id", value: membership.teamId)
                .eq("active", value: true)
                .execute()
                .value
            async let competitionsFetch: [Competition] = SupabaseService.client
                .from("competitions")
                .select("id, team_id, name, starts_at, ends_at, scoring, bonus_rules")
                .eq("team_id", value: membership.teamId)
                .is("archived_at", value: nil)
                .order("ends_at", ascending: false)
                .execute()
                .value

            let (teams, players, competitions) = try await (teamFetch, playersFetch, competitionsFetch)
            let scoring = teams.first?.scoring ?? .fallback
            let startOfToday = RankMath.startOfToday(in: Self.weekTimeZone)

            let weekStart = Leaderboard.weekStart(in: Self.weekTimeZone)
            let weekEntries = try await fetchEntries(since: SupabaseService.timestamp(weekStart), until: nil)
            let weekRows = Self.weekBoard(players: players, entries: weekEntries, scoring: scoring)
            let weekRowsYesterday = Self.weekBoard(
                players: players, entries: weekEntries, scoring: scoring, before: startOfToday
            )

            let today = LogModel.todayISO(timeZone: Self.weekTimeZone)
            var activeCompetition: Competition?
            var competitionEntries: [Entry] = []
            var competitionRows: [CompetitionLeaderboardRow] = []
            var competitionRowsYesterday: [CompetitionLeaderboardRow] = []
            if let competition = competitions.first(where: { $0.isActive(onDay: today) }) {
                activeCompetition = competition
                competitionEntries = try await fetchEntries(
                    since: competition.startsAt,
                    until: competition.endsAt + "T23:59:59"
                )
                competitionRows = Self.competitionBoard(
                    players: players, entries: competitionEntries, competition: competition
                )
                competitionRowsYesterday = Self.competitionBoard(
                    players: players, entries: competitionEntries, competition: competition, before: startOfToday
                )
            }

            state = .loaded(Content(
                players: players,
                scoring: scoring,
                weekEntries: weekEntries,
                weekRows: weekRows,
                weekRowsYesterday: weekRowsYesterday,
                activeCompetition: activeCompetition,
                competitionEntries: competitionEntries,
                competitionRows: competitionRows,
                competitionRowsYesterday: competitionRowsYesterday
            ))
        } catch {
            if state.value == nil { state = .failed(error.localizedDescription) }
        }
    }

    /// Pages through activity_logs (PostgREST caps responses at 1000 rows).
    private func fetchEntries(since: String, until: String?) async throws -> [Entry] {
        var entries: [Entry] = []
        var from = 0
        let page = 1000
        while true {
            var query = SupabaseService.client
                .from("activity_logs")
                .select("player_id, kind, logged_at")
                .eq("team_id", value: membership.teamId)
                .eq("hidden", value: false)
                .gte("logged_at", value: since)
            if let until {
                query = query.lte("logged_at", value: until)
            }
            let batch: [Entry] = try await query
                .range(from: from, to: from + page - 1)
                .execute()
                .value
            entries.append(contentsOf: batch)
            if batch.count < page { break }
            from += page
        }
        return entries
    }
}
