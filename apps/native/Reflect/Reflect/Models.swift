import Foundation

// Swift mirrors of the backend rows in packages/shared/src/types.ts,
// trimmed to the columns the app selects.

struct Team: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
}

struct Player: Codable, Identifiable, Hashable {
    let id: Int
    let teamId: Int
    let name: String
    let phoneE164: String?
    let group: String?
    let active: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, group, active
        case teamId = "team_id"
        case phoneE164 = "phone_e164"
    }
}

struct TwilioMessage: Codable, Identifiable, Hashable {
    var id: String { sid }

    let sid: String
    let direction: String
    let body: String?
    let category: String
    let dateSent: Date
    let playerId: Int?
    let teamId: Int?
    let hidden: Bool?

    var isInbound: Bool { direction.hasPrefix("inbound") }

    enum CodingKeys: String, CodingKey {
        case sid, direction, body, category, hidden
        case dateSent = "date_sent"
        case playerId = "player_id"
        case teamId = "team_id"
    }
}

struct UserPreferences: Codable {
    let clerkUserId: String
    let teamId: Int?

    enum CodingKeys: String, CodingKey {
        case clerkUserId = "clerk_user_id"
        case teamId = "team_id"
    }
}
