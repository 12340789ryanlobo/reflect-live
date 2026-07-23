import SwiftUI

/// The composer: kind, optional note, date. Logging should feel like
/// scoring, not homework — minimum required input is two taps.
struct LogComposerView: View {
    @Bindable var model: LogModel
    @Environment(\.dismiss) private var dismiss

    @State private var kind = "workout"
    @State private var note = ""
    @State private var loggedAt = Date.now
    @State private var isWorking = false

    var body: some View {
        NavigationStack {
            Form {
                Section("What did you do?") {
                    Picker("Kind", selection: $kind) {
                        ForEach(model.kinds, id: \.self) { kind in
                            Text(kind.capitalized).tag(kind)
                        }
                    }
#if os(iOS)
                    .pickerStyle(.segmented)
#endif
                    TextField("Add a note (optional)", text: $note, axis: .vertical)
                        .lineLimit(1...4)
                    DatePicker("When", selection: $loggedAt, in: ...Date.now, displayedComponents: [.date, .hourAndMinute])
                }
                if let errorMessage = model.errorMessage {
                    ErrorBanner(message: errorMessage)
                }
                Section {
                    AsyncButton("Log It", isWorking: $isWorking) {
                        if await model.submit(kind: kind, description: note, loggedAt: loggedAt) {
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle("Log Activity")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
#if os(macOS)
        .frame(minWidth: 380, minHeight: 320)
#endif
        .onAppear {
            if !model.kinds.contains(kind), let first = model.kinds.first {
                kind = first
            }
        }
    }
}
