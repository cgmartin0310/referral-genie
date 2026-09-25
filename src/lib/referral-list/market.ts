import prisma from '../prisma';
import { DEFAULT_ORGANIZATION_ID, SHARED_PRACTICE } from '../org';
import { seedCountyIdForFips } from '../geo/us-counties';
import { advanceCountyIngest, createOrResumeRun } from '../ingest/advance';
import { researchCountyFips } from '../research/clinic-sources';
import { advanceResearchRun, countyScope, createOrResumeResearchRun, sourceIdsForCounty } from '../research/advance';
import { readResearchLlmConfig } from '../research/llm';

/**
 * A clinic's market builds its referral list: every catalog practice in its
 * counties goes on it. A county nobody has pulled is pulled here, in the
 * background, and the lists that want it fill in when it finishes.
 */

/** The spellings one county's FIPS is stored under ("37107", a seed id, …). */
function variants(fips: string): string[] {
  return researchCountyFips([fips]);
}

/** Catalog practices a market brings in: pulled, visible, with providers. */
function marketPractices(fips: string) {
  return prisma.practice.findMany({
    where: { ...SHARED_PRACTICE, countyFips: { in: variants(fips) }, hiddenAt: null, retiredAt: null, providerCount: { gt: 0 } },
    select: { id: true },
  });
}

/**
 * Put every catalog practice in the county on the list of each clinic whose
 * market includes it (or only the given clinic). Practices already listed,
 * including ones a person scored Not a fit, are left as they are.
 */
export async function fillListsForCounty(fips: string, onlyClinicId?: string): Promise<number> {
  const clinics = await prisma.clinicMarketCounty.findMany({
    where: { countyFips: { in: variants(fips) }, ...(onlyClinicId ? { clinicLocationId: onlyClinicId } : {}) },
    select: { clinicLocation: { select: { id: true, organizationId: true } } },
  });
  if (clinics.length === 0) return 0;
  const practices = await marketPractices(fips);
  let added = 0;
  for (const { clinicLocation } of clinics) {
    const result = await prisma.clinicPractice.createMany({
      data: practices.map((practice) => ({
        clinicLocationId: clinicLocation.id,
        practiceId: practice.id,
        organizationId: clinicLocation.organizationId,
        addedFrom: 'market',
      })),
      skipDuplicates: true,
    });
    added += result.count;
  }
  return added;
}

/** A county left the market: its market-built entries the company never scored leave the list. Scored ones stay. */
export async function dropUnscoredForCounties(clinicId: string, organizationId: string, fipsList: string[]): Promise<number> {
  if (fipsList.length === 0) return 0;
  const result = await prisma.clinicPractice.deleteMany({
    where: {
      clinicLocationId: clinicId,
      addedFrom: 'market',
      practice: { countyFips: { in: fipsList.flatMap(variants) }, scores: { none: { organizationId } } },
    },
  });
  return result.count;
}

export type CountyPullState = 'ready' | 'pulling' | 'failed' | 'unavailable';

async function latestPull(fips: string) {
  return prisma.countyIngestRun.findFirst({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: { in: variants(fips) } },
    orderBy: { createdAt: 'desc' },
  });
}

async function everPulled(fips: string): Promise<boolean> {
  const done = await prisma.countyIngestRun.count({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: { in: variants(fips) }, status: 'COMPLETED' },
  });
  return done > 0;
}

// Pulls this server is running, by county, so a county is never pulled twice at once here.
const running = new Map<string, Promise<void>>();
// When a background pull last gave up, by county: it is not retried for a while.
const gaveUpAt = new Map<string, number>();
const RETRY_AFTER_MS = 10 * 60 * 1000;
const MAX_FAILED_STEPS = 3;
const MAX_STEPS = 5000;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runPull(countyId: string, fips: string): Promise<void> {
  let run = await createOrResumeRun({ countyId, mode: 'continue' });
  let failures = 0;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const result = await advanceCountyIngest(run.id);
    if (result.run.status === 'COMPLETED') break;
    if (result.busy) {
      // Someone else (Paragon's pull page) is stepping it; wait for them.
      await pause(5000);
      continue;
    }
    if (result.run.status === 'FAILED') {
      failures += 1;
      if (failures >= MAX_FAILED_STEPS) {
        console.error(`Background pull of ${fips} stopped after ${failures} failures: ${result.run.error}`);
        gaveUpAt.set(countyId, Date.now());
        return;
      }
      await pause(3000 * failures);
    } else {
      failures = 0;
    }
    run = { ...run, id: result.run.id };
  }
  await fillListsForCounty(fips);

  // Find missing faxes on practice websites, when a research model is set up.
  if (!readResearchLlmConfig()) return;
  let research = await createOrResumeResearchRun({ scopeKey: countyScope(fips), mode: 'refresh', sourceIds: await sourceIdsForCounty(fips) });
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const result = await advanceResearchRun(research.id);
    if (result.run.status === 'COMPLETED' || result.run.status === 'FAILED') break;
    if (result.busy) await pause(5000);
    research = { ...research, id: result.run.id };
  }
}

/**
 * Start pulling the county in the background unless it has been pulled, is
 * being pulled on this server, or has no ZIP list to pull from. Returns
 * without waiting.
 */
export async function ensureCountyPulled(fips: string): Promise<void> {
  const countyId = seedCountyIdForFips(fips);
  if (!countyId || running.has(countyId)) return;
  if (Date.now() - (gaveUpAt.get(countyId) ?? 0) < RETRY_AFTER_MS) return;
  if (await everPulled(fips)) return;
  const job = runPull(countyId, fips)
    .catch((error) => console.error(`Background pull of ${fips} failed:`, error))
    .finally(() => running.delete(countyId));
  running.set(countyId, job);
}

export interface MarketCountyStatus {
  fips: string;
  name: string;
  state: string;
  status: CountyPullState;
  /** Catalog practices in the county. */
  practices: number;
  /** How far a running pull is, 0 to 1, when it can tell. */
  progress: number | null;
  error: string | null;
}

/**
 * Each clinic's market counties and whether their practices are in: ready,
 * being pulled, failed, or unavailable (no ZIP list for the county). Starts
 * a background pull for any county not yet pulled.
 */
export async function marketStatus(organizationId: string) {
  const clinics = await prisma.clinicLocation.findMany({
    where: { organizationId },
    select: { id: true, name: true, marketCounties: { orderBy: [{ state: 'asc' }, { countyName: 'asc' }] }, _count: { select: { clinicPractices: true } } },
    orderBy: { name: 'asc' },
  });
  const byFips = new Map<string, MarketCountyStatus>();
  for (const clinic of clinics) {
    for (const county of clinic.marketCounties) {
      if (byFips.has(county.countyFips)) continue;
      const [latest, practices] = await Promise.all([latestPull(county.countyFips), marketPractices(county.countyFips).then((rows) => rows.length)]);
      const pulled = await everPulled(county.countyFips);
      let status: CountyPullState;
      if (!seedCountyIdForFips(county.countyFips)) status = pulled ? 'ready' : 'unavailable';
      else if (pulled) status = 'ready';
      else if (latest?.status === 'FAILED' && !running.has(seedCountyIdForFips(county.countyFips)!)) status = 'failed';
      else status = 'pulling';
      if (status === 'pulling' || status === 'failed') await ensureCountyPulled(county.countyFips);
      if (status === 'failed' && running.has(seedCountyIdForFips(county.countyFips)!)) status = 'pulling';
      const summary = (latest?.summary ?? {}) as { nppesQueries?: number; nppesQueryTotal?: number };
      byFips.set(county.countyFips, {
        fips: county.countyFips,
        name: county.countyName,
        state: county.state,
        status,
        practices,
        progress: status === 'pulling' && summary.nppesQueryTotal ? Math.min(1, (summary.nppesQueries ?? 0) / summary.nppesQueryTotal) : null,
        error: status === 'failed' ? latest?.error ?? null : null,
      });
    }
  }
  return {
    clinics: clinics.map((clinic) => ({
      id: clinic.id,
      name: clinic.name,
      listed: clinic._count.clinicPractices,
      counties: clinic.marketCounties.map((county) => byFips.get(county.countyFips)!),
    })),
    pulling: [...byFips.values()].some((county) => county.status === 'pulling'),
  };
}
