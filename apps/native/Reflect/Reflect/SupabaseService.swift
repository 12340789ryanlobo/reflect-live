import Foundation
import ClerkKit
import Supabase

/// Supabase client authorized by Clerk, mirroring apps/web/src/lib/supabase-browser.ts:
/// every request carries a JWT minted from the Clerk "supabase" template, and
/// Postgres RLS scopes rows to the user's team via user_preferences.
enum SupabaseService {
    static let client = SupabaseClient(
        supabaseURL: AppConfig.supabaseURL,
        supabaseKey: AppConfig.supabaseAnonKey,
        options: SupabaseClientOptions(
            db: .init(decoder: postgresDecoder),
            auth: .init(accessToken: {
                try await Clerk.shared.session?.getToken(.init(template: "supabase"))
            })
        )
    )

    /// Decodes Postgres timestamps (timestamptz with microseconds, with or without timezone).
    static let postgresDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = PostgresDate.parse(raw) else {
                throw DecodingError.dataCorruptedError(
                    in: container,
                    debugDescription: "Unrecognized Postgres date: \(raw)"
                )
            }
            return date
        }
        return decoder
    }()
}

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
