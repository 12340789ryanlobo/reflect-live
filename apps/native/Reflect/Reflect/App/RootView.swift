import SwiftUI

/// Switchboard: auth → onboarding → role-appropriate shell.
struct RootView: View {
    @Environment(SessionController.self) private var session

    var body: some View {
        switch session.phase {
        case .loading:
            ProgressView()
        case .signedOut:
            SignInView()
        case .needsTeam:
            NavigationStack {
                TeamChoiceView()
            }
        case .pendingApproval(let teamId):
            PendingApprovalView(teamId: teamId)
        case .ready(let membership):
            AppShell(membership: membership)
                .id(membership) // rebuild the shell if the active team/role changes
        }
    }
}
