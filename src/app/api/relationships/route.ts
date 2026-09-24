import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { clinicResolver, listRelationships, loadCatalogIndex } from '@/lib/relationships/db';
import { matchToCatalog } from '@/lib/relationships/match';
import { cleanAnswers, trustScore } from '@/lib/relationships/trs';

export const dynamic = 'force-dynamic';

/** The signed-in subscriber's referral sources, with trust scores and catalog matches. */
export async function GET() {
  try {
    const tenant = await currentTenant();
    const relationships = await listRelationships(tenant.organizationId);
    const recent = new Set(['within_90d', '91_180d']);
    return NextResponse.json({
      relationships,
      totals: {
        sources: relationships.length,
        referringRecently: relationships.filter((row) => row.lastReferral && recent.has(row.lastReferral)).length,
        averageTrs: relationships.length ? Math.round(relationships.reduce((sum, row) => sum + row.trs, 0) / relationships.length) : null,
        strong: relationships.filter((row) => row.trs >= 80).length,
        matched: relationships.filter((row) => row.catalog).length,
      },
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error listing relationships:', error);
    return NextResponse.json({ error: 'Failed to load your referral sources' }, { status: 500 });
  }
}

const text = (value: unknown, max = 200) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const digits = (value: unknown) => {
  const d = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  return d.length >= 10 ? d.slice(-10) : null;
};

/** Add one referral source by hand, with the relationship questions answered. */
export async function POST(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    const body = (await request.json()) as Record<string, unknown>;
    const name = text(body.name);
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    const npi = typeof body.npi === 'string' ? body.npi.replace(/\D/g, '') : '';
    if (npi && npi.length !== 10) return NextResponse.json({ error: 'An NPI is 10 digits' }, { status: 400 });

    const answers = cleanAnswers(body);
    const row = {
      name,
      practiceName: text(body.practiceName),
      npi: npi || null,
      specialty: text(body.specialty, 80),
      phone: digits(body.phone),
      fax: digits(body.fax),
      email: text(body.email, 120),
      address: text(body.address),
      city: text(body.city, 80),
      state: text(body.state, 2)?.toUpperCase() ?? null,
      zip: typeof body.zip === 'string' ? body.zip.replace(/\D/g, '').slice(0, 5) || null : null,
      type: ['practice', 'physician', 'school', 'other'].includes(String(body.type)) ? String(body.type) : 'practice',
    };
    const match = matchToCatalog(row, await loadCatalogIndex());
    const resolveClinic = await clinicResolver(tenant.organizationId);
    const created = await prisma.sourceRelationship.create({
      data: {
        organizationId: tenant.organizationId,
        clinicLocationId: resolveClinic(text(body.clinicLocationId)),
        practiceId: match?.practiceId ?? null,
        matchedBy: match?.matchedBy ?? null,
        ...row,
        ...answers,
        trs: trustScore(answers),
        createdFrom: 'manual',
      },
    });
    return NextResponse.json({ id: created.id, trs: created.trs, matched: Boolean(match) }, { status: 201 });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error adding a relationship:', error);
    return NextResponse.json({ error: 'Failed to add the referral source' }, { status: 500 });
  }
}
