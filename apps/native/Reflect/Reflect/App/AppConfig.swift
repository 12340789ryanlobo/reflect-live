import Foundation

/// Public client configuration. These are publishable keys — safe to ship in the client.
enum AppConfig {
    static let supabaseURL = URL(string: "https://hblhfsfcfpfvfjcywety.supabase.co")!
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibGhmc2ZjZnBmdmZqY3l3ZXR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTEyODksImV4cCI6MjA5MjM4NzI4OX0.erYtkzAuGxIyVVV9cEoNEIjicwsTRPsRLVCMIbQv9nM"

    /// Custom URL scheme for invite deep links: reflect://join?code=<team_code>
    static let urlScheme = "reflect"

    static func inviteURL(code: String) -> URL? {
        var components = URLComponents()
        components.scheme = urlScheme
        components.host = "join"
        components.queryItems = [URLQueryItem(name: "code", value: code)]
        return components.url
    }
}
