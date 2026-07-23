import Foundation

// Swift mirrors of the backend rows, trimmed to the columns the app selects.
// Column-level grants on `teams` (migration 0035) limit what the client may
// select — stay within that list.

struct Team: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let teamCode: String?
    let scoring: TeamScoring?

    enum CodingKeys: String, CodingKey {
        case id, name
        case teamCode = "team_code"
        case scoring = "scoring_json"
    }
}

/// Legacy weekly-leaderboard weights from teams.scoring_json.
struct TeamScoring: Codable, Hashable {
    let workoutScore: Double
    let rehabScore: Double

    enum CodingKeys: String, CodingKey {
        case workoutScore = "workout_score"
        case rehabScore = "rehab_score"
    }

    static let fallback = TeamScoring(workoutScore: 1, rehabScore: 1)
}

struct Player: Codable, Identifiable, Hashable {
    let id: Int
    let teamId: Int
    let name: String
    let group: String?
    let active: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, group, active
        case teamId = "team_id"
    }
}

struct ActivityLog: Codable, Identifiable, Hashable {
    let id: Int
    let teamId: Int
    let playerId: Int?
    let kind: String
    let description: String?
    let loggedAt: Date
    let hidden: Bool

    enum CodingKeys: String, CodingKey {
        case id, kind, description, hidden
        case teamId = "team_id"
        case playerId = "player_id"
        case loggedAt = "logged_at"
    }
}

struct Competition: Codable, Identifiable, Hashable {
    let id: Int
    let teamId: Int
    let name: String
    /// ISO dates (YYYY-MM-DD) — kept as strings like the web app; they
    /// compare lexicographically and never carry a time component.
    let startsAt: String
    let endsAt: String
    let scoring: [String: Double]
    let bonusRules: [CompetitionBonusRule]

    enum CodingKeys: String, CodingKey {
        case id, name, scoring
        case teamId = "team_id"
        case startsAt = "starts_at"
        case endsAt = "ends_at"
        case bonusRules = "bonus_rules"
    }

    func isActive(onDay todayISO: String) -> Bool {
        startsAt <= todayISO && todayISO <= endsAt
    }
}

struct CompetitionBonusRule: Codable, Hashable {
    let kind: String
    let minPerDay: Int
    let bonusPoints: Double

    enum CodingKeys: String, CodingKey {
        case kind
        case minPerDay = "min_per_day"
        case bonusPoints = "bonus_points"
    }
}

/// A pending join request as seen by a team manager.
struct JoinRequest: Codable, Identifiable, Hashable {
    let userId: String
    let teamId: Int
    let requestedName: String?
    let requestedEmail: String?
    let requestedAt: Date?

    var id: String { userId }

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case teamId = "team_id"
        case requestedName = "requested_name"
        case requestedEmail = "requested_email"
        case requestedAt = "requested_at"
    }
}
