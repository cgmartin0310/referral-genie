# NPPES spike

Counts pediatrician and primary-care physician NPPES rows for one county and measures how dirty the practice addresses are.

It does **not** call Google Places and it does **not** write to Prisma or `ReferralSource`. Bulk load waits until a Places match rate is known (ingest ticket).

Full notes, taxonomy codes, the county ZIP list, and the results template: [`docs/nppes-spike.md`](../../docs/nppes-spike.md).

```bash
cd scripts/nppes-spike
npm install
npm test                 # offline fixture + sample dissemination CSV
npm run spike:fixture    # writes out/summary.json, out/summary.md, out/sample.csv
npm run spike:live       # Forsyth County, NC via the NPPES Read API
```
