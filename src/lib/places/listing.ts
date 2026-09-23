import { countyForZip } from '../npi/county-map';
import { looksLikePersonListing } from './score';

/** Helpers for Google listings: their addresses, their county, whose they are. */

export interface ParsedAddress {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

/** "101 S Carey St, La Grange, NC 28551, USA" into its parts. */
export function parseFormattedAddress(formatted: string): ParsedAddress {
  const parts = formatted.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length > 0 && /^(usa|united states)$/i.test(parts[parts.length - 1])) parts.pop();
  if (parts.length < 2) return { address: parts[0] ?? null, city: null, state: null, zip: null };
  const stateZip = parts.pop() as string;
  const match = stateZip.match(/^([A-Z]{2})\b\s*(\d{5})?/);
  const city = parts.pop() ?? null;
  return {
    address: parts.join(', ') || null,
    city,
    state: match?.[1] ?? null,
    zip: match?.[2] ?? null,
  };
}

/** The listing's ZIP is one the crosswalk places in this county. */
export function listingInCounty(formattedAddress: string | null | undefined, countyFips: string): boolean {
  const zip = parseFormattedAddress(formattedAddress ?? '').zip;
  return Boolean(zip && countyForZip(zip)?.fips === countyFips);
}

/**
 * Words a practice's name carries and a person's does not. A listing with a
 * credential, or with none of these words ("Pranay Kumar Reddy Loka"), is a
 * clinician's own.
 */
const BUSINESS_WORDS = /\b(health|healthcare|medical|medicine|clinic|clinics|care|center|centre|family|pediatric|pediatrics|children|kids|associates|group|practice|physicians|doctors|hospital|hospitals|partners|primary|internal|urgent|wellness|services|network|specialists|institute|llc|pllc|inc|pa|pc)\b/i;

export function isPersonalListing(name: string): boolean {
  if (looksLikePersonListing(name, [])) return true;
  return !BUSINESS_WORDS.test(name);
}
