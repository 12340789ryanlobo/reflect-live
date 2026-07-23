import SwiftUI

@main struct ReflectApp: App {
    @State private var session = SessionController()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .task { await session.start() }
                .onOpenURL { session.handleDeepLink($0) }
        }
    }
}
