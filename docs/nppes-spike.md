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

The API returns at most 200 rows per request and allows `skip` up to 1,000, so one taxonomy + ZIP search returns at most 1,200 NPIs. The script sets `address_purpose=LOCATION` and `state`, then keeps a row only when its **primary** taxonomy code is on the allow-list. The API's `taxonomy_description` match is loose: `General Practice` also returns dentists, and `Internal Medicine` returns hospitalists, cardiologists, and other subspecialists. A row whose only allow-listed code is a non-primary taxonomy is counted as excluded, not kept.

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

Live Read API run on 2026-09-21. `npm test` still locks the fixture numbers; this table is the live pull only.

| Field | Value |
|-------|-------|
| Run date | 2026-09-21T19:13:02Z |
| Source | `api` — `https://npiregistry.cms.hhs.gov/api/?version=2.1` |
| County | Forsyth County, NC (FIPS 37067), 18 practice ZIPs including 27157 |
| Raw hits | 4,764 |
| Unique NPIs before taxonomy filter | 4,138 |
| Duplicate NPIs (seen more than once) | 524 (626 extra hits) |
| Dropped (no allow-listed taxonomy) | 405 |
| Excluded (allow-listed code was not primary) | 534 |
| Unique NPIs kept (primary taxonomy on the allow-list) | 3,199 |
| NPI-1 / NPI-2 | 2,913 / 286 |
| Missing address | 0 |
| Missing phone | 0 |
| Unparseable city, state, or ZIP | 0 |
| PO Box | 0 |
| ZIP outside county list | 0 |
| Boundary ZIP | 529 (16.5%) |
| Deactivated | 0 |
| Matched on secondary taxonomy only | 0 kept; 534 excluded |
| Places-match ready | 3,199 (100% of kept) |
| Truncated API queries | 0 (busiest query was 3 pages; cap is 6) |
| Top primary taxonomies | PA 899 (`363A00000X`); NP 659 (`363L00000X`); Family Medicine 381 (`207Q00000X`); Internal Medicine 337 (`207R00000X`); NP Family 250 (`363LF0000X`); Neurology 141 (`2084N0400X`); PA Medical 120 (`363AM0700X`); Orthopaedic Surgery 84 (`207X00000X`) |

Allow-list groups among the 3,199: physician assistant 1,055; nurse practitioner 986; family medicine 408; internal medicine 348; neurology 149; orthopaedics 106; PM&R 55; rheumatology 38; pediatrics 17; general practice 17; early intervention 15; school / LEA 5.

Primary pediatrician codes inside that pediatrics group: general pediatrics 6 (`208000000X`), developmental-behavioral 9 (`2080P0006X`), adolescent medicine 2 (`2080A0000X`). Pediatric NPs (`363LP0200X`, 26) are in the nurse-practitioner group. Pediatric subspecialties that are not on the allow-list (for example pediatric emergency medicine) are not counted.

### What this means for ingest

Do not bulk-load these rows into `ReferralSource`. A Places match rate is still unknown, and this pull is not a census of dirty addresses.

- Every API query asked for `address_purpose=LOCATION` plus a ZIP, so providers with a blank practice address never showed up. Missing street, missing phone, bad ZIP, and PO Box are all zero **because of that filter**. The monthly V.2 CSV is the run that can measure that dirtiness.
- 534 NPIs had an allow-listed taxonomy only as a non-primary code (the Internal Medicine search returns hospitalists and cardiologists). They are excluded. Loading "any taxonomy matches" would pollute the graph.
- 529 kept rows (16.5%) use a boundary ZIP (Clemmons, Kernersville, 27107, 27127). A later Places match will mix in Davie and Guilford unless those rows are flagged.
- No query hit the 1,200-row API cap, so this count is not truncated. It is still ZIP-based, not a county polygon.
- PA and NP rows dominate (about 2,000 of 3,199). That is a product decision for the ingest ticket, not a reason to insert them now.

## Expected outputs

`summary.md` sections: counts, enumeration type, primary taxonomy, allow-list group, address quality with percents, notes stating that Google and Prisma were not used.

`sample.csv` header:

```text
npi,enumeration_type,name,primary_taxonomy_code,primary_taxonomy_desc,matched_group,city,state,zip5,has_phone,flags,address_1
```
