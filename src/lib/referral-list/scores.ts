import prisma from '../prisma';
import type { Tier } from './tiers';

/** Set (or with null, clear) the company's score on practices. */
export async function setScores(organizationId: string, practiceIds: string[], tier: Tier | null, actor: string): Promise<number> {
  if (practiceIds.length === 0) return 0;
  if (!tier) {
    const cleared = await prisma.practiceScore.deleteMany({ where: { organizationId, practiceId: { in: practiceIds } } });
    return cleared.count;
  }
  const now = new Date();
  await prisma.$transaction(
    practiceIds.map((practiceId) =>
      prisma.practiceScore.upsert({
        where: { organizationId_practiceId: { organizationId, practiceId } },
        create: { organizationId, practiceId, tier, setAt: now, setBy: actor },
        update: { tier, setAt: now, setBy: actor },
      }),
    ),
  );
  return practiceIds.length;
}

/** Practices a company may score: on one of its clinic lists, or added by it by hand. */
export async function scorablePracticeIds(organizationId: string, practiceIds: string[]): Promise<string[]> {
  const rows = await prisma.practice.findMany({
    where: {
      id: { in: practiceIds },
      OR: [{ clinicPractices: { some: { organizationId } } }, { organizationId, practiceKey: { startsWith: 'own:' } }],
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}
