import Foundation
import Supabase

/// Supabase client authenticated natively (Supabase Auth). The SDK persists
/// the session in the Keychain and refreshes tokens + Realtime auth itself;
/// Postgres RLS scopes rows to the user's team via team_memberships.
enum SupabaseService {
    static let client = SupabaseClient(
        supabaseURL: AppConfig.supabaseURL,
        supabaseKey: AppConfig.supabaseAnonKey,
        options: SupabaseClientOptions(
            db: .init(decoder: postgresDecoder)
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

    /// ISO8601 string for a timestamptz column write.
    static func timestamp(_ date: Date) -> String {
        date.ISO8601Format(.iso8601WithTimeZone(includingFractionalSeconds: true))
    }
}
