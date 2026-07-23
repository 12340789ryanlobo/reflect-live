import SwiftUI

struct ErrorBanner: View {
    let message: String

    var body: some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.callout)
            .foregroundStyle(.red)
    }
}

/// Colored capsule for an activity kind; hue is derived from the kind name
/// so new kinds get stable colors without configuration.
struct KindBadge: View {
    let kind: String

    private var hue: Double {
        Double(abs(kind.hashValue % 360)) / 360
    }

    var body: some View {
        Text(kind)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color(hue: hue, saturation: 0.5, brightness: 0.85).opacity(0.35), in: Capsule())
    }
}
