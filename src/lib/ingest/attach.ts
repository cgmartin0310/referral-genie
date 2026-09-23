import { addressClusterKey, baseAddressKey, phoneClusterKey } from './duplicates';
import { normalizeStreet } from './address';
import { listingNamesPerson } from '../places/score';

/**
 * Nesting NPI records under the practices Google lists.
 *
 * Google lists one practice many times: the clinic, each clinician in their
 * own name, the building's old name, a sister clinic sharing the front desk.
 * Listings that share a phone at one site are one practice, and the one
 * people review most stands for it. A clinician's own listing belongs to the
 * clinic that shares its website, else its phone or street.
 *
 * An NPI record joins the listing in its own name first, then a listing at
 * its site (street, and suite when both give one), preferring one that also
 * shares its phone. A phone alone never crosses to a different suite.
 */

export interface AttachPlace {
  placeId: string;
  name: string;
  address: string | null;
  city: string | null;
  zipCode: string | null;
  phone: string | null;
  website?: string | null;
  reviewCount: number | null;
  personal: boolean;
}

export interface AttachSource {
  id: string;
  name?: string | null;
  address: string | null;
  city: string | null;
  zipCode: string | null;
  phone: string | null;
}

interface Site {
  base: string | null;
  unit: string | null;
  phone: string | null;
}

function siteOf(row: { address: string | null; zipCode: string | null; city: string | null; phone: string | null }): Site {
  return {
    base: baseAddressKey(row.address, row.zipCode, row.city),
    unit: row.address ? normalizeStreet(row.address).unit : null,
    phone: phoneClusterKey(row.phone),
  };
}

/** One street, and one suite when both name a suite. */
export function sameSite(left: Site, right: Site): boolean {
  if (!left.base || left.base !== right.base) return false;
  return !left.unit || !right.unit || left.unit === right.unit;
}

function siteKey(place: AttachPlace): string | null {
  return addressClusterKey(place.address, place.zipCode, place.city);
}

function websiteKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
}

function byReviews(left: AttachPlace, right: AttachPlace): number {
  const difference = (right.reviewCount ?? 0) - (left.reviewCount ?? 0);
  return difference !== 0 ? difference : left.name.localeCompare(right.name);
}

class UnionFind {
  private parent = new Map<string, string>();
  find(id: string): string {
    const parent = this.parent.get(id) ?? id;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }
  union(left: string, right: string) {
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) this.parent.set(b, a);
  }
}

/**
 * For every listing, the listing that stands for its practice: itself, or
 * the most-reviewed clinic listing it merges or folds into.
 */
export function foldListings(places: AttachPlace[]): Map<string, string> {
  const sites = new Map(places.map((place) => [place.placeId, siteOf(place)]));
  const clinics = places.filter((place) => !place.personal);

  // Clinic listings sharing a phone at one site are one practice.
  const uf = new UnionFind();
  for (let i = 0; i < clinics.length; i += 1) {
    for (let j = i + 1; j < clinics.length; j += 1) {
      const a = sites.get(clinics[i].placeId) as Site;
      const b = sites.get(clinics[j].placeId) as Site;
      if (a.phone && a.phone === b.phone && sameSite(a, b)) uf.union(clinics[i].placeId, clinics[j].placeId);
    }
  }
  const members = new Map<string, AttachPlace[]>();
  for (const clinic of clinics) {
    const root = uf.find(clinic.placeId);
    members.set(root, [...(members.get(root) ?? []), clinic]);
  }
  const out = new Map<string, string>();
  for (const group of members.values()) {
    const lead = [...group].sort(byReviews)[0];
    for (const clinic of group) out.set(clinic.placeId, lead.placeId);
  }

  // A clinician's own listing folds into the clinic that shares its website,
  // else one at its site sharing its phone, else one sharing its phone.
  for (const place of places) {
    if (!place.personal) continue;
    const site = sites.get(place.placeId) as Site;
    const atSite = clinics.filter((clinic) => sameSite(site, sites.get(clinic.placeId) as Site));
    const onPhone = clinics.filter((clinic) => site.phone && (sites.get(clinic.placeId) as Site).phone === site.phone);
    const pool = atSite.filter((clinic) => onPhone.includes(clinic));
    const candidates = pool.length > 0 ? pool : atSite.length > 0 ? atSite : onPhone;
    const web = websiteKey(place.website);
    const sameWeb = web ? candidates.filter((clinic) => websiteKey(clinic.website) === web) : [];
    const chosen = [...(sameWeb.length > 0 ? sameWeb : candidates)].sort(byReviews)[0];
    out.set(place.placeId, chosen ? out.get(chosen.placeId) ?? chosen.placeId : place.placeId);
  }
  return out;
}

/** @deprecated Older name; merges clinic listings too. */
export const foldPersonalListings = foldListings;

/**
 * The practice listing each record belongs to, after folding. A record that
 * matches nothing is left out, for a Google lookup of its own.
 */
export function attachSources(
  sources: AttachSource[],
  places: AttachPlace[],
  options: { followElsewhere?: boolean } = {},
): Map<string, string> {
  // Following a person to their own listing elsewhere suits someone working
  // alone; in a group, one person's listing next door must not move the group.
  const followElsewhere = options.followElsewhere ?? true;
  const fold = foldListings(places);
  const sites = new Map(places.map((place) => [place.placeId, siteOf(place)]));
  const rootOf = (place: AttachPlace) => fold.get(place.placeId) ?? place.placeId;
  const byId = new Map(places.map((place) => [place.placeId, place]));

  const out = new Map<string, string>();
  for (const source of sources) {
    const site = siteOf(source);

    // 1. The listing in this person's own name: at their site or phone, or,
    // when they are the only match in the county, wherever Google has them
    // (an NPI address is often the one they left).
    if (source.name) {
      const own = places.filter((place) => place.personal && listingNamesPerson(place.name, source.name as string));
      const near = own.find((place) => {
        const other = sites.get(place.placeId) as Site;
        return sameSite(site, other) || (followElsewhere && site.phone !== null && site.phone === other.phone);
      });
      const chosen = near ?? (followElsewhere && own.length === 1 ? own[0] : undefined);
      if (chosen) {
        out.set(source.id, rootOf(chosen));
        continue;
      }
    }

    // 2. A listing at their site, preferring one on their phone, then the exact
    // suite. Without either, the site's listings count only if they are one practice.
    const atSite = places.filter((place) => sameSite(site, sites.get(place.placeId) as Site));
    const onPhone = atSite.filter((place) => site.phone && (sites.get(place.placeId) as Site).phone === site.phone);
    const exact = atSite.filter((place) => {
      const key = siteKey(place);
      return key !== null && key === addressClusterKey(source.address, source.zipCode, source.city);
    });
    let pool = onPhone.length > 0 ? onPhone : exact.length > 0 ? exact : atSite;

    // 3. No listing at their site: their phone, if it names one practice.
    if (pool.length === 0 && atSite.length === 0 && site.phone) {
      pool = places.filter((place) => (sites.get(place.placeId) as Site).phone === site.phone);
    }
    const roots = [...new Set(pool.map(rootOf))];
    if (roots.length === 1) {
      out.set(source.id, roots[0]);
      continue;
    }
    if (roots.length > 1 && (onPhone.length > 0 || exact.length > 0)) {
      // Several practices on one phone at one site: the one people review.
      const lead = roots.map((id) => byId.get(id) as AttachPlace).sort(byReviews)[0];
      out.set(source.id, lead.placeId);
    }
  }
  return out;
}
