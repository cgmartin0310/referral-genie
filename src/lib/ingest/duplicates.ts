import { digitsOnly } from '../nppes/normalize';

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
  const street = address.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (street.length < 3) return null;
  return `addr:${street}|${zip5}`;
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
 * Flag rows that share a place id, a 10-digit phone, or a normalized
 * street+ZIP. Rows are not merged.
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
    add(phoneClusterKey(row.phone), row.id);
    add(placeClusterKey(row.placeId), row.id);
    add(addressClusterKey(row.address, row.zipCode), row.id);
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
        const rank = (key: string) => (key.startsWith('place:') ? 0 : key.startsWith('phone:') ? 1 : 2);
        const difference = rank(left) - rank(right);
        return difference !== 0 ? difference : left.localeCompare(right);
      });
    const clusterKey = keys[0] ?? `cluster:${root}`;
    for (const id of ids) keyById.set(id, clusterKey);
  }

  return rows.map((row) => {
    const duplicateClusterKey = keyById.get(row.id) ?? null;
    return {
      id: row.id,
      likelyDuplicate: duplicateClusterKey !== null,
      duplicateClusterKey,
    };
  });
}
