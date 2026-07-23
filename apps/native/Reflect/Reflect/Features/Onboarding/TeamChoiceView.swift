import SwiftUI

/// The one onboarding fork: join an existing team or start a new one.
/// A pending invite deep link skips straight into the join form.
struct TeamChoiceView: View {
    @Environment(SessionController.self) private var session

    @State private var inviteJoin: (code: String, viaLink: Bool)?

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "person.3.sequence")
                .font(.system(size: 48))
                .foregroundStyle(.tint)
            Text("Almost there")
                .font(.title.bold())
            Text("Reflect runs on teams. Join yours, or start one and invite everybody.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 360)

            VStack(spacing: 12) {
                NavigationLink {
                    JoinTeamView(prefilledCode: nil, viaInviteLink: false)
                } label: {
                    Label("Join a team", systemImage: "person.badge.plus")
                        .frame(maxWidth: 280)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                NavigationLink {
                    CreateTeamView()
                } label: {
                    Label("Start a team", systemImage: "plus.circle")
                        .frame(maxWidth: 280)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
            Spacer()

            Button("Sign Out", role: .destructive) {
                Task { await session.signOut() }
            }
            .font(.footnote)
        }
        .padding()
        .navigationDestination(isPresented: Binding(
            get: { inviteJoin != nil },
            set: { if !$0 { inviteJoin = nil } }
        )) {
            if let inviteJoin {
                JoinTeamView(prefilledCode: inviteJoin.code, viaInviteLink: inviteJoin.viaLink)
            }
        }
        .onAppear {
            if let pending = session.consumeJoinCode() {
                inviteJoin = pending
            }
        }
    }
}
