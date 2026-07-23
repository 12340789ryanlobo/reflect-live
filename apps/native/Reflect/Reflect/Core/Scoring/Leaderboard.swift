import Foundation

// Swift port of apps/web/src/lib/scoring.ts (aggregateLeaderboard +
// aggregateCompetition). Pure functions — pinned by ReflectTests so the
// port can't drift from the TS original silently.

struct LeaderboardRow: Identifiable, Hashable {
    let playerId: Int
    let name: String
    let group: String?
    let workouts: Int
    let rehabs: Int
    let points: Double

    var id: Int { playerId }
}

struct LeaderboardEntry: Hashable {
    let playerId: Int
    let kind: String
}

struct CompetitionLeaderboardRow: Identifiable, Hashable {
    let playerId: Int
    let name: String
    let group: String?
    /// Per-kind counts inside the date window.
    let counts: [String: Int]
    let basePoints: Double
    let bonusTotal: Double
    let points: Double

    var id: Int { playerId }
}

/// Same as LeaderboardEntry plus the day (ISO YYYY-MM-DD, UTC slice of
/// logged_at) so stacking rules can group by (player, day).
struct CompetitionEntry: Hashable {
    let playerId: Int
    let kind: String
    let day: String
}

enum Leaderboard {
    /// Round to 4 decimals to suppress IEEE 754 accumulation artifacts from
    /// fractional weights, mirroring roundPoints in scoring.ts.
    static func roundPoints(_ n: Double) -> Double {
        (n * 10_000).rounded() / 10_000
    }

    /// Legacy weekly aggregation. Sort: points DESC → workouts DESC →
    /// rehabs DESC → name ASC. Players with zero entries are excluded.
    static func aggregate(
        players: [Player],
        entries: [LeaderboardEntry],
        scoring: TeamScoring
    ) -> [LeaderboardRow] {
        var counts: [Int: (workouts: Int, rehabs: Int)] = [:]
        for entry in entries {
            guard entry.kind == "workout" || entry.kind == "rehab" else { continue }
            var current = counts[entry.playerId] ?? (0, 0)
            if entry.kind == "workout" { current.workouts += 1 } else { current.rehabs += 1 }
            counts[entry.playerId] = current
        }

        let playerById = Dictionary(uniqueKeysWithValues: players.map { ($0.id, $0) })
        var rows: [LeaderboardRow] = []
        for (playerId, count) in counts {
            guard let player = playerById[playerId] else { continue }
            let points = Double(count.workouts) * scoring.workoutScore
                + Double(count.rehabs) * scoring.rehabScore
            rows.append(LeaderboardRow(
                playerId: playerId,
                name: player.name,
                group: player.group,
                workouts: count.workouts,
                rehabs: count.rehabs,
                points: points
            ))
        }

        rows.sort { a, b in
            if a.points != b.points { return a.points > b.points }
            if a.workouts != b.workouts { return a.workouts > b.workouts }
            if a.rehabs != b.rehabs { return a.rehabs > b.rehabs }
            return a.name < b.name
        }
        return rows
    }

    /// Competition-aware aggregation. Bonus rules fire once per (player, day)
    /// when count(kind) >= min_per_day; multiple rules compose additively.
    /// Sort: points DESC → base DESC → name ASC.
    static func aggregateCompetition(
        players: [Player],
        entries: [CompetitionEntry],
        scoring: [String: Double],
        bonusRules: [CompetitionBonusRule]
    ) -> [CompetitionLeaderboardRow] {
        // player → day → kind → count. Kinds absent from scoring are skipped.
        var byPlayerDay: [Int: [String: [String: Int]]] = [:]
        for entry in entries {
            guard scoring[entry.kind] != nil else { continue }
            byPlayerDay[entry.playerId, default: [:]][entry.day, default: [:]][entry.kind, default: 0] += 1
        }

        let playerById = Dictionary(uniqueKeysWithValues: players.map { ($0.id, $0) })
        var rows: [CompetitionLeaderboardRow] = []

        for (playerId, days) in byPlayerDay {
            guard let player = playerById[playerId] else { continue }

            var counts: [String: Int] = [:]
            var basePoints = 0.0
            var bonusTotal = 0.0

            for (_, kindMap) in days {
                for (kind, count) in kindMap {
                    counts[kind, default: 0] += count
                    basePoints += Double(count) * (scoring[kind] ?? 0)
                }
                for rule in bonusRules where (kindMap[rule.kind] ?? 0) >= rule.minPerDay {
                    bonusTotal += rule.bonusPoints
                }
            }

            let baseRounded = roundPoints(basePoints)
            let bonusRounded = roundPoints(bonusTotal)
            rows.append(CompetitionLeaderboardRow(
                playerId: playerId,
                name: player.name,
                group: player.group,
                counts: counts,
                basePoints: baseRounded,
                bonusTotal: bonusRounded,
                points: roundPoints(baseRounded + bonusRounded)
            ))
        }

        rows.sort { a, b in
            if a.points != b.points { return a.points > b.points }
            if a.basePoints != b.basePoints { return a.basePoints > b.basePoints }
            return a.name < b.name
        }
        return rows
    }

    /// The most recent Monday 00:00 in the given timezone (weekly window start).
    static func weekStart(in timeZone: TimeZone, now: Date = .now) -> Date {
        var calendar = Calendar(identifier: .iso8601) // Monday-first weeks
        calendar.timeZone = timeZone
        let startOfDay = calendar.startOfDay(for: now)
        let weekday = calendar.component(.weekday, from: startOfDay) // 1 = Sunday
        let daysSinceMonday = (weekday + 5) % 7
        return calendar.date(byAdding: .day, value: -daysSinceMonday, to: startOfDay) ?? startOfDay
    }

    /// UTC calendar-day key (YYYY-MM-DD), matching scoring.ts's
    /// logged_at.slice(0, 10) on the Postgres UTC timestamp.
    static func utcDay(of date: Date) -> String {
        date.ISO8601Format(.iso8601.year().month().day())
    }
}
