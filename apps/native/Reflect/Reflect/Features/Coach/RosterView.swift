import SwiftUI

struct RosterView: View {
    let membership: ActiveMembership

    @Environment(SessionController.self) private var session
    @State private var model: RosterModel

    init(membership: ActiveMembership) {
        self.membership = membership
        _model = State(initialValue: RosterModel(membership: membership))
    }

    var body: some View {
        Group {
            switch model.state {
            case .idle, .loading:
                ProgressView()
            case .failed(let message):
                ContentUnavailableView {
                    Label("Couldn't Load", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Retry") { Task { await model.load() } }
                }
            case .loaded(let content):
                List {
                    if let errorMessage = model.errorMessage {
                        ErrorBanner(message: errorMessage)
                    }
                    if !content.requests.isEmpty {
                        Section("Requests") {
                            ForEach(content.requests) { request in
                                requestRow(request)
                            }
                        }
                    }
                    Section("Roster (\(content.players.count))") {
                        if content.players.isEmpty {
                            Text("No athletes yet — share the invite link from your Profile tab.")
                                .foregroundStyle(.secondary)
                        }
                        ForEach(content.players) { player in
                            HStack {
                                Text(player.name)
                                Spacer()
                                if let group = player.group {
                                    Text(group)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Roster")
        .task { await model.load() }
        .refreshable { await model.load() }
    }

    private func requestRow(_ request: JoinRequest) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(request.requestedName ?? "Unnamed")
                .fontWeight(.medium)
            if let email = request.requestedEmail {
                Text(email)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Button("Approve") {
                    Task {
                        guard let uid = session.userId else { return }
                        await model.approve(request, deciderUserId: uid)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                Button("Deny", role: .destructive) {
                    Task {
                        guard let uid = session.userId else { return }
                        await model.deny(request, deciderUserId: uid)
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(.vertical, 4)
    }
}
