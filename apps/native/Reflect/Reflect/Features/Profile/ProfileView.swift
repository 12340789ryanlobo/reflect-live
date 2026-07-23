import SwiftUI
import Supabase

/// Me + team + the invite link (the team's growth loop), + sign out.
struct ProfileView: View {
    let membership: ActiveMembership

    @Environment(SessionController.self) private var session
    @State private var teamCode: String?

    var body: some View {
        Form {
            Section("Account") {
                LabeledContent("Email", value: session.userEmail ?? "—")
                LabeledContent("Role", value: membership.role.displayName)
            }
            Section("Team") {
                LabeledContent("Team", value: membership.teamName)
                if let teamCode {
                    LabeledContent("Team code", value: teamCode)
                    if let url = AppConfig.inviteURL(code: teamCode) {
                        ShareLink(item: url) {
                            Label("Share invite link", systemImage: "link.badge.plus")
                        }
                    }
                }
            }
            Section {
                Button("Sign Out", role: .destructive) {
                    Task { await session.signOut() }
                }
            }
        }
        .navigationTitle("Profile")
        .task { await loadTeamCode() }
    }

    private func loadTeamCode() async {
        let teams: [Team] = (try? await SupabaseService.client
            .from("teams")
            .select("id, name, team_code, scoring_json")
            .eq("id", value: membership.teamId)
            .execute()
            .value) ?? []
        teamCode = teams.first?.teamCode
    }
}
