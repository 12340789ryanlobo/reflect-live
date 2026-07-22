import SwiftUI
import ClerkKit

struct DashboardView: View {
    @Environment(Clerk.self) private var clerk
    @State private var model: DashboardModel

    init(team: Team) {
        _model = State(initialValue: DashboardModel(team: team))
    }

    var body: some View {
        NavigationStack {
            List {
                if let errorMessage = model.errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }

                Section("Today") {
                    statsGrid
                }

                Section("Live Feed") {
                    if model.isLoaded && model.messages.isEmpty {
                        Text("No messages yet.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(model.messages) { message in
                        MessageRow(message: message, senderName: model.playerName(for: message))
                    }
                }
            }
            .navigationTitle(model.team.name)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Sign Out", systemImage: "rectangle.portrait.and.arrow.right") {
                        Task { try? await clerk.auth.signOut() }
                    }
                }
            }
            .overlay {
                if !model.isLoaded && model.errorMessage == nil {
                    ProgressView()
                }
            }
            .refreshable {
                await model.load()
            }
            .task {
                await model.start()
            }
            .onDisappear {
                model.stop()
            }
        }
    }

    private var statsGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 12)], spacing: 12) {
            StatCard(title: "Messages", value: "\(model.messagesToday.count)", systemImage: "message")
            StatCard(title: "Active", value: "\(model.activePlayerCountToday)", systemImage: "figure.pool.swim")
            StatCard(title: "Roster", value: "\(model.rosterCount)", systemImage: "person.3")
            StatCard(
                title: "Response",
                value: model.responseRateToday.map { "\($0)%" } ?? "—",
                systemImage: "chart.line.uptrend.xyaxis"
            )
        }
        .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
        .listRowBackground(Color.clear)
    }
}

private struct StatCard: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(title, systemImage: systemImage)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title2.bold())
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct MessageRow: View {
    let message: TwilioMessage
    let senderName: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: message.isInbound ? "arrow.down.left.circle.fill" : "arrow.up.right.circle")
                    .foregroundStyle(message.isInbound ? .green : .secondary)
                Text(senderName)
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text(message.dateSent, style: .relative)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let body = message.body, !body.isEmpty {
                Text(body)
                    .font(.subheadline)
                    .lineLimit(3)
            }
            CategoryBadge(category: message.category)
        }
        .padding(.vertical, 2)
    }
}

private struct CategoryBadge: View {
    let category: String

    private var color: Color {
        switch category {
        case "workout": .blue
        case "rehab": .orange
        case "survey": .purple
        default: .gray
        }
    }

    var body: some View {
        Text(category.capitalized)
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }
}
