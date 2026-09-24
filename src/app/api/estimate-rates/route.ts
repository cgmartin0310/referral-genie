import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_ESTIMATE_RATES, ESTIMATE_PROVIDER_TYPES } from '@/lib/practices/estimate';
import { loadEstimateRates, saveEstimateRates } from '@/lib/practices/estimate-settings';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { loadCatalogGroups } from '@/lib/catalog-settings';

/** Rows for the specialties the catalog pulls; others have no providers to count. */
async function providerTypes() {
  const on = new Set<string>(await loadCatalogGroups());
  return ESTIMATE_PROVIDER_TYPES.filter((row) => on.has(row.sourceType));
}

export const dynamic = 'force-dynamic';

/** The signed-in organization's referral estimate rate table, with the provider types it has rows for. */
export async function GET() {
  try {
    const tenant = await currentTenant();
    return NextResponse.json({
      settings: await loadEstimateRates(tenant.organizationId),
      providerTypes: await providerTypes(),
      defaults: DEFAULT_ESTIMATE_RATES,
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error loading estimate rates:', error);
    return NextResponse.json({ error: 'Failed to load the referral estimate rates' }, { status: 500 });
  }
}

/** Save the rate table: { disciplines: [{ key?, label }], rates: { [discipline]: { [providerType]: number } } }. */
export async function PUT(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    const settings = await saveEstimateRates(await request.json(), tenant.organizationId);
    return NextResponse.json({ settings, providerTypes: await providerTypes(), defaults: DEFAULT_ESTIMATE_RATES });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error saving estimate rates:', error);
    return NextResponse.json({ error: 'Failed to save the referral estimate rates' }, { status: 500 });
  }
}
