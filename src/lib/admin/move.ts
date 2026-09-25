import prisma from '../prisma';

/**
 * Moving clinics (and campaigns) from one organization to another, for
 * Paragon: everything tied to a clinic goes with it, so the subscriber sees
 * its own history. The shared catalog (practices, providers) never moves.
 * Prospect decisions and activity are organization-wide, not per clinic, and
 * stay where they are.
 */

export class MoveError extends Error {}

export interface MovePlan {
  clinics: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
  listed: number;
  faxPages: number;
  relationships: number;
  documents: string[];
  /** Practices the old organization added by hand to these clinics' lists (never pulled catalog rows). */
  ownPractices: string[];
}

export interface MoveSummary {
  clinics: number;
  listed: number;
  campaigns: number;
  faxPages: number;
  relationships: number;
}

const DOCUMENT_PATH = /^\/api\/documents\/([A-Za-z0-9_-]+)$/;

export function summarize(plan: MovePlan): MoveSummary {
  return {
    clinics: plan.clinics.length,
    listed: plan.listed,
    campaigns: plan.campaigns.length,
    faxPages: plan.faxPages,
    relationships: plan.relationships,
  };
}

/** What would move: the chosen clinics, their campaigns, and the chosen campaigns with no clinic. */
export async function planMove(input: {
  fromOrganizationId: string;
  toOrganizationId: string;
  clinicIds: string[];
  campaignIds: string[];
}): Promise<MovePlan> {
  if (input.fromOrganizationId === input.toOrganizationId) throw new MoveError('Choose another organization to move to.');
  const target = await prisma.organization.findUnique({ where: { id: input.toOrganizationId }, select: { id: true } });
  if (!target) throw new MoveError('That organization was not found.');

  const clinics = await prisma.clinicLocation.findMany({
    where: { id: { in: input.clinicIds }, organizationId: input.fromOrganizationId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  if (clinics.length !== new Set(input.clinicIds).size) throw new MoveError('Some of those clinics are not in this organization.');
  const clinicIds = clinics.map((clinic) => clinic.id);

  const taken = await prisma.clinicLocation.findMany({
    where: { organizationId: input.toOrganizationId, name: { in: clinics.map((clinic) => clinic.name) } },
    select: { name: true },
  });
  if (taken.length > 0) {
    throw new MoveError(`The other organization already has a clinic named ${taken.map((row) => row.name).join(', ')}. Rename one first.`);
  }

  const chosen = await prisma.campaign.findMany({
    where: { id: { in: input.campaignIds }, organizationId: input.fromOrganizationId },
    select: { id: true, audienceClinicId: true },
  });
  if (chosen.length !== new Set(input.campaignIds).size) throw new MoveError('Some of those campaigns are not in this organization.');
  const stranded = chosen.filter((campaign) => campaign.audienceClinicId && !clinicIds.includes(campaign.audienceClinicId));
  if (stranded.length > 0) throw new MoveError('A campaign for a clinic moves with its clinic; choose the clinic instead.');

  const campaigns = await prisma.campaign.findMany({
    where: {
      organizationId: input.fromOrganizationId,
      OR: [{ audienceClinicId: { in: clinicIds } }, { id: { in: chosen.map((campaign) => campaign.id) } }],
    },
    select: { id: true, name: true, documentUrl: true },
    orderBy: { name: 'asc' },
  });
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const [listed, targets, legacy, relationships] = await Promise.all([
    prisma.clinicPractice.count({ where: { clinicLocationId: { in: clinicIds } } }),
    prisma.campaignTarget.count({ where: { campaignId: { in: campaignIds } } }),
    prisma.campaignToReferralSource.count({ where: { campaignId: { in: campaignIds } } }),
    prisma.sourceRelationship.count({ where: { organizationId: input.fromOrganizationId, clinicLocationId: { in: clinicIds } } }),
  ]);
  // Practices added by hand (own:…) go with the clinics that list them, unless
  // another of the old organization's clinics still lists one. Paragon's hand
  // additions sit in the catalog organization, so the key tells them apart.
  const handAdded = await prisma.clinicPractice.findMany({
    where: { clinicLocationId: { in: clinicIds }, practice: { organizationId: input.fromOrganizationId, practiceKey: { startsWith: 'own:' } } },
    select: { practiceId: true },
  });
  const stayingOn = await prisma.clinicPractice.findMany({
    where: { organizationId: input.fromOrganizationId, clinicLocationId: { notIn: clinicIds }, practiceId: { in: handAdded.map((row) => row.practiceId) } },
    select: { practiceId: true },
  });
  const staying = new Set(stayingOn.map((row) => row.practiceId));
  const ownPractices = handAdded.map((row) => row.practiceId).filter((id) => !staying.has(id));
  const documents = campaigns
    .map((campaign) => (campaign.documentUrl ?? '').match(DOCUMENT_PATH)?.[1])
    .filter((id): id is string => Boolean(id));

  return {
    clinics,
    campaigns: campaigns.map(({ id, name }) => ({ id, name })),
    listed,
    faxPages: targets + legacy,
    relationships,
    documents,
    ownPractices: [...new Set(ownPractices)],
  };
}

/** Move everything in the plan in one transaction: all of it moves, or none of it. */
export async function executeMove(plan: MovePlan, fromOrganizationId: string, toOrganizationId: string): Promise<void> {
  const clinicIds = plan.clinics.map((clinic) => clinic.id);
  const campaignIds = plan.campaigns.map((campaign) => campaign.id);
  const to = { organizationId: toOrganizationId };
  await prisma.$transaction([
    prisma.clinicLocation.updateMany({ where: { id: { in: clinicIds }, organizationId: fromOrganizationId }, data: to }),
    prisma.clinicPractice.updateMany({ where: { clinicLocationId: { in: clinicIds } }, data: to }),
    prisma.sourceRelationship.updateMany({ where: { organizationId: fromOrganizationId, clinicLocationId: { in: clinicIds } }, data: to }),
    prisma.campaign.updateMany({ where: { id: { in: campaignIds }, organizationId: fromOrganizationId }, data: to }),
    prisma.campaignTarget.updateMany({ where: { campaignId: { in: campaignIds } }, data: to }),
    prisma.campaignToReferralSource.updateMany({ where: { campaignId: { in: campaignIds } }, data: to }),
    prisma.faxDocument.updateMany({ where: { id: { in: plan.documents }, organizationId: fromOrganizationId }, data: to }),
    // Hand-added practices go with the clinics that list them; the catalog never moves.
    prisma.practice.updateMany({
      where: { id: { in: plan.ownPractices }, organizationId: fromOrganizationId, practiceKey: { startsWith: 'own:' } },
      data: to,
    }),
  ]);
}
