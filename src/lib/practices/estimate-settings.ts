import prisma from '../prisma';
import { DEFAULT_ORGANIZATION_ID } from '../org';
import { DEFAULT_ESTIMATE_RATES, parseEstimateRates, type EstimateRates } from './estimate';

/**
 * A subscriber's rate table. Until it saves its own it uses Paragon's, and
 * until Paragon saves one, the defaults.
 */
export async function loadEstimateRates(organizationId: string = DEFAULT_ORGANIZATION_ID): Promise<EstimateRates> {
  const rows = await prisma.estimateSettings.findMany({
    where: { organizationId: { in: [organizationId, DEFAULT_ORGANIZATION_ID] } },
  });
  const own = rows.find((row) => row.organizationId === organizationId);
  const paragon = rows.find((row) => row.organizationId === DEFAULT_ORGANIZATION_ID);
  const row = own ?? paragon;
  return row ? parseEstimateRates(row.rates) : DEFAULT_ESTIMATE_RATES;
}

export async function saveEstimateRates(value: unknown, organizationId: string = DEFAULT_ORGANIZATION_ID): Promise<EstimateRates> {
  const rates = parseEstimateRates(value);
  await prisma.estimateSettings.upsert({
    where: { organizationId },
    create: { organizationId, rates: rates as object },
    update: { rates: rates as object },
  });
  return rates;
}
