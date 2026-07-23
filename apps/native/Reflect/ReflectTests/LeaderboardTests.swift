import Testing
@testable import Reflect

// Pins the Swift port of apps/web/src/lib/scoring.ts. Cases mirror
// apps/web/tests semantics: base scoring, once-per-day bonus rules,
// tiered stacking, unscored kinds, sort order, float rounding.

private func player(_ id: Int, _ name: String, group: String? = nil) -> Player {
    Player(id: id, teamId: 1, name: name, group: group, active: true)
}

struct WeeklyLeaderboardTests {
    @Test func countsAndPoints() {
        let rows = Leaderboard.aggregate(
            players: [player(1, "Ann"), player(2, "Ben")],
            entries: [
                .init(playerId: 1, kind: "workout"),
                .init(playerId: 1, kind: "workout"),
                .init(playerId: 1, kind: "rehab"),
                .init(playerId: 2, kind: "workout"),
            ],
            scoring: TeamScoring(workoutScore: 2, rehabScore: 1)
        )
        #expect(rows.count == 2)
        #expect(rows[0].name == "Ann")
        #expect(rows[0].points == 5)
        #expect(rows[0].workouts == 2)
        #expect(rows[0].rehabs == 1)
        #expect(rows[1].points == 2)
    }

    @Test func ignoresOtherKindsAndUnknownPlayers() {
        let rows = Leaderboard.aggregate(
            players: [player(1, "Ann")],
            entries: [
                .init(playerId: 1, kind: "swim"),      // not a legacy kind
                .init(playerId: 99, kind: "workout"),  // not on the roster
            ],
            scoring: .fallback
        )
        #expect(rows.isEmpty)
    }

    @Test func tieBreaksByWorkoutsThenRehabsThenName() {
        let rows = Leaderboard.aggregate(
            players: [player(1, "Zed"), player(2, "Amy")],
            entries: [
                .init(playerId: 1, kind: "workout"),
                .init(playerId: 2, kind: "workout"),
            ],
            scoring: .fallback
        )
        #expect(rows.map(\.name) == ["Amy", "Zed"])
    }
}

struct CompetitionLeaderboardTests {
    @Test func basePointsPerKind() {
        let rows = Leaderboard.aggregateCompetition(
            players: [player(1, "Ann")],
            entries: [
                .init(playerId: 1, kind: "swim", day: "2026-07-01"),
                .init(playerId: 1, kind: "swim", day: "2026-07-02"),
                .init(playerId: 1, kind: "workout", day: "2026-07-01"),
            ],
            scoring: ["swim": 2, "workout": 1],
            bonusRules: []
        )
        #expect(rows.count == 1)
        #expect(rows[0].basePoints == 5)
        #expect(rows[0].counts == ["swim": 2, "workout": 1])
    }

    @Test func bonusFiresOncePerDayAtThreshold() {
        let rule = CompetitionBonusRule(kind: "swim", minPerDay: 2, bonusPoints: -1)
        let rows = Leaderboard.aggregateCompetition(
            players: [player(1, "Ann")],
            entries: [
                // Day 1: 3 swims — rule fires once, not per-extra.
                .init(playerId: 1, kind: "swim", day: "2026-07-01"),
                .init(playerId: 1, kind: "swim", day: "2026-07-01"),
                .init(playerId: 1, kind: "swim", day: "2026-07-01"),
                // Day 2: 1 swim — below threshold.
                .init(playerId: 1, kind: "swim", day: "2026-07-02"),
            ],
            scoring: ["swim": 1],
            bonusRules: [rule]
        )
        #expect(rows[0].bonusTotal == -1)
        #expect(rows[0].points == 3)
    }

    @Test func tieredRulesComposeAdditively() {
        let rules = [
            CompetitionBonusRule(kind: "swim", minPerDay: 2, bonusPoints: -1),
            CompetitionBonusRule(kind: "swim", minPerDay: 3, bonusPoints: -1),
        ]
        let rows = Leaderboard.aggregateCompetition(
            players: [player(1, "Ann")],
            entries: (0..<3).map { _ in .init(playerId: 1, kind: "swim", day: "2026-07-01") },
            scoring: ["swim": 1],
            bonusRules: rules
        )
        #expect(rows[0].bonusTotal == -2)
        #expect(rows[0].points == 1)
    }

    @Test func unscoredKindsAreSkipped() {
        let rows = Leaderboard.aggregateCompetition(
            players: [player(1, "Ann")],
            entries: [.init(playerId: 1, kind: "yoga", day: "2026-07-01")],
            scoring: ["swim": 1],
            bonusRules: []
        )
        #expect(rows.isEmpty)
    }

    @Test func fractionalWeightsAreRounded() {
        // The canonical float-noise case: 22 × 0.6 must be exactly 13.2.
        let rows = Leaderboard.aggregateCompetition(
            players: [player(1, "Ann")],
            entries: (0..<22).map { i in
                .init(playerId: 1, kind: "rehab", day: "2026-07-\(String(format: "%02d", (i % 28) + 1))")
            },
            scoring: ["rehab": 0.6],
            bonusRules: []
        )
        #expect(rows[0].points == 13.2)
    }

    @Test func sortsByPointsThenBaseThenName() {
        let rows = Leaderboard.aggregateCompetition(
            players: [player(1, "Zed"), player(2, "Amy")],
            entries: [
                .init(playerId: 1, kind: "swim", day: "2026-07-01"),
                .init(playerId: 2, kind: "swim", day: "2026-07-01"),
            ],
            scoring: ["swim": 1],
            bonusRules: []
        )
        #expect(rows.map(\.name) == ["Amy", "Zed"])
    }
}
