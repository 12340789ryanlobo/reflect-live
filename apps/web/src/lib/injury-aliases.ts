// apps/web/src/lib/injury-aliases.ts
//
// Free-text injury descriptions → canonical body region keys for the heatmap.
// Ported from reflect's app/heatmap.py. Keep in lockstep when reflect updates
// its alias list.

export const BODY_REGIONS = [
  'hand', 'wrist', 'forearm', 'elbow', 'upper_arm', 'shoulder',
  'upper_back', 'mid_back', 'lower_back', 'neck',
  'hip', 'groin', 'hamstring', 'quad', 'knee', 'calf',
  'shin', 'ankle', 'foot', 'achilles', 'chest', 'abs',
] as const;

export type BodyRegion = typeof BODY_REGIONS[number];

const REGION_ALIASES: Record<string, BodyRegion> = {
  // Hand
  hands: 'hand', finger: 'hand', fingers: 'hand', thumb: 'hand', thumbs: 'hand',
  palm: 'hand', palms: 'hand', knuckle: 'hand', knuckles: 'hand',
  // Wrist
  wrists: 'wrist',
  // Forearm
  forearms: 'forearm', 'lower arm': 'forearm',
  // Upper arm
  'upper arm': 'upper_arm', 'upper arms': 'upper_arm',
  bicep: 'upper_arm', biceps: 'upper_arm', tricep: 'upper_arm', triceps: 'upper_arm',
  // Elbow
  elbows: 'elbow', 'tennis elbow': 'elbow',
  // Shoulder
  shoulders: 'shoulder', rotator: 'shoulder', 'rotator cuff': 'shoulder',
  deltoid: 'shoulder',
  // Upper back
  'upper back': 'upper_back', 'upper-back': 'upper_back', thoracic: 'upper_back',
  'shoulder blade': 'upper_back', 'shoulder blades': 'upper_back',
  scapula: 'upper_back', scapulas: 'upper_back', scap: 'upper_back', scaps: 'upper_back',
  rhomboid: 'upper_back', rhomboids: 'upper_back',
  lat: 'upper_back', lats: 'upper_back', latissimus: 'upper_back',
  'latissimus dorsi': 'upper_back',
  // Mid back
  'mid back': 'mid_back', 'middle back': 'mid_back',
  'mid-back': 'mid_back', 'middle-back': 'mid_back',
  // Lower back
  'lower back': 'lower_back', 'low back': 'lower_back',
  'lower-back': 'lower_back', 'low-back': 'lower_back',
  lumbar: 'lower_back', 'si joint': 'lower_back', sacrum: 'lower_back',
  tailbone: 'lower_back', coccyx: 'lower_back', ql: 'lower_back',
  // Generic spine → mid_back
  spine: 'mid_back', spinal: 'mid_back',
  // Neck
  cervical: 'neck', trap: 'neck', traps: 'neck', trapezius: 'neck',
  // Hip
  hips: 'hip', glute: 'hip', glutes: 'hip', gluteal: 'hip',
  butt: 'hip', buttock: 'hip', piriformis: 'hip',
  'it band': 'hip', itb: 'hip',
  // Groin
  groins: 'groin', adductor: 'groin', adductors: 'groin', 'inner thigh': 'groin',
  // Hamstring
  hammy: 'hamstring', hamstrings: 'hamstring', hammie: 'hamstring',
  hammies: 'hamstring', 'posterior thigh': 'hamstring',
  // Quad
  quads: 'quad', quadricep: 'quad', quadriceps: 'quad',
  thigh: 'quad', 'anterior thigh': 'quad',
  // Knee
  knees: 'knee', patella: 'knee', patellar: 'knee',
  meniscus: 'knee', acl: 'knee', mcl: 'knee', pcl: 'knee',
  // Calf
  calves: 'calf', 'calf muscle': 'calf', gastrocnemius: 'calf', soleus: 'calf',
  // Shin
  shins: 'shin', 'shin splint': 'shin', 'shin splints': 'shin',
  tibialis: 'shin', tibia: 'shin',
  // Ankle
  ankles: 'ankle', 'lateral ankle': 'ankle', 'medial ankle': 'ankle',
  // Foot
  feet: 'foot', toes: 'foot', toe: 'foot', arch: 'foot',
  plantar: 'foot', metatarsal: 'foot', 'ball of foot': 'foot',
  // Achilles
  'achilles tendon': 'achilles', heel: 'achilles', heels: 'achilles',
  // Chest
  pec: 'chest', pecs: 'chest', pectoral: 'chest', pectorals: 'chest',
  sternum: 'chest', rib: 'chest', ribs: 'chest',
  // Abs
  ab: 'abs', abdomen: 'abs', abdominal: 'abs', abdominals: 'abs',
  core: 'abs', oblique: 'abs', obliques: 'abs', stomach: 'abs',
};

const REGION_GROUP_ALIASES: Record<string, BodyRegion[]> = {
  'entire arm': ['upper_arm', 'elbow', 'forearm'],
  'full arm': ['upper_arm', 'elbow', 'forearm'],
  'whole arm': ['upper_arm', 'elbow', 'forearm'],
  arm: ['upper_arm', 'elbow', 'forearm'],
  arms: ['upper_arm', 'elbow', 'forearm'],
  'entire back': ['upper_back', 'mid_back', 'lower_back'],
  'full back': ['upper_back', 'mid_back', 'lower_back'],
  'whole back': ['upper_back', 'mid_back', 'lower_back'],
  back: ['upper_back', 'mid_back', 'lower_back'],
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsPhrase(text: string, phrase: string): boolean {
  return new RegExp(`(?<![a-z])${escapeRegex(phrase)}(?![a-z])`, 'i').test(text);
}

function findRegionsInText(text: string): BodyRegion[] {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return [];

  for (const region of BODY_REGIONS) {
    if (containsPhrase(t, region)) return [region];
  }

  const aliases = Object.entries(REGION_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, region] of aliases) {
    if (containsPhrase(t, alias)) return [region];
  }

  const groups = Object.entries(REGION_GROUP_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, regions] of groups) {
    if (containsPhrase(t, alias)) return [...regions];
  }
  return [];
}

/**
 * Parse a free-text injury description into canonical body region keys.
 * Returns ['other'] when nothing matches.
 *
 * Examples:
 *   'left wrist' → ['wrist']
 *   'right ankle, lower back' → ['ankle', 'lower_back']
 *   'tennis elbow' → ['elbow']
 */
export function parseInjuryRegions(rawText: string | null | undefined): string[] {
  if (!rawText) return ['other'];

  const text = rawText.toLowerCase().trim();
  const parts = text.split(/[,;/&]|\band\b/);

  const found: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const stripped = part
      .replace(/\b(left|right|bilateral|both|either|lt|rt|lhs|rhs)\b/g, ' ')
      .replace(/(?<![a-z])([lr])(?![a-z])\.?/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!stripped) continue;
    for (const r of findRegionsInText(stripped)) {
      if (!seen.has(r)) {
        seen.add(r);
        found.push(r);
      }
    }
  }
  if (found.length) return found;

  // Fallback: try the whole string with side-words stripped.
  const stripped = text
    .replace(/\b(left|right|bilateral|both|either|lt|rt|lhs|rhs)\b/g, ' ')
    .replace(/(?<![a-z])([lr])(?![a-z])\.?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const fallback = findRegionsInText(stripped);
  if (fallback.length) return fallback;

  return ['other'];
}

/**
 * Heatmap density palette — five tiers from "empty" to "hot" relative
 * to the current view's max count. Slightly more saturated than the
 * project's *-soft tokens so the colors read at small sizes (legend
 * swatches as well as the silhouette regions).
 *
 * Ordered: [None, Low, Mid, High, Hot]. Both regionColor() and the
 * heatmap-tabs legend read from this single array so they cannot drift.
 */
export const HEATMAP_PALETTE: readonly [string, string, string, string, string] = [
  'var(--paper-2)', // None  — empty
  '#BCDFC9',        // Low   — warmer pale green
  '#FBDFA0',        // Mid   — warm pale amber
  '#F2BC73',        // High  — saturated warm amber
  '#EAA29D',        // Hot   — saturated pink-red
] as const;

/**
 * Heatmap density color: relative-max ratio, so a small team's lone hot
 * region still reads as red. Returns one of HEATMAP_PALETTE.
 */
export function regionColor(count: number, maxCount: number): string {
  if (maxCount === 0 || count === 0) return HEATMAP_PALETTE[0];
  const ratio = Math.min(count / maxCount, 1);
  if (ratio < 0.25) return HEATMAP_PALETTE[1];
  if (ratio < 0.5) return HEATMAP_PALETTE[2];
  if (ratio < 0.75) return HEATMAP_PALETTE[3];
  return HEATMAP_PALETTE[4];
}

export function regionLabel(region: string): string {
  if (region === 'other') return 'Other';
  return region.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
