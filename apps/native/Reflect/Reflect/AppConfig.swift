import Foundation

/// Public client configuration, mirroring the NEXT_PUBLIC_* values in apps/web/.env.local.
/// These are publishable keys — safe to ship in the client. The Clerk key is the
/// development instance (pk_test); swap for the production key before release.
enum AppConfig {
    static let supabaseURL = URL(string: "https://hblhfsfcfpfvfjcywety.supabase.co")!
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibGhmc2ZjZnBmdmZqY3l3ZXR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTEyODksImV4cCI6MjA5MjM4NzI4OX0.erYtkzAuGxIyVVV9cEoNEIjicwsTRPsRLVCMIbQv9nM"
    static let clerkPublishableKey = "pk_test_ZmFuY3ktdGVycmllci00LmNsZXJrLmFjY291bnRzLmRldiQ"
}
