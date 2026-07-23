import SwiftUI

/// The payoff for logging: points count up, the rank rolls, the verdict
/// lands, the streak ticks. Beat-driven; Reduce Motion shows everything
/// immediately. Content card on a scrim — glass stays on the Log button.
struct LogMomentOverlay: View {
    let data: LogMomentData
    let onUndo: () async -> Void
    let onDismiss: () -> Void

    @State private var beat = 0
    @State private var shownPoints: Double = 0
    @State private var shownRank: Int
    @State private var shownStreak: Int
    @State private var undoAvailable = true
    @State private var isUndoing = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(data: LogMomentData, onUndo: @escaping () async -> Void, onDismiss: @escaping () -> Void) {
        self.data = data
        self.onUndo = onUndo
        self.onDismiss = onDismiss
        _shownRank = State(initialValue: (data.rankBefore ?? data.rankAfter ?? 0) + 1)
        _shownStreak = State(initialValue: data.streakBefore)
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.45)
                .ignoresSafeArea()
                .onTapGesture { onDismiss() }

            card
                .frame(maxWidth: 420)
                .padding(24)
        }
        .sensoryFeedback(.impact(weight: .medium), trigger: data.id)
        .sensoryFeedback(.success, trigger: beat) { _, new in
            new == 2 && data.rankImproved
        }
        .task { await runBeats() }
#if os(macOS)
        .onExitCommand { onDismiss() }
#endif
    }

    private var card: some View {
        VStack(spacing: 18) {
            Text(data.kind.uppercased())
                .font(.caption.weight(.bold))
                .tracking(2)
                .foregroundStyle(.secondary)

            if data.pointsEarned != nil {
                Text("+\(Copy.points(shownPoints))")
                    .font(.score(64))
                    .foregroundStyle(Theme.accent)
                    .contentTransition(.numericText(value: shownPoints))
            } else {
                Text(Copy.unscoredKind)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            if data.rankAfter != nil, data.pointsEarned != nil {
                VStack(spacing: 6) {
                    Text("#\(shownRank)")
                        .font(.score(40))
                        .contentTransition(.numericText(countsDown: true))
                    if beat >= 2, let verdict = data.verdict {
                        Text(verdict)
                            .font(.headline)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
            }

            if beat >= 3, data.streakAfter > data.streakBefore {
                Label(Copy.streak(shownStreak), systemImage: "flame.fill")
                    .font(.headline)
                    .foregroundStyle(Theme.flame)
                    .contentTransition(.numericText(value: Double(shownStreak)))
                    .transition(.opacity)
            }

            HStack {
                if undoAvailable {
                    Button(Copy.undo) {
                        guard !isUndoing else { return }
                        isUndoing = true
                        Task { await onUndo() }
                    }
                    .buttonStyle(.plain)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .transition(.opacity)
                }
                Spacer()
                Button("Done") { onDismiss() }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
            .padding(.top, 4)
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func runBeats() async {
        if reduceMotion {
            beat = 3
            shownPoints = data.pointsEarned ?? 0
            shownRank = (data.rankAfter ?? data.rankBefore ?? 0) + 1
            shownStreak = data.streakAfter
            await expireUndo()
            return
        }
        try? await Task.sleep(for: .seconds(0.25))
        beat = 1
        withAnimation(.easeOut(duration: 0.7)) { shownPoints = data.pointsEarned ?? 0 }

        try? await Task.sleep(for: .seconds(0.75))
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            beat = 2
            if let after = data.rankAfter { shownRank = after + 1 }
        }

        try? await Task.sleep(for: .seconds(0.35))
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            beat = 3
            shownStreak = data.streakAfter
        }
        await expireUndo()
    }

    /// The 5s undo window keeps the moment tidy — the log stays removable
    /// later from the Log tab.
    private func expireUndo() async {
        try? await Task.sleep(for: .seconds(5))
        withAnimation(.easeOut(duration: 0.3)) { undoAvailable = false }
    }
}
