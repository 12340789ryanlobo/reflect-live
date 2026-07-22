import SwiftUI
import ClerkKit
import Supabase

/// Resolves the signed-in user's active team from user_preferences
/// (same source of truth the web dashboard uses), then shows the dashboard.
struct TeamGateView: View {
    @Environment(Clerk.self) private var clerk

    private enum LoadState {
        case loading
        case noTeam
        case failed(String)
        case ready(Team)
    }

    @State private var state: LoadState = .loading

    var body: some View {
        switch state {
        case .loading:
            ProgressView("Loading your team…")
                .task { await load() }
        case .ready(let team):
            DashboardView(team: team)
        case .noTeam:
            ContentUnavailableView {
                Label("No Team Yet", systemImage: "person.3")
            } description: {
                Text("Finish setting up your team on the Reflect website, then come back here.")
            } actions: {
                signOutButton
            }
        case .failed(let message):
            ContentUnavailableView {
                Label("Couldn't Load Team", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Retry") {
                    state = .loading
                }
                signOutButton
            }
        }
    }

    private var signOutButton: some View {
        Button("Sign Out", role: .destructive) {
            Task { try? await clerk.auth.signOut() }
        }
    }

    private func load() async {
        do {
            // RLS restricts user_preferences to the current user, so no filter is needed.
            let preferences: [UserPreferences] = try await SupabaseService.client
                .from("user_preferences")
                .select("clerk_user_id, team_id")
                .limit(1)
                .execute()
                .value
            guard let teamId = preferences.first?.teamId else {
                state = .noTeam
                return
            }
            let teams: [Team] = try await SupabaseService.client
                .from("teams")
                .select("id, name")
                .eq("id", value: teamId)
                .execute()
                .value
            if let team = teams.first {
                state = .ready(team)
            } else {
                state = .noTeam
            }
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}
