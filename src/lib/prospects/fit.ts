/**
 * How well a catalog practice fits a subscriber as a prospect, 0 to 100:
 * expected referrals for the clinic's disciplines (40), distance to the
 * nearest clinic (30), provider count (15), and pediatric focus when the
 * clinic sees children (15). Starting weights, like the estimate rates.
 * Never uses referral data from other subscribers (spec §2.6).
 */
export interface FitInput {
  /** The practice's estimated referrals a month for the nearest clinic's disciplines. */
  estimatePoint: number | null;
  /** Miles to the nearest clinic; null when either has no place. */
  miles: number | null;
  providers: number;
  /** Share of the practice's providers who are pediatric (0 to 1). */
  pediatricShare: number;
  clinicSeesChildren: boolean;
}

export function fitScore(input: FitInput): number {
  const referrals = Math.min(Math.max(input.estimatePoint ?? 0, 0), 5) / 5 * 40;
  const distance =
    input.miles == null ? 12
    : input.miles <= 5 ? 30
    : input.miles <= 15 ? 22
    : input.miles <= 30 ? 12
    : 4;
  const size = Math.min(input.providers, 10) / 10 * 15;
  const focus = input.clinicSeesChildren ? input.pediatricShare * 15 : 7.5;
  return Math.round(Math.min(100, referrals + distance + size + focus));
}

export const PROSPECT_STATUSES = ['proposed', 'approved', 'excluded'] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];
