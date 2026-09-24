import { NextRequest, NextResponse } from 'next/server';
import { optOutLine } from '@/lib/fax/opt-out';
import { loadFaxSettings, saveFaxSettings } from '@/lib/fax/settings';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/** The signed-in organization's sender and opt-out numbers, printed on every campaign fax page. */
export async function GET() {
  try {
    const tenant = await currentTenant();
    const settings = await loadFaxSettings(tenant.organizationId);
    return NextResponse.json({ settings, line: optOutLine(settings) });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error loading fax settings:', error);
    return NextResponse.json({ error: 'Failed to load the fax settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    const settings = await saveFaxSettings(await request.json(), tenant.organizationId);
    return NextResponse.json({ settings, line: optOutLine(settings) });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error saving fax settings:', error);
    return NextResponse.json({ error: 'Failed to save the fax settings' }, { status: 500 });
  }
}
