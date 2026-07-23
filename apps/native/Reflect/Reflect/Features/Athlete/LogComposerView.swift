import SwiftUI

/// The composer: kind, optional note, date. Logging should feel like
/// scoring, not homework — minimum required input is two taps.
struct LogComposerView: View {
    @Bindable var model: LogModel
    /// When hosted by Today, submits route through TodayModel so current-day
    /// logs get the Log Moment (backdates stay quiet). Nil = legacy path.
    var onSubmit: ((String, String, Date) async -> Bool)? = nil

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
                        let succeeded: Bool
                        if let onSubmit {
                            succeeded = await onSubmit(kind, note, loggedAt)
                        } else {
                            succeeded = await model.submit(kind: kind, description: note, loggedAt: loggedAt)
                        }
                        if succeeded { dismiss() }
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
