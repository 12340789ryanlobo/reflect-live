/**
 * Phone-number helpers. Kept dependency-free so this module can be
 * imported from both client + server code without pulling Twilio or
 * Supabase SDKs into the browser bundle.
 */

/**
 * Normalize a user-supplied phone to E.164. Accepts common formats:
 *  - "(321) 406-2958" → "+13214062958" (assumes US if 10 digits)
 *  - "+61 452 543 234" → "+61452543234"
 *  - "13214062958" → "+13214062958"
 * Returns null when the input can't be coerced into a plausible E.164.
 */
export function toE164(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  }
  if (cleaned.length === 10) return '+1' + cleaned;
  if (cleaned.length === 11 && cleaned.startsWith('1')) return '+' + cleaned;
  if (cleaned.length >= 8) return '+' + cleaned;
  return null;
}
