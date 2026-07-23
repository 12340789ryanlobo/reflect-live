import Foundation
import Testing
@testable import Reflect

// Pins Streaks + RankMath, especially the Chicago-time day bucketing that a
// naive UTC slice would get wrong.

private let chicago = TimeZone(identifier: "America/Chicago")!

private var chicagoCalendar: Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = chicago
    return calendar
}

/// A Chicago wall-clock instant.
private func ct(_ year: Int, _ month: Int, _ day: Int, _ hour: Int = 12, _ minute: Int = 0) -> Date {
    chicagoCalendar.date(from: DateComponents(
        year: year, month: month, day: day, hour: hour, minute: minute
    ))!
}

struct StreaksTests {
    // Fixed "now": Thursday 2026-07-23 10:00 CT.
    private let now = ct(2026, 7, 23, 10)

    @Test func emptyIsZero() {
        #expect(Streaks.compute(logDates: [], timeZone: chicago, now: now) == .init(current: 0, longest: 0))
    }

    @Test func singleLogTodayIsOne() {
        let result = Streaks.compute(logDates: [ct(2026, 7, 23, 8)], timeZone: chicago, now: now)
        #expect(result == .init(current: 1, longest: 1))
    }

    @Test func yesterdayPlusTodayIsTwo() {
        let result = Streaks.compute(
            logDates: [ct(2026, 7, 22), ct(2026, 7, 23, 6)],
            timeZone: chicago, now: now
        )
        #expect(result == .init(current: 2, longest: 2))
    }

    @Test func yesterdayOnlyKeepsGraceDay() {
        let result = Streaks.compute(logDates: [ct(2026, 7, 22)], timeZone: chicago, now: now)
        #expect(result == .init(current: 1, longest: 1))
    }

    @Test func twoDaysAgoOnlyIsBroken() {
        let result = Streaks.compute(logDates: [ct(2026, 7, 21)], timeZone: chicago, now: now)
        #expect(result == .init(current: 0, longest: 1))
    }

    @Test func multipleLogsSameDayCountOnce() {
        let result = Streaks.compute(
            logDates: [ct(2026, 7, 23, 6), ct(2026, 7, 23, 12), ct(2026, 7, 23, 18)],
            timeZone: chicago, now: now
        )
        #expect(result == .init(current: 1, longest: 1))
    }

    @Test func gapSplitsRunsAndKeepsLongest() {
        // Days t-6..t-4 (run of 3), then t-1 and t (run of 2, current).
        let dates = [
            ct(2026, 7, 17), ct(2026, 7, 18), ct(2026, 7, 19),
            ct(2026, 7, 22), ct(2026, 7, 23),
        ]
        let result = Streaks.compute(logDates: dates, timeZone: chicago, now: now)
        #expect(result == .init(current: 2, longest: 3))
    }

    @Test func utcInstantBucketsToChicagoDay() {
        // 2026-07-23 04:30Z is 23:30 CT on 07-22 — the previous Chicago day.
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        let lateNight = utc.date(from: DateComponents(year: 2026, month: 7, day: 23, hour: 4, minute: 30))!
        let result = Streaks.compute(logDates: [lateNight], timeZone: chicago, now: now)
        // It's 07-22 in Chicago = yesterday → grace day keeps it current.
        #expect(result == .init(current: 1, longest: 1))
    }

    @Test func justAfterMidnightStillCurrent() {
        // now = 00:10 CT on 07-23; log at 23:55 CT on 07-22 → streak ends
        // "yesterday", still current.
        let result = Streaks.compute(
            logDates: [ct(2026, 7, 22, 23, 55)],
            timeZone: chicago, now: ct(2026, 7, 23, 0, 10)
        )
        #expect(result == .init(current: 1, longest: 1))
    }
}

struct RankMathTests {
    @Test func movementRiserFallerHolderEntrant() {
        // Yesterday: [10, 20, 30, 40]. Today: [30, 20, 10, 50].
        let movement = RankMath.movement(current: [30, 20, 10, 50], previous: [10, 20, 30, 40])
        #expect(movement[30] == .up(2))
        #expect(movement[20] == .same)
        #expect(movement[10] == .down(2))
        #expect(movement[50] == .entered)
    }

    @Test func emptyPreviousBoardIsAllEntered() {
        let movement = RankMath.movement(current: [1, 2], previous: [])
        #expect(movement[1] == .entered)
        #expect(movement[2] == .entered)
    }

    @Test func gapToNextAndLead() {
        let points = [10.0, 7.0, 6.5]
        #expect(RankMath.gapToNext(points: points, index: 0) == nil)
        #expect(RankMath.gapToNext(points: points, index: 1) == 3)
        #expect(RankMath.gapToNext(points: points, index: 2) == 0.5)
        #expect(RankMath.lead(points: points) == 3)
        #expect(RankMath.lead(points: [5.0]) == nil)
    }

    @Test func gapRoundsFloatNoise() {
        // 7.1 − 7.0 is 0.09999999999999964 in IEEE 754.
        #expect(RankMath.gapToNext(points: [7.1, 7.0], index: 1) == 0.1)
    }

    @Test func startOfTodayHandlesDST() {
        // 2026-03-08 is the US spring-forward date.
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = chicago
        let dstNoon = calendar.date(from: DateComponents(year: 2026, month: 3, day: 8, hour: 12))!
        let start = RankMath.startOfToday(in: chicago, now: dstNoon)
        let parts = calendar.dateComponents([.year, .month, .day, .hour], from: start)
        #expect(parts.day == 8)
        #expect(parts.hour == 0)
    }
}
