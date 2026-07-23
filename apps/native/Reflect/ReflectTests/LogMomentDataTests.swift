import Foundation
import Testing
@testable import Reflect

// Pins the pure LogMomentData factory — points resolution, rank movement,
// passed-name, and the verdict copy paths.

private func player(_ id: Int, _ name: String) -> Player {
    Player(id: id, teamId: 1, name: name, group: nil, active: true)
}

private func entry(_ playerId: Int, _ kind: String, daysAgo: Int = 0) -> LeaderboardModel.Entry {
    LeaderboardModel.Entry(
        playerId: playerId,
        kind: kind,
        loggedAt: Date(timeIntervalSinceNow: -Double(daysAgo) * 86_400)
    )
}

struct LogMomentDataTests {
    private let scoring = TeamScoring(workoutScore: 2, rehabScore: 1)

    @Test func pointsPreferCompetitionWeightOverLegacy() {
        let competition = Competition(
            id: 1, teamId: 1, name: "Summer", startsAt: "2026-07-01", endsAt: "2026-07-31",
            scoring: ["workout": 5, "swim": 2], bonusRules: []
        )
        #expect(LogMomentData.pointsEarned(kind: "workout", scoring: scoring, competition: competition) == 5)
        #expect(LogMomentData.pointsEarned(kind: "swim", scoring: scoring, competition: competition) == 2)
        // Legacy fallback when the competition doesn't score the kind.
        #expect(LogMomentData.pointsEarned(kind: "rehab", scoring: scoring, competition: competition) == 1)
    }

    @Test func pointsFallBackToLegacyThenNil() {
        #expect(LogMomentData.pointsEarned(kind: "workout", scoring: scoring, competition: nil) == 2)
        #expect(LogMomentData.pointsEarned(kind: "rehab", scoring: scoring, competition: nil) == 1)
        #expect(LogMomentData.pointsEarned(kind: "yoga", scoring: scoring, competition: nil) == nil)
    }

    @Test func passingSomeoneNamesThem() {
        // Before: Jake 2×workout (4 pts), Me 1×workout (2 pts). My new
        // workout ties on points, so Jake stays ahead — add two to pass.
        let players = [player(1, "Me"), player(2, "Jake")]
        let entries = [
            entry(2, "workout"), entry(2, "workout"),
            entry(1, "workout"),
        ]
        // First new log ties; make() with a rehab won't pass. Use a scenario
        // that passes: me at 3 pts (workout+rehab), Jake at 4, new workout → 5.
        let richerEntries = entries + [entry(1, "rehab")]
        let moment = LogMomentData.make(
            kind: "workout", logId: 99, playerId: 1,
            players: players, scoring: scoring,
            weekEntries: richerEntries, activeCompetition: nil,
            newEntry: entry(1, "workout"),
            streakBefore: 1, streakAfter: 2
        )
        #expect(moment.rankBefore == 1)
        #expect(moment.rankAfter == 0)
        #expect(moment.passedName == "Jake")
        #expect(moment.rankImproved)
        #expect(moment.leadMargin == 1)
        #expect(moment.verdict == Copy.leadsBy(1))
    }

    @Test func firstLogEntersTheBoard() {
        let players = [player(1, "Me"), player(2, "Jake")]
        let entries = [entry(2, "workout")]
        let moment = LogMomentData.make(
            kind: "rehab", logId: 1, playerId: 1,
            players: players, scoring: scoring,
            weekEntries: entries, activeCompetition: nil,
            newEntry: entry(1, "rehab"),
            streakBefore: 0, streakAfter: 1
        )
        #expect(moment.rankBefore == nil)
        #expect(moment.rankAfter == 1)
        #expect(moment.rankImproved)
        #expect(moment.verdict == Copy.onBoard)
    }

    @Test func heldRankShowsGap() {
        // Jake 3×workout (6), me 1×workout (2) + new rehab (3) — still #2.
        let players = [player(1, "Me"), player(2, "Jake")]
        let entries = [
            entry(2, "workout"), entry(2, "workout"), entry(2, "workout"),
            entry(1, "workout"),
        ]
        let moment = LogMomentData.make(
            kind: "rehab", logId: 1, playerId: 1,
            players: players, scoring: scoring,
            weekEntries: entries, activeCompetition: nil,
            newEntry: entry(1, "rehab"),
            streakBefore: 1, streakAfter: 1
        )
        #expect(moment.rankAfter == 1)
        #expect(moment.rankImproved == false)
        #expect(moment.gapToNext == 3)
        #expect(moment.verdict == Copy.gapToNext(3, rank: 2))
    }

    @Test func unscoredKindHasNoPointsButKeepsStreak() {
        let players = [player(1, "Me")]
        let moment = LogMomentData.make(
            kind: "yoga", logId: 1, playerId: 1,
            players: players, scoring: scoring,
            weekEntries: [], activeCompetition: nil,
            newEntry: entry(1, "yoga"),
            streakBefore: 3, streakAfter: 4
        )
        #expect(moment.pointsEarned == nil)
        // yoga doesn't count on the week board → still not on it.
        #expect(moment.rankAfter == nil)
        #expect(moment.streakAfter == 4)
    }
}
