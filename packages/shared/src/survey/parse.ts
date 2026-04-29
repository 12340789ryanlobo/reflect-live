// Pure parsing helpers ported from reflect/app/utils.py.

/**
 * Parse a numeric scale response (1-10, 1-3, etc.) from free-text. Tolerant of
 * leading/trailing words and punctuation: "around 7", "8/10", "definitely 9!"
 * all parse to their respective numbers. Returns null when no valid number is
 * found in [min, max].
 */
export function parseScaleResponse(
  raw: string,
  min: number,
  max: number,
): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // First try plain integer
  const plain = Number(trimmed);
  if (Number.isFinite(plain) && Number.isInteger(plain) && plain >= min && plain <= max) {
    return plain;
  }

  // Extract first integer token from anywhere in the string
  const match = trimmed.match(/-?\d+/);
  if (!match) return null;
  const n = Number(match[0]);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

/**
 * Parse multi-region body answers like "left knee 7, right wrist 4" into
 * (region_label, rating) pairs. Used by the multi_select_body_regions
 * question type. Conservative: only returns pairs where we found both a
 * region word and a numeric rating.
 */
export function parseBodyRegions(raw: string): [string, number][] {
  if (!raw) return [];
  const out: [string, number][] = [];
  const parts = raw.split(/[,;/&\n]|\band\b/i);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const numMatch = trimmed.match(/-?\d+/);
    if (!numMatch) continue;
    const rating = Number(numMatch[0]);
    if (!Number.isFinite(rating)) continue;
    const region = trimmed.replace(numMatch[0], '').trim();
    if (!region) continue;
    out.push([region, rating]);
  }
  return out;
}

export function truncateText(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1).trimEnd() + '…';
}
