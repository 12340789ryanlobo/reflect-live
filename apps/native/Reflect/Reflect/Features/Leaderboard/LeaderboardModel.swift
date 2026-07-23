import Foundation
import Observation
import Supabase

/// Loads roster + activity entries and runs the scoring port. Two boards:
/// the rolling weekly board (legacy teams.scoring_json weights) and, when a
/// competition is running, the competition board with bonus rules.
@MainActor
@Observable
final class LeaderboardModel {
    struct Content {
        var weekRows: [LeaderboardRow]
        var activeCompetition: Competition?
        var competitionRows: [CompetitionLeaderboardRow]
    }

    let membership: ActiveMembership
    private(set) var state: LoadState<Content> = .idle

    /// Weekly window timezone. teams.timezone isn't client-readable (0035
    /// column grants), so this matches the web app's CT anchor for now.
    static let weekTimeZone = TimeZone(identifier: "America/Chicago") ?? .current

    init(membership: ActiveMembership) {
        self.membership = membership
    }

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

            let weekStart = Leaderboard.weekStart(in: Self.weekTimeZone)
            let weekEntries = try await fetchEntries(since: SupabaseService.timestamp(weekStart), until: nil)
            let weekRows = Leaderboard.aggregate(
                players: players,
                entries: weekEntries.compactMap { entry in
                    entry.playerId.map { LeaderboardEntry(playerId: $0, kind: entry.kind) }
                },
                scoring: scoring
            )

            let today = LogModel.todayISO(timeZone: Self.weekTimeZone)
            var activeCompetition: Competition?
            var competitionRows: [CompetitionLeaderboardRow] = []
            if let competition = competitions.first(where: { $0.isActive(onDay: today) }) {
                activeCompetition = competition
                let entries = try await fetchEntries(
                    since: competition.startsAt,
                    until: competition.endsAt + "T23:59:59"
                )
                competitionRows = Leaderboard.aggregateCompetition(
                    players: players,
                    entries: entries.compactMap { entry in
                        entry.playerId.map {
                            CompetitionEntry(playerId: $0, kind: entry.kind, day: Leaderboard.utcDay(of: entry.loggedAt))
                        }
                    },
                    scoring: competition.scoring,
                    bonusRules: competition.bonusRules
                )
            }

            state = .loaded(Content(
                weekRows: weekRows,
                activeCompetition: activeCompetition,
                competitionRows: competitionRows
            ))
        } catch {
            if state.value == nil { state = .failed(error.localizedDescription) }
        }
    }

    private struct EntryRow: Decodable {
        let playerId: Int?
        let kind: String
        let loggedAt: Date

        enum CodingKeys: String, CodingKey {
            case kind
            case playerId = "player_id"
            case loggedAt = "logged_at"
        }
    }

    /// Pages through activity_logs (PostgREST caps responses at 1000 rows).
    private func fetchEntries(since: String, until: String?) async throws -> [EntryRow] {
        var entries: [EntryRow] = []
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
            let batch: [EntryRow] = try await query
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
