#!/usr/bin/env node
/**
 * Build src/data/zcta-county.json from the Census 2020 ZCTA-to-county
 * relationship file. NPPES has no county parameter, so a county is pulled by
 * the practice-location ZIPs that lie mostly inside it.
 *
 *   node scripts/build-zcta-county.mjs            # downloads the Census file
 *   node scripts/build-zcta-county.mjs local.txt  # uses a downloaded copy
 *
 * Keeps ZCTAs whose land area is at least 15% inside the county. On Lenoir
 * County, NC that reproduces the hand-checked list: the eight ZIPs kept and
 * the two (28526, 28580) that mostly belong to neighbors dropped.
 */
import { readFile, writeFile } from 'node:fs/promises';

const SOURCE = 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt';
const MIN_SHARE = 0.15;
const OUT = new URL('../src/data/zcta-county.json', import.meta.url);

const text = process.argv[2]
  ? await readFile(process.argv[2], 'utf8')
  : await (await fetch(SOURCE)).text();

const lines = text.replace(/^﻿/, '').split('\n');
const header = lines[0].trim().split('|');
const col = (name) => header.indexOf(name);
const [zctaCol, fipsCol, landCol, partCol] = ['GEOID_ZCTA5_20', 'GEOID_COUNTY_20', 'AREALAND_ZCTA5_20', 'AREALAND_PART'].map(col);

const byCounty = new Map();
for (const line of lines.slice(1)) {
  const cells = line.split('|');
  const zcta = cells[zctaCol];
  const fips = cells[fipsCol];
  const land = Number(cells[landCol] || 0);
  const part = Number(cells[partCol] || 0);
  if (!zcta || !fips || land <= 0) continue;
  const share = part / land;
  if (share < MIN_SHARE) continue;
  if (!byCounty.has(fips)) byCounty.set(fips, []);
  byCounty.get(fips).push([zcta, Math.round(share * 1000) / 1000]);
}

const out = {};
for (const fips of [...byCounty.keys()].sort()) {
  out[fips] = byCounty.get(fips).sort((a, b) => b[1] - a[1]);
}
await writeFile(OUT, JSON.stringify(out));
console.log(`wrote ${Object.keys(out).length} counties to ${OUT.pathname}`);
