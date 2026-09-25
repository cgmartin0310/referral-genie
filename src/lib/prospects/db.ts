import prisma from '../prisma';
import { CATALOG_ORGANIZATION_ID, SHARED_PRACTICE } from '../org';
import { countyForZip } from '../npi/county-map';
import { nearestClinic } from '../geo/distance';
import { estimateMonthlyReferrals, ratesForDisciplines, type EstimateRates } from '../practices/estimate';
import { loadEstimateRates } from '../practices/estimate-settings';
import { fitScore, type ProspectStatus } from './fit';

export interface ProspectView {
  practiceId: string;
  name: string;
  address: string | null;
  city: string | null;
  countyName: string | null;
  providers: number;
  mix: Record<string, number>;
  faxNumber: string | null;
  nearest: { clinicId: string; clinicName: string; miles: number } | null;
  estimate: { low: number; high: number } | null;
  fit: number;
  healthSystem: boolean;
  status: ProspectStatus;
  decidedBy: string | null;
  decidedAt: string | null;
}

/**
 * A subscriber's prospects: catalog practices in its market (its clinics'
 * market counties, else each clinic's own county) that are not already its
 * referral sources, deleted, or opted out. Each counts once, assigned to the
 * nearest clinic, and is scored for fit against that clinic.
 */
export async function prospectsFor(organizationId: string): Promise<{
  market: { fips: string; name: string | null }[];
  prospects: ProspectView[];
}> {
  const clinics = await prisma.clinicLocation.findMany({
    where: { organizationId, isActive: true },
    select: {
      id: true, name: true, zipCode: true, latitude: true, longitude: true, disciplines: true, pediatric: true,
      marketCounties: { select: { countyFips: true, countyName: true } },
    },
  });
  const market = new Map<string, string | null>();
  for (const clinic of clinics) {
    if (clinic.marketCounties.length > 0) {
      for (const county of clinic.marketCounties) market.set(county.countyFips, county.countyName);
    } else if (clinic.zipCode) {
      const county = countyForZip(clinic.zipCode.slice(0, 5));
      if (county && !market.has(county.fips)) market.set(county.fips, null);
    }
  }
  if (market.size === 0) return { market: [], prospects: [] };

  const [practices, sources, decisions, rates] = await Promise.all([
    prisma.practice.findMany({
      where: {
        ...SHARED_PRACTICE,
        countyFips: { in: [...market.keys()] },
        hiddenAt: null,
        retiredAt: null,
        faxOptOutAt: null,
        providerCount: { gt: 0 },
      },
      select: {
        id: true, name: true, address: true, city: true, countyName: true, countyFips: true, providerCount: true, taxonomyMix: true,
        faxNumber: true, latitude: true, longitude: true,
      },
    }),
    prisma.sourceRelationship.findMany({ where: { organizationId, practiceId: { not: null } }, select: { practiceId: true } }),
    prisma.prospectDecision.findMany({ where: { organizationId } }),
    loadEstimateRates(organizationId),
  ]);
  const known = new Set(sources.map((row) => row.practiceId));
  const decided = new Map(decisions.map((row) => [row.practiceId, row]));
  const clinicById = new Map(clinics.map((clinic) => [clinic.id, clinic]));
  // Counties set from a clinic's ZIP have no name yet; the practices there carry it.
  for (const practice of practices) {
    if (practice.countyFips && !market.get(practice.countyFips) && practice.countyName) market.set(practice.countyFips, practice.countyName);
  }
  // A practice name the catalog has at two or more addresses is a chain or a
  // health system: flagged, not dropped (spec P9).
  const nameCounts = await prisma.practice.groupBy({
    by: ['name'],
    where: { organizationId: CATALOG_ORGANIZATION_ID, hiddenAt: null, retiredAt: null, name: { in: [...new Set(practices.map((row) => row.name))] } },
    _count: { _all: true },
  });
  const chains = new Set(nameCounts.filter((row) => row._count._all > 1).map((row) => row.name));

  const prospects = practices
    .filter((practice) => !known.has(practice.id))
    .map((practice) => {
      const mix = (practice.taxonomyMix ?? {}) as Record<string, number>;
      const nearest = nearestClinic(practice, clinics);
      const clinic = nearest ? clinicById.get(nearest.clinicId) : clinics[0];
      const clinicRates: EstimateRates = ratesForDisciplines(rates, clinic?.disciplines ?? []);
      const estimate = estimateMonthlyReferrals(mix, clinicRates);
      const pediatric = (mix.pediatrics ?? 0) / Math.max(1, practice.providerCount);
      const decision = decided.get(practice.id);
      return {
        practiceId: practice.id,
        name: practice.name,
        address: practice.address,
        city: practice.city,
        countyName: practice.countyName,
        providers: practice.providerCount,
        mix,
        faxNumber: practice.faxNumber,
        nearest,
        estimate: estimate ? { low: estimate.low, high: estimate.high } : null,
        fit: fitScore({
          estimatePoint: estimate?.point ?? 0,
          miles: nearest?.miles ?? null,
          providers: practice.providerCount,
          pediatricShare: pediatric,
          clinicSeesChildren: clinic?.pediatric ?? true,
        }),
        healthSystem: chains.has(practice.name),
        status: (decision?.status as ProspectStatus) ?? 'proposed',
        decidedBy: decision?.decidedBy ?? null,
        decidedAt: decision?.decidedAt.toISOString() ?? null,
      };
    })
    .sort((left, right) => right.fit - left.fit || right.providers - left.providers);

  return { market: [...market.entries()].map(([fips, name]) => ({ fips, name })), prospects };
}
