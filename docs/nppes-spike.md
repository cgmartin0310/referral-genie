# NPPES spike — one county, pediatricians and primary care

ICP: outpatient OT/PT/ST referral sources are **pediatricians and primary care physicians only**. This spike counts those NPIs in one county and measures how many of the returned practice addresses are usable later for a Google Places match. It stops there.

- It does not call Google Places.
- It does not connect to Prisma and does not upsert `ReferralSource`.
- `out/` is gitignored. A 25-row `sample.csv` is written locally. Do not commit a bulk extract.

Default county: **Forsyth County, North Carolina** (FIPS `37067`, Winston-Salem). Override with `--county` once another county is added in `scripts/nppes-spike/src/counties.ts`.

## Sources

Official CMS sources, in the order you should use them:

| Source | URL | Role in this spike |
|--------|-----|--------------------|
| NPPES Read API 2.1 | https://npiregistry.cms.hhs.gov/api/?version=2.1 | Default live path. Documented at https://npiregistry.cms.hhs.gov/api-page |
| Monthly dissemination file, V.2 | https://download.cms.gov/nppes/NPI_Files.html | Complete recount when an API query hits the 1,200-row cap |
| File indexed on 2026-09-21 | https://download.cms.gov/nppes/NPPES_Data_Dissemination_September_2026_V2.zip | About 1,106 MB zipped. Too large to vendor into this repo |

The API returns at most 200 rows per request and allows `skip` up to 1,000, so one taxonomy + ZIP search returns at most 1,200 NPIs. The script sets `address_purpose=LOCATION` and `state`, then keeps a row only when its **primary** taxonomy code is on the allow-list below. The API's `taxonomy_description` match is loose: `General Practice` also returns dentists, and `Internal Medicine` returns hospitalists, cardiologists, and other subspecialists. A row whose only allow-listed code is a non-primary taxonomy is counted as excluded, not kept. Orthopaedics, neurology, physician assistants, and nurse practitioners are not searched and not kept.

The weekly incremental zip on the same download page is only a delta. It is not a county census. Do not point `--file` at it and treat the result as complete.

There is no county parameter. The script queries a documented ZIP list and then flags ZIPs that sit on the county line. PO Box ZIPs are not queried. The unique ZIP 27157 is queried because it is the Atrium Health Wake Forest Baptist campus, not a PO Box.

## How to run

From `scripts/nppes-spike` (own `package.json`; Node 20+; no dependency on the Next.js app):

```bash
cd scripts/nppes-spike
npm install
npm test
npm run spike:fixture
npm run spike:live
```

Equivalent CLI flags:

```bash
npx tsx src/cli.ts --fixture
npx tsx src/cli.ts --live --county forsyth-nc --delay-ms 250
npx tsx src/cli.ts --file /absolute/path/to/npidata_pfile.csv --county forsyth-nc
```

Environment overrides: `NPPES_COUNTY`, `NPPES_OUT_DIR`, `NPPES_DELAY_MS`.

Each run writes:

- `out/summary.json` — counts, taxonomy breakdown, address-quality metrics
- `out/summary.md` — the same report in markdown
- `out/sample.csv` — up to 25 kept rows (NPI, taxonomy, city/state/ZIP, flags). Not loaded into the app database

`--google`, `--places`, `--upsert`, `--write-db`, and `--prisma` exit with an error. If `DATABASE_URL` is set, the script prints that it will not use it.

### Monthly file (when the API truncates)

```bash
# From https://download.cms.gov/nppes/NPI_Files.html — V.2 monthly zip, ~1.1 GB.
# Unzip and pass the npidata_pfile_*.csv inside it (several GB uncompressed).
cd scripts/nppes-spike
npx tsx src/cli.ts --file /path/to/npidata_pfile_20050523-20260913.csv
```

The reader streams the CSV. It does not load the file into memory. Required columns are the practice-location address, phone, entity type, NPI, and `Healthcare Provider Taxonomy Code_1` / `Healthcare Provider Primary Taxonomy Switch_1` (codes `_2` through `_15` are read when present). A header mismatch fails with the missing column names.

Offline stand-in for that path: `fixtures/dissemination-sample.csv` (used by `npm test`).

## Taxonomy allow-list

Codes live in `scripts/nppes-spike/src/taxonomies.ts`. Every code below is a pediatrician or a primary care physician. Display names are the NUCC descriptions the NPPES API returns.

| Code | Display name | Group |
|------|--------------|-------|
| 207Q00000X | Family Medicine | pcp_family_medicine |
| 207QA0505X | Family Medicine, Adult Medicine | pcp_family_medicine |
| 207QG0300X | Family Medicine, Geriatric Medicine | pcp_family_medicine |
| 207R00000X | Internal Medicine | pcp_internal_medicine |
| 207RG0300X | Internal Medicine, Geriatric Medicine | pcp_internal_medicine |
| 208D00000X | General Practice | pcp_general_practice |
| 208000000X | Pediatrics | pediatrics |
| 2080A0000X | Pediatrics, Adolescent Medicine | pediatrics |
| 2080P0006X | Pediatrics, Developmental - Behavioral Pediatrics | pediatrics |

Not on the list: orthopaedics, neurology, physical medicine and rehabilitation, rheumatology, sports-medicine specializations, physician assistants, nurse practitioners, early-intervention agencies, schools, and the therapy professions themselves (PT/OT/SLP). Pediatric subspecialties other than adolescent medicine and developmental-behavioral pediatrics (for example pediatric emergency medicine) are not included.

API search strings (candidates only; the table above is the filter): Family Medicine, Internal Medicine, General Practice, Pediatrics.

## Forsyth County ZIP list

Queried as practice-location ZIP + `state=NC`. `boundary` ZIPs are not fully inside the county (Census 2020 ZCTA land share). A provider there may practice in Davie or Guilford.

| ZIP | Place | Role |
|-----|-------|------|
| 27009 | Belews Creek | core |
| 27010 | Bethania | core |
| 27023 | Lewisville | core |
| 27040 | Pfafftown | core |
| 27045 | Rural Hall | core |
| 27050 | Tobaccoville | core |
| 27051 | Walkertown | core |
| 27101 | Winston-Salem | core |
| 27103 | Winston-Salem | core |
| 27104 | Winston-Salem | core |
| 27105 | Winston-Salem | core |
| 27106 | Winston-Salem | core |
| 27109 | Winston-Salem | core |
| 27157 | Winston-Salem | core (unique ZIP for Atrium Health Wake Forest Baptist) |
| 27127 | Winston-Salem | boundary (~81% of ZCTA land area) |
| 27284 | Kernersville | boundary (~83%; rest Guilford) |
| 27012 | Clemmons | boundary (~62%; rest mostly Davie) |
| 27107 | Winston-Salem | boundary (~47% land area, large population) |

## Address metrics

On unique kept NPIs (primary taxonomy on the allow-list):

- Missing address: no practice-location address, or a blank street line. A mailing address is not treated as the practice.
- Missing phone: practice-location phone has fewer than 10 digits.
- Unparseable city/state/ZIP: city has no letters, state is not two letters, or ZIP is not 5 or 9 digits.
- Duplicate NPI: the same NPI returned by more than one ZIP or taxonomy query.
- Also reported: PO Box, ZIP outside the list above, boundary ZIP, deactivated NPI, and a **places-match ready** count (street, phone, parseable city/state/ZIP inside the county list, not a PO Box, not deactivated). Boundary ZIPs can still be places-match ready.

The Read API path cannot see providers who have no practice-location ZIP in the query list. A zero for "missing address" on an API run means the returned rows had a location, not that the full registry is clean. Use `--file` on the monthly CSV to measure blank addresses.

## Results note

Live Read API run on 2026-09-21 after narrowing the allow-list to pediatricians and primary care physicians. `npm test` still locks the fixture numbers; this table is the live pull only.

| Field | Value |
|-------|-------|
| Run date | 2026-09-21T20:16:35Z |
| Source | `api` — `https://npiregistry.cms.hhs.gov/api/?version=2.1` |
| County | Forsyth County, NC (FIPS 37067), 18 practice ZIPs including 27157 |
| ICP | Pediatricians and PCPs only (9 NUCC codes) |
| Raw hits | 1,866 |
| Unique NPIs before taxonomy filter | 1,672 |
| Duplicate NPIs (seen more than once) | 159 (194 extra hits) |
| Dropped (no allow-listed taxonomy) | 436 |
| Excluded (allow-listed code was not primary) | 461 |
| Unique NPIs kept (primary taxonomy on the allow-list) | 775 |
| NPI-1 / NPI-2 | 598 individuals / 177 organizations |
| Missing address | 0 |
| Missing phone | 0 |
| Unparseable city, state, or ZIP | 0 |
| PO Box | 0 |
| ZIP outside county list | 0 |
| Boundary ZIP | 136 (17.5%) |
| Deactivated | 0 |
| Matched on secondary taxonomy only | 0 kept; 461 excluded |
| Places-match ready | 775 (100% of kept) |
| Truncated API queries | 0 (busiest query was 2 pages; cap is 6) |

Primary taxonomy counts among the 775 kept NPIs:

| Count | Code | Display name |
|------:|------|--------------|
| 381 | 207Q00000X | Family Medicine |
| 337 | 207R00000X | Internal Medicine |
| 17 | 208D00000X | General Practice |
| 11 | 207RG0300X | Internal Medicine, Geriatric Medicine |
| 9 | 2080P0006X | Pediatrics, Developmental - Behavioral Pediatrics |
| 7 | 207QG0300X | Family Medicine, Geriatric Medicine |
| 6 | 207QA0505X | Family Medicine, Adult Medicine |
| 5 | 208000000X | Pediatrics |
| 2 | 2080A0000X | Pediatrics, Adolescent Medicine |

Groups: family medicine 394, internal medicine 348, general practice 17, pediatrics 16.

### What this means for ingest

Do not bulk-load these rows into `ReferralSource`. A Places match rate is still unknown, and this pull is not a census of dirty addresses.

- Every API query asked for `address_purpose=LOCATION` plus a ZIP, so providers with a blank practice address never showed up. Missing street, missing phone, bad ZIP, and PO Box are all zero **because of that filter**. The monthly V.2 CSV is the run that can measure that dirtiness.
- 461 NPIs had an allow-listed taxonomy only as a non-primary code (the Internal Medicine search returns hospitalists and cardiologists who also list general internal medicine). They are excluded.
- 436 candidates had no pediatrician or PCP code at all (dentists from the General Practice search, pediatric nurse practitioners from the Pediatrics search, and similar). They are dropped.
- 136 kept rows (17.5%) use a boundary ZIP (Clemmons, Kernersville, 27107, 27127). A later Places match will mix in Davie and Guilford unless those rows are flagged.
- No query hit the 1,200-row API cap. The count is still ZIP-based, not a county polygon.
- General pediatrics is a small slice of this pull (5 with primary `208000000X`, plus 9 developmental-behavioral and 2 adolescent medicine). Most of the 775 are family medicine and internal medicine physicians.

## Expected outputs

`summary.md` sections: counts, enumeration type, primary taxonomy, allow-list group, address quality with percents, notes stating that Google and Prisma were not used.

`sample.csv` header:

```text
npi,enumeration_type,name,primary_taxonomy_code,primary_taxonomy_desc,matched_group,city,state,zip5,has_phone,flags,address_1
```
