import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { loadCatalogGroups, saveCatalogGroups } from '@/lib/catalog-settings';
import { TAXONOMY_CATALOG, TAXONOMY_GROUPS } from '@/lib/nppes/taxonomies';
import { currentTenant, requireParagon, tenantErrorResponse } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/**
 * The specialties the shared catalog pulls, with each one's NUCC codes and
 * how many records the loaded NPI file holds for it (0 means the file was
 * loaded before the specialty existed: reload it before pulling).
 */
async function view() {
  const enabled = new Set<string>(await loadCatalogGroups());
  const counts = await prisma.npiRecord.groupBy({ by: ['primaryTaxonomyCode'], _count: { _all: true } });
  const byCode = new Map(counts.map((row) => [row.primaryTaxonomyCode, row._count._all]));
  return {
    groups: TAXONOMY_GROUPS.map((group) => {
      const codes = TAXONOMY_CATALOG.filter((row) => row.group === group.group);
      return {
        group: group.group,
        label: group.label,
        organizations: group.organizations,
        enabled: enabled.has(group.group),
        codes: codes.map((row) => ({ code: row.code, description: row.description })),
        onFile: codes.reduce((sum, row) => sum + (byCode.get(row.code) ?? 0), 0),
      };
    }),
  };
}

export async function GET() {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'The catalog\'s specialties are Paragon\'s to set.');
    return NextResponse.json(await view());
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error loading catalog settings:', error);
    return NextResponse.json({ error: 'Failed to load the catalog specialties' }, { status: 500 });
  }
}

/** Body: { groups: string[] } — the specialty groups to pull. */
export async function PUT(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant, 'The catalog\'s specialties are Paragon\'s to set.');
    const body = (await request.json()) as { groups?: unknown };
    await saveCatalogGroups(body.groups);
    return NextResponse.json(await view());
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error saving catalog settings:', error);
    return NextResponse.json({ error: 'Failed to save the catalog specialties' }, { status: 500 });
  }
}
