// Pure helpers for the player-page timeline tabs. Kept out of the
// component so they're unit-testable without rendering.

export type Tab = 'competition' | 'surveys' | 'messages';

/** Point-value label for a competition input, e.g. 'swim' + {swim:2} →
 *  '2pts'. Singular '1pt' for exactly one. Null when the kind isn't
 *  scored (or no scoring map / no kind) — callers render just the kind
 *  with no point suffix rather than a misleading '0pts'. */
export function pointLabel(
  activityKind: string | null,
  scoring: Record<string, number> | undefined,
): string | null {
  if (!activityKind || !scoring) return null;
  const pts = scoring[activityKind.toLowerCase()];
  if (pts == null) return null;
  return pts === 1 ? '1pt' : `${pts}pts`;
}

/** Highest-signal non-empty tab to open on. A team mid-competition
 *  lands on scoring inputs; a survey-only team lands on check-ins;
 *  nobody lands on an empty tab. */
export function defaultTab(opts: {
  hasActiveCompetition: boolean;
  competitionCount: number;
  surveyCount: number;
  messageCount: number;
}): Tab {
  if (opts.hasActiveCompetition && opts.competitionCount > 0) return 'competition';
  if (opts.surveyCount > 0) return 'surveys';
  if (opts.competitionCount > 0) return 'competition';
  if (opts.messageCount > 0) return 'messages';
  return 'competition';
}
