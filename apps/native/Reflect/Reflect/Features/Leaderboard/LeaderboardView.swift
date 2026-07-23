import SwiftUI

struct LeaderboardView: View {
    let membership: ActiveMembership

    private enum Board: Hashable {
        case week
        case competition
    }

    @State private var model: LeaderboardModel
    @State private var board: Board = .week

    init(membership: ActiveMembership) {
        self.membership = membership
        _model = State(initialValue: LeaderboardModel(membership: membership))
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
                boardList(content)
            }
        }
        .navigationTitle("Leaderboard")
        .task { await model.load() }
        .refreshable { await model.load() }
    }

    @ViewBuilder
    private func boardList(_ content: LeaderboardModel.Content) -> some View {
        List {
            if let competition = content.activeCompetition {
                Picker("Board", selection: $board) {
                    Text("This Week").tag(Board.week)
                    Text(competition.name).tag(Board.competition)
                }
                .pickerStyle(.segmented)
                .listRowSeparator(.hidden)
            }

            switch board {
            case .week where content.weekRows.isEmpty,
                 .competition where content.competitionRows.isEmpty:
                ContentUnavailableView {
                    Label("No points yet", systemImage: "trophy")
                } description: {
                    Text("First one to log takes the lead.")
                }
            case .week:
                ForEach(Array(content.weekRows.enumerated()), id: \.element.id) { index, row in
                    rankRow(rank: index + 1, name: row.name, group: row.group,
                            points: row.points,
                            detail: "\(row.workouts) workouts · \(row.rehabs) rehabs",
                            isMe: row.playerId == membership.playerId)
                }
            case .competition:
                ForEach(Array(content.competitionRows.enumerated()), id: \.element.id) { index, row in
                    rankRow(rank: index + 1, name: row.name, group: row.group,
                            points: row.points,
                            detail: countsSummary(row.counts),
                            isMe: row.playerId == membership.playerId)
                }
            }
        }
    }

    private func rankRow(rank: Int, name: String, group: String?, points: Double, detail: String, isMe: Bool) -> some View {
        HStack(spacing: 12) {
            Text("\(rank)")
                .font(.headline.monospacedDigit())
                .frame(width: 28)
                .foregroundStyle(rank <= 3 ? Color.orange : Color.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .fontWeight(isMe ? .bold : .regular)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(points.formatted(.number.precision(.fractionLength(0...2))))
                .font(.headline.monospacedDigit())
        }
        .listRowBackground(isMe ? Color.accentColor.opacity(0.08) : nil)
    }

    private func countsSummary(_ counts: [String: Int]) -> String {
        counts.sorted { $0.value > $1.value }
            .map { "\($0.value) \($0.key)" }
            .joined(separator: " · ")
    }
}
