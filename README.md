# Referral Genie

Finds, verifies, and works referral sources for outpatient therapy clinics, then faxes them.

A **referral source** is a pediatrician, primary care physician, or the organization they work for, pulled from the NPI registry by county, enriched with Google Places, and researched on its own website for fax, referral email, and referral forms. A **clinic** is one of your sites; it keeps a referral list chosen from those sources. A **campaign** faxes a clinic's list, one page per fax machine.

## How it works

1. **Referral Sources** → *Pull referral sources for a county*. Pick a state and county and press one button. Three stages run with live progress:
   - **Pull from the NPI file** — every provider whose practice ZIP maps to that county, kept by taxonomy code (see [taxonomies](src/lib/nppes/taxonomies.ts)). Falls back to scanning the NPPES API ZIP by ZIP when the file is not loaded.
   - **Match to Google Places** — phone, address, website, rating, listing name.
   - **Research websites** — an OpenAI-compatible model reads each practice site and fills fax, referral email, referral form, and preferred channel only when the page states them.
2. The result is one list. An organization on NPI (NPI-2) groups the providers at its address and expands to show them. Where a health system registered no organization at a clinic (common: one NPI-2 at the home office), the Google Places listing the providers share names the practice instead. A provider with neither is listed on their own; nothing is ever named after its street. One provider's registered fax covers colleagues at the same location who left theirs blank. Every row has a fax and a referral estimate (per-type monthly rates in [estimate.ts](src/lib/practices/estimate.ts); starting assumptions to tune).
3. **Our Clinics** → add a clinic. Back on Referral Sources, check rows and **Add to clinic**. The clinic's **Referral list** shows what was added with the estimate rolled up.
4. **Campaigns** → choose the clinic. The audience is its list, previewed as pages to send: everyone at a practice sharing a fax machine gets one page; a provider whose *own fax* switch is on gets their own; anyone unreachable is listed, not dropped.

Details and current limits: [docs/market-setup.md](docs/market-setup.md), [docs/kinston-pilot.md](docs/kinston-pilot.md).

## Running it

Next.js 15, Prisma, Postgres. Deployed on Render from `main` ([render.yaml](render.yaml)); the build runs the tests, builds, and applies migrations.

Environment (see [render.yaml](render.yaml) for the full list):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres |
| `AUTH_USERNAME`, `AUTH_PASSWORD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | Sign-in. There is no default login. |
| `GOOGLE_PLACES_API_KEY` | Places enrichment |
| `XAI_API_KEY` (or `OPENAI_COMPAT_API_KEY` + `_BASE_URL` + `_MODEL`) | Website research |
| `HUMBLE_FAX_API_KEY`, `HUMBLE_FAX_API_SECRET` | Fax sending |
| `HUMBLE_FAX_WEBHOOK_SECRET` | Optional; the delivery webhook then requires it |

### Load the NPI file

Pulls read the NPI dissemination file from the `NpiRecord` table. Load it once, and again each month when CMS publishes the next file. From a Render shell (or locally with `DATABASE_URL` set):

```bash
npm run npi:load -- --states NC,SC,VA
```

It downloads the monthly file from CMS (about 1.2 GB), streams it, keeps referral-source taxonomies, and places each practice ZIP in a county: the HUD USPS ZIP–County crosswalk first, the Census ZCTA crosswalk second, and the town for ZIPs in neither (which is how a PO Box ZIP is placed). `--states` keeps the table to the states you serve; the whole country is about 930,000 rows and 330 MB. Needs `unzip` on the box.

The crosswalk data files are built by [scripts/build-zip-county.py](scripts/build-zip-county.py) (HUD workbook) and [scripts/build-zcta-county.mjs](scripts/build-zcta-county.mjs) (Census file).

### Locally

```bash
npm install
npm run dev
npm test
```

Tests are pure-function suites under `src/lib` and run with Node's test runner through `tsx`.

## Layout

```
src/app/                 pages and API routes (Next.js app router)
src/lib/nppes/           NPPES API client, taxonomy list, record classification
src/lib/npi/             NPI file parsing and ZIP → county mapping
src/lib/ingest/          the county pull: slices, cursor, Places, duplicates, formation
src/lib/practices/       organization/provider formation, fax routing, estimate
src/lib/places/          Google Places matching
src/lib/research/        website research job and field guardrails
src/lib/campaigns/       campaign audience from a clinic's list
scripts/                 NPI file loader, crosswalk builders, county seed
prisma/                  schema and migrations
docs/                    product and data notes
```
