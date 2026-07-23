import SwiftUI

/// The athlete's home: where do I stand this week, and one-tap logging.
/// Survey inbox joins this screen in Phase 2.
struct TodayView: View {
    let membership: ActiveMembership

    @State private var leaderboard: LeaderboardModel
    @State private var logModel: LogModel
    @State private var showComposer = false

    init(membership: ActiveMembership) {
        self.membership = membership
        _leaderboard = State(initialValue: LeaderboardModel(membership: membership))
        _logModel = State(initialValue: LogModel(membership: membership))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let content = leaderboard.state.value {
                    weekCard(content)
                } else if case .failed(let message) = leaderboard.state {
                    ErrorBanner(message: message)
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                }

                Button {
                    showComposer = true
                } label: {
                    Label("Log Activity", systemImage: "plus.circle.fill")
                        .font(.title3.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            .padding()
        }
        .navigationTitle("Today")
        .sheet(isPresented: $showComposer, onDismiss: {
            Task { await leaderboard.load() }
        }) {
            LogComposerView(model: logModel)
        }
        .task {
            await logModel.load()
            await leaderboard.load()
        }
        .refreshable { await leaderboard.load() }
    }

    @ViewBuilder
    private func weekCard(_ content: LeaderboardModel.Content) -> some View {
        let myIndex = content.weekRows.firstIndex { $0.playerId == membership.playerId }
        let myRow = myIndex.map { content.weekRows[$0] }

        VStack(alignment: .leading, spacing: 8) {
            Text("This Week")
                .font(.headline)
                .foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 24) {
                VStack(alignment: .leading) {
                    Text((myRow?.points ?? 0).formatted(.number.precision(.fractionLength(0...2))))
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                    Text("points")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let myIndex {
                    VStack(alignment: .leading) {
                        Text("#\(myIndex + 1)")
                            .font(.system(size: 44, weight: .bold, design: .rounded))
                        Text("of \(content.weekRows.count)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            if myRow == nil {
                Text("Nothing on the board yet this week — one log puts you on it.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
    }
}
