import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/org';
import { presentProvider } from '@/lib/practices/present';

export const dynamic = 'force-dynamic';

/** Provider settings a person controls. The pull never writes these. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { useOwnFax?: unknown; faxNumber?: unknown };

    const data: { useOwnFax?: boolean; faxNumber?: string | null } = {};
    if (typeof body.useOwnFax === 'boolean') data.useOwnFax = body.useOwnFax;
    if (typeof body.faxNumber === 'string') data.faxNumber = body.faxNumber.trim() || null;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const existing = await prisma.provider.findFirst({
      where: { id, organizationId: DEFAULT_ORGANIZATION_ID },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

    const updated = await prisma.provider.update({
      where: { id },
      data,
      include: { practice: { select: { id: true, name: true, faxNumber: true } } },
    });
    return NextResponse.json(presentProvider(updated, updated.practice));
  } catch (error) {
    console.error('Error updating provider:', error);
    return NextResponse.json({ error: 'Failed to update provider' }, { status: 500 });
  }
}
