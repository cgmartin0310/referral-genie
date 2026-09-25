import { NextRequest, NextResponse } from 'next/server';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { importToLists } from '@/lib/referral-list/import-db';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 2_000_000;

/**
 * Upload a spreadsheet (saved as CSV) of referral sources onto the clinic
 * lists. Body: { csv, clinicId } where clinicId takes rows with no Location.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    const body = (await request.json().catch(() => ({}))) as { csv?: unknown; clinicId?: unknown };
    if (typeof body.csv !== 'string' || !body.csv.trim()) return NextResponse.json({ error: 'Upload a CSV file' }, { status: 400 });
    if (body.csv.length > MAX_BYTES) return NextResponse.json({ error: 'The file is larger than 2 MB' }, { status: 400 });
    const report = await importToLists({
      organizationId: tenant.organizationId,
      actor: tenant.actor,
      csv: body.csv,
      defaultClinicId: typeof body.clinicId === 'string' && body.clinicId ? body.clinicId : null,
    });
    return NextResponse.json(report);
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error importing onto referral lists:', error);
    return NextResponse.json({ error: 'Failed to import the file' }, { status: 500 });
  }
}
