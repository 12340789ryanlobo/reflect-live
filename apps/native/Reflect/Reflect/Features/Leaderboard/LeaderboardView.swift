import SwiftUI

/// The Board: a living scoreboard, not a table. Movement arrows vs
/// yesterday, streak flames, the me-row pinned out visually with its gap
/// to the next rank. Top-3 read broadcast (weight + tint), not youth-soccer
/// (no medals). All content layer — no glass here.
struct LeaderboardView: View {
    let membership: ActiveMembership

    private enum Board: Hashable {
        case week
        case competition
    }

    /// Row-shape-agnostic display row: week and competition boards render
    /// through the same anatomy.
    fileprivate struct DisplayRow: Identifiable {
        let playerId: Int
        let name: String
        let detail: String
        let points: Double
        let movement: Movement?
        let flameDays: Int?
        let isMe: Bool
        let gapChip: String?

        var id: Int { playerId }
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
#if os(macOS)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Refresh", systemImage: "arrow.clockwise") {
                    Task { await model.load() }
                }
            }
        }
#endif
    }

    @ViewBuilder
    private func boardList(_ content: LeaderboardModel.Content) -> some View {
        let rows = displayRows(content)
        List {
            if let competition = content.activeCompetition {
                Picker("Board", selection: $board) {
                    Text("This Week").tag(Board.week)
                    Text(competition.name).tag(Board.competition)
                }
                .pickerStyle(.segmented)
                .listRowSeparator(.hidden)
            }

            if rows.isEmpty {
                ContentUnavailableView {
                    Label(Copy.boardEmpty, systemImage: "trophy")
                }
            } else {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    BoardRow(rank: index + 1, row: row)
                        .listRowBackground(rowBackground(isMe: row.isMe))
                }
            }
        }
    }

    private func rowBackground(isMe: Bool) -> some View {
        Group {
            if isMe {
                Theme.accent.opacity(0.10)
                    .overlay(alignment: .leading) {
                        Rectangle()
                            .fill(Theme.accent)
                            .frame(width: 3)
                    }
            } else {
                Color.clear
            }
        }
    }

    // MARK: - Display mapping

    private func displayRows(_ content: LeaderboardModel.Content) -> [DisplayRow] {
        let flames = weekFlames(content)
        switch board {
        case .week:
            let movement = RankMath.movement(
                current: content.weekRows.map(\.playerId),
                previous: content.weekRowsYesterday.map(\.playerId)
            )
            let points = content.weekRows.map(\.points)
            return content.weekRows.enumerated().map { index, row in
                DisplayRow(
                    playerId: row.playerId,
                    name: row.name,
                    detail: "\(row.workouts) workouts · \(row.rehabs) rehabs",
                    points: row.points,
                    movement: movement[row.playerId],
                    flameDays: flames[row.playerId],
                    isMe: row.playerId == membership.playerId,
                    gapChip: gapChip(points: points, index: index, isMe: row.playerId == membership.playerId)
                )
            }
        case .competition:
            let movement = RankMath.movement(
                current: content.competitionRows.map(\.playerId),
                previous: content.competitionRowsYesterday.map(\.playerId)
            )
            let points = content.competitionRows.map(\.points)
            return content.competitionRows.enumerated().map { index, row in
                DisplayRow(
                    playerId: row.playerId,
                    name: row.name,
                    detail: countsSummary(row.counts),
                    points: row.points,
                    movement: movement[row.playerId],
                    flameDays: flames[row.playerId],
                    isMe: row.playerId == membership.playerId,
                    gapChip: gapChip(points: points, index: index, isMe: row.playerId == membership.playerId)
                )
            }
        }
    }

    private func gapChip(points: [Double], index: Int, isMe: Bool) -> String? {
        guard isMe else { return nil }
        if index == 0 {
            return RankMath.lead(points: points).map(Copy.leadsBy)
        }
        return RankMath.gapToNext(points: points, index: index)
            .map { Copy.gapToNext($0, rank: index + 1) }
    }

    /// Week-scoped streaks for the board flames (entries only reach back to
    /// Monday; the athlete's true streak lives on Today). Shown at ≥ 3 days.
    private func weekFlames(_ content: LeaderboardModel.Content) -> [Int: Int] {
        var datesByPlayer: [Int: [Date]] = [:]
        for entry in content.weekEntries {
            guard let playerId = entry.playerId else { continue }
            datesByPlayer[playerId, default: []].append(entry.loggedAt)
        }
        return datesByPlayer.compactMapValues { dates in
            let streak = Streaks.compute(logDates: dates).current
            return streak >= 3 ? streak : nil
        }
    }

    private func countsSummary(_ counts: [String: Int]) -> String {
        counts.sorted { $0.value > $1.value }
            .map { "\($0.value) \($0.key)" }
            .joined(separator: " · ")
    }
}

// MARK: - Row anatomy

private struct BoardRow: View {
    let rank: Int
    let row: LeaderboardView.DisplayRow

    @State private var hovered = false

    var body: some View {
        HStack(spacing: 12) {
            movementColumn
                .frame(width: 24)

            rankCircle

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(row.name)
                        .fontWeight(row.isMe ? .bold : .regular)
                    if let flameDays = row.flameDays {
                        Label("\(flameDays)", systemImage: "flame.fill")
                            .font(.caption.bold())
                            .foregroundStyle(Theme.flame)
                    }
                }
                Text(row.detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text(Copy.points(row.points))
                    .font(.score(17))
                    .contentTransition(.numericText(value: row.points))
                if let gapChip = row.gapChip {
                    Text(gapChip)
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(.quaternary, in: Capsule())
                }
            }
        }
        .padding(.vertical, 2)
#if os(macOS)
        .background(.quaternary.opacity(hovered ? 0.5 : 0))
        .onHover { hovered = $0 }
#endif
    }

    @ViewBuilder
    private var movementColumn: some View {
        switch row.movement {
        case .up(let count):
            Label("\(count)", systemImage: "arrow.up")
                .font(.caption2.bold())
                .foregroundStyle(Theme.rankUp)
        case .down(let count):
            Label("\(count)", systemImage: "arrow.down")
                .font(.caption2.bold())
                .foregroundStyle(Theme.rankDown)
        case .same:
            Text("·")
                .foregroundStyle(.tertiary)
        case .entered, .none:
            EmptyView()
        }
    }

    private var rankCircle: some View {
        Text("\(rank)")
            .font(.score(rank <= 3 ? 18 : 16, weight: rank <= 3 ? .heavy : .semibold))
            .foregroundStyle(rank == 1 ? Theme.accent : .primary)
            .frame(width: 34, height: 34)
            .background(
                Circle().fill(
                    rank == 1 ? AnyShapeStyle(Theme.accent.opacity(0.15))
                        : rank <= 3 ? AnyShapeStyle(.quaternary)
                        : AnyShapeStyle(.clear)
                )
            )
    }
}
