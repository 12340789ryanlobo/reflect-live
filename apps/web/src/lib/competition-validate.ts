// Shared validators for competition scoring + bonus rules, used by both
// POST /api/competitions and PATCH /api/competitions/[id] so the two paths
// can't drift — a coach editing a competition gets the same deep checks as
// creating one (previously PATCH only shallow-checked the shape, letting an
// edit persist non-numeric scoring or bonus rules referencing unscored kinds).

export function validateScoring(raw: unknown): Record<string, number> | { error: string } {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'scoring must be an object' };
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return { error: `scoring.${k} must be a finite number` };
    if (!/^[a-z][a-z0-9_]*$/.test(k)) return { error: `scoring key "${k}" must be lowercase alphanumeric` };
    out[k] = v;
  }
  return out;
}

export interface BonusRule {
  kind: string;
  min_per_day: number;
  bonus_points: number;
}

export function validateBonusRules(raw: unknown): BonusRule[] | { error: string } {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return { error: 'bonus_rules must be an array' };
  const out: BonusRule[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] as Record<string, unknown>;
    if (!r || typeof r !== 'object') return { error: `bonus_rules[${i}] must be an object` };
    const kind = r.kind;
    const minPerDay = r.min_per_day;
    const bonus = r.bonus_points;
    if (typeof kind !== 'string' || !/^[a-z][a-z0-9_]*$/.test(kind)) {
      return { error: `bonus_rules[${i}].kind invalid` };
    }
    if (!Number.isInteger(minPerDay) || (minPerDay as number) < 2) {
      return { error: `bonus_rules[${i}].min_per_day must be an integer >= 2` };
    }
    if (typeof bonus !== 'number' || !Number.isFinite(bonus)) {
      return { error: `bonus_rules[${i}].bonus_points must be a finite number` };
    }
    out.push({ kind, min_per_day: minPerDay as number, bonus_points: bonus });
  }
  return out;
}

// Every kind referenced by a bonus rule must carry points in scoring, else the
// rule silently no-ops. Returns an error string, or null when consistent.
export function crossCheckBonusKinds(
  scoring: Record<string, number>,
  bonusRules: Array<{ kind: string }>,
): string | null {
  for (const rule of bonusRules) {
    if (!(rule.kind in scoring)) {
      return `bonus_rules references kind "${rule.kind}" but it has no points in scoring`;
    }
  }
  return null;
}
