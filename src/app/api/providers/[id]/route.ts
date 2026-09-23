import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/org';
import { presentProvider } from '@/lib/practices/present';

export const dynamic = 'force-dynamic';

/** The practice's provider count and mix, from the providers still on the list. */
async function recount(practiceId: string) {
  const providers = await prisma.provider.findMany({
    where: { practiceId, hiddenAt: null },
    select: { sourceType: true },
  });
  const taxonomyMix: Record<string, number> = {};
  for (const provider of providers) {
    const key = provider.sourceType ?? 'unknown';
    taxonomyMix[key] = (taxonomyMix[key] ?? 0) + 1;
  }
  await prisma.practice.update({ where: { id: practiceId }, data: { providerCount: providers.length, taxonomyMix } });
}

/** Provider settings a person controls. The pull never writes these. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { useOwnFax?: unknown; faxNumber?: unknown; hidden?: unknown };

    const data: { useOwnFax?: boolean; faxNumber?: string | null; hiddenAt?: Date | null } = {};
    if (typeof body.useOwnFax === 'boolean') data.useOwnFax = body.useOwnFax;
    if (typeof body.faxNumber === 'string') data.faxNumber = body.faxNumber.trim() || null;
    // Remove from the list (true) or restore (false). Later pulls keep it removed.
    if (typeof body.hidden === 'boolean') data.hiddenAt = body.hidden ? new Date() : null;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const existing = await prisma.provider.findFirst({
      where: { id, organizationId: DEFAULT_ORGANIZATION_ID },
      select: { id: true, practiceId: true },
    });
    if (!existing) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

    const updated = await prisma.provider.update({
      where: { id },
      data,
      include: { practice: { select: { id: true, name: true, faxNumber: true } } },
    });
    if (data.hiddenAt !== undefined && existing.practiceId) await recount(existing.practiceId);
    return NextResponse.json(presentProvider(updated, updated.practice));
  } catch (error) {
    console.error('Error updating provider:', error);
    return NextResponse.json({ error: 'Failed to update provider' }, { status: 500 });
  }
}
