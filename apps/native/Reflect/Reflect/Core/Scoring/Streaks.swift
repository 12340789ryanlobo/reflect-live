import Foundation

// Pure streak + rank math for the scoreboard feel. No Supabase imports —
// everything takes values in and returns values out so ReflectTests can
// pin the behavior (especially the timezone day-bucketing).

nonisolated enum Streaks {
    /// Matches LeaderboardModel.weekTimeZone; teams.timezone isn't
    /// client-readable (0035 column grants).
    static let teamTimeZone = TimeZone(identifier: "America/Chicago") ?? .current

    struct Result: Equatable {
        let current: Int
        let longest: Int
    }

    /// A streak is consecutive days (in `timeZone`) with at least one log.
    /// `current` is alive if it ends today OR yesterday — you haven't lost
    /// the streak at 7am just because you haven't trained yet.
    static func compute(
        logDates: [Date],
        timeZone: TimeZone = teamTimeZone,
        now: Date = .now
    ) -> Result {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone

        let days = Set(logDates.map { calendar.startOfDay(for: $0) })
        guard !days.isEmpty else { return Result(current: 0, longest: 0) }

        let sorted = days.sorted()
        var longest = 1
        var run = 1
        for index in 1..<sorted.count {
            if calendar.date(byAdding: .day, value: 1, to: sorted[index - 1]) == sorted[index] {
                run += 1
            } else {
                run = 1
            }
            longest = max(longest, run)
        }

        let today = calendar.startOfDay(for: now)
        let yesterday = calendar.date(byAdding: .day, value: -1, to: today) ?? today
        var current = 0
        if days.contains(today) || days.contains(yesterday) {
            var cursor = days.contains(today) ? today : yesterday
            while days.contains(cursor) {
                current += 1
                guard let previous = calendar.date(byAdding: .day, value: -1, to: cursor) else { break }
                cursor = previous
            }
        }
        return Result(current: current, longest: longest)
    }
}

/// A player's rank change vs the board as of end-of-yesterday.
nonisolated enum Movement: Equatable {
    case up(Int)
    case down(Int)
    case same
    case entered // not on yesterday's board
}

nonisolated enum RankMath {
    /// Board-shape-agnostic: ordered playerIds today vs at the cutoff.
    static func movement(current: [Int], previous: [Int]) -> [Int: Movement] {
        let previousIndex = Dictionary(uniqueKeysWithValues: previous.enumerated().map { ($1, $0) })
        var result: [Int: Movement] = [:]
        for (index, playerId) in current.enumerated() {
            if let before = previousIndex[playerId] {
                if before > index {
                    result[playerId] = .up(before - index)
                } else if before < index {
                    result[playerId] = .down(index - before)
                } else {
                    result[playerId] = .same
                }
            } else {
                result[playerId] = .entered
            }
        }
        return result
    }

    /// Points behind the row above; nil for rank 1 (rank 1 shows `lead`).
    static func gapToNext(points: [Double], index: Int) -> Double? {
        guard index > 0, index < points.count else { return nil }
        return Leaderboard.roundPoints(points[index - 1] - points[index])
    }

    /// Rank 1's margin over rank 2; nil if the board has fewer than 2 rows.
    static func lead(points: [Double]) -> Double? {
        guard points.count >= 2 else { return nil }
        return Leaderboard.roundPoints(points[0] - points[1])
    }

    /// Start of today in tz — the entries cutoff for "board as of end-of-yesterday".
    static func startOfToday(in timeZone: TimeZone, now: Date = .now) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.startOfDay(for: now)
    }
}
