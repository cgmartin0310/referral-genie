import prisma from '../prisma';
import { buildAudience, type Audience, type AudienceTarget } from './audience';
import { audienceTierFilter, type OutreachTier } from '../referral-list/tiers';

/** The faxes a campaign to this clinic's referral list would send. Null when the clinic is unknown. */
export async function audienceForClinic(
  clinicId: string,
  organizationId: string,
  tiers: readonly OutreachTier[] = [],
  practiceIds: readonly string[] = [],
): Promise<Audience | null> {
  const clinic = await prisma.clinicLocation.findFirst({
    where: { id: clinicId, organizationId },
    select: { id: true },
  });
  if (!clinic) return null;

  const rows = await prisma.clinicPractice.findMany({
    // A deleted referral source, a removed provider, and a practice scored Not a fit are not faxed.
    // Only the chosen tiers (Cold takes in not-yet-scored); never Not a fit.
    // Chosen practices when there are any; otherwise the chosen tiers.
    where: {
      clinicLocationId: clinicId,
      organizationId,
      AND: [
        { practice: { hiddenAt: null } },
        practiceIds.length > 0 ? { excludedAt: null, practiceId: { in: [...practiceIds] } } : audienceTierFilter(organizationId, tiers),
      ],
    },
    include: {
      practice: {
        include: {
          providers: { where: { hiddenAt: null }, select: { id: true, name: true, faxNumber: true, useOwnFax: true } },
        },
      },
    },
    orderBy: { practice: { providerCount: 'desc' } },
  });

  return buildAudience(
    rows.map((row) => ({
      id: row.practice.id,
      name: row.practice.name,
      faxNumber: row.practice.faxNumber,
      faxOptOut: row.practice.faxOptOutAt !== null,
      providers: row.practice.providers,
    })),
  );
}

/** Chosen practice ids from a request, cleaned. */
export function parsePracticeIds(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(list.filter((item): item is string => typeof item === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(item.trim())).map((item) => item.trim()))].slice(0, 500);
}

/** Rows for CampaignTarget.createMany. */
export function targetRows(campaignId: string, targets: AudienceTarget[], organizationId: string) {
  return targets.map((target) => ({
    organizationId,
    campaignId,
    practiceId: target.practiceId,
    practiceName: target.practiceName,
    providerIds: target.providerIds,
    providerNames: target.providerNames,
    toName: target.toName,
    faxNumber: target.faxNumber,
    level: target.level,
    status: 'PENDING',
  }));
}
