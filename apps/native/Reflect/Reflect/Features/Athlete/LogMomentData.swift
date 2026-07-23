import Foundation

/// Everything the Log Moment overlay needs, computed the instant the insert
/// lands — locally, from the already-fetched board, so the celebration never
/// waits on a full reload. Pure factory, pinned by LogMomentDataTests.
nonisolated struct LogMomentData: Identifiable {
    let id = UUID()
    let kind: String
    /// nil = kind doesn't score right now → streak-only card.
    let pointsEarned: Double?
    /// nil = wasn't on the week board before this log.
    let rankBefore: Int?
    /// nil = still not on the week board (kind doesn't count for the week).
    let rankAfter: Int?
    let boardSize: Int
    /// Name of the person now directly below me, when I moved up.
    let passedName: String?
    /// Points off the row above, post-log (nil at rank 1 — see leadMargin).
    let gapToNext: Double?
    /// Rank 1's margin over rank 2, when I lead post-log.
    let leadMargin: Double?
    let streakBefore: Int
    let streakAfter: Int
    let logId: Int

    var rankImproved: Bool {
        guard let rankAfter else { return false }
        guard let rankBefore else { return true } // entered the board
        return rankAfter < rankBefore
    }

    /// The verdict line under the rank numeral.
    var verdict: String? {
        guard let rankAfter else { return nil }
        if rankAfter == 0 {
            return leadMargin.map(Copy.leadsBy) ?? Copy.tookLead
        }
        if rankBefore == nil { return Copy.onBoard }
        if let passedName, rankImproved { return Copy.passed(passedName) }
        return gapToNext.map { Copy.gapToNext($0, rank: rankAfter + 1) }
    }

    /// Builds the moment from the pre-insert board content plus the new entry.
    static func make(
        kind: String,
        logId: Int,
        playerId: Int,
        players: [Player],
        scoring: TeamScoring,
        weekEntries: [LeaderboardModel.Entry],
        activeCompetition: Competition?,
        newEntry: LeaderboardModel.Entry,
        streakBefore: Int,
        streakAfter: Int
    ) -> LogMomentData {
        let pointsEarned = Self.pointsEarned(kind: kind, scoring: scoring, competition: activeCompetition)

        let beforeRows = LeaderboardModel.weekBoard(players: players, entries: weekEntries, scoring: scoring)
        let afterRows = LeaderboardModel.weekBoard(
            players: players, entries: weekEntries + [newEntry], scoring: scoring
        )
        let rankBefore = beforeRows.firstIndex { $0.playerId == playerId }
        let rankAfter = afterRows.firstIndex { $0.playerId == playerId }

        var passedName: String?
        if let before = rankBefore, let after = rankAfter, after < before, after + 1 < afterRows.count {
            passedName = afterRows[after + 1].name
        }

        let points = afterRows.map(\.points)
        let gapToNext = rankAfter.flatMap { RankMath.gapToNext(points: points, index: $0) }
        let leadMargin = rankAfter == 0 ? RankMath.lead(points: points) : nil

        return LogMomentData(
            kind: kind,
            pointsEarned: pointsEarned,
            rankBefore: rankBefore,
            rankAfter: rankAfter,
            boardSize: afterRows.count,
            passedName: passedName,
            gapToNext: gapToNext,
            leadMargin: leadMargin,
            streakBefore: streakBefore,
            streakAfter: streakAfter,
            logId: logId
        )
    }

    /// Competition weight when a competition scores this kind, else the
    /// legacy weekly weights, else nil (unscored).
    static func pointsEarned(
        kind: String,
        scoring: TeamScoring,
        competition: Competition?
    ) -> Double? {
        if let weight = competition?.scoring[kind] { return weight }
        switch kind {
        case "workout": return scoring.workoutScore
        case "rehab": return scoring.rehabScore
        default: return nil
        }
    }
}
