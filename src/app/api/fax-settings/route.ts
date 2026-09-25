import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { faxNotice } from '@/lib/fax/opt-out';
import { FaxSettingsError, loadFaxSettings, saveFaxSettings } from '@/lib/fax/settings';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/** Who is saving, readable: a Clerk account's email, else the admin username. */
async function actorLabel(tenant: { via: string; actor: string }): Promise<string> {
  if (tenant.via !== 'clerk') return tenant.actor;
  try {
    const user = await (await clerkClient()).users.getUser(tenant.actor);
    return user.primaryEmailAddress?.emailAddress ?? tenant.actor;
  } catch {
    return tenant.actor;
  }
}

/** The signed-in organization's sender and opt-out numbers, printed on every campaign fax page. */
export async function GET() {
  try {
    const tenant = await currentTenant();
    const settings = await loadFaxSettings(tenant.organizationId);
    return NextResponse.json({ settings, ...faxNotice(settings) });
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
    const settings = await saveFaxSettings(await request.json(), tenant.organizationId, await actorLabel(tenant));
    return NextResponse.json({ settings, ...faxNotice(settings) });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    if (error instanceof FaxSettingsError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Error saving fax settings:', error);
    return NextResponse.json({ error: 'Failed to save the fax settings' }, { status: 500 });
  }
}
