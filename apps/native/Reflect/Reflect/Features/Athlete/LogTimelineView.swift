import SwiftUI

/// The athlete's Log tab: own timeline + composer entry point.
struct LogTimelineView: View {
    let membership: ActiveMembership

    @State private var model: LogModel
    @State private var showComposer = false

    init(membership: ActiveMembership) {
        self.membership = membership
        _model = State(initialValue: LogModel(membership: membership))
    }

    var body: some View {
        Group {
            switch model.timeline {
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
            case .loaded(let logs):
                if logs.isEmpty {
                    ContentUnavailableView {
                        Label("Nothing logged yet", systemImage: "figure.run")
                    } description: {
                        Text("Log your first workout — it counts toward the leaderboard immediately.")
                    } actions: {
                        Button("Log Activity") { showComposer = true }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    List {
                        if let errorMessage = model.errorMessage {
                            ErrorBanner(message: errorMessage)
                        }
                        ForEach(logs) { log in
                            LogRow(log: log)
                                .swipeActions(edge: .trailing) {
                                    Button("Remove", systemImage: "trash", role: .destructive) {
                                        Task { await model.hide(log) }
                                    }
                                }
                                .contextMenu {
                                    Button("Remove", systemImage: "trash", role: .destructive) {
                                        Task { await model.hide(log) }
                                    }
                                }
                        }
                    }
                }
            }
        }
        .navigationTitle("Log")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Log Activity", systemImage: "plus") {
                    showComposer = true
                }
            }
        }
        .sheet(isPresented: $showComposer) {
            LogComposerView(model: model)
        }
        .task { await model.load() }
        .refreshable { await model.load() }
    }
}

struct LogRow: View {
    let log: ActivityLog

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            KindBadge(kind: log.kind)
            VStack(alignment: .leading, spacing: 2) {
                if let description = log.description, !description.isEmpty {
                    Text(description)
                }
                Text(log.loggedAt, format: .dateTime.weekday(.wide).month().day())
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 2)
    }
}
