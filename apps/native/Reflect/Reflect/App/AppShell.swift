import SwiftUI

/// Role-based navigation shell: TabView on iOS, NavigationSplitView on macOS.
/// Athletes get the accountability game; managers get the team console.
struct AppShell: View {
    let membership: ActiveMembership

    private enum Section: String, CaseIterable, Identifiable {
        case today, log, leaderboard, roster, profile

        var id: String { rawValue }

        var title: String {
            switch self {
            case .today: "Today"
            case .log: "Log"
            case .leaderboard: "Leaderboard"
            case .roster: "Roster"
            case .profile: "Profile"
            }
        }

        var systemImage: String {
            switch self {
            case .today: "sun.max"
            case .log: "plus.circle"
            case .leaderboard: "trophy"
            case .roster: "person.3"
            case .profile: "person.crop.circle"
            }
        }
    }

    @State private var selection: Section?

    private var sections: [Section] {
        membership.role.managesTeam
            ? [.roster, .leaderboard, .profile]
            : [.today, .log, .leaderboard, .profile]
    }

    var body: some View {
#if os(macOS)
        NavigationSplitView {
            List(sections, selection: $selection) { section in
                Label(section.title, systemImage: section.systemImage)
                    .tag(section)
            }
            .navigationTitle(membership.teamName)
        } detail: {
            content(for: selection ?? sections[0])
        }
#else
        TabView {
            ForEach(sections) { section in
                Tab(section.title, systemImage: section.systemImage) {
                    NavigationStack {
                        content(for: section)
                    }
                }
            }
        }
#endif
    }

    @ViewBuilder
    private func content(for section: Section) -> some View {
        switch section {
        case .today:
            TodayView(membership: membership)
        case .log:
            LogTimelineView(membership: membership)
        case .leaderboard:
            LeaderboardView(membership: membership)
        case .roster:
            RosterView(membership: membership)
        case .profile:
            ProfileView(membership: membership)
        }
    }
}
