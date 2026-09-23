import { Prisma, type CountyIngestRun } from '@prisma/client';
import prisma from '../prisma';
import { DEFAULT_ORGANIZATION_ID } from '../org';
import { getCounty, type CountyMarket } from '../nppes/counties';
import { classifyHit } from '../nppes/normalize';
import type { RawHit } from '../nppes/types';
import { fetchNppesPage } from '../nppes/api';
import { advanceScanCursor, searchDescriptionAt } from './scan';
import { hitFromNpiRecord, withRecordZips, keptTaxonomyFilter, FILE_SLICE } from './npi-file';
import {
  googlePlacesClient,
  matchPractice,
  PlacesConfigError,
  PlacesQuotaError,
  type DiscoveryClient,
  type PlaceClient,
  type PlaceMatch,
} from '../places/match';
import { looksLikePersonListing, specialtyHints } from '../places/score';
import { discoveryPlan, discoveryTowns, isPersonalListing, keepDiscovered, parseFormattedAddress, searchText } from '../places/discover';
import { countyForZip } from '../npi/county-map';
import { attachSources, type AttachPlace } from './attach';
import { buildPractices, type PlaceRow, type PracticeSourceRow } from '../practices/build';
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
): Promise<void> {
  const decision = classifyHit(hit, county);
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
  const records = await prisma.npiRecord.findMany({
    where: { countyFips: county.fips, ...keptTaxonomyFilter() },
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
    await keepHit(hitFromNpiRecord(record), scoped, summary, ids);
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
  for (const hit of page.results) {
    await keepHit(hit, county, summary, ids);
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

function placesClient(): PlaceClient & DiscoveryClient {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    throw new PlacesConfigError('GOOGLE_PLACES_API_KEY is not set. Set the key and resume this pull.');
  }
  return googlePlacesClient(apiKey);
}

/** Practice cities on the county's NPI records, so every town with a practice is searched. */
async function npiCitiesFor(county: CountyMarket): Promise<string[]> {
  const onFile = await prisma.npiRecord.groupBy({
    by: ['city'],
    where: { countyFips: county.fips, ...keptTaxonomyFilter() },
  });
  const cities = onFile.map((row) => row.city).filter((city): city is string => Boolean(city));
  if (cities.length > 0) return cities;
  const sources = await prisma.referralSource.groupBy({
    by: ['city'],
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: county.fips },
  });
  return sources.map((row) => row.city).filter((city): city is string => Boolean(city));
}

/**
 * Discovery: search Google town by town for the kinds of practice that
 * refer, and keep each listing the crosswalk places in this county. One
 * search page per loop; the cursor holds the page token so a slice can end
 * mid-search.
 */
async function stepDiscover(
  run: CountyIngestRun,
  summary: IngestSummary,
  cursor: IngestCursor,
  county: CountyMarket,
  started: number,
  budgetMs: number,
): Promise<CountyIngestRun> {
  const plan = discoveryPlan(discoveryTowns(county, await npiCitiesFor(county)));
  summary.discoverQueryTotal = plan.length;
  if (cursor.discoverIndex >= plan.length) {
    cursor.phase = 'details';
    return saveRun(run.id, { status: 'RUNNING', phase: 'details', cursor, summary, clearLock: true });
  }

  const client = placesClient();
  while (cursor.discoverIndex < plan.length && Date.now() - started < budgetMs) {
    const search = plan[cursor.discoverIndex];
    const page = await client.textSearch(searchText(search, county.state), cursor.pageToken);
    const tag = `${search.town}/${search.query}`;
    for (const result of page.results) {
      const { keep, parsed } = keepDiscovered(result, county.fips);
      if (!keep) continue;
      const existing = await prisma.discoveredPlace.findUnique({
        where: { organizationId_placeId: { organizationId: DEFAULT_ORGANIZATION_ID, placeId: result.placeId } },
        select: { id: true, queries: true },
      });
      if (existing) {
        if (!existing.queries.includes(tag)) {
          await prisma.discoveredPlace.update({ where: { id: existing.id }, data: { queries: [...existing.queries, tag] } });
        }
        continue;
      }
      const personal = isPersonalListing(result.name);
      await prisma.discoveredPlace.create({
        data: {
          organizationId: DEFAULT_ORGANIZATION_ID,
          countyFips: county.fips,
          placeId: result.placeId,
          name: result.name,
          formattedAddress: result.formattedAddress,
          address: parsed.address,
          city: parsed.city,
          state: parsed.state,
          zipCode: parsed.zip,
          rating: result.rating,
          reviewCount: result.reviewCount,
          businessStatus: result.businessStatus ?? null,
          latitude: result.lat ?? null,
          longitude: result.lng ?? null,
          types: result.types,
          queries: [tag],
          personal,
          origin: 'search',
        },
      });
      summary.placesFound += 1;
      if (personal) summary.placesPersonal += 1;
    }
    if (page.nextPageToken && cursor.pageCount < 2) {
      cursor.pageToken = page.nextPageToken;
      cursor.pageCount += 1;
    } else {
      cursor.pageToken = null;
      cursor.pageCount = 0;
      cursor.discoverIndex += 1;
      summary.discoverQueries += 1;
    }
    await saveRun(run.id, { status: 'RUNNING', phase: 'discover', cursor, summary, clearLock: false });
  }

  if (cursor.discoverIndex >= plan.length) cursor.phase = 'details';
  return saveRun(run.id, { status: 'RUNNING', phase: cursor.phase, cursor, summary, clearLock: true });
}

/** Phone, website, rating, and the exact address for each listing found. */
async function stepDetails(
  run: CountyIngestRun,
  summary: IngestSummary,
  cursor: IngestCursor,
  county: CountyMarket,
  started: number,
  budgetMs: number,
): Promise<CountyIngestRun> {
  const pending = await prisma.discoveredPlace.findMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: county.fips, detailsAt: null },
    orderBy: { id: 'asc' },
    take: 10,
  });
  if (pending.length === 0) {
    cursor.phase = 'nppes';
    return saveRun(run.id, { status: 'RUNNING', phase: 'nppes', cursor, summary, clearLock: true });
  }

  const client = placesClient();
  for (const place of pending) {
    if (Date.now() - started > budgetMs) break;
    const details = await client.placeDetails(place.placeId);
    const name = details?.name || place.name;
    const formattedAddress = details?.formattedAddress || place.formattedAddress;
    const parsed = parseFormattedAddress(formattedAddress);
    await prisma.discoveredPlace.update({
      where: { id: place.id },
      data: {
        detailsAt: new Date(),
        name,
        formattedAddress,
        address: parsed.address ?? place.address,
        city: parsed.city ?? place.city,
        state: parsed.state ?? place.state,
        zipCode: parsed.zip ?? place.zipCode,
        phone: details?.phone ?? place.phone,
        website: details?.website ?? place.website,
        rating: details?.rating ?? place.rating,
        reviewCount: details?.reviewCount ?? place.reviewCount,
        businessStatus: details?.businessStatus ?? place.businessStatus,
        latitude: details?.latitude ?? place.latitude,
        longitude: details?.longitude ?? place.longitude,
        personal: isPersonalListing(name),
      },
    });
  }
  return saveRun(run.id, { status: 'RUNNING', phase: 'details', cursor, summary, clearLock: true });
}

type PlaceRecord = Awaited<ReturnType<typeof prisma.discoveredPlace.findMany>>[number];

function toAttachPlace(place: PlaceRecord): AttachPlace {
  return {
    placeId: place.placeId,
    name: place.name,
    address: place.address,
    city: place.city,
    zipCode: place.zipCode,
    phone: place.phone,
    reviewCount: place.reviewCount,
    website: place.website,
    personal: place.personal,
  };
}

function matchFromPlace(place: PlaceRecord): PlaceMatch {
  return {
    placeId: place.placeId,
    name: place.name,
    formattedAddress: place.formattedAddress,
    confidence: 1,
    phone: place.phone,
    website: place.website,
    rating: place.rating,
    reviewCount: place.reviewCount,
    businessStatus: place.businessStatus,
    latitude: place.latitude,
    longitude: place.longitude,
    matchedBy: 'address',
  };
}

/**
 * Nest the county's NPI records under the listings found: by phone, then by
 * street. A record no listing claims is marked pending so the lookup step
 * searches Google for it by its own phone and address.
 */
async function attachToPlaces(
  countyFips: string,
  summary: IngestSummary,
  options: { markUnattached: boolean },
): Promise<void> {
  const places = await prisma.discoveredPlace.findMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips },
  });
  const sources = await prisma.referralSource.findMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips },
    select: { id: true, name: true, address: true, city: true, zipCode: true, contactPhone: true, placeId: true, provenance: true },
  });
  const attached = attachSources(
    sources.map((source) => ({
      id: source.id,
      name: source.name,
      address: source.address,
      city: source.city,
      zipCode: source.zipCode,
      phone: source.contactPhone,
    })),
    places.map(toAttachPlace),
  );
  const placeById = new Map(places.map((place) => [place.placeId, place]));

  let attachedCount = 0;
  let unattached = 0;
  for (const source of sources) {
    const placeId = attached.get(source.id);
    const place = placeId ? placeById.get(placeId) : undefined;
    if (place) {
      await prisma.referralSource.update({
        where: { id: source.id },
        data: asWrite(buildPlacesWrite(matchFromPlace(place), source.provenance)),
      });
      attachedCount += 1;
      continue;
    }
    unattached += 1;
    if (options.markUnattached) {
      // A link from an older pull to a listing this pull did not find is stale.
      await prisma.referralSource.update({
        where: { id: source.id },
        data: { placeId: null, placeName: null, placesMatchStatus: 'pending' },
      });
    }
  }
  summary.providersAttached = attachedCount;
  summary.providersUnattached = unattached;
}

/**
 * Lookup: for each NPI record no listing claimed, search Google by its
 * phone, then its address. A listing in this county joins the found set, so
 * a practice the county search missed still becomes a row.
 */
async function stepLookup(
  run: CountyIngestRun,
  summary: IngestSummary,
  cursor: IngestCursor,
  county: CountyMarket,
  started: number,
  budgetMs: number,
): Promise<CountyIngestRun> {
  const pending = await prisma.referralSource.findMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: run.countyFips, placesMatchStatus: 'pending' },
    orderBy: { id: 'asc' },
    take: 5,
  });
  if (pending.length === 0) {
    cursor.phase = 'practices';
    return saveRun(run.id, { status: 'RUNNING', phase: 'practices', cursor, summary, clearLock: true });
  }

  const client = placesClient();
  let saved = run;
  for (const source of pending) {
    if (Date.now() - started > budgetMs) break;
    await sleep(200);
    let match: PlaceMatch | null = null;
    try {
      match = await matchPractice(
        {
          name: source.name,
          street: source.address ?? '',
          city: source.city ?? '',
          state: source.state ?? '',
          zip: source.zipCode ?? '',
          phone: source.contactPhone ?? '',
          isPerson: (source.enumerationType ?? '').toUpperCase() !== 'NPI-2',
          specialty: specialtyHints(source.sourceType),
        },
        client,
      );
    } catch (error) {
      if (error instanceof PlacesConfigError || error instanceof PlacesQuotaError) throw error;
      match = null;
    }

    const parsed = match?.formattedAddress ? parseFormattedAddress(match.formattedAddress) : null;
    const inCounty = parsed?.zip ? countyForZip(parsed.zip)?.fips === county.fips : false;
    if (match && parsed && inCounty) {
      const personal = looksLikePersonListing(match.name ?? '', [source.name]);
      const existing = await prisma.discoveredPlace.findUnique({
        where: { organizationId_placeId: { organizationId: DEFAULT_ORGANIZATION_ID, placeId: match.placeId } },
        select: { id: true },
      });
      const shape = {
        name: match.name || source.name,
        formattedAddress: match.formattedAddress ?? '',
        address: parsed.address,
        city: parsed.city,
        state: parsed.state,
        zipCode: parsed.zip,
        phone: match.phone,
        website: match.website,
        rating: match.rating,
        reviewCount: match.reviewCount,
        businessStatus: match.businessStatus,
        latitude: match.latitude,
        longitude: match.longitude,
        personal,
        detailsAt: new Date(),
      };
      if (existing) {
        await prisma.discoveredPlace.update({ where: { id: existing.id }, data: shape });
      } else {
        await prisma.discoveredPlace.create({
          data: {
            organizationId: DEFAULT_ORGANIZATION_ID,
            countyFips: county.fips,
            placeId: match.placeId,
            origin: 'provider',
            queries: [`npi/${source.npiNumber ?? source.id}`],
            ...shape,
          },
        });
        summary.placesFromLookup += 1;
      }
      await prisma.referralSource.update({
        where: { id: source.id },
        data: asWrite(buildPlacesWrite(match, source.provenance)),
      });
      summary.placesMatched += 1;
    } else {
      await prisma.referralSource.update({
        where: { id: source.id },
        data: asWrite(buildPlacesWrite(null, source.provenance)),
      });
      summary.placesUnmatched += 1;
    }
    saved = await saveRun(run.id, { status: 'RUNNING', phase: 'lookup', cursor, summary, clearLock: false });
  }

  return saveRun(saved.id, { status: 'RUNNING', phase: 'lookup', cursor, summary, clearLock: true });
}

/**
 * Form practices: the listings found, with the county's NPI records nested
 * under them, then whatever NPI records Google lists nowhere. Runs right
 * after the NPI pull so the catalog shows practices at once, and again after
 * the lookup step. Upserts, so running twice is safe.
 */
async function formPractices(run: CountyIngestRun, summary: IngestSummary): Promise<void> {
  const found = await prisma.discoveredPlace.findMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: run.countyFips },
    orderBy: { id: 'asc' },
  });
  const places: PlaceRow[] = found.map((place) => ({
    placeId: place.placeId,
    name: place.name,
    address: place.address,
    city: place.city,
    state: place.state,
    zipCode: place.zipCode,
    countyName: run.countyName,
    countyFips: run.countyFips,
    phone: place.phone,
    website: place.website,
    rating: place.rating,
    reviewCount: place.reviewCount,
    personal: place.personal,
    types: place.types,
  }));
  const sources = await prisma.referralSource.findMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: run.countyFips },
    select: {
      id: true, npiNumber: true, name: true, enumerationType: true,
      primaryTaxonomyCode: true, taxonomyCodes: true, sourceType: true,
      address: true, city: true, state: true, zipCode: true,
      countyName: true, countyFips: true, contactPhone: true,
      faxNumber: true, placeId: true, placeName: true, website: true, rating: true, reviewCount: true,
    },
  });

  const practices = buildPractices(sources as PracticeSourceRow[], places);
  let providersLinked = 0;

  for (const built of practices) {
    const shape = {
      placeId: built.placeId,
      placeName: built.placeName,
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
    const practice = await prisma.practice.upsert({
      where: {
        organizationId_practiceKey: {
          organizationId: DEFAULT_ORGANIZATION_ID,
          practiceKey: built.practiceKey,
        },
      },
      create: {
        organizationId: DEFAULT_ORGANIZATION_ID,
        practiceKey: built.practiceKey,
        ...shape,
      },
      update: { ...shape, retiredAt: null },
      select: { id: true },
    });

    for (const provider of built.providers) {
      if (!provider.npiNumber) continue;
      const fields = {
        name: provider.name,
        primaryTaxonomyCode: provider.primaryTaxonomyCode,
        taxonomyCodes: provider.taxonomyCodes,
        sourceType: provider.sourceType,
        countyFips: built.countyFips,
        faxNumber: provider.faxNumber,
        practiceId: practice.id,
      };
      await prisma.provider.upsert({
        where: {
          organizationId_npiNumber: {
            organizationId: DEFAULT_ORGANIZATION_ID,
            npiNumber: provider.npiNumber,
          },
        },
        // useOwnFax is a person's setting and is never written by the pull.
        create: { organizationId: DEFAULT_ORGANIZATION_ID, npiNumber: provider.npiNumber, ...fields },
        update: fields,
        select: { id: true },
      });
      providersLinked += 1;
    }
  }

  summary.practicesFormed = practices.length;
  summary.providersLinked = providersLinked;

  // A row this pass did not produce is stale: re-keyed by place id, or a
  // grouping that no longer exists. Drop it when nothing refers to it; when a
  // clinic list or campaign still does, keep the row but stop it claiming
  // providers that now sit elsewhere.
  const keys = practices.map((built) => built.practiceKey);
  await prisma.practice.deleteMany({
    where: {
      organizationId: DEFAULT_ORGANIZATION_ID,
      countyFips: run.countyFips,
      practiceKey: { notIn: keys },
      clinicPractices: { none: {} },
      campaignTargets: { none: {} },
    },
  });
  await prisma.practice.updateMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: run.countyFips, practiceKey: { notIn: keys } },
    data: { providerCount: 0, taxonomyMix: {}, retiredAt: new Date() },
  });
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
  await attachToPlaces(run.countyFips, summary, { markUnattached: true });
  await formPractices(run, summary);
  cursor.phase = 'lookup';
  return saveRun(run.id, { status: 'RUNNING', phase: 'lookup', cursor, summary, clearLock: true });
}

/** After the lookup: nest under any listing it added, re-form, and finish. */
async function stepPractices(
  run: CountyIngestRun,
  summary: IngestSummary,
  cursor: IngestCursor,
): Promise<CountyIngestRun> {
  await attachToPlaces(run.countyFips, summary, { markUnattached: false });
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
  const onFile = await prisma.npiRecord.count({ where: { countyFips: county.fips, ...keptTaxonomyFilter() } });
  return prisma.countyIngestRun.create({
    data: {
      organizationId: DEFAULT_ORGANIZATION_ID,
      countyId: county.id,
      countyName: county.name,
      countyFips: county.fips,
      status: 'QUEUED',
      phase: 'discover',
      cursor: asJson({ ...emptyCursor(), source: onFile > 0 ? 'file' : 'api' }),
      summary: asJson(emptySummary(onFile > 0 ? Math.ceil(onFile / FILE_SLICE) : county.zips.length)),
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

    if (cursor.phase === 'discover') {
      run = await stepDiscover(run, summary, cursor, county, started, budgetMs);
    } else if (cursor.phase === 'details') {
      run = await stepDetails(run, summary, cursor, county, started, budgetMs);
    } else if (cursor.phase === 'nppes') {
      run = cursor.source === 'file'
        ? await stepNppesFile(run, summary, cursor, county)
        : await stepNppes(run, summary, cursor, county);
    } else if (cursor.phase === 'group') {
      run = await stepGroup(run, summary, cursor);
    } else if (cursor.phase === 'lookup' || cursor.phase === 'places' || cursor.phase === 'duplicates') {
      run = await stepLookup(run, summary, cursor, county, started, budgetMs);
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
