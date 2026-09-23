import prisma from '../prisma';
import { DEFAULT_ORGANIZATION_ID } from '../org';
import { DEFAULT_ESTIMATE_RATES, parseEstimateRates, type EstimateRates } from './estimate';

/** The organization's rate table, or the defaults until someone saves one. */
export async function loadEstimateRates(): Promise<EstimateRates> {
  const row = await prisma.estimateSettings.findUnique({ where: { organizationId: DEFAULT_ORGANIZATION_ID } });
  return row ? parseEstimateRates(row.rates) : DEFAULT_ESTIMATE_RATES;
}

export async function saveEstimateRates(value: unknown): Promise<EstimateRates> {
  const rates = parseEstimateRates(value);
  await prisma.estimateSettings.upsert({
    where: { organizationId: DEFAULT_ORGANIZATION_ID },
    create: { organizationId: DEFAULT_ORGANIZATION_ID, rates: rates as object },
    update: { rates: rates as object },
  });
  return rates;
}
