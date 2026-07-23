import Foundation
import Testing
@testable import Reflect

struct PostgresDateTests {
    @Test func parsesMicrosecondPrecision() {
        let date = PostgresDate.parse("2026-07-22T14:30:00.123456+00:00")
        #expect(date != nil)
    }

    @Test func parsesMillisecondPrecision() {
        let date = PostgresDate.parse("2026-07-22T14:30:00.123Z")
        #expect(date != nil)
    }

    @Test func parsesWithoutFractionalSeconds() {
        let date = PostgresDate.parse("2026-07-22T14:30:00Z")
        #expect(date != nil)
    }

    @Test func parsesSpaceSeparatorAndMissingTimezoneAsUTC() {
        let spaced = PostgresDate.parse("2026-07-22 14:30:00.123456")
        let explicit = PostgresDate.parse("2026-07-22T14:30:00.123Z")
        #expect(spaced == explicit)
    }

    @Test func rejectsGarbage() {
        #expect(PostgresDate.parse("not a date") == nil)
    }

    @Test func microsecondsTruncateToMilliseconds() {
        let a = PostgresDate.parse("2026-07-22T14:30:00.123999Z")
        let b = PostgresDate.parse("2026-07-22T14:30:00.123Z")
        #expect(a == b)
    }
}
