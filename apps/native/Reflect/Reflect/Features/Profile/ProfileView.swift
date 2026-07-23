import SwiftUI
import Supabase

/// Me + team + the invite link (the team's growth loop), + sign out.
/// Managers also get "View as athlete" — the shell flips to the athlete
/// experience embodying a chosen roster player.
struct ProfileView: View {
    let membership: ActiveMembership

    @Environment(SessionController.self) private var session
    @State private var teamCode: String?
    @State private var roster: [Player] = []

    /// The real membership behind any preview — preview controls key off this.
    private var realMembership: ActiveMembership? {
        if case .ready(let real) = session.phase { return real }
        return nil
    }

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
            if let realMembership, realMembership.role.managesTeam {
                previewSection
            }
            Section {
                Button("Sign Out", role: .destructive) {
                    Task { await session.signOut() }
                }
            }
        }
        .navigationTitle("Profile")
        .task { await load() }
    }

    @ViewBuilder
    private var previewSection: some View {
        Section {
            if let previewing = session.previewPlayer {
                LabeledContent("Viewing as", value: previewing.name)
                Button("Exit athlete preview") {
                    session.previewPlayer = nil
                }
            } else {
                Menu {
                    ForEach(roster) { player in
                        Button(player.name) {
                            session.previewPlayer = player
                        }
                    }
                } label: {
                    Label("View as athlete…", systemImage: "eye")
                }
                .disabled(roster.isEmpty)
            }
        } header: {
            Text("Preview")
        } footer: {
            Text("See the app exactly as an athlete does. Anything you log while previewing is recorded for that athlete.")
        }
    }

    private func load() async {
        guard let realMembership else { return }
        async let teamsFetch: [Team] = SupabaseService.client
            .from("teams")
            .select("id, name, team_code, scoring_json")
            .eq("id", value: realMembership.teamId)
            .execute()
            .value
        async let playersFetch: [Player] = SupabaseService.client
            .from("players")
            .select("id, team_id, name, group, active")
            .eq("team_id", value: realMembership.teamId)
            .eq("active", value: true)
            .order("name")
            .execute()
            .value
        teamCode = (try? await teamsFetch)?.first?.teamCode
        if realMembership.role.managesTeam {
            roster = (try? await playersFetch) ?? []
        }
    }
}
