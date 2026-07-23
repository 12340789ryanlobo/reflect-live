import Foundation
import Observation
import Supabase

/// Join / create-team RPC calls (security definer functions from migration 0037).
@MainActor
@Observable
final class OnboardingModel {
    private(set) var errorMessage: String?

    /// Returns true on success. Invite-link joins come back status=active;
    /// cold code joins land in the approval queue.
    func joinTeam(code: String, name: String, email: String?, phone: String?, viaInviteLink: Bool) async -> Bool {
        struct Params: Encodable {
            let p_code: String
            let p_name: String
            let p_email: String?
            let p_phone: String?
            let p_via_invite_link: Bool
        }
        errorMessage = nil
        do {
            try await SupabaseService.client
                .rpc("join_team_by_code", params: Params(
                    p_code: code.trimmingCharacters(in: .whitespacesAndNewlines),
                    p_name: name,
                    p_email: email,
                    p_phone: phone,
                    p_via_invite_link: viaInviteLink
                ))
                .execute()
            return true
        } catch {
            errorMessage = friendly(error)
            return false
        }
    }

    /// Creates a team and makes the caller its manager. Returns true on success.
    func createTeam(name: String) async -> Bool {
        struct Params: Encodable {
            let p_name: String
            let p_timezone: String
        }
        errorMessage = nil
        do {
            try await SupabaseService.client
                .rpc("create_team_with_manager", params: Params(
                    p_name: name,
                    p_timezone: TimeZone.current.identifier
                ))
                .execute()
            return true
        } catch {
            errorMessage = friendly(error)
            return false
        }
    }

    private func friendly(_ error: Error) -> String {
        let message = error.localizedDescription
        if message.localizedCaseInsensitiveContains("not found") {
            return "No team with that code. Double-check it with your captain or coach."
        }
        return message
    }
}
