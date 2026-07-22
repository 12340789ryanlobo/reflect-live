import Foundation
import Observation
import Supabase

/// Loads the roster and recent messages, then keeps the feed live via
/// Supabase Realtime — the same team_id-filtered INSERT subscription as
/// apps/web/src/components/live-feed.tsx.
@MainActor
@Observable
final class DashboardModel {
    let team: Team

    private(set) var playersById: [Int: Player] = [:]
    private(set) var messages: [TwilioMessage] = []
    private(set) var errorMessage: String?
    private(set) var isLoaded = false

    private var realtimeTask: Task<Void, Never>?

    init(team: Team) {
        self.team = team
    }

    // MARK: - Derived stats (over the loaded window of recent messages)

    var messagesToday: [TwilioMessage] {
        messages.filter { Calendar.current.isDateInToday($0.dateSent) }
    }

    var activePlayerCountToday: Int {
        Set(messagesToday.filter(\.isInbound).compactMap(\.playerId)).count
    }

    var rosterCount: Int {
        playersById.values.filter(\.active).count
    }

    var responseRateToday: Int? {
        guard rosterCount > 0 else { return nil }
        return Int((Double(activePlayerCountToday) / Double(rosterCount) * 100).rounded())
    }

    func playerName(for message: TwilioMessage) -> String {
        if let playerId = message.playerId, let player = playersById[playerId] {
            return player.name
        }
        return message.isInbound ? "Unknown sender" : "Reflect"
    }

    // MARK: - Loading

    func start() async {
        await load()
        subscribe()
    }

    func load() async {
        do {
            async let playersFetch: [Player] = SupabaseService.client
                .from("players")
                .select("id, team_id, name, phone_e164, group, active")
                .eq("team_id", value: team.id)
                .execute()
                .value
            async let messagesFetch: [TwilioMessage] = SupabaseService.client
                .from("twilio_messages")
                .select()
                .eq("team_id", value: team.id)
                .eq("hidden", value: false)
                .order("date_sent", ascending: false)
                .limit(100)
                .execute()
                .value

            let (players, recentMessages) = try await (playersFetch, messagesFetch)
            playersById = Dictionary(uniqueKeysWithValues: players.map { ($0.id, $0) })
            messages = recentMessages
            errorMessage = nil
            isLoaded = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func subscribe() {
        realtimeTask?.cancel()
        realtimeTask = Task { [weak self, teamId = team.id] in
            let channel = SupabaseService.client.channel("live-messages")
            let insertions = channel.postgresChange(
                InsertAction.self,
                schema: "public",
                table: "twilio_messages",
                filter: .eq("team_id", value: teamId)
            )
            try? await channel.subscribeWithError()
            for await action in insertions {
                guard let self else { break }
                guard let message: TwilioMessage = try? action.decodeRecord(
                    decoder: SupabaseService.postgresDecoder
                ) else { continue }
                self.append(message)
            }
        }
    }

    private func append(_ message: TwilioMessage) {
        guard message.hidden != true else { return }
        guard !messages.contains(where: { $0.sid == message.sid }) else { return }
        messages.insert(message, at: 0)
        if messages.count > 200 {
            messages.removeLast(messages.count - 200)
        }
    }

    func stop() {
        realtimeTask?.cancel()
        realtimeTask = nil
        let client = SupabaseService.client
        Task { await client.removeAllChannels() }
    }
}
