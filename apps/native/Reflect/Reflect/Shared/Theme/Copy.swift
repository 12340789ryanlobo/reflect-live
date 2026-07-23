import Foundation

/// The voice, in one place. Second person, terse, present tense.
/// No exclamation marks, no emoji — the scoreboard doesn't cheer, it reports.
enum Copy {
    static let boardEmpty = "Board's empty. First log leads."
    static let pulseQuiet = "Quiet so far today."
    static let notOnBoard = "One log puts you on the board."
    static let unscoredKind = "Doesn't score this week. Streak still counts."
    static let undo = "Undo"
    static let tookLead = "You lead."
    static let onBoard = "You're on the board."
    static let loggedQuiet = "Logged."

    static func passed(_ name: String) -> String {
        "You passed \(name)."
    }

    static func passed(count: Int) -> String {
        count == 1 ? "You passed 1 person." : "You passed \(count) people."
    }

    static func gapToNext(_ pts: Double, rank: Int) -> String {
        "\(points(pts)) pts off #\(rank - 1)."
    }

    static func leadsBy(_ pts: Double) -> String {
        "Leads by \(points(pts))."
    }

    static func streak(_ days: Int) -> String {
        "Day \(days)."
    }

    static func pulseLine(name: String, kind: String) -> String {
        "\(name) logged \(kind)"
    }

    /// "3" not "3.0"; up to two decimals for fractional weights.
    static func points(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...2)))
    }
}
