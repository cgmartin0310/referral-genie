# Market setup

A clinic comes first. The counties on that clinic are its market. Referral sources are pulled for those counties, then enriched. The research agent is the next bite, not this one.

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

### 5. Research agent — next

Not in this release. A later bite can research the enriched referral sources. Inbound referrals, attribution, and fax changes are also out of scope.

## Click path

1. Sign in.
2. **Add a clinic** (home, or **Clinics** in the nav). Save name, address, phone, and fax.
3. **Pick counties**. Save the market.
4. **Pull referral sources** for a county that is ready (Lenoir County, NC today).
5. **Enrich with Google Places**.
6. Open **Referral sources**.

**Pull sources** in the nav is the same pull and enrich steps when you already have a clinic and counties.
