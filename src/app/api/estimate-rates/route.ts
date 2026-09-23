import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_ESTIMATE_RATES, ESTIMATE_PROVIDER_TYPES } from '@/lib/practices/estimate';
import { loadEstimateRates, saveEstimateRates } from '@/lib/practices/estimate-settings';

export const dynamic = 'force-dynamic';

/** The referral estimate's rate table, with the provider types it has rows for. */
export async function GET() {
  try {
    return NextResponse.json({
      settings: await loadEstimateRates(),
      providerTypes: ESTIMATE_PROVIDER_TYPES,
      defaults: DEFAULT_ESTIMATE_RATES,
    });
  } catch (error) {
    console.error('Error loading estimate rates:', error);
    return NextResponse.json({ error: 'Failed to load the referral estimate rates' }, { status: 500 });
  }
}

/** Save the rate table: { disciplines: [{ key?, label }], rates: { [discipline]: { [providerType]: number } } }. */
export async function PUT(request: NextRequest) {
  try {
    const settings = await saveEstimateRates(await request.json());
    return NextResponse.json({ settings, providerTypes: ESTIMATE_PROVIDER_TYPES, defaults: DEFAULT_ESTIMATE_RATES });
  } catch (error) {
    console.error('Error saving estimate rates:', error);
    return NextResponse.json({ error: 'Failed to save the referral estimate rates' }, { status: 500 });
  }
}
