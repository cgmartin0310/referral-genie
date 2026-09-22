import { digitsOnly } from '../nppes/normalize';
import { normalizeStreet } from './address';

export interface ClusterInput {
  id: string;
  phone: string | null;
  placeId: string | null;
  address: string | null;
  zipCode: string | null;
}

export interface ClusterAssignment {
  id: string;
  likelyDuplicate: boolean;
  duplicateClusterKey: string | null;
  /**
   * Shares a phone with a row in a different practice cluster. Worth showing
   * an operator, but not grounds for treating the rows as one practice.
   */
  phoneOnlyMatch: boolean;
}

export function phoneClusterKey(phone: string | null): string | null {
  const digits = digitsOnly(phone ?? '');
  if (digits.length < 10) return null;
  const last10 = digits.slice(-10);
  if (last10 === '0000000000') return null;
  return `phone:${last10}`;
}

export function addressClusterKey(address: string | null, zip: string | null): string | null {
  const zip5 = digitsOnly(zip ?? '').slice(0, 5);
  if (zip5.length !== 5 || !address) return null;
  const { street, unit } = normalizeStreet(address);
  if (street.replace(/ /g, '').length < 3) return null;
  return `addr:${street}${unit ? `|${unit}` : ''}|${zip5}`;
}

/**
 * Street and ZIP without the tenant space. Two rows at one street address that
 * disagree only on suite or floor share this key.
 */
export function baseAddressKey(address: string | null, zip: string | null): string | null {
  const zip5 = digitsOnly(zip ?? '').slice(0, 5);
  if (zip5.length !== 5 || !address) return null;
  const { street } = normalizeStreet(address);
  if (street.replace(/ /g, '').length < 3) return null;
  return `base:${street}|${zip5}`;
}

export function placeClusterKey(placeId: string | null): string | null {
  const trimmed = placeId?.trim() ?? '';
  if (!trimmed) return null;
  return `place:${trimmed}`;
}

class UnionFind {
  private parent = new Map<string, string>();

  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

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
 * Group rows into practice clusters.
 *
 * Identity comes from a Google place id first, then a normalized street, suite,
 * and ZIP. A shared phone does NOT merge rows: practices with several sites
 * publish one main number, and merging on it collapses distinct locations into
 * one oversized practice. Phone agreement is reported as `phoneOnlyMatch` so an
 * operator can still see it.
 */
export function assignDuplicateClusters(rows: ClusterInput[]): ClusterAssignment[] {
  const groups = new Map<string, string[]>();
  const add = (key: string | null, id: string) => {
    if (!key) return;
    const list = groups.get(key) ?? [];
    list.push(id);
    groups.set(key, list);
  };

  for (const row of rows) {
    add(placeClusterKey(row.placeId), row.id);
    add(addressClusterKey(row.address, row.zipCode), row.id);
    // Corroborated merge: one street address, one phone, differing suite or
    // floor. A hospital campus writes its address three ways; a multi-site
    // group shares a phone but not a street, so this never joins two sites.
    const base = baseAddressKey(row.address, row.zipCode);
    const phone = phoneClusterKey(row.phone);
    if (base && phone) add(`${base}+${phone}`, row.id);
  }

  const uf = new UnionFind();
  for (const row of rows) uf.add(row.id);

  const sharedKeys: { key: string; ids: string[] }[] = [];
  for (const [key, ids] of groups) {
    const unique = [...new Set(ids)];
    if (unique.length < 2) continue;
    sharedKeys.push({ key, ids: unique });
    for (let index = 1; index < unique.length; index += 1) {
      uf.union(unique[0], unique[index]);
    }
  }

  const members = new Map<string, string[]>();
  for (const row of rows) {
    const root = uf.find(row.id);
    const list = members.get(root) ?? [];
    list.push(row.id);
    members.set(root, list);
  }

  const keyById = new Map<string, string>();
  for (const [root, ids] of members) {
    if (ids.length < 2) continue;
    const idSet = new Set(ids);
    const keys = sharedKeys
      .filter((entry) => entry.ids.some((id) => idSet.has(id)))
      .map((entry) => entry.key)
      .sort((left, right) => {
        const rank = (key: string) => (key.startsWith('place:') ? 0 : 1);
        const difference = rank(left) - rank(right);
        return difference !== 0 ? difference : left.localeCompare(right);
      });
    const clusterKey = keys[0] ?? `cluster:${root}`;
    for (const id of ids) keyById.set(id, clusterKey);
  }

  // A shared phone across two different practice clusters is a soft signal.
  const rootsByPhone = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = phoneClusterKey(row.phone);
    if (!key) continue;
    const roots = rootsByPhone.get(key) ?? new Set<string>();
    roots.add(uf.find(row.id));
    rootsByPhone.set(key, roots);
  }

  return rows.map((row) => {
    const duplicateClusterKey = keyById.get(row.id) ?? null;
    const phoneKey = phoneClusterKey(row.phone);
    const sharedRoots = phoneKey ? rootsByPhone.get(phoneKey) : undefined;
    return {
      id: row.id,
      likelyDuplicate: duplicateClusterKey !== null,
      duplicateClusterKey,
      phoneOnlyMatch: (sharedRoots?.size ?? 0) > 1,
    };
  });
}
