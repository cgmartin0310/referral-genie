import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { clinicResolver, loadCatalogIndex } from '@/lib/relationships/db';
import { parseImport } from '@/lib/relationships/import';
import { matchToCatalog, nameKey } from '@/lib/relationships/match';
import { trustScore } from '@/lib/relationships/trs';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 2_000_000;

/**
 * Upload a spreadsheet (saved as CSV) of existing referral sources. Each row
 * is matched to the catalog; a row that is already one of this subscriber's
 * sources (same NPI, or same name and ZIP) is merged into it. The report
 * says what was accepted, merged, and rejected, and why.
 * Body: { csv: string, clinicLocationId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    const body = (await request.json()) as { csv?: unknown; clinicLocationId?: unknown };
    if (typeof body.csv !== 'string' || !body.csv.trim()) {
      return NextResponse.json({ error: 'Upload a CSV file' }, { status: 400 });
    }
    if (body.csv.length > MAX_BYTES) return NextResponse.json({ error: 'The file is larger than 2 MB' }, { status: 400 });

    const parsed = parseImport(body.csv);
    const index = await loadCatalogIndex();
    const resolveClinic = await clinicResolver(tenant.organizationId);
    const defaultClinic = typeof body.clinicLocationId === 'string' ? resolveClinic(body.clinicLocationId) : null;
    const existing = await prisma.sourceRelationship.findMany({
      where: { organizationId: tenant.organizationId },
      select: { id: true, npi: true, name: true, zip: true },
    });
    const byNpi = new Map(existing.filter((row) => row.npi).map((row) => [row.npi as string, row.id]));
    const byNameZip = new Map(existing.map((row) => [`${nameKey(row.name)}|${row.zip ?? ''}`, row.id]));

    let accepted = 0;
    let merged = 0;
    let matched = 0;
    for (const row of parsed.rows) {
      const match = matchToCatalog(row, index);
      if (match) matched += 1;
      const data = {
        clinicLocationId: resolveClinic(row.clinic) ?? defaultClinic,
        practiceId: match?.practiceId ?? null,
        matchedBy: match?.matchedBy ?? null,
        name: row.name,
        practiceName: row.practiceName,
        npi: row.npi,
        specialty: row.specialty,
        phone: row.phone,
        fax: row.fax,
        email: row.email,
        address: row.address,
        city: row.city,
        state: row.state,
        zip: row.zip,
        type: row.type,
        ...row.answers,
        trs: trustScore(row.answers),
      };
      const already = (row.npi && byNpi.get(row.npi)) || byNameZip.get(`${nameKey(row.name)}|${row.zip ?? ''}`);
      if (already) {
        // A merge fills in what this row says; a blank cell never erases what was known.
        const filled = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null && value !== undefined));
        const current = await prisma.sourceRelationship.findUniqueOrThrow({ where: { id: already } });
        const answers = {
          lastReferral: row.answers.lastReferral ?? current.lastReferral,
          referralVolume: row.answers.referralVolume ?? current.referralVolume,
          strength: row.answers.strength ?? current.strength,
          origin: row.answers.origin ?? current.origin,
        };
        await prisma.sourceRelationship.update({
          where: { id: already },
          data: { ...filled, ...answers, trs: trustScore(answers) },
        });
        merged += 1;
      } else {
        const created = await prisma.sourceRelationship.create({
          data: { organizationId: tenant.organizationId, createdFrom: 'upload', ...data },
          select: { id: true },
        });
        if (row.npi) byNpi.set(row.npi, created.id);
        byNameZip.set(`${nameKey(row.name)}|${row.zip ?? ''}`, created.id);
        accepted += 1;
      }
    }

    return NextResponse.json({ accepted, merged, matched, rejected: parsed.rejected, columns: parsed.columns });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error importing relationships:', error);
    return NextResponse.json({ error: 'Failed to import the file' }, { status: 500 });
  }
}
