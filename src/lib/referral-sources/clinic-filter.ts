import { researchCountyFips, sourceIdsMatchingFips } from '../research/clinic-sources';

/**
 * Whether a referral source should appear when filtering Referral Sources by a clinic.
 *
 * Prefer an explicit `clinicLocationId` stamp (set when NPI is pulled from that clinic).
 * For older market-pulled rows with a null clinic, fall back to "source county is in
 * this clinic's market" so Lenoir-style pulls are not invisible until a re-pull.
 */
export function sourceMatchesClinicFilter(
  source: { clinicLocationId: string | null; countyFips: string | null },
  clinicId: string,
  marketCountyFips: readonly string[],
): boolean {
  if (source.clinicLocationId === clinicId) return true;
  if (source.clinicLocationId) return false;
  if (!source.countyFips || marketCountyFips.length === 0) return false;
  const fips = researchCountyFips(marketCountyFips);
  return sourceIdsMatchingFips([{ id: 's', countyFips: source.countyFips }], fips).length > 0;
}
