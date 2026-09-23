/**
 * Referral estimate for one practice.
 *
 * Each provider type is assumed to send a set number of referrals a month
 * for each therapy discipline (a pediatrician: so many speech, so many OT).
 * The rates are a table a person edits (Settings → Referral estimates);
 * DEFAULT_ESTIMATE_RATES is where a new organization starts.
 *
 * The sum is shown as a range with its drivers, never as one precise number:
 * NPPES lists providers at every location they work from and keeps people who
 * have left, so a provider count is an upper bound.
 */

export interface Discipline {
  key: string;
  label: string;
}

export interface EstimateRates {
  disciplines: Discipline[];
  /** Discipline key → provider type (source type) → referrals per provider per month. */
  rates: Record<string, Record<string, number>>;
}

/** Provider types the rate table has a row for. Organizations are never counted. */
export const ESTIMATE_PROVIDER_TYPES: { sourceType: string; label: string }[] = [
  { sourceType: 'pediatrics', label: 'Pediatrics' },
  { sourceType: 'pcp_family_medicine', label: 'Family medicine' },
  { sourceType: 'pcp_general_practice', label: 'General practice' },
];

/**
 * Starting assumptions, to be tuned once inbound data exists. They split the
 * earlier single rates (pediatrics 1, family medicine and general practice
 * 0.5 a month) across disciplines, so totals are unchanged.
 */
export const DEFAULT_ESTIMATE_RATES: EstimateRates = {
  disciplines: [
    { key: 'pt', label: 'Physical therapy' },
    { key: 'ot', label: 'Occupational therapy' },
    { key: 'st', label: 'Speech therapy' },
  ],
  rates: {
    pt: { pediatrics: 0.2, pcp_family_medicine: 0.25, pcp_general_practice: 0.25 },
    ot: { pediatrics: 0.3, pcp_family_medicine: 0.1, pcp_general_practice: 0.1 },
    st: { pediatrics: 0.5, pcp_family_medicine: 0.15, pcp_general_practice: 0.15 },
  },
};

const LOW_FACTOR = 0.6;
const HIGH_FACTOR = 1.4;

export interface EstimateDriver {
  sourceType: string;
  providers: number;
  ratePerMonth: number;
  monthly: number;
}

export interface DisciplineEstimate {
  key: string;
  label: string;
  point: number;
  low: number;
  high: number;
}

export interface ReferralEstimate {
  low: number;
  high: number;
  point: number;
  drivers: EstimateDriver[];
  byDiscipline: DisciplineEstimate[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function range(point: number): { low: number; high: number } {
  return {
    low: Math.max(0, Math.floor(point * LOW_FACTOR)),
    high: point > 0 ? Math.max(1, Math.ceil(point * HIGH_FACTOR)) : 0,
  };
}

function rate(settings: EstimateRates, discipline: string, sourceType: string): number {
  const value = settings.rates[discipline]?.[sourceType];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function estimateMonthlyReferrals(
  taxonomyMix: Record<string, number> | null | undefined,
  settings: EstimateRates = DEFAULT_ESTIMATE_RATES,
): ReferralEstimate | null {
  if (!taxonomyMix) return null;
  const counted = Object.entries(taxonomyMix).filter(
    ([, providers]) => Number.isFinite(providers) && providers > 0,
  );
  if (counted.length === 0) return null;

  const drivers: EstimateDriver[] = counted.map(([sourceType, providers]) => {
    const ratePerMonth = round2(settings.disciplines.reduce((sum, discipline) => sum + rate(settings, discipline.key, sourceType), 0));
    return { sourceType, providers, ratePerMonth, monthly: round2(providers * ratePerMonth) };
  });
  const byDiscipline = settings.disciplines.map((discipline) => {
    const point = round2(counted.reduce((sum, [sourceType, providers]) => sum + providers * rate(settings, discipline.key, sourceType), 0));
    return { key: discipline.key, label: discipline.label, point, ...range(point) };
  });
  const point = round2(drivers.reduce((sum, driver) => sum + driver.monthly, 0));
  return {
    point,
    ...range(point),
    drivers: drivers.sort((left, right) => right.monthly - left.monthly),
    byDiscipline,
  };
}

export interface EstimateTotal {
  low: number;
  high: number;
  byDiscipline: { key: string; label: string; low: number; high: number }[];
}

export function sumEstimates(estimates: (ReferralEstimate | null)[]): EstimateTotal {
  let low = 0;
  let high = 0;
  const byKey = new Map<string, { key: string; label: string; low: number; high: number }>();
  for (const estimate of estimates) {
    if (!estimate) continue;
    low += estimate.low;
    high += estimate.high;
    for (const discipline of estimate.byDiscipline) {
      const entry = byKey.get(discipline.key) ?? { key: discipline.key, label: discipline.label, low: 0, high: 0 };
      entry.low += discipline.low;
      entry.high += discipline.high;
      byKey.set(discipline.key, entry);
    }
  }
  return { low, high, byDiscipline: [...byKey.values()] };
}

/**
 * Clean a rate table from a person or the database: known provider types,
 * finite rates from 0 to 20 a month, one to ten disciplines with unique keys
 * and a label. Falls back to the defaults when nothing usable is left.
 */
export function parseEstimateRates(value: unknown): EstimateRates {
  const input = value && typeof value === 'object' ? (value as Partial<EstimateRates>) : {};
  const disciplines: Discipline[] = [];
  const seen = new Set<string>();
  for (const row of Array.isArray(input.disciplines) ? input.disciplines : []) {
    const label = typeof row?.label === 'string' ? row.label.trim().slice(0, 40) : '';
    if (!label) continue;
    let key = typeof row?.key === 'string' && /^[a-z0-9_-]{1,40}$/.test(row.key) ? row.key : slug(label);
    if (!key) continue;
    while (seen.has(key)) key = `${key}_`;
    seen.add(key);
    disciplines.push({ key, label });
    if (disciplines.length === 10) break;
  }
  if (disciplines.length === 0) return DEFAULT_ESTIMATE_RATES;

  const rawRates = input.rates && typeof input.rates === 'object' ? input.rates : {};
  const rates: Record<string, Record<string, number>> = {};
  for (const discipline of disciplines) {
    const row = (rawRates as Record<string, unknown>)[discipline.key];
    rates[discipline.key] = {};
    for (const { sourceType } of ESTIMATE_PROVIDER_TYPES) {
      const raw = row && typeof row === 'object' ? (row as Record<string, unknown>)[sourceType] : undefined;
      const number = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : 0;
      rates[discipline.key][sourceType] = Number.isFinite(number) ? Math.min(20, Math.max(0, round2(number))) : 0;
    }
  }
  return { disciplines, rates };
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}
