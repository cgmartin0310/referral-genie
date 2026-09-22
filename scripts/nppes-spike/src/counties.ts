/**
 * Default market: Forsyth County, NC (Winston-Salem).
 *
 * ZIP codes are not counties. `core` means the Census 2020 ZCTA is entirely
 * or almost entirely inside Forsyth. `boundary` means a large share of the
 * ZCTA sits in a neighboring county, so a practice ZIP in that list can be
 * outside the county. PO Box ZIPs are not queried. The unique ZIP 27157 is
 * included because it is the Atrium Health Wake Forest Baptist campus.
 *
 * Land-share notes are from the Census 2020 ZCTA / county relationship
 * (FIPS 37067). 27107 is included even though about half its land area is
 * outside Forsyth, because it is a large Winston-Salem delivery ZIP.
 */

export interface CountyZip {
  zip: string;
  city: string;
  role: "core" | "boundary";
  note: string;
}

export interface CountyMarket {
  id: string;
  name: string;
  state: string;
  fips: string;
  zips: CountyZip[];
}

export const FORSYTH_NC: CountyMarket = {
  id: "forsyth-nc",
  name: "Forsyth County",
  state: "NC",
  fips: "37067",
  zips: [
    { zip: "27009", city: "Belews Creek", role: "core", note: "About 90% of ZCTA land area in Forsyth" },
    { zip: "27010", city: "Bethania", role: "core", note: "Forsyth place; small ZIP, not in the land-share extract" },
    { zip: "27023", city: "Lewisville", role: "core", note: "ZCTA entirely in Forsyth" },
    { zip: "27040", city: "Pfafftown", role: "core", note: "ZCTA entirely in Forsyth" },
    { zip: "27045", city: "Rural Hall", role: "core", note: "About 92% of ZCTA land area in Forsyth" },
    { zip: "27050", city: "Tobaccoville", role: "core", note: "About 87% of ZCTA land area in Forsyth" },
    { zip: "27051", city: "Walkertown", role: "core", note: "ZCTA entirely in Forsyth" },
    { zip: "27101", city: "Winston-Salem", role: "core", note: "ZCTA entirely in Forsyth" },
    { zip: "27103", city: "Winston-Salem", role: "core", note: "ZCTA entirely in Forsyth" },
    { zip: "27104", city: "Winston-Salem", role: "core", note: "ZCTA entirely in Forsyth" },
    { zip: "27105", city: "Winston-Salem", role: "core", note: "ZCTA entirely in Forsyth" },
    { zip: "27106", city: "Winston-Salem", role: "core", note: "ZCTA entirely in Forsyth" },
    { zip: "27109", city: "Winston-Salem", role: "core", note: "ZCTA entirely in Forsyth" },
    {
      zip: "27157",
      city: "Winston-Salem",
      role: "core",
      note: "Unique ZIP for Atrium Health Wake Forest Baptist. Not a PO Box; holds a large practice cluster",
    },
    { zip: "27127", city: "Winston-Salem", role: "boundary", note: "About 81% of ZCTA land area in Forsyth" },
    { zip: "27284", city: "Kernersville", role: "boundary", note: "About 83% of ZCTA land area in Forsyth; rest is Guilford" },
    { zip: "27012", city: "Clemmons", role: "boundary", note: "About 62% of ZCTA land area in Forsyth; rest is mostly Davie" },
    { zip: "27107", city: "Winston-Salem", role: "boundary", note: "About 47% of ZCTA land area in Forsyth; large population ZIP" },
  ],
};

const COUNTIES: Record<string, CountyMarket> = {
  [FORSYTH_NC.id]: FORSYTH_NC,
};

export function getCounty(id: string): CountyMarket {
  const county = COUNTIES[id];
  if (!county) {
    const known = Object.keys(COUNTIES).join(", ");
    throw new Error(`Unknown county "${id}". Known counties: ${known}`);
  }
  return county;
}

export function zipRole(county: CountyMarket, zip5: string): "core" | "boundary" | null {
  const found = county.zips.find((row) => row.zip === zip5);
  return found ? found.role : null;
}
