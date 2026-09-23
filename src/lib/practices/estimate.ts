/**
 * Referral estimate for one practice.
 *
 * Providers of each type are assumed to send a set number of referrals a
 * month. The sum is shown as a range with its drivers, never as one precise
 * number: NPPES lists providers at every location they work from and keeps
 * people who have left, so a provider count is an upper bound.
 *
 * These rates are starting assumptions to be tuned once inbound data exists.
 */
export const DEFAULT_MONTHLY_RATE: Record<string, number> = {
  pediatrics: 1,
  pcp_family_medicine: 0.5,
  pcp_general_practice: 0.5,
};

const LOW_FACTOR = 0.6;
const HIGH_FACTOR = 1.4;

export interface EstimateDriver {
  sourceType: string;
  providers: number;
  ratePerMonth: number;
  monthly: number;
}

export interface ReferralEstimate {
  low: number;
  high: number;
  point: number;
  drivers: EstimateDriver[];
}

export function estimateMonthlyReferrals(
  taxonomyMix: Record<string, number> | null | undefined,
  rates: Record<string, number> = DEFAULT_MONTHLY_RATE,
): ReferralEstimate | null {
  if (!taxonomyMix) return null;
  const drivers: EstimateDriver[] = [];
  for (const [sourceType, providers] of Object.entries(taxonomyMix)) {
    if (!Number.isFinite(providers) || providers <= 0) continue;
    const ratePerMonth = rates[sourceType] ?? 0;
    drivers.push({ sourceType, providers, ratePerMonth, monthly: providers * ratePerMonth });
  }
  if (drivers.length === 0) return null;
  const point = drivers.reduce((sum, driver) => sum + driver.monthly, 0);
  return {
    point,
    low: Math.max(0, Math.floor(point * LOW_FACTOR)),
    high: Math.max(1, Math.ceil(point * HIGH_FACTOR)),
    drivers: drivers.sort((left, right) => right.monthly - left.monthly),
  };
}

export function sumEstimates(estimates: (ReferralEstimate | null)[]): { low: number; high: number } {
  let low = 0;
  let high = 0;
  for (const estimate of estimates) {
    if (!estimate) continue;
    low += estimate.low;
    high += estimate.high;
  }
  return { low, high };
}
