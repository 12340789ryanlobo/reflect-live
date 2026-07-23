import SwiftUI
import AuthenticationServices
import CryptoKit
import Supabase

/// Sign in with Apple (primary) with email OTP as the co-equal fallback —
/// SIWA needs the paid Apple Developer Program entitlement, OTP does not.
struct SignInView: View {
    @Environment(\.colorScheme) private var colorScheme

    private enum EmailStep {
        case enterEmail
        case enterCode(email: String)
    }

    @State private var emailStep: EmailStep = .enterEmail
    @State private var email = ""
    @State private var code = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    /// Raw nonce for the in-flight Apple request; Apple gets the SHA-256 hash.
    @State private var currentNonce: String?

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "waveform.path.ecg")
                .font(.system(size: 56))
                .foregroundStyle(.tint)
            Text("Reflect")
                .font(.largeTitle.bold())
            Text("Your team competes to stay accountable.")
                .foregroundStyle(.secondary)

            SignInWithAppleButton(.signIn) { request in
                let nonce = Self.randomNonce()
                currentNonce = nonce
                request.requestedScopes = [.email]
                request.nonce = Self.sha256(nonce)
            } onCompletion: { result in
                Task { await handleApple(result) }
            }
            .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
            .frame(maxWidth: 320)
            .frame(height: 48)
            .padding(.top, 16)

            Text("or use email")
                .font(.footnote)
                .foregroundStyle(.secondary)

            emailForm
                .frame(maxWidth: 320)

            if let errorMessage {
                ErrorBanner(message: errorMessage)
                    .frame(maxWidth: 320)
            }
            Spacer()
        }
        .padding()
    }

    @ViewBuilder
    private var emailForm: some View {
        switch emailStep {
        case .enterEmail:
            VStack(spacing: 8) {
                TextField("you@example.com", text: $email)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.emailAddress)
#if os(iOS)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
#endif
                AsyncButton("Send Code", isWorking: $isWorking) {
                    await sendCode()
                }
                .buttonStyle(.borderedProminent)
                .disabled(email.isEmpty)
            }
        case .enterCode(let sentTo):
            VStack(spacing: 8) {
                Text("Enter the 6-digit code sent to \(sentTo)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                TextField("123456", text: $code)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.oneTimeCode)
#if os(iOS)
                    .keyboardType(.numberPad)
#endif
                AsyncButton("Verify", isWorking: $isWorking) {
                    await verifyCode(email: sentTo)
                }
                .buttonStyle(.borderedProminent)
                .disabled(code.count < 6)
                Button("Use a different email") {
                    emailStep = .enterEmail
                    code = ""
                }
                .font(.footnote)
            }
        }
    }

    // MARK: - Email OTP

    private func sendCode() async {
        errorMessage = nil
        do {
            try await SupabaseService.client.auth.signInWithOTP(
                email: email,
                shouldCreateUser: true
            )
            emailStep = .enterCode(email: email)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func verifyCode(email: String) async {
        errorMessage = nil
        do {
            try await SupabaseService.client.auth.verifyOTP(
                email: email,
                token: code,
                type: .email
            )
            // authStateChanges drives the transition from here.
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Sign in with Apple

    private func handleApple(_ result: Result<ASAuthorization, Error>) async {
        errorMessage = nil
        switch result {
        case .success(let authorization):
            guard
                let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let idToken = String(data: tokenData, encoding: .utf8),
                let nonce = currentNonce
            else {
                errorMessage = "Apple sign-in returned no identity token."
                return
            }
            do {
                try await SupabaseService.client.auth.signInWithIdToken(
                    credentials: OpenIDConnectCredentials(
                        provider: .apple,
                        idToken: idToken,
                        nonce: nonce
                    )
                )
            } catch {
                errorMessage = error.localizedDescription
            }
        case .failure(let error):
            // User-cancelled flows shouldn't flash an error.
            if (error as? ASAuthorizationError)?.code != .canceled {
                errorMessage = error.localizedDescription
            }
        }
    }

    private static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}
