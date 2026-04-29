// Team-code generator. 6-char strings from a 32-letter ambiguity-free
// alphabet — no 0/O, 1/I/l. Used both by the web app (when a coach
// creates a team) and by migration 0015 (to seed team_code on existing
// teams). Stored lowercase; input is normalized by case.

export const TEAM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 6;

export function generateTeamCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += TEAM_CODE_ALPHABET[Math.floor(Math.random() * TEAM_CODE_ALPHABET.length)];
  }
  return out;
}

export function isValidTeamCode(input: string): boolean {
  if (typeof input !== 'string') return false;
  const lower = input.toLowerCase();
  if (lower.length !== CODE_LENGTH) return false;
  for (const ch of lower) {
    if (!TEAM_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}
