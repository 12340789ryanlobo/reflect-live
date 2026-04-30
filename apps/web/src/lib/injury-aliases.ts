// apps/web/src/lib/injury-aliases.ts
//
// Free-text injury descriptions → canonical body region keys for the heatmap.
// Ported from reflect's app/heatmap.py. Keep in lockstep when reflect updates
// its alias list.

export const BODY_REGIONS = [
  'hand', 'wrist', 'forearm', 'elbow',
  // upper_arm stays for ambiguous "arm pain" / "upper arm soreness"
  // reports. bicep + tricep are the more specific buckets — the
  // `react-muscle-highlighter` library has separate slugs for each, so
  // splitting gives a more accurate heatmap when descriptions name the
  // specific muscle (curl → bicep, tricep extension → tricep).
  'upper_arm', 'bicep', 'tricep', 'shoulder',
  'upper_back', 'mid_back', 'lower_back', 'neck',
  'hip', 'groin', 'hamstring', 'quad', 'knee', 'calf',
  'shin', 'ankle', 'foot', 'achilles', 'chest', 'abs', 'obliques',
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
  // Upper arm (catch-all when the description doesn't specify front vs back)
  'upper arm': 'upper_arm', 'upper arms': 'upper_arm',
  // Specific upper-arm muscles
  bicep: 'bicep', biceps: 'bicep',
  tricep: 'tricep', triceps: 'tricep',
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
  // Abs (front core)
  ab: 'abs', abdomen: 'abs', abdominal: 'abs', abdominals: 'abs',
  core: 'abs', stomach: 'abs',
  // Obliques (side core) — own region; library has its own slug.
  oblique: 'obliques', 'side abs': 'obliques', 'side ab': 'obliques',
  'love handles': 'obliques',
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

// Workout / rehab vocabulary mapped to the primary muscle worked.
// Used by parseAllRegions() (NOT parseInjuryRegions, which stays focused
// on injury vocabulary). Phrases here cover the common ways exercises
// show up in activity_log descriptions: 'bench press', 'lat pulldown',
// 'tricep extension', 'leg curl', 'box jump', etc.
//
// Ordering inside the table doesn't matter — findAllRegionsInText sorts
// by phrase length descending so longer phrases ('leg curl' →
// hamstring) consume their text before shorter ones ('curl' →
// upper_arm) get a chance to match.
const WORKOUT_ALIASES: Record<string, BodyRegion> = {
  // Chest pressing
  'bench press': 'chest', 'incline press': 'chest', 'incline bench': 'chest',
  'db press': 'chest', 'dumbbell press': 'chest', 'chest press': 'chest',
  'flat bench': 'chest', fly: 'chest', flies: 'chest', flys: 'chest',
  press: 'chest',
  // Shoulder pressing & raises
  'overhead press': 'shoulder', 'shoulder press': 'shoulder',
  'push press': 'shoulder', 'military press': 'shoulder',
  'lateral raise': 'shoulder', 'lateral raises': 'shoulder',
  'front raise': 'shoulder', 'front raises': 'shoulder',
  'side raise': 'shoulder', 'side raises': 'shoulder',
  // Pulling — back
  row: 'upper_back', rows: 'upper_back',
  'seated row': 'upper_back', 'seated rows': 'upper_back',
  'cable row': 'upper_back',
  pulldown: 'upper_back', pulldowns: 'upper_back', 'pull-down': 'upper_back',
  'pull up': 'upper_back', 'pull ups': 'upper_back',
  pullup: 'upper_back', pullups: 'upper_back',
  'pull-up': 'upper_back', 'pull-ups': 'upper_back',
  'chin up': 'upper_back', 'chin ups': 'upper_back',
  chinup: 'upper_back', chinups: 'upper_back',
  // Arm curls / extensions — specific muscle attribution
  curl: 'bicep', curls: 'bicep',
  'bicep curl': 'bicep', 'bicep curls': 'bicep',
  'tricep extension': 'tricep', 'tricep extensions': 'tricep',
  'tricep pushdown': 'tricep', 'tricep pushdowns': 'tricep',
  'tricep kickback': 'tricep', 'tricep kickbacks': 'tricep',
  skullcrusher: 'tricep', skullcrushers: 'tricep',
  // Leg curls / extensions (override generic 'curl' / 'extension'
  // because phrases are longer and consumed first)
  'leg curl': 'hamstring', 'leg curls': 'hamstring',
  'hamstring curl': 'hamstring', 'hamstring curls': 'hamstring',
  'leg extension': 'quad', 'leg extensions': 'quad',
  // Squats / lunges
  squat: 'quad', squats: 'quad',
  'front squat': 'quad', 'back squat': 'quad', 'goblet squat': 'quad',
  'split squat': 'quad', rfess: 'quad', 'split-squat': 'quad',
  lunge: 'quad', lunges: 'quad',
  // Posterior chain
  deadlift: 'hamstring', deadlifts: 'hamstring',
  rdl: 'hamstring', 'romanian deadlift': 'hamstring', 'romanian deadlifts': 'hamstring',
  'good morning': 'hamstring', 'good mornings': 'hamstring',
  // Hip / glute drills
  'hip thrust': 'hip', 'hip thrusts': 'hip',
  'glute bridge': 'hip', 'glute bridges': 'hip',
  // Plyo / lower-leg
  'box jump': 'calf', 'box jumps': 'calf',
  'squat jump': 'calf', 'squat jumps': 'calf',
  'broad jump': 'calf', 'broad jumps': 'calf',
  jump: 'calf', jumps: 'calf', jumping: 'calf',
  pogo: 'calf', pogos: 'calf',
  'calf raise': 'calf', 'calf raises': 'calf',
  // Core — front (abs)
  situp: 'abs', situps: 'abs', 'sit up': 'abs', 'sit ups': 'abs',
  'sit-up': 'abs', 'sit-ups': 'abs',
  crunch: 'abs', crunches: 'abs',
  plank: 'abs', planks: 'abs',
  'leg raise': 'abs', 'leg raises': 'abs',
  // Core — side (obliques). Phrases longer than 'plank' / 'crunch'
  // win the longest-first sort, so 'side plank' won't ever
  // misattribute to plain 'plank'.
  'side plank': 'obliques', 'side planks': 'obliques',
  'russian twist': 'obliques', 'russian twists': 'obliques',
  'oblique twist': 'obliques', 'oblique twists': 'obliques',
  'oblique crunch': 'obliques', 'oblique crunches': 'obliques',
  'side bend': 'obliques', 'side bends': 'obliques',
  woodchop: 'obliques', woodchops: 'obliques',
  woodchopper: 'obliques', woodchoppers: 'obliques',
};

/**
 * Pre-flattened, length-sorted phrase table used by findAllRegionsInText.
 * Built once at module load so the per-call scan is just a regex test +
 * replace per phrase. Each entry maps a phrase to ONE OR MORE regions
 * (groups expand here too).
 */
interface PhraseEntry { phrase: string; regions: BodyRegion[]; }
const ALL_PHRASES: ReadonlyArray<PhraseEntry> = (() => {
  const out: PhraseEntry[] = [];
  for (const region of BODY_REGIONS) {
    out.push({ phrase: region, regions: [region] });
    if (region.includes('_')) {
      out.push({ phrase: region.replace('_', ' '), regions: [region] });
    }
  }
  for (const [alias, region] of Object.entries(REGION_ALIASES)) {
    out.push({ phrase: alias, regions: [region] });
  }
  for (const [alias, region] of Object.entries(WORKOUT_ALIASES)) {
    out.push({ phrase: alias, regions: [region] });
  }
  for (const [alias, regions] of Object.entries(REGION_GROUP_ALIASES)) {
    out.push({ phrase: alias, regions: [...regions] });
  }
  // Longest-first so phrase aliases ('leg curl', 'tricep extension')
  // consume their text before shorter substrings ('curl', 'leg') match.
  out.sort((a, b) => b.phrase.length - a.phrase.length);
  return out;
})();

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
 * Find ALL canonical regions referenced anywhere in the text. Used by
 * activity_log descriptions where a single workout typically hits
 * multiple muscle groups ("Day 3: Incline DB press, lat pulldown,
 * tricep extension, ..." → chest, upper_back, upper_arm, ...).
 *
 * Differs from findRegionsInText (used by parseInjuryRegions) which
 * stops at the first match — correct for injury reports ("left wrist"
 * should be ['wrist']), wrong for workout descriptions.
 *
 * Uses ALL_PHRASES sorted longest-first so 'leg curl' is matched (and
 * its text consumed) before bare 'curl' gets a chance to fire.
 */
function findAllRegionsInText(text: string): BodyRegion[] {
  let t = text.replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const found = new Set<BodyRegion>();
  for (const { phrase, regions } of ALL_PHRASES) {
    const re = new RegExp(`(?<![a-z])${escapeRegex(phrase)}(?![a-z])`, 'gi');
    if (re.test(t)) {
      for (const r of regions) found.add(r);
      // Consume so shorter aliases inside this phrase don't double-match.
      t = t.replace(re, ' '.repeat(phrase.length));
    }
  }
  return Array.from(found);
}

/**
 * Parse a free-text activity description (workout / rehab) into all
 * canonical body regions worked. Returns [] when nothing matches.
 *
 * Examples:
 *   'Incline DB press, lat pulldown, tricep extension'
 *     → ['chest', 'upper_back', 'upper_arm']
 *   'front squat, hamstring curl, box jump'
 *     → ['quad', 'hamstring', 'calf']
 */
export function parseAllRegions(rawText: string | null | undefined): string[] {
  if (!rawText) return [];
  return findAllRegionsInText(rawText.toLowerCase());
}

export function regionLabel(region: string): string {
  if (region === 'other') return 'Other';
  return region.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
