# Market setup

A clinic comes first. The counties on that clinic are its market. Referral sources are pulled for those counties, enriched, then researched for missing contact details.

## Bites

### 1. Add a clinic — implemented

`/clinic-locations` is the first step. Add or edit a clinic site: name, street address, city, state, ZIP, phone, and fax. Home and the nav lead with **Clinics** / **Add a clinic**.

### 2. Pick counties — implemented

After a clinic exists, open it and save one or more US counties as that clinic’s market. The picker is state, then county name. Lenoir County, NC is an example you can add; it is not the only county and it is not the product name.

Counties are stored on the clinic in `ClinicMarketCounty` (clinic, FIPS, county name, state). Removing a clinic removes its market rows.

### 3. Pull referral sources (NPI) — implemented

Pediatricians, primary care physicians, and the clinic/center organizations that run primary care come from the **NPI dissemination file**, loaded into `NpiRecord` by `npm run npi:load`. The loader streams the monthly file from CMS (about 1.2 GB zipped), keeps rows whose primary taxonomy is a referral-source type, and maps each practice-location ZIP to a county in three steps: the HUD USPS ZIP–County crosswalk (`src/data/zip-county.json`, built by `scripts/build-zip-county.py` from the HUD workbook; the county holding most of the ZIP's addresses), then the Census ZCTA crosswalk by land share for ZCTAs HUD lacks, then the town and state for ZIPs in neither file (a PO Box ZIP such as Kinston 28502 lands where Kinston's street ZIPs did). Pulling a county then reads that table: complete and immediate, with no API cap and no missed records.

Run it on the server from a Render shell, restricting to the states you serve to keep the table small (`--states NC` is about 40,000 rows; the whole country is about 1.3 million):

```bash
npm run npi:load -- --states NC,SC,VA
```

Each ZIP belongs to exactly one county on the file (the county holding most of the ZCTA), so a practice in a ZIP that straddles a county line is filed under one county, not both; a clinic near a line adds practices from the neighboring county to its list as well. Re-run the loader monthly when CMS publishes the next file. Until the file is loaded, pulls fall back to scanning the NPPES API ZIP by ZIP, which is slower, capped at 1,200 rows per ZIP, and cannot see practices registered under a PO Box ZIP.

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
2. **Referral Sources** → *Pull referral sources for a county*. Pick a county; pull pediatricians and primary care physicians from NPI, enrich with Google Places, research websites. This builds the catalog and has nothing to do with any clinic.
3. **Our Clinics** → add a clinic (name, address, fax). Its *Market* tab is only a label for the counties it serves.
4. Back on **Referral Sources**, one list of providers: each practice Google lists in the county is a row, named as Google names it, with the NPI providers at its phone or address nested under it; a provider Google lists nowhere is shown on their own or under an organization NPI at their address. Check rows and **Add to clinic**. The clinic's **Referral list** shows what was added, with the estimate rolled up.
5. **Campaigns** → new campaign → choose the clinic. The audience is its referral list, previewed as pages to send.
