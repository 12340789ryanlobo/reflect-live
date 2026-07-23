import SwiftUI

/// The athlete's home: where do I stand, is the team moving, and one-tap
/// logging. The quick-log cluster is the screen's single Liquid Glass
/// element (HIG: glass is the floating functional layer, content is not).
struct TodayView: View {
    let membership: ActiveMembership

    @State private var model: TodayModel
    @State private var composerModel: LogModel
    @State private var showComposer = false
    @State private var quickLogExpanded = false
    @State private var logCount = 0
    @State private var shownPoints: Double = 0

    @Namespace private var glassNamespace
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(membership: ActiveMembership) {
        self.membership = membership
        _model = State(initialValue: TodayModel(membership: membership))
        _composerModel = State(initialValue: LogModel(membership: membership))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                heroCard
                if let errorMessage = model.errorMessage {
                    ErrorBanner(message: errorMessage)
                }
                pulseSection
            }
            .padding()
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("Today")
        .safeAreaInset(edge: .bottom) { quickLogCluster }
        .sheet(isPresented: $showComposer, onDismiss: {
            Task { await model.load() }
        }) {
            LogComposerView(model: composerModel)
        }
        .task { await model.load() }
        .task { await model.watchPulse() }
        .refreshable { await model.load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await model.load() }
            }
        }
        .onChange(of: model.myPoints) { _, points in
            if reduceMotion {
                shownPoints = points
            } else {
                withAnimation(.easeOut(duration: 0.6)) { shownPoints = points }
            }
        }
        .sensoryFeedback(.success, trigger: logCount)
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

    // MARK: - Hero scoreboard card

    @ViewBuilder
    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("This Week")
                .font(.headline)
                .foregroundStyle(.secondary)

            if case .failed(let message) = model.leaderboard.state {
                ErrorBanner(message: message)
            } else if model.leaderboard.state.value == nil {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 28) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Copy.points(shownPoints))
                            .font(.score(48))
                            .contentTransition(.numericText(value: shownPoints))
                        Text("points")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if let index = model.myIndex {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text("#\(index + 1)")
                                    .font(.score(48))
                                movementChip
                            }
                            Text("of \(model.weekRows.count)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                }

                HStack(spacing: 14) {
                    if model.streak.current >= 2 {
                        Label(Copy.streak(model.streak.current), systemImage: "flame.fill")
                            .foregroundStyle(Theme.flame)
                            .font(.callout.weight(.semibold))
                    }
                    if let gapLine = model.myGapLine {
                        Text(gapLine)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                    if model.myIndex == nil {
                        Text(Copy.notOnBoard)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .scoreCard()
    }

    @ViewBuilder
    private var movementChip: some View {
        switch model.myMovement {
        case .up(let count):
            Label("\(count)", systemImage: "arrow.up")
                .font(.caption.bold())
                .foregroundStyle(Theme.rankUp)
                .labelStyle(.titleAndIcon)
        case .down(let count):
            Label("\(count)", systemImage: "arrow.down")
                .font(.caption.bold())
                .foregroundStyle(Theme.rankDown)
        default:
            EmptyView()
        }
    }

    // MARK: - Pulse feed

    @ViewBuilder
    private var pulseSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Pulse")
                .font(.headline)
                .foregroundStyle(.secondary)

            switch model.pulse {
            case .idle, .loading:
                ProgressView()
            case .failed(let message):
                ErrorBanner(message: message)
            case .loaded(let items):
                if items.isEmpty {
                    Text(Copy.pulseQuiet)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(items) { item in
                        HStack(alignment: .firstTextBaseline) {
                            Text(item.isMe ? Copy.pulseLine(name: "You", kind: item.kind)
                                           : Copy.pulseLine(name: item.playerName, kind: item.kind))
                                .fontWeight(item.isMe ? .semibold : .regular)
                            Spacer()
                            Text(item.loggedAt, style: .relative)
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                                .monospacedDigit()
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
    }

    // MARK: - Quick-log glass cluster

    private var quickLogCluster: some View {
        GlassEffectContainer(spacing: 12) {
            HStack(spacing: 12) {
                if quickLogExpanded {
                    Button {
                        withAnimation(.spring) { quickLogExpanded = false }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.headline)
                            .padding(12)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.interactive())
                    .glassEffectID("close", in: glassNamespace)

                    ForEach(model.kinds, id: \.self) { kind in
                        Button {
                            Task { await quickLog(kind) }
                        } label: {
                            Text(kind.capitalized)
                                .font(.headline)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 12)
                        }
                        .buttonStyle(.plain)
                        .glassEffect(.regular.interactive())
                        .glassEffectID(kind, in: glassNamespace)
                    }

                    Button {
                        quickLogExpanded = false
                        showComposer = true
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.headline)
                            .padding(12)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.interactive())
                    .glassEffectID("more", in: glassNamespace)
                } else {
                    Button {
                        withAnimation(.spring) { quickLogExpanded = true }
                    } label: {
                        Label("Log", systemImage: "plus")
                            .font(.headline)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 14)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.tint(Theme.accent).interactive())
                    .glassEffectID("log", in: glassNamespace)
                }
            }
        }
        .glassEffectTransition(.matchedGeometry)
        .padding(.bottom, 8)
    }

    private func quickLog(_ kind: String) async {
        withAnimation(.spring) { quickLogExpanded = false }
        if await model.quickLog(kind: kind) != nil {
            logCount += 1
        }
    }
}
