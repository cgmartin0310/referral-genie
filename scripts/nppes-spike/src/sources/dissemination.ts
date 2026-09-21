import { iterateCsvObjects } from "../csv.js";
import type { AddressParts, RawHit, TaxonomyHit } from "../types.js";

/**
 * Column names from the NPPES Data Dissemination file (monthly V.2 CSV inside the zip).
 * The script fails if a required column is missing rather than guessing.
 */
const REQUIRED = [
  "NPI",
  "Entity Type Code",
  "Provider Organization Name (Legal Business Name)",
  "Provider Last Name (Legal Name)",
  "Provider First Name",
  "Provider First Line Business Practice Location Address",
  "Provider Business Practice Location Address City Name",
  "Provider Business Practice Location Address State Name",
  "Provider Business Practice Location Address Postal Code",
  "Provider Business Practice Location Address Telephone Number",
  "Healthcare Provider Taxonomy Code_1",
  "Healthcare Provider Primary Taxonomy Switch_1",
] as const;

function cell(row: Record<string, string>, name: string): string {
  return (row[name] ?? "").trim();
}

function addressFrom(row: Record<string, string>): AddressParts | null {
  const parts: AddressParts = {
    address1: cell(row, "Provider First Line Business Practice Location Address"),
    address2: cell(row, "Provider Second Line Business Practice Location Address"),
    city: cell(row, "Provider Business Practice Location Address City Name"),
    state: cell(row, "Provider Business Practice Location Address State Name"),
    postalCode: cell(row, "Provider Business Practice Location Address Postal Code"),
    phone: cell(row, "Provider Business Practice Location Address Telephone Number"),
  };
  const any = Object.values(parts).some((value) => value.length > 0);
  return any ? parts : null;
}

function taxonomiesFrom(row: Record<string, string>): TaxonomyHit[] {
  const hits: TaxonomyHit[] = [];
  for (let index = 1; index <= 15; index += 1) {
    const code = cell(row, `Healthcare Provider Taxonomy Code_${index}`);
    if (!code) continue;
    const primarySwitch = cell(row, `Healthcare Provider Primary Taxonomy Switch_${index}`).toUpperCase();
    hits.push({
      code,
      desc: null,
      primary: primarySwitch === "Y" || primarySwitch === "X",
    });
  }
  return hits;
}

export async function loadDisseminationHits(filePath: string): Promise<RawHit[]> {
  const hits: RawHit[] = [];
  let checkedHeader = false;
  for await (const row of iterateCsvObjects(filePath)) {
    if (!checkedHeader) {
      const missing = REQUIRED.filter((name) => !(name in row));
      if (missing.length > 0) {
        throw new Error(
          `Dissemination CSV is missing required columns: ${missing.join(", ")}. Use the npidata_pfile CSV from the monthly V.2 zip, not the weekly file alone and not the deactivation report.`,
        );
      }
      checkedHeader = true;
    }
    const entity = cell(row, "Entity Type Code");
    const enumerationType = entity === "1" ? "NPI-1" : entity === "2" ? "NPI-2" : entity;
    const organization = cell(row, "Provider Organization Name (Legal Business Name)");
    const person = [cell(row, "Provider First Name"), cell(row, "Provider Last Name (Legal Name)")]
      .filter((part) => part.length > 0)
      .join(" ");
    hits.push({
      npi: cell(row, "NPI"),
      enumerationType,
      name: organization || person,
      status: null,
      deactivationDate: cell(row, "NPI Deactivation Date") || null,
      reactivationDate: cell(row, "NPI Reactivation Date") || null,
      taxonomies: taxonomiesFrom(row),
      location: addressFrom(row),
      mailing: null,
    });
  }
  return hits.filter((hit) => hit.npi);
}
