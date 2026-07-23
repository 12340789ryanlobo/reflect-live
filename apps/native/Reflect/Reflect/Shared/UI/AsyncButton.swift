import SwiftUI

/// Button that runs an async action, showing progress and preventing double-taps.
struct AsyncButton: View {
    let title: String
    @Binding var isWorking: Bool
    let action: () async -> Void

    init(_ title: String, isWorking: Binding<Bool>, action: @escaping () async -> Void) {
        self.title = title
        self._isWorking = isWorking
        self.action = action
    }

    var body: some View {
        Button {
            guard !isWorking else { return }
            Task {
                isWorking = true
                defer { isWorking = false }
                await action()
            }
        } label: {
            HStack(spacing: 8) {
                if isWorking {
                    ProgressView()
                        .controlSize(.small)
                }
                Text(title)
            }
        }
        .disabled(isWorking)
    }
}
