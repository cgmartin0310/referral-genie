import { Prisma, type CountyIngestRun } from '@prisma/client';
import prisma from '../prisma';
import { DEFAULT_ORGANIZATION_ID } from '../org';
import { getCounty, type CountyMarket } from '../nppes/counties';
import { classifyHit } from '../nppes/normalize';
import type { RawHit } from '../nppes/types';
import { fetchNppesPage } from '../nppes/api';
import { advanceScanCursor, searchDescriptionAt } from './scan';
import { hitFromNpiRecord, withRecordZips, keptTaxonomyFilter, FILE_SLICE } from './npi-file';
import { pulledCodes } from '../catalog-settings';
import {
  findCandidates,
  googlePlacesClient,
  PlacesConfigError,
  PlacesQuotaError,
  type PlaceClient,
} from '../places/match';
import { specialtyHints } from '../places/score';
import { isPersonalListing, listingInCounty, parseFormattedAddress } from '../places/listing';
import { buildPractices, npiGroups, type PlaceRow, type PracticeSourceRow } from '../practices/build';
import { normalizeNpiNumber } from '../npi';
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
  source: 'file' | 'api';
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
    source: parseCursor(run.cursor).source,
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

/** Classify one NPPES record for the county and upsert it as a referral source. */
async function keepHit(
  hit: RawHit,
  county: CountyMarket,
  summary: IngestSummary,
  ids: Set<string>,
  allowed: Set<string>,
): Promise<void> {
  const decision = classifyHit(hit, county, allowed);
  if (decision.action === 'drop') {
    if (decision.reason === 'not_allow_list') summary.droppedNotAllowList += 1;
    if (decision.reason === 'secondary_only') summary.excludedSecondaryOnly += 1;
    return;
  }

  const kept = decision.provider;
  const npiNumber = normalizeNpiNumber(kept.npi);
  if (!npiNumber) return;
  const existing = await prisma.referralSource.findFirst({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, npiNumber },
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

/**
 * NPI stage from the loaded NPI file: every record whose practice ZIP maps to
 * this county, one slice per call. Complete and immediate; no API, no cap.
 */
async function stepNppesFile(
  run: CountyIngestRun,
  summary: IngestSummary,
  cursor: IngestCursor,
  county: CountyMarket,
): Promise<CountyIngestRun> {
  const allowed = await pulledCodes();
  const records = await prisma.npiRecord.findMany({
    where: { countyFips: county.fips, ...keptTaxonomyFilter(allowed) },
    orderBy: { npi: 'asc' },
    skip: cursor.skip,
    take: FILE_SLICE,
  });
  if (records.length === 0) {
    cursor.phase = 'group';
    return saveRun(run.id, { status: 'RUNNING', phase: 'group', cursor, summary, clearLock: true });
  }

  summary.nppesQueries += 1;
  const ids = await categoryIds();
  const scoped = withRecordZips(county, records);
  for (const record of records) {
    await keepHit(hitFromNpiRecord(record), scoped, summary, ids, allowed);
  }

  cursor.skip += FILE_SLICE;
  if (records.length < FILE_SLICE) cursor.phase = 'group';
  return saveRun(run.id, { status: 'RUNNING', phase: cursor.phase, cursor, summary, clearLock: true });
}

async function stepNppes(
  run: CountyIngestRun,
  summary: IngestSummary,
  cursor: IngestCursor,
  county: CountyMarket,
): Promise<CountyIngestRun> {
  if (cursor.zipIndex >= county.zips.length) {
    cursor.phase = 'group';
    return saveRun(run.id, { status: 'RUNNING', phase: 'group', cursor, summary, clearLock: true });
  }

  const zip = county.zips[cursor.zipIndex];
  const description = searchDescriptionAt(cursor.searchIndex);
  const page = await fetchNppesPage({
    taxonomyDescription: description,
    postalCode: zip.zip,
    state: county.state,
    skip: cursor.skip,
    timeoutMs: 20_000,
  });

  summary.nppesQueries += 1;
  if (page.error) {
    summary.nppesErrors.push(`${zip.zip} ${description ?? 'scan'}: ${page.error}`.slice(0, 300));
    summary.nppesErrors = summary.nppesErrors.slice(-20);
  }

  const ids = await categoryIds();
  const allowed = await pulledCodes();
  for (const hit of page.results) {
    await keepHit(hit, county, summary, ids, allowed);
  }

  const moved = advanceScanCursor(cursor, county.zips.length, { rawCount: page.rawCount });
  summary.nppesQueryTotal += moved.addedQueries;
  if (moved.truncated) summary.truncatedQueries += 1;

  return saveRun(run.id, {
    status: 'RUNNING',
    phase: cursor.phase,
    cursor,
    summary,
    clearLock: true,
  });
}

function placesClient(): PlaceClient {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    throw new PlacesConfigError('GOOGLE_PLACES_API_KEY is not set. Set the key and resume this pull.');
  }
  return googlePlacesClient(apiKey);
}

const SOURCE_FIELDS = {
  id: true, npiNumber: true, name: true, enumerationType: true,
  primaryTaxonomyCode: true, taxonomyCodes: true, sourceType: true,
  address: true, city: true, state: true, zipCode: true,
  countyName: true, countyFips: true, contactPhone: true,
  faxNumber: true, mailingFax: true, placeId: true, placeName: true, website: true, rating: true, reviewCount: true,
  placesMatchStatus: true,
} as const;

/** The county's NPI records, minus providers a person removed from the list. */
async function countySources(countyFips: string) {
  const hidden = await prisma.provider.findMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips, hiddenAt: { not: null } },
    select: { npiNumber: true },
  });
  const hiddenNpis = new Set(hidden.map((row) => row.npiNumber));
  const rows = await prisma.referralSource.findMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips },
    select: SOURCE_FIELDS,
    orderBy: { id: 'asc' },
  });
  return rows.filter((row) => !row.npiNumber || !hiddenNpis.has(row.npiNumber));
}

/** Groups looked up per call; each is one to three Places searches plus details. */
const LOOKUP_GROUPS = 4;

/**
 * Name each NPI group on Google: search by its phone, then its address, then
 * (for one person) their name in their town, and keep every listing in the
 * county that plausibly is this practice. Formation picks among them.
 */
async function stepLookup(
  run: CountyIngestRun,
  summary: IngestSummary,
  cursor: IngestCursor,
  started: number,
  budgetMs: number,
): Promise<CountyIngestRun> {
  const rows = await countySources(run.countyFips);
  const pending = npiGroups(rows as PracticeSourceRow[])
    .filter((group) => group.members.some((row) => (row as { placesMatchStatus?: string | null }).placesMatchStatus === 'pending'))
    .slice(0, LOOKUP_GROUPS);
  if (pending.length === 0) {
    cursor.phase = 'practices';
    return saveRun(run.id, { status: 'RUNNING', phase: 'practices', cursor, summary, clearLock: true });
  }

  const client = placesClient();
  for (const group of pending) {
    if (Date.now() - started > budgetMs) break;
    const members = group.members;
    const org = members.find((row) => (row.enumerationType ?? '').toUpperCase() === 'NPI-2');
    const people = members.filter((row) => row !== org);
    const lead = org ?? people[0];
    const phone = members.map((row) => row.contactPhone).find(Boolean) ?? '';
    let candidates: Awaited<ReturnType<typeof findCandidates>> = [];
    try {
      candidates = await findCandidates(
        {
          name: lead.name,
          street: lead.address ?? '',
          city: lead.city ?? '',
          state: lead.state ?? '',
          zip: lead.zipCode ?? '',
          phone,
          isPerson: !org && people.length === 1,
          specialty: specialtyHints(people[0]?.sourceType ?? null),
        },
        client,
      );
    } catch (error) {
      if (error instanceof PlacesConfigError || error instanceof PlacesQuotaError) throw error;
      candidates = [];
    }

    let kept = 0;
    for (const candidate of candidates) {
      if (!listingInCounty(candidate.formattedAddress, run.countyFips)) continue;
      const parsed = parseFormattedAddress(candidate.formattedAddress);
      const details = candidate.details;
      const shape = {
        countyFips: run.countyFips,
        name: candidate.name,
        formattedAddress: candidate.formattedAddress,
        address: parsed.address,
        city: parsed.city,
        state: parsed.state,
        zipCode: parsed.zip,
        phone: details?.phone ?? null,
        website: details?.website ?? null,
        rating: details?.rating ?? null,
        reviewCount: details?.reviewCount ?? null,
        businessStatus: details?.businessStatus ?? null,
        latitude: details?.latitude ?? null,
        longitude: details?.longitude ?? null,
        personal: isPersonalListing(candidate.name),
        detailsAt: new Date(),
      };
      const existing = await prisma.discoveredPlace.findUnique({
        where: { organizationId_placeId: { organizationId: DEFAULT_ORGANIZATION_ID, placeId: candidate.placeId } },
        select: { id: true },
      });
      if (existing) {
        await prisma.discoveredPlace.update({ where: { id: existing.id }, data: shape });
      } else {
        await prisma.discoveredPlace.create({
          data: {
            organizationId: DEFAULT_ORGANIZATION_ID,
            placeId: candidate.placeId,
            origin: 'provider',
            queries: [`${candidate.matchedBy}/${lead.npiNumber ?? lead.id}`],
            ...shape,
          },
        });
        summary.placesFound += 1;
        if (shape.personal) summary.placesPersonal += 1;
      }
      kept += 1;
    }

    if (kept > 0) summary.placesMatched += 1;
    else summary.placesUnmatched += 1;
    await prisma.referralSource.updateMany({
      where: { id: { in: members.map((row) => row.id) } },
      data: { placesMatchStatus: kept > 0 ? 'matched' : 'unmatched' },
    });
    await saveRun(run.id, { status: 'RUNNING', phase: 'lookup', cursor, summary, clearLock: false });
  }

  return saveRun(run.id, { status: 'RUNNING', phase: 'lookup', cursor, summary, clearLock: true });
}

/**
 * Form practices from the county's NPI records (see practices/build) with
 * the Google listings the lookup found, and write them. Upserts, so running
 * twice is safe. Fields a person edited, and rows a person deleted, stay as
 * they left them.
 */
export async function formPracticesForCounty(countyFips: string, countyName: string): Promise<{ practicesFormed: number; providersLinked: number }> {
  const found = await prisma.discoveredPlace.findMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips },
    orderBy: { id: 'asc' },
  });
  const places: PlaceRow[] = found.map((place) => ({
    placeId: place.placeId,
    name: place.name,
    address: place.address,
    city: place.city,
    state: place.state,
    zipCode: place.zipCode,
    countyName,
    countyFips,
    phone: place.phone,
    website: place.website,
    rating: place.rating,
    reviewCount: place.reviewCount,
    personal: place.personal,
  }));
  const sources = await countySources(countyFips);
  const practices = buildPractices(sources as PracticeSourceRow[], places);
  const placeById = new Map(found.map((place) => [place.placeId, place]));
  let providersLinked = 0;

  for (const built of practices) {
    const listing = built.placeId ? placeById.get(built.placeId) : undefined;
    const shape: Record<string, unknown> = {
      placeId: built.placeId,
      placeName: built.placeName,
      latitude: listing?.latitude ?? null,
      longitude: listing?.longitude ?? null,
      formedBy: built.formedBy,
      name: built.name,
      nameAmbiguous: built.nameAmbiguous,
      address: built.address,
      city: built.city,
      state: built.state,
      zipCode: built.zipCode,
      countyName: built.countyName,
      countyFips: built.countyFips,
      phone: built.phone,
      faxNumber: built.faxNumber,
      website: built.website,
      rating: built.rating,
      reviewCount: built.reviewCount,
      orgNpis: built.orgNpis,
      providerCount: built.providerCount,
      taxonomyMix: asJson(built.taxonomyMix),
    };
    const existing = await prisma.practice.findUnique({
      where: { organizationId_practiceKey: { organizationId: DEFAULT_ORGANIZATION_ID, practiceKey: built.practiceKey } },
      select: { id: true, editedFields: true },
    });
    let practiceId: string;
    if (existing) {
      const update: Record<string, unknown> = { ...shape, retiredAt: null };
      for (const field of existing.editedFields) delete update[field];
      await prisma.practice.update({ where: { id: existing.id }, data: update as Prisma.PracticeUncheckedUpdateInput });
      practiceId = existing.id;
    } else {
      const created = await prisma.practice.create({
        data: {
          organizationId: DEFAULT_ORGANIZATION_ID,
          practiceKey: built.practiceKey,
          ...shape,
        } as Prisma.PracticeUncheckedCreateInput,
        select: { id: true },
      });
      practiceId = created.id;
    }

    for (const provider of built.providers) {
      if (!provider.npiNumber) continue;
      const fields = {
        name: provider.name,
        primaryTaxonomyCode: provider.primaryTaxonomyCode,
        taxonomyCodes: provider.taxonomyCodes,
        sourceType: provider.sourceType,
        countyFips: built.countyFips,
        faxNumber: provider.faxNumber,
        practiceId,
      };
      await prisma.provider.upsert({
        where: {
          organizationId_npiNumber: {
            organizationId: DEFAULT_ORGANIZATION_ID,
            npiNumber: provider.npiNumber,
          },
        },
        // useOwnFax and hiddenAt are a person's settings and are never written by the pull.
        create: { organizationId: DEFAULT_ORGANIZATION_ID, npiNumber: provider.npiNumber, ...fields },
        update: fields,
        select: { id: true },
      });
      providersLinked += 1;
    }

    // Each record carries its practice's listing, so research reads the site
    // Google lists. NPI's own phone and address are left as NPI wrote them.
    const place = built.placeId ? placeById.get(built.placeId) : undefined;
    await prisma.referralSource.updateMany({
      where: { id: { in: built.memberIds } },
      data: place
        ? { placeId: place.placeId, placeName: place.name, rating: place.rating, reviewCount: place.reviewCount }
        : { placeId: null, placeName: null },
    });
    if (place?.website) {
      await prisma.referralSource.updateMany({
        where: { id: { in: built.memberIds }, website: null },
        data: { website: place.website },
      });
    }
  }

  // A row this pass did not produce is stale. Drop it when nothing refers to
  // it; when a clinic list or campaign still does, retire it: hidden from the
  // catalog, kept for the lists that use it.
  const keys = practices.map((built) => built.practiceKey);
  await prisma.practice.deleteMany({
    where: {
      organizationId: DEFAULT_ORGANIZATION_ID,
      countyFips,
      practiceKey: { notIn: keys },
      clinicPractices: { none: {} },
      campaignTargets: { none: {} },
    },
  });
  await prisma.practice.updateMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips, practiceKey: { notIn: keys }, retiredAt: null },
    data: { providerCount: 0, taxonomyMix: {}, retiredAt: new Date() },
  });
  return { practicesFormed: practices.length, providersLinked };
}

async function formPractices(run: CountyIngestRun, summary: IngestSummary): Promise<void> {
  const result = await formPracticesForCounty(run.countyFips, run.countyName);
  summary.practicesFormed = result.practicesFormed;
  summary.providersLinked = result.providersLinked;
}
/**
 * Sources for this county that the pull did not see are gone from NPI (or
 * moved counties). Remove them unless a person has logged activity or a
 * campaign against them, or added them by hand. Otherwise every pull leaves
 * ghosts behind and the counts never agree.
 */
async function retireUnseen(run: CountyIngestRun, summary: IngestSummary): Promise<number> {
  const seen = new Set(summary.seenNpis.map((npi) => normalizeNpiNumber(npi)).filter((npi): npi is string => Boolean(npi)));
  const candidates = await prisma.referralSource.findMany({
    where: {
      organizationId: DEFAULT_ORGANIZATION_ID,
      countyFips: run.countyFips,
      npiNumber: { not: null },
      interactions: { none: {} },
      campaigns: { none: {} },
    },
    select: { id: true, npiNumber: true, provenance: true },
  });
  const stale = candidates.filter((row) => {
    if (!row.npiNumber || seen.has(row.npiNumber)) return false;
    const origin = (row.provenance as { origin?: string } | null)?.origin;
    return origin !== 'user';
  });
  if (stale.length === 0) return 0;
  await prisma.provider.deleteMany({ where: { organizationId: DEFAULT_ORGANIZATION_ID, npiNumber: { in: stale.map((row) => row.npiNumber as string) } } });
  const result = await prisma.referralSource.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  return result.count;
}

/** After the NPI pull: retire what it did not see, nest records under listings, form practices, then look up the rest. */
async function stepGroup(
  run: CountyIngestRun,
  summary: IngestSummary,
  cursor: IngestCursor,
): Promise<CountyIngestRun> {
  summary.retired = await retireUnseen(run, summary);
  await formPractices(run, summary);
  cursor.phase = 'lookup';
  return saveRun(run.id, { status: 'RUNNING', phase: 'lookup', cursor, summary, clearLock: true });
}

/** After the lookup: form with the listings found, and finish. */
async function stepPractices(
  run: CountyIngestRun,
  summary: IngestSummary,
  cursor: IngestCursor,
): Promise<CountyIngestRun> {
  await formPractices(run, summary);
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

  // A fresh pull searches Google again; listings from the last pull go.
  await prisma.discoveredPlace.deleteMany({ where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: county.fips } });

  // Read from the loaded NPI file when it covers this county; otherwise scan NPPES by ZIP.
  const onFile = await prisma.npiRecord.count({ where: { countyFips: county.fips, ...keptTaxonomyFilter(await pulledCodes()) } });
  // For the change report: the practices this county had before the pull.
  const practicesBefore = await prisma.practice.count({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: county.fips, retiredAt: null, hiddenAt: null },
  });
  return prisma.countyIngestRun.create({
    data: {
      organizationId: DEFAULT_ORGANIZATION_ID,
      countyId: county.id,
      countyName: county.name,
      countyFips: county.fips,
      status: 'QUEUED',
      phase: 'nppes',
      cursor: asJson({ ...emptyCursor(), source: onFile > 0 ? 'file' : 'api' }),
      summary: asJson({ ...emptySummary(onFile > 0 ? Math.ceil(onFile / FILE_SLICE) : county.zips.length), practicesBefore }),
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

    if (cursor.phase === 'discover' || cursor.phase === 'details') {
      // A pull started under the Google-first order: begin again from NPI.
      cursor.phase = 'nppes';
      run = await saveRun(run.id, { status: 'RUNNING', phase: 'nppes', cursor, summary, clearLock: true });
    } else if (cursor.phase === 'nppes') {
      run = cursor.source === 'file'
        ? await stepNppesFile(run, summary, cursor, county)
        : await stepNppes(run, summary, cursor, county);
    } else if (cursor.phase === 'group') {
      run = await stepGroup(run, summary, cursor);
    } else if (cursor.phase === 'lookup' || cursor.phase === 'places' || cursor.phase === 'duplicates') {
      run = await stepLookup(run, summary, cursor, started, budgetMs);
    } else if (cursor.phase === 'practices') {
      run = await stepPractices(run, summary, cursor);
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
