import SwiftUI
import ClerkKit
import ClerkKitUI

/// Auth gate: shows the welcome screen until a Clerk user exists,
/// then hands off to team resolution.
struct RootView: View {
    @Environment(Clerk.self) private var clerk
    @State private var authIsPresented = false

    var body: some View {
        if !clerk.isLoaded {
            ProgressView()
        } else if clerk.user != nil {
            TeamGateView()
        } else {
            signedOut
        }
    }

    private var signedOut: some View {
        VStack(spacing: 12) {
            Image(systemName: "waveform.path.ecg")
                .font(.system(size: 56))
                .foregroundStyle(.tint)
            Text("Reflect")
                .font(.largeTitle.bold())
            Text("Live team pulse for coaches")
                .foregroundStyle(.secondary)
            Button("Sign In") {
                authIsPresented = true
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.top, 12)
        }
        .padding()
        .sheet(isPresented: $authIsPresented) {
            AuthView()
        }
    }
}
