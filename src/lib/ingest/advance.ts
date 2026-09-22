import { Prisma, type CountyIngestRun } from '@prisma/client';
import prisma from '../prisma';
import { DEFAULT_ORGANIZATION_ID } from '../org';
import { getCounty, type CountyMarket } from '../nppes/counties';
import { TAXONOMY_SEARCHES } from '../nppes/taxonomies';
import { classifyHit } from '../nppes/normalize';
import { fetchNppesPage, NPPES_MAX_SKIP, NPPES_PAGE_SIZE } from '../nppes/api';
import { googlePlacesClient, matchPractice, PlacesConfigError, PlacesQuotaError } from '../places/match';
import { assignDuplicateClusters } from './duplicates';
import { buildNppesUpsert, buildPlacesWrite, type SourceWrite } from './source-write';
import {
  emptyCursor,
  emptySummary,
  parseCursor,
  parseSummary,
  publicSummary,
  type IngestCursor,
  type IngestSummary,
  type PublicSummary,
} from './summary';

const LOCK_MS = 90_000;
const DEFAULT_BUDGET_MS = 20_000;

export interface CountyRunView {
  id: string;
  countyId: string;
  countyName: string;
  countyFips: string;
  status: string;
  phase: string;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
  summary: PublicSummary;
}

export interface AdvanceResult {
  run: CountyRunView;
  busy: boolean;
  placesPending: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asWrite(write: SourceWrite): Prisma.ReferralSourceUncheckedUpdateInput {
  const { provenance, organizationId, ...rest } = write;
  return {
    ...rest,
    ...(organizationId ? { organizationId } : {}),
    ...(provenance ? { provenance: asJson(provenance) } : {}),
  };
}

export function presentRun(run: CountyIngestRun): CountyRunView {
  return {
    id: run.id,
    countyId: run.countyId,
    countyName: run.countyName,
    countyFips: run.countyFips,
    status: run.status,
    phase: run.phase,
    error: run.error,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    updatedAt: run.updatedAt.toISOString(),
    summary: publicSummary(parseSummary(run.summary)),
  };
}

async function placesPending(countyFips: string): Promise<number> {
  return prisma.referralSource.count({
    where: {
      organizationId: DEFAULT_ORGANIZATION_ID,
      countyFips,
      placesMatchStatus: 'pending',
    },
  });
}

async function finish(run: CountyIngestRun, busy: boolean): Promise<AdvanceResult> {
  return {
    run: presentRun(run),
    busy,
    placesPending: await placesPending(run.countyFips),
  };
}

async function saveRun(
  id: string,
  input: {
    status: string;
    phase: string;
    cursor: IngestCursor;
    summary: IngestSummary;
    clearLock: boolean;
    error?: string | null;
    finishedAt?: Date | null;
  },
): Promise<CountyIngestRun> {
  return prisma.countyIngestRun.update({
    where: { id },
    data: {
      status: input.status,
      phase: input.phase,
      cursor: asJson(input.cursor),
      summary: asJson(input.summary),
      error: input.error ?? null,
      ...(input.clearLock ? { lockedAt: null } : {}),
      ...(input.finishedAt !== undefined ? { finishedAt: input.finishedAt } : {}),
    },
  });
}

async function categoryIds(): Promise<Set<string>> {
  const rows = await prisma.referralCategory.findMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

function blankCategory(write: SourceWrite, ids: Set<string>) {
  if (write.categoryId && !ids.has(write.categoryId)) write.categoryId = null;
}

async function stepNppes(
  run: CountyIngestRun,
  summary: IngestSummary,
  cursor: IngestCursor,
  county: CountyMarket,
): Promise<CountyIngestRun> {
  if (cursor.zipIndex >= county.zips.length) {
    cursor.phase = 'places';
    return saveRun(run.id, { status: 'RUNNING', phase: 'places', cursor, summary, clearLock: true });
  }

  const zip = county.zips[cursor.zipIndex];
  const search = TAXONOMY_SEARCHES[cursor.searchIndex] ?? TAXONOMY_SEARCHES[0];
  const page = await fetchNppesPage({
    taxonomyDescription: search.search,
    postalCode: zip.zip,
    state: county.state,
    skip: cursor.skip,
    timeoutMs: 20_000,
  });

  summary.nppesQueries += 1;
  if (page.error) {
    summary.nppesErrors.push(`${zip.zip} ${search.search}: ${page.error}`.slice(0, 300));
    summary.nppesErrors = summary.nppesErrors.slice(-20);
  }

  const ids = await categoryIds();
  for (const hit of page.results) {
    const decision = classifyHit(hit, county);
    if (decision.action === 'drop') {
      if (decision.reason === 'not_allow_list') summary.droppedNotAllowList += 1;
      if (decision.reason === 'secondary_only') summary.excludedSecondaryOnly += 1;
      continue;
    }

    const kept = decision.provider;
    const existing = await prisma.referralSource.findFirst({
      where: { organizationId: DEFAULT_ORGANIZATION_ID, npiNumber: kept.npi },
    });
    const built = buildNppesUpsert(kept, county, DEFAULT_ORGANIZATION_ID, existing?.provenance ?? null);
    blankCategory(built.create, ids);
    blankCategory(built.update, ids);

    if (!existing) {
      await prisma.referralSource.create({
        data: asWrite(built.create) as Prisma.ReferralSourceUncheckedCreateInput,
      });
    } else {
      await prisma.referralSource.update({
        where: { id: existing.id },
        data: asWrite(built.update),
      });
    }

    if (!summary.seenNpis.includes(kept.npi)) {
      summary.seenNpis.push(kept.npi);
      summary.npisUpserted += 1;
      if (existing) summary.npisUpdated += 1;
      else summary.npisCreated += 1;
      if (kept.quarantined) summary.quarantined += 1;
    }
  }

  const fullPage = page.rawCount >= NPPES_PAGE_SIZE;
  if (fullPage && cursor.skip < NPPES_MAX_SKIP) {
    cursor.skip += NPPES_PAGE_SIZE;
  } else {
    if (fullPage && cursor.skip >= NPPES_MAX_SKIP) summary.truncatedQueries += 1;
    cursor.skip = 0;
    cursor.searchIndex += 1;
    if (cursor.searchIndex >= TAXONOMY_SEARCHES.length) {
      cursor.searchIndex = 0;
      cursor.zipIndex += 1;
    }
    if (cursor.zipIndex >= county.zips.length) cursor.phase = 'places';
  }

  return saveRun(run.id, {
    status: 'RUNNING',
    phase: cursor.phase,
    cursor,
    summary,
    clearLock: true,
  });
}

async function stepPlaces(
  run: CountyIngestRun,
  summary: IngestSummary,
  cursor: IngestCursor,
  started: number,
  budgetMs: number,
): Promise<CountyIngestRun> {
  const pending = await prisma.referralSource.findMany({
    where: {
      organizationId: DEFAULT_ORGANIZATION_ID,
      countyFips: run.countyFips,
      placesMatchStatus: 'pending',
    },
    orderBy: { id: 'asc' },
    take: 5,
  });

  if (pending.length === 0) {
    cursor.phase = 'duplicates';
    return saveRun(run.id, { status: 'RUNNING', phase: 'duplicates', cursor, summary, clearLock: true });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    throw new PlacesConfigError(
      'GOOGLE_PLACES_API_KEY is not set. NPPES rows are saved. Set the key and resume this run to match Places.',
    );
  }

  const client = googlePlacesClient(apiKey);
  let saved = run;
  for (const source of pending) {
    if (Date.now() - started > budgetMs) break;
    await sleep(200);
    let match = null;
    try {
      match = await matchPractice(
        {
          name: source.name,
          street: source.address ?? '',
          city: source.city ?? '',
          state: source.state ?? '',
          zip: source.zipCode ?? '',
          phone: source.contactPhone ?? '',
        },
        client,
      );
    } catch (error) {
      if (error instanceof PlacesConfigError || error instanceof PlacesQuotaError) throw error;
      match = null;
    }

    const write = buildPlacesWrite(match, source.provenance);
    await prisma.referralSource.update({
      where: { id: source.id },
      data: asWrite(write),
    });
    if (match) summary.placesMatched += 1;
    else summary.placesUnmatched += 1;
    saved = await saveRun(run.id, {
      status: 'RUNNING',
      phase: 'places',
      cursor,
      summary,
      clearLock: false,
    });
  }

  return saveRun(saved.id, {
    status: 'RUNNING',
    phase: 'places',
    cursor,
    summary,
    clearLock: true,
  });
}

async function stepDuplicates(
  run: CountyIngestRun,
  summary: IngestSummary,
  cursor: IngestCursor,
): Promise<CountyIngestRun> {
  await prisma.referralSource.updateMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: run.countyFips },
    data: { likelyDuplicate: false, duplicateClusterKey: null },
  });

  const rows = await prisma.referralSource.findMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: run.countyFips },
    select: { id: true, contactPhone: true, placeId: true, address: true, zipCode: true },
  });
  const assignments = assignDuplicateClusters(
    rows.map((row) => ({
      id: row.id,
      phone: row.contactPhone,
      placeId: row.placeId,
      address: row.address,
      zipCode: row.zipCode,
    })),
  );
  const flagged = assignments.filter((row) => row.likelyDuplicate);
  for (const row of flagged) {
    await prisma.referralSource.update({
      where: { id: row.id },
      data: { likelyDuplicate: true, duplicateClusterKey: row.duplicateClusterKey },
    });
  }

  summary.duplicatesFlagged = flagged.length;
  summary.duplicateClusters = new Set(flagged.map((row) => row.duplicateClusterKey)).size;
  cursor.phase = 'done';
  return saveRun(run.id, {
    status: 'COMPLETED',
    phase: 'done',
    cursor,
    summary,
    clearLock: true,
    error: null,
    finishedAt: new Date(),
  });
}

export async function createOrResumeRun(input: {
  countyId: string;
  mode: 'continue' | 'refresh';
  runId?: string;
}): Promise<CountyIngestRun> {
  const county = getCounty(input.countyId);
  const organization = await prisma.organization.findUnique({ where: { id: DEFAULT_ORGANIZATION_ID } });
  if (!organization) {
    throw new Error('Default organization is missing. Run prisma migrate deploy before pulling referral sources.');
  }

  if (input.mode === 'continue' && input.runId) {
    const run = await prisma.countyIngestRun.findFirst({
      where: { id: input.runId, organizationId: DEFAULT_ORGANIZATION_ID, countyId: county.id },
    });
    if (!run) throw new Error('Pull not found');
    return run;
  }

  if (input.mode === 'continue') {
    const latest = await prisma.countyIngestRun.findFirst({
      where: {
        organizationId: DEFAULT_ORGANIZATION_ID,
        countyId: county.id,
        status: { in: ['QUEUED', 'RUNNING', 'FAILED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (latest) return latest;
  }

  if (input.mode === 'refresh') {
    const staleBefore = new Date(Date.now() - LOCK_MS);
    const active = await prisma.countyIngestRun.findFirst({
      where: {
        organizationId: DEFAULT_ORGANIZATION_ID,
        countyId: county.id,
        status: 'RUNNING',
        lockedAt: { gt: staleBefore },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (active) return active;

    await prisma.countyIngestRun.updateMany({
      where: {
        organizationId: DEFAULT_ORGANIZATION_ID,
        countyId: county.id,
        status: { in: ['QUEUED', 'RUNNING', 'FAILED'] },
      },
      data: {
        status: 'FAILED',
        error: 'Replaced by a newer pull.',
        lockedAt: null,
        finishedAt: new Date(),
      },
    });
  }

  return prisma.countyIngestRun.create({
    data: {
      organizationId: DEFAULT_ORGANIZATION_ID,
      countyId: county.id,
      countyName: county.name,
      countyFips: county.fips,
      status: 'QUEUED',
      phase: 'nppes',
      cursor: asJson(emptyCursor()),
      summary: asJson(emptySummary(county.zips.length * TAXONOMY_SEARCHES.length)),
    },
  });
}

export async function advanceCountyIngest(runId: string, options?: { budgetMs?: number }): Promise<AdvanceResult> {
  const budgetMs = options?.budgetMs ?? DEFAULT_BUDGET_MS;
  const existing = await prisma.countyIngestRun.findFirst({
    where: { id: runId, organizationId: DEFAULT_ORGANIZATION_ID },
  });
  if (!existing) throw new Error('Pull not found');
  if (existing.status === 'COMPLETED') return finish(existing, false);

  const staleBefore = new Date(Date.now() - LOCK_MS);
  const claim = await prisma.countyIngestRun.updateMany({
    where: {
      id: runId,
      organizationId: DEFAULT_ORGANIZATION_ID,
      status: { in: ['QUEUED', 'RUNNING', 'FAILED'] },
      OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
    },
    data: { status: 'RUNNING', lockedAt: new Date(), error: null, finishedAt: null },
  });

  if (claim.count === 0) {
    const current = await prisma.countyIngestRun.findUnique({ where: { id: runId } });
    return finish(current ?? existing, true);
  }

  const started = Date.now();
  try {
    let run = await prisma.countyIngestRun.findUniqueOrThrow({ where: { id: runId } });
    const summary = parseSummary(run.summary);
    const cursor = parseCursor(run.cursor);
    const county = getCounty(run.countyId);

    if (cursor.phase === 'nppes') {
      run = await stepNppes(run, summary, cursor, county);
    } else if (cursor.phase === 'places') {
      run = await stepPlaces(run, summary, cursor, started, budgetMs);
    } else if (cursor.phase === 'duplicates') {
      run = await stepDuplicates(run, summary, cursor);
    } else {
      run = await saveRun(run.id, {
        status: 'COMPLETED',
        phase: 'done',
        cursor,
        summary,
        clearLock: true,
        finishedAt: run.finishedAt ?? new Date(),
      });
    }

    return finish(run, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Referral source pull failed';
    const failed = await prisma.countyIngestRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        error: message,
        lockedAt: null,
        finishedAt: new Date(),
      },
    });
    return finish(failed, false);
  }
}

export async function latestRun(countyId: string): Promise<CountyIngestRun | null> {
  const county = getCounty(countyId);
  return prisma.countyIngestRun.findFirst({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyId: county.id },
    orderBy: { createdAt: 'desc' },
  });
}
