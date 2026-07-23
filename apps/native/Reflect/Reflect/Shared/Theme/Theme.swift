import SwiftUI

/// The scoreboard look: broadcast-cyan accent, semantic movement colors,
/// rolled numerals. Content cards use standard materials — Liquid Glass is
/// reserved for the one floating control per screen (HIG: functional layer).
enum Theme {
    /// Electric pool-cyan from Theme.xcassets (dark: #2BE0F0, light: #0891B2).
    static let accent = Color("AccentPool")
    static let rankUp = Color.green
    static let rankDown = Color.red.opacity(0.8)
    static let flame = Color.orange
}

extension Font {
    /// Scoreboard numeral: rounded + monospacedDigit so digits roll, never jitter.
    static func score(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .rounded).monospacedDigit()
    }
}

extension View {
    /// Content-card treatment (standard material, NOT glass).
    func scoreCard() -> some View {
        padding()
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
