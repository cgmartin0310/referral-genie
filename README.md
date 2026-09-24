# Referral360

The repository and Render service are still named referral-genie.

Finds, verifies, and works referral sources for outpatient therapy clinics, then faxes them.

A **referral source** is a practice: pediatricians and primary care physicians from the NPI registry, grouped under their organization or the address they share, named as Google lists it, and researched on its own website for fax, referral email, and referral forms. A **clinic** is one of your sites; it keeps a referral list chosen from those sources. A **campaign** faxes a clinic's list, one page per fax machine.

## How it works

1. **Referral Sources** → *Pull referral sources for a county*. Pick a state and county and press one button. Three stages run with live progress:
   - **Pull from the NPI file** — every record whose practice ZIP maps to that county, kept by taxonomy code (see [taxonomies](src/lib/nppes/taxonomies.ts)). Providers nest under an organization NPI at their address; the rest group by the address they share (street and town, suite when both give one; a shared phone settles spelling, never joins two addresses); anyone left is on their own. Falls back to scanning the NPPES API ZIP by ZIP when the file is not loaded.
   - **Name practices on Google** — one Google search per group (phone, then address, then a lone physician's name in their town). A clinician's own listing gives way to the clinic listing that shares its website or phone, and listings sharing a phone at one site are one practice, named by the one people review most. Groups that land on the same listing merge. An organization keeps its NPI name unless the same name is registered at several sites (a health system), where Google's name for the site is used.
   - **Find missing faxes** — for each practice with no fax on NPI, an OpenAI-compatible model reads its website once and fills the fax (and referral email, form, and channel) only when the page states them.
2. The result is one list of practices, each expanding to its providers. The fax is the one the group's NPI records agree on; Google publishes none. An organization with no provider under it is not listed.
3. **Our Clinics** → add a clinic. Back on Referral Sources, check rows and **Add to clinic**. The clinic's **Referral list** shows what was added with the estimate rolled up.
   The estimate comes from **Settings → Referral estimates**: therapy disciplines across, provider types down, each cell referrals per provider per month. Every estimate is the sum across disciplines, shown as a range with a per-discipline breakdown.
4. **Campaigns** → choose the clinic. The audience is its list, previewed as pages to send: everyone at a practice sharing a fax machine gets one page; a provider whose *own fax* switch is on gets their own; anyone unreachable is listed, not dropped.

Details and current limits: [docs/market-setup.md](docs/market-setup.md), [docs/kinston-pilot.md](docs/kinston-pilot.md).

## Who sees what

People sign in with Clerk (the Referral360 application) when its keys are set; each Clerk organization is a **subscriber**, set up the first time someone signs into it. The organization named **Paragon** runs the program, and the username login (`AUTH_USERNAME`) also acts as Paragon.

- **The county catalog** (referral sources, practices, providers, pulls, research) is shared. Every subscriber reads it and adds from it to its own clinics; only Paragon pulls, edits, deletes, or chooses its specialties.
- **Per subscriber**: clinics (disciplines, payers, children, new patients, market), referral lists, campaigns, activity, **Your Sources** (existing relationships, uploaded or entered, with a 0–100 trust score), **Prospects** (catalog practices near its clinics that are not yet its sources, scored for fit, for it to approve or exclude), the fax opt-out line, and estimate rates (Paragon's until it saves its own). New subscribers get a **Set up Referral360** walkthrough.
- **Paragon admin**: Subscribers, Source Universe (the outreach ladder, referral coordinators, assignees), Call queue (logged calls that move the ladder), Clinic owners (therapy practices to recruit, from the same NPI file).
- **Fax opt-outs** are global: a practice marked opted out is never faxed by any subscriber; only Paragon removes one.

## Running it

Next.js 15, Prisma, Postgres, Clerk, on Node 22. Deployed on Render from `main` ([render.yaml](render.yaml)); the build runs the tests, builds, and applies migrations.

Environment (see [render.yaml](render.yaml) for the full list):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk sign-in for subscribers. Without them the app uses the username login only. |
| `AUTH_USERNAME`, `AUTH_PASSWORD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | The Paragon admin username login (kept as a fallback alongside Clerk). There is no default login. |
| `GOOGLE_PLACES_API_KEY` | Places enrichment |
| `XAI_API_KEY` (or `OPENAI_COMPAT_API_KEY` + `_BASE_URL` + `_MODEL`) | Website research |
| `HUMBLE_FAX_API_KEY`, `HUMBLE_FAX_API_SECRET` | Fax sending |
| `HUMBLE_FAX_WEBHOOK_SECRET` | Optional; the delivery webhook then requires it |

### Load the NPI file

Pulls read the NPI dissemination file from the `NpiRecord` table. Load it once, and again each month when CMS publishes the next file. From a Render shell (or locally with `DATABASE_URL` set):

```bash
npm run npi:load -- --states NC,SC,VA
```

It downloads the monthly file from CMS (about 1.2 GB), streams it, keeps every specialty the catalog can pull and the therapists Paragon recruits (for Clinic owners) (Paragon turns each on under **Settings → Specialties in the catalog**; a file loaded before a specialty existed needs one reload before that specialty is pulled), and places each practice ZIP in a county: the HUD USPS ZIP–County crosswalk first, the Census ZCTA crosswalk second, and the town for ZIPs in neither (which is how a PO Box ZIP is placed). `--states` keeps the table to the states you serve; the whole country is about 930,000 rows and 330 MB. Needs `unzip` on the box.

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
