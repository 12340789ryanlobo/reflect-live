import Foundation

/// Parses Postgres timestamp strings, which vary in fractional-second precision
/// (microseconds vs milliseconds) and may omit the timezone suffix.
enum PostgresDate {
    private static let fractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let plain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func parse(_ raw: String) -> Date? {
        var value = raw.replacingOccurrences(of: " ", with: "T")
        value = ensureTimezone(value)
        // ISO8601DateFormatter only accepts exactly 3 fractional digits; Postgres emits up to 6.
        let normalized = value.replacingOccurrences(
            of: #"\.(\d{3})\d*"#,
            with: ".$1",
            options: .regularExpression
        )
        return fractional.date(from: normalized) ?? plain.date(from: value)
    }

    private static func ensureTimezone(_ value: String) -> String {
        let timePart = value.drop { $0 != "T" }.dropFirst()
        if timePart.contains("Z") || timePart.contains("+") || timePart.contains("-") {
            return value
        }
        return value + "Z"
    }
}
