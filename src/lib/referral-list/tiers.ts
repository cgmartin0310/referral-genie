/**
 * A subscriber's score for a practice, once for the whole company. One click
 * each, so a long list can be scored during onboarding. The tier sets the
 * outreach; Not a fit is never faxed; a practice not scored counts as Cold.
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

/** Prisma filter for a clinic's list entries a campaign may fax: on the list, and not scored Not a fit. */
export function faxableEntries(organizationId: string) {
  return { excludedAt: null, practice: { scores: { none: { organizationId, tier: 'not_fit' } } } };
}

/** Tiers a campaign can be aimed at. Not a fit is never faxed. */
export const OUTREACH_TIERS = ['trusted', 'warm', 'cold'] as const;
export type OutreachTier = (typeof OUTREACH_TIERS)[number];

/** A campaign's chosen tiers, cleaned. All three (or none) means the whole list. */
export function parseAudienceTiers(value: unknown): OutreachTier[] {
  const chosen = Array.isArray(value) ? value.filter((item): item is OutreachTier => (OUTREACH_TIERS as readonly string[]).includes(item)) : [];
  const unique = OUTREACH_TIERS.filter((tier) => chosen.includes(tier));
  return unique.length === OUTREACH_TIERS.length ? [] : unique;
}

/**
 * Prisma filter for the list entries a campaign faxes: the chosen tiers of
 * the company's scores, where Cold takes in practices not scored yet; with no
 * tiers chosen, everything but Not a fit. Entries taken off a list never are.
 */
export function audienceTierFilter(organizationId: string, tiers: readonly OutreachTier[]) {
  if (tiers.length === 0) return faxableEntries(organizationId);
  return {
    excludedAt: null,
    OR: [
      { practice: { scores: { some: { organizationId, tier: { in: [...tiers] } } } } },
      ...(tiers.includes('cold') ? [{ practice: { scores: { none: { organizationId } } } }] : []),
    ],
  };
}
