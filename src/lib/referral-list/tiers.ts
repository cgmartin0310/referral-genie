/**
 * The subscriber's score for a practice on a clinic's referral list. One
 * click each, so a long list can be scored during onboarding. The tier sets
 * the outreach; Not a fit is never faxed.
 */

export const TIERS = ['trusted', 'warm', 'cold', 'not_fit'] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_INFO: Record<Tier, { label: string; outreach: string }> = {
  trusted: { label: 'Trusted', outreach: 'Sends referrals now: thank-you and nurture touches.' },
  warm: { label: 'Warm', outreach: 'Knows you: regular contact.' },
  cold: { label: 'Cold', outreach: 'No relationship yet: introduction campaigns.' },
  not_fit: { label: 'Not a fit', outreach: 'Never contacted.' },
};

export function parseTier(value: unknown): Tier | null {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value) ? (value as Tier) : null;
}

/** A tier from the old 0–100 relationship score (Your Sources before tiers). */
export function tierFromTrustScore(trs: number): Tier {
  if (trs >= 70) return 'trusted';
  if (trs >= 40) return 'warm';
  return 'cold';
}

/** Prisma filter for list entries a campaign may fax: unscored, or scored as anything but Not a fit. */
export const FAXABLE_TIER = { OR: [{ tier: null }, { tier: { not: 'not_fit' } }] };
