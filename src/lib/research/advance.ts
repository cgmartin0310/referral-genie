import { Prisma, type ResearchRun } from '@prisma/client';
import prisma from '../prisma';
import { DEFAULT_ORGANIZATION_ID } from '../org';
import { parseProvenance, researchProvenance } from '../provenance';
import { acceptProposals } from './accept';
import { researchCountyFips, seedIdsForMarket, sourceIdsMatchingFips } from './clinic-sources';
import { fetchPracticePages, practiceUrl } from './html';
import { createResearchJudge, ResearchConfigError } from './llm';
import { formPracticesForCounty } from '../ingest/advance';

const LOCK_MS = 90_000;

export interface ResearchSummary {
  total: number;
  researched: number;
  skippedNoUrl: number;
  fieldsFilled: number;
  /** Proposals dropped: not confident enough, or not verifiable on the page. */
  lowConfidence: number;
  notOnPage: number;
  /** Proposals for fields that already had a value. */
  alreadyFilled: number;
  /** Sites where the model proposed nothing at all. */
  nothingProposed: number;
  /** Sites where the model call itself failed (bad JSON, HTTP error). */
  modelErrors: number;
  errors: string[];
  /** One line per site, most recent last, capped. */
  notes: string[];
}

interface ResearchCursor {
  sourceIds: string[];
  index: number;
}

export interface ResearchRunView {
  id: string;
  scopeKey: string;
  status: string;
  error: string | null;
  summary: ResearchSummary;
  index: number;
  total: number;
}

export interface ResearchAdvanceResult {
  run: ResearchRunView;
  busy: boolean;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function emptySummary(total: number): ResearchSummary {
  return {
    total,
    researched: 0,
    skippedNoUrl: 0,
    fieldsFilled: 0,
    lowConfidence: 0,
    notOnPage: 0,
    alreadyFilled: 0,
    nothingProposed: 0,
    modelErrors: 0,
    errors: [],
    notes: [],
  };
}

function parseSummary(value: unknown): ResearchSummary {
  const row = value && typeof value === 'object' ? value as Partial<ResearchSummary> : {};
  return {
    total: numberOr(row.total),
    researched: numberOr(row.researched),
    skippedNoUrl: numberOr(row.skippedNoUrl),
    fieldsFilled: numberOr(row.fieldsFilled),
    lowConfidence: numberOr(row.lowConfidence),
    notOnPage: numberOr(row.notOnPage),
    alreadyFilled: numberOr(row.alreadyFilled),
    nothingProposed: numberOr(row.nothingProposed),
    modelErrors: numberOr(row.modelErrors),
    errors: Array.isArray(row.errors) ? row.errors.filter((item): item is string => typeof item === 'string').slice(0, 20) : [],
    notes: Array.isArray(row.notes) ? row.notes.filter((item): item is string => typeof item === 'string').slice(-40) : [],
  };
}

function parseCursor(value: unknown): ResearchCursor {
  const row = value && typeof value === 'object' ? value as Partial<ResearchCursor> : {};
  const sourceIds = Array.isArray(row.sourceIds)
    ? row.sourceIds.filter((item): item is string => typeof item === 'string')
    : [];
  return { sourceIds, index: numberOr(row.index) };
}

function numberOr(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function presentResearchRun(run: ResearchRun): ResearchRunView {
  const summary = parseSummary(run.summary);
  const cursor = parseCursor(run.cursor);
  return {
    id: run.id,
    scopeKey: run.scopeKey,
    status: run.status,
    error: run.error,
    summary,
    index: cursor.index,
    total: cursor.sourceIds.length || summary.total,
  };
}

/** Research every source pulled for one county, whichever clinics list it. */
export function countyScope(countyFips: string): string {
  return `county:${countyFips.trim()}`;
}

export function clinicScope(clinicId: string): string {
  return `clinic:${clinicId}`;
}

export function sourceScope(sourceId: string): string {
  return `source:${sourceId}`;
}

export async function latestResearchRun(scopeKey: string): Promise<ResearchRun | null> {
  return prisma.researchRun.findFirst({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, scopeKey },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createOrResumeResearchRun(input: {
  scopeKey: string;
  mode: 'continue' | 'refresh';
  runId?: string;
  sourceIds: string[];
}): Promise<ResearchRun> {
  const organization = await prisma.organization.findUnique({ where: { id: DEFAULT_ORGANIZATION_ID } });
  if (!organization) {
    throw new Error('Default organization is missing. Run prisma migrate deploy before researching referral sources.');
  }

  if (input.mode === 'continue' && input.runId) {
    const run = await prisma.researchRun.findFirst({
      where: { id: input.runId, organizationId: DEFAULT_ORGANIZATION_ID, scopeKey: input.scopeKey },
    });
    if (!run) throw new Error('Research run not found');
    return run;
  }

  if (input.mode === 'continue') {
    const latest = await prisma.researchRun.findFirst({
      where: {
        organizationId: DEFAULT_ORGANIZATION_ID,
        scopeKey: input.scopeKey,
        status: { in: ['QUEUED', 'RUNNING', 'FAILED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (latest) return latest;
  }

  if (input.mode === 'refresh') {
    const staleBefore = new Date(Date.now() - LOCK_MS);
    const active = await prisma.researchRun.findFirst({
      where: {
        organizationId: DEFAULT_ORGANIZATION_ID,
        scopeKey: input.scopeKey,
        status: 'RUNNING',
        lockedAt: { gt: staleBefore },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (active) return active;

    await prisma.researchRun.updateMany({
      where: {
        organizationId: DEFAULT_ORGANIZATION_ID,
        scopeKey: input.scopeKey,
        status: { in: ['QUEUED', 'RUNNING', 'FAILED'] },
      },
      data: {
        status: 'FAILED',
        error: 'Replaced by a newer research run.',
        lockedAt: null,
        finishedAt: new Date(),
      },
    });
  }

  return prisma.researchRun.create({
    data: {
      organizationId: DEFAULT_ORGANIZATION_ID,
      scopeKey: input.scopeKey,
      status: 'QUEUED',
      cursor: asJson({ sourceIds: input.sourceIds, index: 0 }),
      summary: asJson(emptySummary(input.sourceIds.length)),
    },
  });
}

export async function advanceResearchRun(runId: string): Promise<ResearchAdvanceResult> {
  const existing = await prisma.researchRun.findFirst({
    where: { id: runId, organizationId: DEFAULT_ORGANIZATION_ID },
  });
  if (!existing) throw new Error('Research run not found');
  if (existing.status === 'COMPLETED') {
    return { run: presentResearchRun(existing), busy: false };
  }

  const staleBefore = new Date(Date.now() - LOCK_MS);
  const claim = await prisma.researchRun.updateMany({
    where: {
      id: runId,
      organizationId: DEFAULT_ORGANIZATION_ID,
      status: { in: ['QUEUED', 'RUNNING', 'FAILED'] },
      OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
    },
    data: { status: 'RUNNING', lockedAt: new Date(), error: null, finishedAt: null },
  });
  if (claim.count === 0) {
    const current = await prisma.researchRun.findUnique({ where: { id: runId } });
    return { run: presentResearchRun(current ?? existing), busy: true };
  }

  try {
    const run = await stepResearch(await prisma.researchRun.findUniqueOrThrow({ where: { id: runId } }));
    return { run: presentResearchRun(run), busy: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research failed';
    const failed = await prisma.researchRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        error: message,
        lockedAt: null,
        finishedAt: new Date(),
      },
    });
    return { run: presentResearchRun(failed), busy: false };
  }
}

async function stepResearch(run: ResearchRun): Promise<ResearchRun> {
  const summary = parseSummary(run.summary);
  const cursor = parseCursor(run.cursor);
  if (cursor.index >= cursor.sourceIds.length) {
    return finishRun(run.id, summary, cursor);
  }

  const sourceId = cursor.sourceIds[cursor.index];
  const source = await prisma.referralSource.findFirst({
    where: { id: sourceId, organizationId: DEFAULT_ORGANIZATION_ID },
  });
  if (!source) {
    pushError(summary, `Missing referral source ${sourceId}`);
    cursor.index += 1;
    return saveProgress(run.id, summary, cursor);
  }

  const url = practiceUrl(source.website);
  if (!url) {
    summary.skippedNoUrl += 1;
    cursor.index += 1;
    return cursor.index >= cursor.sourceIds.length
      ? finishRun(run.id, summary, cursor)
      : saveProgress(run.id, summary, cursor);
  }

  let judge;
  try {
    judge = createResearchJudge();
  } catch (error) {
    if (error instanceof ResearchConfigError) throw error;
    throw error;
  }

  const bundle = await fetchPracticePages(url);
  if (bundle.pages.length === 0) {
    pushError(summary, `${source.name}: ${bundle.error || 'No page text'}`);
    cursor.index += 1;
    return cursor.index >= cursor.sourceIds.length
      ? finishRun(run.id, summary, cursor)
      : saveProgress(run.id, summary, cursor);
  }

  let proposals;
  try {
    proposals = await judge.extract({
      practiceName: source.name,
      city: source.city,
      state: source.state,
      pages: bundle.pages,
      links: bundle.links,
    });
  } catch (error) {
    if (error instanceof ResearchConfigError) throw error;
    summary.modelErrors += 1;
    summary.researched += 1;
    pushError(summary, `${source.name}: ${error instanceof Error ? error.message : 'model call failed'}`);
    pushNote(summary, `${source.name}: model error`);
    cursor.index += 1;
    return cursor.index >= cursor.sourceIds.length
      ? finishRun(run.id, summary, cursor)
      : saveProgress(run.id, summary, cursor);
  }
  const provenance = parseProvenance(source.provenance);
  const decision = acceptProposals({
    current: {
      website: source.website,
      contactPhone: source.contactPhone,
      faxNumber: source.faxNumber,
      numberOfProviders: source.numberOfProviders,
      contactEmail: source.contactEmail,
      referralFormUrl: source.referralFormUrl,
      preferredChannel: source.preferredChannel,
    },
    overriddenFields: provenance.overriddenFields,
    pageText: bundle.text,
    links: bundle.links,
    fetchedUrls: bundle.pages.map((page) => page.url),
    proposals,
  });
  summary.lowConfidence += decision.rejections.filter((row) => row.reason === 'low_confidence').length;
  summary.notOnPage += decision.rejections.filter((row) => row.reason === 'not_on_page').length;
  summary.alreadyFilled += decision.skippedFilled;
  if (proposals.length === 0) summary.nothingProposed += 1;
  summary.researched += 1;
  summary.fieldsFilled += decision.accepted.length;
  pushNote(
    summary,
    `${source.name} (${bundle.pages.length} page${bundle.pages.length === 1 ? '' : 's'}): ` +
      (proposals.length === 0
        ? 'nothing proposed'
        : [
            decision.accepted.length ? `filled ${decision.accepted.map((row) => row.field).join(', ')}` : null,
            decision.skippedFilled ? `${decision.skippedFilled} already filled` : null,
            decision.rejections.length
              ? `dropped ${decision.rejections.map((row) => `${row.field} (${row.reason === 'not_on_page' ? 'not on page' : 'low confidence'})`).join(', ')}`
              : null,
          ].filter(Boolean).join(' · ')),
  );

  if (decision.accepted.length > 0) {
    const updates = decision.updates;
    await prisma.referralSource.update({
      where: { id: source.id },
      data: {
        ...(typeof updates.website === 'string' ? { website: updates.website } : {}),
        ...(typeof updates.contactPhone === 'string' ? { contactPhone: updates.contactPhone } : {}),
        ...(typeof updates.faxNumber === 'string' ? { faxNumber: updates.faxNumber } : {}),
        ...(typeof updates.contactEmail === 'string' ? { contactEmail: updates.contactEmail } : {}),
        ...(typeof updates.referralFormUrl === 'string' ? { referralFormUrl: updates.referralFormUrl } : {}),
        ...(typeof updates.preferredChannel === 'string' ? { preferredChannel: updates.preferredChannel } : {}),
        ...(typeof updates.numberOfProviders === 'number' ? { numberOfProviders: updates.numberOfProviders } : {}),
        provenance: asJson(researchProvenance(source.provenance, decision.accepted)),
      },
    });
  }

  cursor.index += 1;
  return cursor.index >= cursor.sourceIds.length
    ? finishRun(run.id, summary, cursor)
    : saveProgress(run.id, summary, cursor);
}

function pushNote(summary: ResearchSummary, message: string) {
  summary.notes.push(message.slice(0, 200));
  if (summary.notes.length > 40) summary.notes = summary.notes.slice(-40);
}

function pushError(summary: ResearchSummary, message: string) {
  if (summary.errors.length < 20) summary.errors.push(message);
}

async function saveProgress(id: string, summary: ResearchSummary, cursor: ResearchCursor): Promise<ResearchRun> {
  return prisma.researchRun.update({
    where: { id },
    data: {
      status: 'RUNNING',
      cursor: asJson(cursor),
      summary: asJson(summary),
      error: null,
      lockedAt: null,
    },
  });
}

async function finishRun(id: string, summary: ResearchSummary, cursor: ResearchCursor): Promise<ResearchRun> {
  const run = await prisma.researchRun.findUnique({ where: { id }, select: { scopeKey: true } });
  const fips = run?.scopeKey.startsWith('county:') ? run.scopeKey.slice('county:'.length) : null;
  if (fips) {
    // What research wrote onto the records (a fax, a website) reaches the
    // practice rows now rather than at the next pull.
    const pull = await prisma.countyIngestRun.findFirst({
      where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: fips },
      orderBy: { createdAt: 'desc' },
      select: { countyName: true },
    });
    await formPracticesForCounty(fips, pull?.countyName ?? '');
  }
  return prisma.researchRun.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      cursor: asJson(cursor),
      summary: asJson(summary),
      error: null,
      lockedAt: null,
      finishedAt: new Date(),
    },
  });
}

/**
 * What research reads: one website per practice that has no fax. NPI gives
 * most practices their fax, and a site rarely states anything else a
 * referral needs, so reading the rest only repeats what is known. Each
 * practice is read through one of its records that has a website (an
 * organization's first); a practice with no website is left for a person.
 */
export async function practicesNeedingFax(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const [sources, practices] = await Promise.all([
    prisma.referralSource.findMany({
      where: { id: { in: ids } },
      select: { id: true, npiNumber: true, website: true, enumerationType: true },
      orderBy: { id: 'asc' },
    }),
    prisma.practice.findMany({
      where: { organizationId: DEFAULT_ORGANIZATION_ID, faxNumber: null, hiddenAt: null, retiredAt: null },
      select: { id: true, orgNpis: true, providers: { where: { hiddenAt: null }, select: { npiNumber: true } } },
    }),
  ]);
  const practiceByNpi = new Map<string, string>();
  for (const practice of practices) {
    for (const npi of practice.orgNpis) practiceByNpi.set(npi, practice.id);
    for (const provider of practice.providers) practiceByNpi.set(provider.npiNumber, practice.id);
  }
  const reader = new Map<string, { id: string; org: boolean }>();
  for (const source of sources) {
    const practiceId = source.npiNumber ? practiceByNpi.get(source.npiNumber) : undefined;
    if (!practiceId || !practiceUrl(source.website)) continue;
    const org = (source.enumerationType ?? '').toUpperCase() === 'NPI-2';
    const current = reader.get(practiceId);
    if (!current || (org && !current.org)) reader.set(practiceId, { id: source.id, org });
  }
  return [...reader.values()].map((row) => row.id).sort();
}

export async function sourceIdsForCounty(countyFips: string): Promise<string[]> {
  const fips = researchCountyFips([countyFips]);
  if (fips.length === 0) return [];
  const sources = await prisma.referralSource.findMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: { not: null } },
    select: { id: true, countyFips: true },
    orderBy: { id: 'asc' },
  });
  return practicesNeedingFax(sourceIdsMatchingFips(sources, fips));
}

export async function sourceIdsForClinic(clinicId: string): Promise<string[]> {
  const clinic = await prisma.clinicLocation.findFirst({
    where: { id: clinicId, organizationId: DEFAULT_ORGANIZATION_ID },
    include: { marketCounties: true },
  });
  if (!clinic) throw new Error('Clinic not found');
  const marketFips = clinic.marketCounties.map((county) => county.countyFips);
  const fips = await fipsWrittenForMarket(marketFips);
  if (fips.length === 0) return [];
  // Compare normalized FIPS in memory. A market row, an ingest run, and a
  // source can store "37107", "37-107", or the seed id for the same county.
  const sources = await prisma.referralSource.findMany({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, countyFips: { not: null } },
    select: { id: true, countyFips: true },
    orderBy: { id: 'asc' },
  });
  return practicesNeedingFax(sourceIdsMatchingFips(sources, fips));
}

/** Market FIPS plus the FIPS the pull actually stored for those seed counties. */
async function fipsWrittenForMarket(marketFips: string[]): Promise<string[]> {
  const seedIds = seedIdsForMarket(marketFips);
  const runs = seedIds.length === 0
    ? []
    : await prisma.countyIngestRun.findMany({
        where: { organizationId: DEFAULT_ORGANIZATION_ID, countyId: { in: seedIds } },
        select: { countyFips: true },
      });
  return researchCountyFips([...marketFips, ...runs.map((run) => run.countyFips)]);
}

export async function assertSource(sourceId: string): Promise<void> {
  const source = await prisma.referralSource.findFirst({
    where: { id: sourceId, organizationId: DEFAULT_ORGANIZATION_ID },
    select: { id: true },
  });
  if (!source) throw new Error('Referral source not found');
}
