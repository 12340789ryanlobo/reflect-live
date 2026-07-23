import SwiftUI

/// Join by team code. Invite-link arrivals get the code prefilled and are
/// auto-approved server-side; cold code entry lands in the approval queue.
struct JoinTeamView: View {
    let prefilledCode: String?
    let viaInviteLink: Bool

    @Environment(SessionController.self) private var session
    @State private var model = OnboardingModel()

    @State private var code = ""
    @State private var name = ""
    @State private var phone = ""
    @State private var isWorking = false

    var body: some View {
        Form {
            Section("Team code") {
                TextField("e.g. uchicago-swim", text: $code)
#if os(iOS)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
#endif
                    .disabled(viaInviteLink && prefilledCode != nil)
            }
            Section("About you") {
                TextField("Your name", text: $name)
                    .textContentType(.name)
                TextField("Phone (optional)", text: $phone)
                    .textContentType(.telephoneNumber)
#if os(iOS)
                    .keyboardType(.phonePad)
#endif
            }
            if let errorMessage = model.errorMessage {
                ErrorBanner(message: errorMessage)
            }
            Section {
                AsyncButton(viaInviteLink ? "Join Team" : "Request to Join", isWorking: $isWorking) {
                    await submit()
                }
                .disabled(code.isEmpty || name.isEmpty)
            } footer: {
                if !viaInviteLink {
                    Text("A team manager approves requests. You'll get in the moment they do.")
                }
            }
        }
        .navigationTitle("Join a Team")
        .onAppear {
            if let prefilledCode, code.isEmpty { code = prefilledCode }
        }
    }

    private func submit() async {
        let joined = await model.joinTeam(
            code: code,
            name: name,
            email: session.userEmail,
            phone: normalizedPhone(),
            viaInviteLink: viaInviteLink
        )
        if joined {
            await session.refresh()
        }
    }

    /// Lightweight E.164 normalization for US-style numbers; anything else
    /// passes through raw so a join is never blocked on phone formatting.
    /// (PhoneNumberKit does this properly once it's a direct dependency.)
    private func normalizedPhone() -> String? {
        let trimmed = phone.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if trimmed.hasPrefix("+") { return trimmed }
        let digits = trimmed.filter(\.isNumber)
        if digits.count == 10 { return "+1" + digits }
        if digits.count == 11, digits.hasPrefix("1") { return "+" + digits }
        return trimmed
    }
}
