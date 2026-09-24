import prisma from '../prisma';
import { buildAudience, type Audience, type AudienceTarget } from './audience';

/** The faxes a campaign to this clinic's referral list would send. Null when the clinic is unknown. */
export async function audienceForClinic(clinicId: string, organizationId: string): Promise<Audience | null> {
  const clinic = await prisma.clinicLocation.findFirst({
    where: { id: clinicId, organizationId },
    select: { id: true },
  });
  if (!clinic) return null;

  const rows = await prisma.clinicPractice.findMany({
    // A deleted referral source or a removed provider is not faxed.
    where: { clinicLocationId: clinicId, organizationId, practice: { hiddenAt: null } },
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
      providers: row.practice.providers,
    })),
  );
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
