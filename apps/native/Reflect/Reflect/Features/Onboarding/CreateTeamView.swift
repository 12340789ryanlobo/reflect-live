import SwiftUI

/// Self-serve team creation: the creator becomes the team's manager instantly.
struct CreateTeamView: View {
    @Environment(SessionController.self) private var session
    @State private var model = OnboardingModel()

    @State private var name = ""
    @State private var isWorking = false

    var body: some View {
        Form {
            Section("Team name") {
                TextField("e.g. UChicago Swim & Dive", text: $name)
            }
            if let errorMessage = model.errorMessage {
                ErrorBanner(message: errorMessage)
            }
            Section {
                AsyncButton("Create Team", isWorking: $isWorking) {
                    if await model.createTeam(name: name) {
                        await session.refresh()
                    }
                }
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            } footer: {
                Text("You'll be the team manager. Share the invite link from your Profile tab and teammates join instantly.")
            }
        }
        .navigationTitle("Start a Team")
    }
}
