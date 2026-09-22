#!/usr/bin/env python3
"""Build src/data/zip-county.json from the HUD USPS ZIP-County crosswalk.

    python3 scripts/build-zip-county.py us_zip_to_county.xlsx

Expects a workbook with a `zip_primary` sheet (zip, county_name, state_abbr,
state_fips, county_fips, res_ratio, is_primary, n_counties_for_zip): one row
per ZIP, the county holding the largest share of its addresses. Source:
https://www.huduser.gov/portal/datasets/usps_crosswalk.html (free account).
"""
import json, sys
import openpyxl

path = sys.argv[1]
ws = openpyxl.load_workbook(path, read_only=True)['zip_primary']
rows = ws.iter_rows(values_only=True)
header = [str(h) for h in next(rows)]
zip_col, fips_col = header.index('zip'), header.index('county_fips')
out = {}
for r in rows:
    if r[zip_col] is None or r[fips_col] is None:
        continue
    out[str(r[zip_col]).zfill(5)] = str(r[fips_col]).zfill(5)
with open('src/data/zip-county.json', 'w') as f:
    json.dump(dict(sorted(out.items())), f, separators=(',', ':'))
print(f'wrote {len(out)} ZIPs')
