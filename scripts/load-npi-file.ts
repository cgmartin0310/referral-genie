/**
 * Load the NPI dissemination file into NpiRecord.
 *
 *   npm run npi:load                      # downloads this month's file from CMS
 *   npm run npi:load -- --file /path.zip  # or a downloaded .zip / .csv
 *   npm run npi:load -- --limit 200000    # stop early (for a smoke test)
 *   npm run npi:load -- --states NC,SC,VA  # only practice locations in these states
 *
 * Streams the ~10 GB CSV without holding it in memory. Keeps rows whose primary
 * taxonomy is a referral-source type and that are not deactivated, maps each
 * practice ZIP to a county (ZCTA crosswalk, then city+state for PO Box ZIPs),
 * and upserts in batches. Rows absent from the new file are removed at the end.
 * Needs `unzip` on the PATH when given a .zip.
 */
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Prisma, PrismaClient } from '@prisma/client';

// A quiet client: the shared one echoes every query in development, and each
// batch here is a 1,000-row INSERT.
const prisma = new PrismaClient({ log: ['error', 'warn'] });
import { parseCsvLine, headerIndex } from '../src/lib/npi/csv';
import { CityCountyMap, countyForZip, zip5 } from '../src/lib/npi/county-map';
import { acquisitionCodes, catalogCodes } from '../src/lib/nppes/taxonomies';

const FILES_PAGE = 'https://download.cms.gov/nppes/NPI_Files.html';
const BATCH = 1000;
const TAXONOMY_SLOTS = 15;

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function latestFileUrl(): Promise<{ url: string; name: string }> {
  const html = await (await fetch(FILES_PAGE)).text();
  const match = html.match(/NPPES_Data_Dissemination_[A-Za-z]+_\d{4}_V2\.zip/);
  if (!match) throw new Error('Could not find the monthly file on ' + FILES_PAGE);
  return { url: `https://download.cms.gov/nppes/${match[0]}`, name: match[0] };
}

async function download(url: string, name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'npi-'));
  const path = join(dir, name);
  console.log(`downloading ${url} → ${path}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`download failed: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(path));
  return path;
}

function openCsv(path: string): NodeJS.ReadableStream {
  if (path.endsWith('.csv')) return createReadStream(path);
  // The zip also holds npidata_pfile_..._fileheader.csv; its one header line would be read as a row.
  const child = spawn('unzip', ['-p', path, 'npidata_pfile_*.csv', '-x', '*FileHeader*', '*fileheader*'], { stdio: ['ignore', 'pipe', 'inherit'] });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`unzip exited with code ${code}`);
  });
  return child.stdout;
}

interface Row {
  npi: string;
  entityType: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  credential: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  postalCode: string | null;
  phone: string | null;
  fax: string | null;
  primaryTaxonomyCode: string;
  taxonomyCodes: string[];
  countyFips: string | null;
  countyMatch: string | null;
  lastUpdated: string | null;
}

const text = (value: string | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
};

async function upsertBatch(rows: Row[], loadedAt: Date, loadId: string): Promise<void> {
  if (rows.length === 0) return;
  const values = rows.map(
    (r) => Prisma.sql`(${r.npi}, ${r.entityType}, ${r.name}, ${r.firstName}, ${r.lastName}, ${r.credential}, ${r.address1}, ${r.address2}, ${r.city}, ${r.state}, ${r.zip}, ${r.postalCode}, ${r.phone}, ${r.fax}, ${r.primaryTaxonomyCode}, ${r.taxonomyCodes}::text[], ${r.countyFips}, ${r.countyMatch}, ${r.lastUpdated}, ${loadedAt.toISOString()}::timestamp, ${loadId})`,
  );
  await prisma.$executeRaw`
    INSERT INTO "NpiRecord" ("npi","entityType","name","firstName","lastName","credential","address1","address2","city","state","zip","postalCode","phone","fax","primaryTaxonomyCode","taxonomyCodes","countyFips","countyMatch","lastUpdated","loadedAt","loadId")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("npi") DO UPDATE SET
      "entityType" = EXCLUDED."entityType", "name" = EXCLUDED."name", "firstName" = EXCLUDED."firstName",
      "lastName" = EXCLUDED."lastName", "credential" = EXCLUDED."credential", "address1" = EXCLUDED."address1",
      "address2" = EXCLUDED."address2", "city" = EXCLUDED."city", "state" = EXCLUDED."state", "zip" = EXCLUDED."zip",
      "postalCode" = EXCLUDED."postalCode", "phone" = EXCLUDED."phone", "fax" = EXCLUDED."fax",
      "primaryTaxonomyCode" = EXCLUDED."primaryTaxonomyCode", "taxonomyCodes" = EXCLUDED."taxonomyCodes",
      "countyFips" = EXCLUDED."countyFips", "countyMatch" = EXCLUDED."countyMatch",
      "lastUpdated" = EXCLUDED."lastUpdated", "loadedAt" = EXCLUDED."loadedAt", "loadId" = EXCLUDED."loadId"`;
}

async function main() {
  const limit = Number(arg('--limit') ?? 0) || Infinity;
  const states = new Set((arg('--states') ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
  let path = arg('--file');
  let fileName = path ? path.split('/').pop() ?? path : '';
  if (!path) {
    const latest = await latestFileUrl();
    fileName = latest.name;
    path = await download(latest.url, latest.name);
  }

  const load = await prisma.npiLoad.create({ data: { fileName } });
  const loadedAt = load.startedAt;
  const loadId = load.id;
  // Every specialty the catalog could pull (so turning one on needs no code change), and the
  // therapy practices Paragon recruits as subscribers.
  const allowed = new Set([...catalogCodes(), ...acquisitionCodes()]);
  const cities = new CityCountyMap();
  let header: ((name: string) => number) | null = null;
  let cols: Record<string, number> = {};
  let rowsRead = 0;
  let rowsKept = 0;
  let mappedByZcta = 0;
  let batch: Row[] = [];
  const started = Date.now();

  console.log(`loading ${fileName} (load ${load.id})`);
  const lines = createInterface({ input: openCsv(path), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    const fields = parseCsvLine(line);
    if (!header) {
      header = headerIndex(fields);
      cols = {
        npi: header('NPI'),
        entity: header('Entity Type Code'),
        org: header('Provider Organization Name (Legal Business Name)'),
        last: header('Provider Last Name (Legal Name)'),
        first: header('Provider First Name'),
        cred: header('Provider Credential Text'),
        a1: header('Provider First Line Business Practice Location Address'),
        a2: header('Provider Second Line Business Practice Location Address'),
        city: header('Provider Business Practice Location Address City Name'),
        state: header('Provider Business Practice Location Address State Name'),
        postal: header('Provider Business Practice Location Address Postal Code'),
        phone: header('Provider Business Practice Location Address Telephone Number'),
        fax: header('Provider Business Practice Location Address Fax Number'),
        updated: header('Last Update Date'),
        deactivated: header('NPI Deactivation Date'),
      };
      for (let i = 1; i <= TAXONOMY_SLOTS; i += 1) {
        cols[`tax${i}`] = header(`Healthcare Provider Taxonomy Code_${i}`);
        cols[`primary${i}`] = header(`Healthcare Provider Primary Taxonomy Switch_${i}`);
      }
      continue;
    }

    rowsRead += 1;
    if (rowsRead > limit) break;
    if (rowsRead % 500000 === 0) {
      console.log(`  read ${rowsRead.toLocaleString()} · kept ${rowsKept.toLocaleString()} · ${Math.round((Date.now() - started) / 1000)}s`);
    }

    const entityType = fields[cols.entity];
    if (entityType !== '1' && entityType !== '2') continue;
    if (text(fields[cols.deactivated])) continue;

    const taxonomyCodes: string[] = [];
    let primary: string | null = null;
    for (let i = 1; i <= TAXONOMY_SLOTS; i += 1) {
      const code = text(fields[cols[`tax${i}`]]);
      if (!code) continue;
      taxonomyCodes.push(code);
      if (fields[cols[`primary${i}`]] === 'Y' && !primary) primary = code;
    }
    if (!primary) primary = taxonomyCodes[0] ?? null;
    if (!primary || !allowed.has(primary)) continue;

    const state = text(fields[cols.state]);
    if (states.size > 0 && (!state || !states.has(state.toUpperCase()))) continue;
    const city = text(fields[cols.city]);
    const postalCode = text(fields[cols.postal]);
    const zip = zip5(postalCode);
    const placed = zip ? countyForZip(zip) : null;
    if (placed) {
      mappedByZcta += 1;
      cities.learn(state, city, placed.fips);
    }

    const org = text(fields[cols.org]);
    const first = text(fields[cols.first]);
    const last = text(fields[cols.last]);
    batch.push({
      npi: fields[cols.npi],
      entityType,
      name: entityType === '2' ? org ?? `NPI ${fields[cols.npi]}` : [first, last].filter(Boolean).join(' ') || `NPI ${fields[cols.npi]}`,
      firstName: first,
      lastName: last,
      credential: text(fields[cols.cred]),
      address1: text(fields[cols.a1]),
      address2: text(fields[cols.a2]),
      city,
      state,
      zip,
      postalCode,
      phone: text(fields[cols.phone]),
      fax: text(fields[cols.fax]),
      primaryTaxonomyCode: primary,
      taxonomyCodes,
      countyFips: placed?.fips ?? null,
      countyMatch: placed?.match ?? null,
      lastUpdated: text(fields[cols.updated]),
    });
    rowsKept += 1;
    if (batch.length >= BATCH) {
      await upsertBatch(batch, loadedAt, loadId);
      batch = [];
    }
  }
  await upsertBatch(batch, loadedAt, loadId);
  console.log(`read ${rowsRead.toLocaleString()} rows · kept ${rowsKept.toLocaleString()} · ${mappedByZcta.toLocaleString()} mapped by ZIP · ${cities.size().toLocaleString()} towns learned`);

  // PO Box ZIPs: map through the town, using where that town's street ZIPs landed.
  const unresolved = await prisma.npiRecord.findMany({
    where: { loadId, countyFips: null },
    select: { state: true, city: true },
    distinct: ['state', 'city'],
  });
  let mappedByCity = 0;
  for (const group of unresolved) {
    const fips = cities.resolve(group.state, group.city);
    if (!fips) continue;
    const result = await prisma.npiRecord.updateMany({
      where: { loadId, countyFips: null, state: group.state, city: group.city },
      data: { countyFips: fips, countyMatch: 'city' },
    });
    mappedByCity += result.count;
  }
  console.log(`${mappedByCity.toLocaleString()} more mapped by town · ${unresolved.length.toLocaleString()} town groups checked`);

  // Rows that vanished from the file (within the states loaded, when filtered).
  const written = await prisma.npiRecord.count({ where: { loadId } });
  if (written === 0 && rowsKept > 0) throw new Error(`load kept ${rowsKept} rows but none carry loadId=${loadId}`);
  const removed = await prisma.npiRecord.deleteMany({
    where: { OR: [{ loadId: { not: loadId } }, { loadId: null }], ...(states.size > 0 ? { state: { in: [...states] } } : {}) },
  });
  console.log(`removed ${removed.count.toLocaleString()} records no longer in the file`);

  await prisma.npiLoad.update({
    where: { id: load.id },
    data: { status: 'COMPLETED', finishedAt: new Date(), rowsRead, rowsKept, countyMapped: mappedByZcta + mappedByCity },
  });
  console.log(`done in ${Math.round((Date.now() - started) / 1000)}s`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
