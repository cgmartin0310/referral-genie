import { zipRole, type CountyMarket } from "./counties.js";
import { taxonomyByCode, allowListCodes } from "./taxonomies.js";
import type { AddressParts, NormalizedProvider, RawHit } from "./types.js";

const PO_BOX = /\bP\.?\s*O\.?\s*BOX\b|\bPOST\s+OFFICE\s+BOX\b/i;

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function parsePostal(raw: string): { zip5: string; valid: boolean } {
  const trimmed = raw.trim();
  if (/^\d{5}(-\d{4})?$/.test(trimmed)) {
    return { zip5: trimmed.slice(0, 5), valid: true };
  }
  const digits = digitsOnly(trimmed);
  if (digits.length === 5 || digits.length === 9) {
    return { zip5: digits.slice(0, 5), valid: true };
  }
  return { zip5: "", valid: false };
}

export function hasUsablePhone(phone: string): boolean {
  return digitsOnly(phone).length >= 10;
}

function isDeactivated(hit: RawHit): boolean {
  if ((hit.status ?? "").toUpperCase() === "D") return true;
  const deactivated = (hit.deactivationDate ?? "").trim().length > 0;
  const reactivated = (hit.reactivationDate ?? "").trim().length > 0;
  return deactivated && !reactivated;
}

function preferCountyLocation(hits: RawHit[], county: CountyMarket): AddressParts | null {
  const locations = hits.map((hit) => hit.location).filter((row): row is AddressParts => row !== null);
  const inCounty = locations.find((row) => {
    const parsed = parsePostal(row.postalCode);
    return parsed.valid && zipRole(county, parsed.zip5) !== null;
  });
  return inCounty ?? locations[0] ?? null;
}

function flagsFor(provider: {
  location: AddressParts | null;
  deactivated: boolean;
  matchedOnSecondaryOnly: boolean;
  county: CountyMarket;
}): string[] {
  const flags: string[] = [];
  if (provider.deactivated) flags.push("deactivated");
  if (provider.matchedOnSecondaryOnly) flags.push("matched_on_secondary_only");

  const location = provider.location;
  if (!location) {
    flags.push("missing_practice_location");
    flags.push("missing_address");
    flags.push("missing_phone");
    flags.push("unparseable_city_state_or_zip");
    return flags;
  }

  if (!location.address1) {
    flags.push("missing_street");
    flags.push("missing_address");
  } else if (PO_BOX.test(location.address1) || PO_BOX.test(location.address2)) {
    flags.push("po_box");
  }

  if (!/[A-Za-z]/.test(location.city)) {
    flags.push("missing_city");
  }

  const state = location.state.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) {
    flags.push("invalid_state");
  } else if (state !== provider.county.state) {
    flags.push("state_not_target");
  }

  const postal = parsePostal(location.postalCode);
  if (!postal.valid) {
    flags.push("invalid_zip");
  } else {
    const role = zipRole(provider.county, postal.zip5);
    if (role === null) flags.push("zip_outside_county");
    if (role === "boundary") flags.push("boundary_zip");
  }

  if (flags.includes("missing_city") || flags.includes("invalid_state") || flags.includes("invalid_zip")) {
    flags.push("unparseable_city_state_or_zip");
  }

  if (!hasUsablePhone(location.phone)) {
    flags.push("missing_phone");
  }

  return flags;
}

export interface NormalizeStats {
  providers: NormalizedProvider[];
  rawHitCount: number;
  uniqueNpiBeforeTaxonomyFilter: number;
  duplicateNpiCount: number;
  extraDuplicateHits: number;
  droppedNotInAllowList: number;
}

export function normalizeHits(hits: RawHit[], county: CountyMarket): NormalizeStats {
  const allowed = allowListCodes();
  const groups = new Map<string, RawHit[]>();
  for (const hit of hits) {
    if (!hit.npi) continue;
    const existing = groups.get(hit.npi);
    if (existing) existing.push(hit);
    else groups.set(hit.npi, [hit]);
  }

  let duplicateNpiCount = 0;
  let extraDuplicateHits = 0;
  for (const group of groups.values()) {
    if (group.length > 1) {
      duplicateNpiCount += 1;
      extraDuplicateHits += group.length - 1;
    }
  }

  const providers: NormalizedProvider[] = [];
  let droppedNotInAllowList = 0;

  for (const [npi, group] of groups) {
    const taxonomies = new Map<string, { desc: string | null; primary: boolean }>();
    for (const hit of group) {
      for (const taxonomy of hit.taxonomies) {
        const prior = taxonomies.get(taxonomy.code);
        if (!prior) {
          taxonomies.set(taxonomy.code, { desc: taxonomy.desc, primary: taxonomy.primary });
        } else if (taxonomy.primary) {
          prior.primary = true;
          prior.desc = taxonomy.desc ?? prior.desc;
        }
      }
    }

    const matched = [...taxonomies.keys()].filter((code) => allowed.has(code));
    if (matched.length === 0) {
      droppedNotInAllowList += 1;
      continue;
    }

    const primaryEntry = [...taxonomies.entries()].find(([, value]) => value.primary);
    const primaryCode = primaryEntry?.[0] ?? null;
    const primaryDesc = primaryEntry?.[1].desc ?? null;
    const matchedOnSecondaryOnly = primaryCode === null || !allowed.has(primaryCode);
    const groupCode = matchedOnSecondaryOnly ? matched[0] : primaryCode!;
    const matchedGroup = taxonomyByCode(groupCode)?.group ?? null;
    const location = preferCountyLocation(group, county);
    const deactivated = group.some(isDeactivated);
    const name = group.find((hit) => hit.name)?.name ?? "";
    const enumerationType = group.find((hit) => hit.enumerationType)?.enumerationType || "unknown";
    const postal = location ? parsePostal(location.postalCode) : { zip5: "", valid: false };
    const flagList = flagsFor({ location, deactivated, matchedOnSecondaryOnly, county });

    providers.push({
      npi,
      enumerationType: enumerationType || "unknown",
      name,
      deactivated,
      primaryTaxonomyCode: primaryCode,
      primaryTaxonomyDesc: primaryDesc,
      matchedTaxonomyCodes: matched,
      matchedGroup,
      matchedOnSecondaryOnly,
      city: location?.city ?? "",
      state: location?.state ?? "",
      zip5: postal.valid ? postal.zip5 : "",
      address1: location?.address1 ?? "",
      hasPhone: location ? hasUsablePhone(location.phone) : false,
      flags: flagList,
      rawHitCount: group.length,
    });
  }

  providers.sort((a, b) => a.npi.localeCompare(b.npi));

  return {
    providers,
    rawHitCount: hits.filter((hit) => hit.npi).length,
    uniqueNpiBeforeTaxonomyFilter: groups.size,
    duplicateNpiCount,
    extraDuplicateHits,
    droppedNotInAllowList,
  };
}

const DIRT = [
  "missing_address",
  "missing_phone",
  "unparseable_city_state_or_zip",
  "po_box",
  "deactivated",
  "zip_outside_county",
  "state_not_target",
] as const;

export function isPlacesMatchReady(provider: NormalizedProvider): boolean {
  return !DIRT.some((flag) => provider.flags.includes(flag));
}
