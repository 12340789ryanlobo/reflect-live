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
            let effective = session.effectiveMembership(membership)
            AppShell(membership: effective)
                .id(effective) // rebuild the shell if the team/role/preview changes
        }
    }
}
