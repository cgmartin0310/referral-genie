import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CATALOG_ORGANIZATION_ID } from '@/lib/org';
import { currentTenant, requireParagon, tenantErrorResponse } from '@/lib/tenant';
import { DEFAULT_CALL_SCRIPT, isCallOutcome, stageAfterCall } from '@/lib/universe';

export const dynamic = 'force-dynamic';

const QUEUE_STAGES = ['queued', 'outreach_active', 'rc_identified'];

/**
 * Paragon's call queue: catalog practices still working toward an engaged
 * referral coordinator, with a phone and no opt-out, least recently touched
 * first. Query: countyFips
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'The call queue is for Paragon.');
    const countyFips = request.nextUrl.searchParams.get('countyFips')?.trim() || null;
    const practices = await prisma.practice.findMany({
      where: {
        organizationId: CATALOG_ORGANIZATION_ID,
        hiddenAt: null,
        retiredAt: null,
        faxOptOutAt: null,
        providerCount: { gt: 0 },
        phone: { not: null },
        outreachStage: { in: QUEUE_STAGES },
        ...(countyFips ? { countyFips } : {}),
      },
      select: {
        id: true, name: true, city: true, countyName: true, phone: true, faxNumber: true, providerCount: true,
        outreachStage: true, rcName: true, rcPhone: true, assignee: true,
      },
      take: 300,
    });
    const touches = await prisma.outreachTouch.findMany({
      where: { practiceId: { in: practices.map((row) => row.id) } },
      orderBy: { createdAt: 'desc' },
    });
    const byPractice = new Map<string, typeof touches>();
    for (const touch of touches) byPractice.set(touch.practiceId, [...(byPractice.get(touch.practiceId) ?? []), touch]);
    const queue = practices
      .map((row) => {
        const history = byPractice.get(row.id) ?? [];
        return {
          ...row,
          touches: history.length,
          lastTouch: history[0] ? { outcome: history[0].outcome, at: history[0].createdAt.toISOString(), notes: history[0].notes, actor: history[0].actor } : null,
        };
      })
      .sort((left, right) => (left.lastTouch?.at ?? '').localeCompare(right.lastTouch?.at ?? '') || right.providerCount - left.providerCount);
    return NextResponse.json({ queue, script: DEFAULT_CALL_SCRIPT, caller: tenant.actor });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error loading the call queue:', error);
    return NextResponse.json({ error: 'Failed to load the call queue' }, { status: 500 });
  }
}

const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

/**
 * Log a call. The outcome moves the practice on the ladder; a coordinator's
 * name and phone are recorded; a request not to be contacted opts the
 * practice out for every subscriber.
 * Body: { practiceId, outcome, notes?, rcName?, rcPhone?, faxNumber? }
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'The call queue is for Paragon.');
    const body = (await request.json()) as Record<string, unknown>;
    if (!isCallOutcome(body.outcome)) return NextResponse.json({ error: 'Choose how the call ended' }, { status: 400 });
    const practice = await prisma.practice.findFirst({
      where: { id: String(body.practiceId ?? ''), organizationId: CATALOG_ORGANIZATION_ID },
      select: { id: true, outreachStage: true, editedFields: true },
    });
    if (!practice) return NextResponse.json({ error: 'Practice not found' }, { status: 404 });

    const outcome = body.outcome;
    const stage = stageAfterCall(practice.outreachStage, outcome);
    const rcName = text(body.rcName, 120);
    const rcPhone = text(body.rcPhone, 40);
    const fax = typeof body.faxNumber === 'string' ? body.faxNumber.replace(/\D/g, '').slice(-10) : '';
    await prisma.$transaction([
      prisma.outreachTouch.create({
        data: { practiceId: practice.id, channel: 'call', outcome, notes: text(body.notes, 1000), actor: tenant.actor },
      }),
      prisma.practice.update({
        where: { id: practice.id },
        data: {
          outreachStage: stage,
          ...(stage !== practice.outreachStage ? { stageChangedAt: new Date() } : {}),
          ...(rcName ? { rcName } : {}),
          ...(rcPhone ? { rcPhone } : {}),
          // A fax confirmed on the phone is a person's edit: later pulls keep it.
          ...(fax.length === 10
            ? { faxNumber: fax, editedFields: [...new Set([...practice.editedFields, 'faxNumber'])] }
            : {}),
          ...(outcome === 'dnc_request' ? { faxOptOutAt: new Date(), faxOptOutBy: 'Paragon (call)' } : {}),
        },
      }),
    ]);
    return NextResponse.json({ stage, optedOut: outcome === 'dnc_request' });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error logging a call:', error);
    return NextResponse.json({ error: 'Failed to log the call' }, { status: 500 });
  }
}
