# Lenoir County ZIP list

The product path is in [market-setup.md](./market-setup.md): add a clinic, pick counties, pull referral sources, enrich with Google Places. This note is the hand-checked practice-location ZIP list for **Lenoir County, North Carolina** (FIPS `37107`). Every other county is pulled the same way from the Census ZCTA-to-county crosswalk; Lenoir is the one whose ZIPs were checked by hand and reproduces exactly from that crosswalk at the 15% land-share cutoff.

The pull loads pediatricians and primary care physicians from the NPPES Read API, upserts them onto `ReferralSource` by NPI, then matches Google Places by phone and address. Keyword Nearby Search is no longer the way the source list is built. It remains at **Non-NPI search** for partners that do not have an NPI.

This does not add inbound referrals, attribution, or fax changes.

## What gets stored

Each kept NPI is one referral source in the default organization (`org_default`):

- Taxonomy codes, primary taxonomy, enumeration type (`NPI-1` or `NPI-2`)
- Fax number when NPPES lists one on the practice location (about 70% of kept Lenoir rows). An absent NPPES fax never clears a fax that research or a person already found.
- County name and FIPS
- Source type and a seeded category: Pediatrician, Primary Care - Family Medicine, Primary Care - Internal Medicine, Primary Care - General Practice
- When Places matches: `placeId`, phone, website, rating, review count, business status, latitude, longitude, and match confidence
- Provenance: origin (`nppes`, `places`, `user`, or `mixed`), confidence, and who overrode which fields
- `likelyDuplicate` when two sources in the county resolve to one practice: the same place id, or the same normalized street, suite, and ZIP. A shared phone alone does not merge rows, because a multi-site group publishes one main number; it is reported as `phoneOnlyMatch` instead. Rows that differ only by suite or floor at one street address are rejoined when the phone also matches. Rows are flagged, not merged.

A row is quarantined (stored, not sent to Places) when the practice location is deactivated, a PO Box, missing a street or phone, or has an unusable city, state, or ZIP. Boundary ZIPs are still matched and flagged `boundary_zip`.

Re-runs upsert on `(organizationId, npiNumber)`. Fields a person edited in the CRM are listed on provenance and are not overwritten.

## Taxonomy allow-list

Fifteen NUCC codes: the nine physician codes from the NPPES spike plus six clinic/center organization codes. A row is kept only when the **primary** taxonomy is on this list. Organization rows are never counted as providers; they name the practice and carry its fax.

| Code | Display name |
|------|----------------|
| 207Q00000X | Family Medicine |
| 207QA0505X | Family Medicine, Adult Medicine |
| 207QG0300X | Family Medicine, Geriatric Medicine |
| 207R00000X | Internal Medicine |
| 207RG0300X | Internal Medicine, Geriatric Medicine |
| 208D00000X | General Practice |
| 208000000X | Pediatrics |
| 2080A0000X | Pediatrics, Adolescent Medicine |
| 2080P0006X | Pediatrics, Developmental - Behavioral Pediatrics |
| 261QP2300X | Clinic/Center, Primary Care |
| 261QR1300X | Clinic/Center, Rural Health |
| 261QF0400X | Clinic/Center, FQHC |
| 261QP0905X | Clinic/Center, Public Health, State or Local |
| 261QP0904X | Clinic/Center, Public Health, Federal |
| 261QM1300X | Clinic/Center, Multi-Specialty |

## Lenoir ZIP list

NPPES has no county parameter. The seed queries these practice-location ZIPs with `state=NC`. Land share is the Census 2020 ZCTA share inside Lenoir County. PO Box ZIPs 28502 and 28503 are not queried. 28526 and 28580 are omitted because almost all of their land sits in another county.

| ZIP | Place | Role |
|-----|--------|------|
| 28504 | Kinston | core (~98%) |
| 28525 | Deep Run | core (~92%) |
| 28501 | Kinston | boundary (~75%). Primary Kinston street ZIP |
| 28551 | La Grange | boundary (~58%) |
| 28530 | Grifton | boundary (~36%, mostly Pitt) |
| 28578 | Seven Springs | boundary (~28%, mostly Wayne) |
| 28572 | Pink Hill | boundary (~27%, mostly Duplin) |
| 28538 | Hookerton | boundary (~18%, mostly Greene) |

The Read API returns at most 1,200 rows per taxonomy and ZIP (`skip` tops out at 1,000). Lenoir is small enough that this cap is unlikely. A truncated query is counted on the seed summary. The national NPPES dissemination file is not downloaded or committed.

## Environment variables

Set these on the Render web service. There is no built-in username or password.

| Variable | Required | Role |
|----------|----------|------|
| `DATABASE_URL` | yes | Postgres. The Render blueprint wires this from the database. |
| `AUTH_USERNAME` | yes | Login name. Unset rejects every login. |
| `AUTH_PASSWORD` | yes | Login password. Unset rejects every login. |
| `NEXTAUTH_SECRET` | yes | Session signing secret. The blueprint can generate it. |
| `NEXTAUTH_URL` | yes | Public origin, for example `https://your-app.onrender.com`. |
| `GOOGLE_PLACES_API_KEY` | yes for enrichment | Same key the prospecting page already uses. Places matching calls Find Place and Place Details on `maps.googleapis.com`. |

NPPES does not need a key. `prisma migrate deploy` runs from the Render build command and creates the default organization plus the four categories.

Breaking change: deploys that relied on the old shared login must set `AUTH_USERNAME` and `AUTH_PASSWORD` before anyone can sign in.

## Run it on Render

1. Deploy this branch. The build runs `npx prisma migrate deploy`.
2. Set the env vars above and redeploy if they were missing at boot.
3. Sign in.
4. Open **Clinics**, add a clinic if you need one, and save Lenoir County, NC on its market.
5. Press **Pull referral sources**, then **Enrich with Google Places**.

The page drives the job. Each request does one slice and writes progress to `CountyIngestRun`:

- one NPPES page (up to 200 rows), or
- up to five Places matches, or
- the duplicate pass, which finishes the run

The browser calls the next slice only after the previous response returns. That is real work, not a timer that marks the run complete. Closing the browser pauses the run. Open the clinic or **Pull sources** again and press **Continue pull** or **Enrich with Google Places**. A failed run (missing Places key, NPPES timeout, Places quota) keeps the rows already written. Fix the cause and press **Resume pull** or **Resume enrichment**.

Shell alternative, from a Render shell with the service env:

```bash
npx tsx scripts/seed-county.ts --county lenoir-nc
```

`--refresh` replaces an unfinished run. If the last run already finished, the command starts another idempotent refresh either way. The script calls the same steps until the run completes or fails. Use it when you do not want the browser to stay open. The script lives only as long as that shell session.

## Limits

- Render's proxy will not hold one HTTP request for a whole county. The UI and the script both chunk the work. A single slice is aimed at about 20 seconds.
- A free Render instance can sleep after HTTP traffic stops. The in-progress rows stay in Postgres. Continue after the service wakes.
- A seed step holds a 90-second lock. A second click while that lock is fresh does not start a duplicate worker.
- Places matches are sequential and use the existing Google key. Quota or a denied key stops the run at the Places phase. NPPES rows are already saved.
- Boundary ZIPs can include practices whose ZCTA also covers Pitt, Wayne, Duplin, or Greene. Those rows are flagged, not dropped.
- Duplicate clusters are flagged inside the seeded county. They are not merged.
- Practice identity is strongest after Places has run: a place id rejoins addresses a person typed differently (a facility name inside the street line, for example).
- Providers who disappear from a later NPPES pull are left in the CRM. The upsert does not delete.
- This path does not download the national NPPES file.

## What you should see

After a finished run, **Referral sources** lists Lenoir County rows with source type, NPI, and a Places status of matched, unmatched, or quarantined. Open a row for taxonomy, FIPS, place id, rating, review count, business status, lat/lng, provenance, and the duplicate flag. Matched rows have those Places fields filled in. Unmatched rows were sent to Places and did not clear the address or phone check. Quarantined rows were not sent.

A Read API pull on 2026-09-21 kept 81 NPIs (64 individuals, 17 organizations): family medicine, internal medicine, and general practice. None had pediatrics as the primary taxonomy. The Pediatrics search in these ZIPs returned pediatric nurse practitioners, and those codes are not on the allow-list, so they are not upserted. Many kept rows share a clinic main phone number. The duplicate pass flags that cluster and does not merge the NPIs.
