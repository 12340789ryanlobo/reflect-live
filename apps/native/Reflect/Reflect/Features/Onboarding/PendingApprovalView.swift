import SwiftUI
import Supabase

/// Waiting room after a cold join request. A Realtime subscription on the
/// user's own membership rows flips the app the instant a manager approves.
struct PendingApprovalView: View {
    let teamId: Int

    @Environment(SessionController.self) private var session

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            ProgressView()
            Text("Request sent")
                .font(.title2.bold())
            Text("A team manager needs to approve your request. This screen updates automatically.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 320)
            Spacer()
            Button("Sign Out", role: .destructive) {
                Task { await session.signOut() }
            }
            .font(.footnote)
        }
        .padding()
        .task { await watchMembership() }
    }

    private func watchMembership() async {
        guard let userId = session.userId else { return }
        let client = SupabaseService.client
        let channel = client.channel("membership-watch")
        let updates = channel.postgresChange(
            UpdateAction.self,
            schema: "public",
            table: "team_memberships",
            filter: .eq("user_id", value: userId)
        )
        try? await channel.subscribeWithError()
        for await _ in updates {
            await session.refresh()
        }
        await client.removeChannel(channel)
    }
}
