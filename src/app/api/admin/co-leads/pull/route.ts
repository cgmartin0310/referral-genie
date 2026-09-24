import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { acquisitionCodes } from '@/lib/nppes/taxonomies';
import { buildLeads } from '@/lib/acquisition/leads';
import { countyMarketForFips } from '@/lib/nppes/counties';
import { currentTenant, requireParagon, tenantErrorResponse } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/**
 * Build a county's clinic-owner leads from the NPI file. Re-pulling keeps
 * each lead's stage, notes, and assignee; a lead no longer on the file is
 * retired, not deleted. Body: { countyFips }
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'Clinic-owner leads are for Paragon.');
    const body = (await request.json()) as { countyFips?: unknown };
    const countyFips = typeof body.countyFips === 'string' ? body.countyFips.trim() : '';
    if (!/^\d{5}$/.test(countyFips)) return NextResponse.json({ error: 'Choose a county' }, { status: 400 });
    const county = countyMarketForFips(countyFips);

    const records = await prisma.npiRecord.findMany({
      where: { countyFips, primaryTaxonomyCode: { in: [...acquisitionCodes()] } },
      select: { npi: true, name: true, entityType: true, primaryTaxonomyCode: true, address1: true, city: true, zip: true, phone: true, fax: true },
    });
    const leads = buildLeads(records);
    for (const lead of leads) {
      const shape = { ...lead, therapists: lead.therapists, countyName: county?.name ?? null, retiredAt: null };
      await prisma.coLead.upsert({
        where: { countyFips_key: { countyFips, key: lead.key } },
        create: { countyFips, ...shape },
        update: shape,
      });
    }
    const retired = await prisma.coLead.updateMany({
      where: { countyFips, key: { notIn: leads.map((lead) => lead.key) }, retiredAt: null },
      data: { retiredAt: new Date() },
    });
    return NextResponse.json({ records: records.length, leads: leads.length, retired: retired.count });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error pulling clinic-owner leads:', error);
    return NextResponse.json({ error: 'Failed to pull clinic-owner leads' }, { status: 500 });
  }
}
