import { NextResponse } from 'next/server';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { prospectsFor } from '@/lib/prospects/db';

export const dynamic = 'force-dynamic';

/** The signed-in subscriber's prospects in its market, scored, with its decisions. */
export async function GET() {
  try {
    const tenant = await currentTenant();
    const { market, prospects } = await prospectsFor(tenant.organizationId);
    const open = prospects.filter((row) => row.status !== 'excluded');
    return NextResponse.json({
      market,
      prospects,
      totals: {
        practices: open.length,
        providers: open.reduce((sum, row) => sum + row.providers, 0),
        approved: prospects.filter((row) => row.status === 'approved').length,
        excluded: prospects.filter((row) => row.status === 'excluded').length,
        proposed: prospects.filter((row) => row.status === 'proposed').length,
      },
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error listing prospects:', error);
    return NextResponse.json({ error: 'Failed to load prospects' }, { status: 500 });
  }
}
