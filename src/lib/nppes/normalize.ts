import { zipRole, type CountyMarket } from './counties';
import { taxonomyByCode, allowListCodes } from './taxonomies';
import type { AddressParts, KeptProvider, RawHit } from './types';

const PO_BOX = /\bP\.?\s*O\.?\s*BOX\b|\bPOST\s+OFFICE\s+BOX\b/i;

const QUARANTINE_FLAGS = [
  'deactivated',
  'po_box',
  'missing_address',
  'missing_street',
  'unparseable_city_state_or_zip',
  'zip_outside_county',
  'state_not_target',
  'missing_phone',
] as const;

export type DropReason = 'missing_npi' | 'not_allow_list' | 'secondary_only';

export type KeepDecision =
  | { action: 'drop'; reason: DropReason }
  | { action: 'keep'; provider: KeptProvider };

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
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
  return { zip5: '', valid: false };
}

export function hasUsablePhone(phone: string): boolean {
  return digitsOnly(phone).length >= 10;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
}

export function normalizeEnumeration(value: string): string {
  const upper = value.trim().toUpperCase();
  if (upper === '1' || upper === 'NPI-1' || upper === 'INDIVIDUAL') return 'NPI-1';
  if (upper === '2' || upper === 'NPI-2' || upper === 'ORGANIZATION') return 'NPI-2';
  return value.trim() || 'unknown';
}

function preferCountyLocation(hit: RawHit, county: CountyMarket): AddressParts | null {
  const inCounty = hit.locations.find((row) => {
    const parsed = parsePostal(row.postalCode);
    return parsed.valid && zipRole(county, parsed.zip5) !== null;
  });
  return inCounty ?? hit.locations[0] ?? null;
}

function flagsFor(location: AddressParts | null, deactivated: boolean, county: CountyMarket): string[] {
  const flags: string[] = [];
  if (deactivated) flags.push('deactivated');
  if (!location) {
    flags.push('missing_practice_location', 'missing_address', 'missing_phone', 'unparseable_city_state_or_zip');
    return flags;
  }

  if (!location.address1) {
    flags.push('missing_street', 'missing_address');
  } else if (PO_BOX.test(location.address1) || PO_BOX.test(location.address2)) {
    flags.push('po_box');
  }

  if (!/[A-Za-z]/.test(location.city)) flags.push('missing_city');

  const state = location.state.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) flags.push('invalid_state');
  else if (state !== county.state) flags.push('state_not_target');

  const postal = parsePostal(location.postalCode);
  if (!postal.valid) flags.push('invalid_zip');
  else {
    const role = zipRole(county, postal.zip5);
    if (role === null) flags.push('zip_outside_county');
    if (role === 'boundary') flags.push('boundary_zip');
  }

  if (flags.includes('missing_city') || flags.includes('invalid_state') || flags.includes('invalid_zip')) {
    flags.push('unparseable_city_state_or_zip');
  }

  if (!hasUsablePhone(location.phone)) flags.push('missing_phone');
  return flags;
}

export function isQuarantined(flags: string[]): boolean {
  return QUARANTINE_FLAGS.some((flag) => flags.includes(flag));
}

/**
 * Keep a single NPPES record when its primary taxonomy is on the allow-list.
 * Secondary-only matches and non-PCP/peds hits are dropped, not upserted.
 */
export function classifyHit(hit: RawHit, county: CountyMarket, allowed: Set<string> = allowListCodes()): KeepDecision {
  if (!hit.npi) return { action: 'drop', reason: 'missing_npi' };

  const taxonomies = new Map<string, { desc: string | null; primary: boolean }>();
  for (const taxonomy of hit.taxonomies) {
    const prior = taxonomies.get(taxonomy.code);
    if (!prior) taxonomies.set(taxonomy.code, { desc: taxonomy.desc, primary: taxonomy.primary });
    else if (taxonomy.primary) {
      prior.primary = true;
      prior.desc = taxonomy.desc ?? prior.desc;
    }
  }

  const matched = [...taxonomies.keys()].filter((code) => allowed.has(code));
  if (matched.length === 0) return { action: 'drop', reason: 'not_allow_list' };

  const primaryEntry = [...taxonomies.entries()].find(([, value]) => value.primary);
  const primaryCode = primaryEntry?.[0] ?? null;
  if (!primaryCode || !allowed.has(primaryCode)) return { action: 'drop', reason: 'secondary_only' };

  const group = taxonomyByCode(primaryCode)?.group;
  if (!group) return { action: 'drop', reason: 'not_allow_list' };

  const location = preferCountyLocation(hit, county);
  const deactivated = (hit.status ?? '').toUpperCase() === 'D';
  const addressFlags = flagsFor(location, deactivated, county);
  const postal = location ? parsePostal(location.postalCode) : { zip5: '', valid: false };
  const street = location
    ? [location.address1, location.address2].filter((part) => part.length > 0).join(', ')
    : '';

  return {
    action: 'keep',
    provider: {
      npi: hit.npi,
      name: titleCase(hit.name || `NPI ${hit.npi}`),
      enumerationType: normalizeEnumeration(hit.enumerationType),
      taxonomyCodes: [...taxonomies.keys()].sort(),
      primaryTaxonomyCode: primaryCode,
      primaryTaxonomyDesc: primaryEntry?.[1].desc ?? taxonomyByCode(primaryCode)?.description ?? null,
      sourceType: group,
      address: street ? titleCase(street) : '',
      city: location?.city ? titleCase(location.city) : '',
      state: location?.state.trim().toUpperCase() ?? '',
      zipCode: postal.valid ? postal.zip5 : '',
      phone: location?.phone ?? '',
      fax: location?.fax ?? '',
      addressFlags,
      quarantined: isQuarantined(addressFlags),
    },
  };
}
