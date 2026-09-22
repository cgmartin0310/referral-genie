# Market setup

A clinic comes first. The counties on that clinic are its market. Referral sources are pulled for those counties, enriched, then researched for missing contact details.

## Bites

### 1. Add a clinic — implemented

`/clinic-locations` is the first step. Add or edit a clinic site: name, street address, city, state, ZIP, phone, and fax. Home and the nav lead with **Clinics** / **Add a clinic**.

### 2. Pick counties — implemented

After a clinic exists, open it and save one or more US counties as that clinic’s market. The picker is state, then county name. Lenoir County, NC is an example you can add; it is not the only county and it is not the product name.

Counties are stored on the clinic in `ClinicMarketCounty` (clinic, FIPS, county name, state). Removing a clinic removes its market rows.

### 3. Pull referral sources (NPI) — partial

Pediatricians and primary care physicians come from the NPPES Read API. The pull is the existing county ingest job, NPPES phase only, started from the clinic page or from **Pull sources** (`/county-seed`).

NPPES has no county parameter. A pull runs only when that county has a practice-location ZIP list. Today that list is Lenoir County, NC. Any other saved county stays on the market and waits until a ZIP list is added. This bite does not download the national NPPES file and does not rebuild the ingest job.

### 4. Enrich with Google Places — partial

The same job’s Places phase. After the pull leaves NPPES, **Enrich with Google Places** matches phone and address, then flags duplicates. It runs for counties the pull supports. A missing Places key or quota stops enrichment; NPPES rows already saved stay saved.

### 5. Research missing info — partial

After Places enrichment, **Research missing info** reads each referral source that already has a public website. One HTTP request researches one practice and stores progress on `ResearchRun`, so a closed browser can resume. The model is an OpenAI-compatible chat API. xAI/Grok is used when `XAI_API_KEY` or `GROK_API_KEY` is set. Otherwise set `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_BASE_URL`, and `OPENAI_COMPAT_MODEL`.

The agent fills only blank fields, and only when the value is on the page and confidence is high enough:

- phone and fax (the digits must appear in the page; a guessed number is dropped)
- referral email (`contactEmail`)
- number of providers
- referral form URL (must be a link on the site)
- preferred channel: fax, portal, call, or email
- website, only when the field is blank and the URL is one the job actually fetched

Human edits are stored on provenance `overriddenFields` and win on the next research or county pull. Per-field confidence is stored on provenance `fieldConfidence`. NPI pull and Places enrichment do not call the model.

Pages are fetched as HTML. JavaScript-only sites can be missed. A later browser fetch can replace `fetchPracticePages` without changing the job. TypeSafe Jev is not connected. `createJevJudge` is the swap point for that judge; fetch, guardrails, and the job stay the same.

Sources with no website are counted and skipped. Discovering a URL that is not already on the referral source is not in this bite.

Inbound referrals, attribution, and fax campaigns are out of scope.

## Click path

1. Sign in. Home is a dashboard of your clinics.
2. **Our Clinics** → add a clinic. Under **Market & data**, pick its counties, then pull referral sources, enrich with Google Places, and research missing details. That fills the shared catalog.
3. **Referral Sources** lists the catalog as practices (with providers nested, fax, provider count, and a referral estimate) and as providers (with the own-fax switch). Check practices and **Add to clinic**. "Add practice" covers a school, program, or office without an NPI, and links to Google keyword search.
4. Back on the clinic, **Referral list** shows what was added, with the estimate rolled up.
5. **Campaigns** → new campaign → choose the clinic. The audience is that clinic's list, previewed as pages to send: everyone at a practice who shares a fax machine gets one page, a provider on their own line gets their own, and anyone unreachable is listed rather than dropped.
