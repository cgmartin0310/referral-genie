/**
 * Trust Relationship Score (0 to 100), from what a subscriber says about a
 * referral source. Analytics only: it shapes outreach tone and cadence and
 * never who is offered a referral (spec §2).
 *
 * The answers are the onboarding prototype's questions. Weights are starting
 * assumptions: recency 35, volume 30, strength 25, where it was built 10.
 */

export const LAST_REFERRAL = [
  { key: 'none', label: 'No referral yet', points: 0 },
  { key: 'within_90d', label: 'Within the last 90 days', points: 35 },
  { key: '91_180d', label: '91–180 days ago', points: 25 },
  { key: '6_12m', label: '6–12 months ago', points: 15 },
  { key: '12_24m', label: '12–24 months ago', points: 8 },
  { key: 'over_24m', label: 'More than 24 months ago', points: 3 },
] as const;

export const REFERRAL_VOLUME = [
  { key: 'never', label: 'Never referred', points: 0 },
  { key: 'knows_us', label: 'Knows us, but has never referred', points: 4 },
  { key: 'may_refer', label: 'Has indicated they may refer', points: 6 },
  { key: 'one', label: '1 prior referral', points: 12 },
  { key: 'two_four', label: '2–4 prior referrals', points: 18 },
  { key: 'five_nine', label: '5–9 prior referrals', points: 24 },
  { key: 'ten_plus', label: '10+ prior referrals', points: 30 },
] as const;

export const STRENGTH = [
  { key: 'none', label: 'No relationship', points: 0 },
  { key: 'may_recognize', label: 'May recognize us', points: 4 },
  { key: 'met_once', label: 'Met once or twice', points: 8 },
  { key: 'multiple', label: 'Multiple interactions', points: 14 },
  { key: 'knows_professionally', label: 'Knows us professionally', points: 20 },
  { key: 'established', label: 'Established working relationship', points: 25 },
] as const;

export const ORIGIN = [
  { key: 'unknown', label: 'Unknown', points: 3 },
  { key: 'personal', label: 'Owner or clinician built it personally', points: 10 },
  { key: 'current_clinic', label: 'Belongs to this clinic', points: 10 },
  { key: 'colleague', label: 'Introduced by a colleague', points: 6 },
  { key: 'previous_employer', label: 'Built at a previous practice', points: 5 },
  { key: 'referral360', label: 'Found by Referral360', points: 4 },
] as const;

export interface RelationshipAnswers {
  lastReferral?: string | null;
  referralVolume?: string | null;
  strength?: string | null;
  origin?: string | null;
}

function points(options: readonly { key: string; points: number }[], key: string | null | undefined): number {
  return options.find((option) => option.key === key)?.points ?? 0;
}

export function trustScore(answers: RelationshipAnswers): number {
  const total =
    points(LAST_REFERRAL, answers.lastReferral) +
    points(REFERRAL_VOLUME, answers.referralVolume) +
    points(STRENGTH, answers.strength) +
    points(ORIGIN, answers.origin);
  return Math.max(0, Math.min(100, total));
}

/** Only answers the questions offer; anything else is dropped. */
export function cleanAnswers(input: Record<string, unknown>): RelationshipAnswers {
  const pick = (options: readonly { key: string }[], value: unknown) =>
    typeof value === 'string' && options.some((option) => option.key === value) ? value : null;
  return {
    lastReferral: pick(LAST_REFERRAL, input.lastReferral),
    referralVolume: pick(REFERRAL_VOLUME, input.referralVolume),
    strength: pick(STRENGTH, input.strength),
    origin: pick(ORIGIN, input.origin),
  };
}

/** The spec's outreach bands, for display: trusted, warm, cold. */
export function trustBand(score: number): 'trusted' | 'warm' | 'cold' {
  if (score >= 70) return 'trusted';
  if (score >= 40) return 'warm';
  return 'cold';
}
