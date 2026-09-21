# NPPES spike — one county, therapy taxonomies

Measure how many referring providers NPPES has in one outpatient-therapy market, and how many of those practice addresses are usable later for a Google Places match. This spike stops there.

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

The API returns at most 200 rows per request and allows `skip` up to 1,000, so one taxonomy + ZIP search returns at most 1,200 NPIs. The script sets `address_purpose=LOCATION` and `state`, then filters to the taxonomy allow-list locally. The API's `taxonomy_description` match is loose: `General Practice` also returns dentists, and `Internal Medicine` returns hospitalists and subspecialists. Those rows are dropped unless their taxonomy code is on the allow-list.

The weekly incremental zip on the same download page is only a delta. It is not a county census. Do not point `--file` at it and treat the result as complete.

There is no county parameter. The script queries a documented ZIP list and then flags ZIPs that sit on the county line. PO Box and unique ZIPs are not queried.

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

Codes live in `scripts/nppes-spike/src/taxonomies.ts`. They are referring clinicians and two org types that send patients to outpatient PT/OT/ST. Physical therapist, occupational therapist, and speech-language pathologist codes are omitted on purpose.

| Code | Description | Group |
|------|-------------|-------|
| 207Q00000X | Family Medicine | pcp_family_medicine |
| 207QA0505X | Family Medicine, Adult Medicine | pcp_family_medicine |
| 207QG0300X | Family Medicine, Geriatric Medicine | pcp_family_medicine |
| 207QS0010X | Family Medicine, Sports Medicine | pcp_family_medicine |
| 207R00000X | Internal Medicine | pcp_internal_medicine |
| 207RG0300X | Internal Medicine, Geriatric Medicine | pcp_internal_medicine |
| 207RS0010X | Internal Medicine, Sports Medicine | pcp_internal_medicine |
| 208D00000X | General Practice | pcp_general_practice |
| 208000000X | Pediatrics | pediatrics |
| 2080A0000X | Pediatrics, Adolescent Medicine | pediatrics |
| 2080P0006X | Pediatrics, Developmental - Behavioral Pediatrics | pediatrics |
| 207X00000X | Orthopaedic Surgery | orthopaedics |
| 207XP3100X | Orthopaedic Surgery, Pediatric Orthopaedic Surgery | orthopaedics |
| 207XS0117X | Orthopaedic Surgery, Orthopaedic Surgery of the Spine | orthopaedics |
| 207XX0005X | Orthopaedic Surgery, Sports Medicine | orthopaedics |
| 207XX0801X | Orthopaedic Surgery, Orthopaedic Trauma | orthopaedics |
| 2084N0400X | Psychiatry & Neurology, Neurology | neurology |
| 2084N0402X | Psychiatry & Neurology, Neurology with Special Qualifications in Child Neurology | neurology |
| 2084P0005X | Psychiatry & Neurology, Neurodevelopmental Disabilities | neurology |
| 208100000X | Physical Medicine & Rehabilitation | pmr |
| 2081P0010X | Physical Medicine & Rehabilitation, Pediatric Rehabilitation Medicine | pmr |
| 2081P2900X | Physical Medicine & Rehabilitation, Pain Medicine | pmr |
| 2081S0010X | Physical Medicine & Rehabilitation, Sports Medicine | pmr |
| 207RR0500X | Internal Medicine, Rheumatology | rheumatology |
| 363A00000X | Physician Assistant | physician_assistant |
| 363AM0700X | Physician Assistant, Medical | physician_assistant |
| 363AS0400X | Physician Assistant, Surgical | physician_assistant |
| 363L00000X | Nurse Practitioner | nurse_practitioner |
| 363LA2200X | Nurse Practitioner, Adult Health | nurse_practitioner |
| 363LF0000X | Nurse Practitioner, Family | nurse_practitioner |
| 363LG0600X | Nurse Practitioner, Gerontology | nurse_practitioner |
| 363LP0200X | Nurse Practitioner, Pediatrics | nurse_practitioner |
| 363LP2300X | Nurse Practitioner, Primary Care | nurse_practitioner |
| 252Y00000X | Early Intervention Provider Agency | early_intervention |
| 251300000X | Local Education Agency (LEA) | school |

API search strings (candidates only; the table above is the filter): Family Medicine, Internal Medicine, General Practice, Pediatrics, Orthopaedic Surgery, Neurology, Physical Medicine & Rehabilitation, Rheumatology, Physician Assistant, Nurse Practitioner, Early Intervention, Local Education Agency.

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
| 27127 | Winston-Salem | boundary (~81% of ZCTA land area) |
| 27284 | Kernersville | boundary (~83%; rest Guilford) |
| 27012 | Clemmons | boundary (~62%; rest mostly Davie) |
| 27107 | Winston-Salem | boundary (~47% land area, large population) |

## Address metrics

On unique kept NPIs:

- Missing address: no practice-location address, or a blank street line. A mailing address is not treated as the practice.
- Missing phone: practice-location phone has fewer than 10 digits.
- Unparseable city/state/ZIP: city has no letters, state is not two letters, or ZIP is not 5 or 9 digits.
- Duplicate NPI: the same NPI returned by more than one ZIP or taxonomy query.
- Also reported: PO Box, ZIP outside the list above, boundary ZIP, deactivated NPI, matched only via a non-primary taxonomy, and a **places-match ready** count (street, phone, parseable city/state/ZIP inside the county list, not a PO Box, not deactivated). Boundary ZIPs can still be places-match ready.

## Results note

Fill this in after `npm run spike:live` (or after a `--file` run against the monthly CSV). Leave the fixture run out of this table; `npm test` locks those numbers.

| Field | Value |
|-------|-------|
| Run date | |
| Source (`api` or `file`) | |
| County | Forsyth County, NC |
| Raw hits | |
| Unique NPIs before taxonomy filter | |
| Duplicate NPIs (seen more than once) | |
| Dropped (no allow-listed taxonomy) | |
| Unique NPIs kept | |
| NPI-1 / NPI-2 | |
| Missing address | |
| Missing phone | |
| Unparseable city, state, or ZIP | |
| PO Box | |
| ZIP outside county list | |
| Boundary ZIP | |
| Deactivated | |
| Matched on secondary taxonomy only | |
| Places-match ready | |
| Truncated API queries | |
| Top primary taxonomies | |

### What this means for ingest

Do not bulk-load these rows into `ReferralSource` until a Places match is measured on the places-match-ready subset (ingest ticket). Rows with a missing street, a PO Box, or an unparseable ZIP are a poor match key. If any API query is truncated, rerun with the monthly V.2 CSV before treating the count as a census.

## Expected outputs

`summary.md` sections: counts, enumeration type, primary taxonomy, allow-list group, address quality with percents, notes stating that Google and Prisma were not used.

`sample.csv` header:

```text
npi,enumeration_type,name,primary_taxonomy_code,primary_taxonomy_desc,matched_group,city,state,zip5,has_phone,flags,address_1
```
