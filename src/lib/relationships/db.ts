import type { SourceRelationship } from '@prisma/client';
import prisma from '../prisma';
import { SHARED_PRACTICE } from '../org';
import { buildCatalogIndex, type CatalogIndex } from './match';
import { trustBand } from './trs';

/** The shared catalog, indexed for matching. One read per request. */
export async function loadCatalogIndex(): Promise<CatalogIndex> {
  const practices = await prisma.practice.findMany({
    where: { ...SHARED_PRACTICE, hiddenAt: null },
    select: {
      id: true, name: true, placeName: true, zipCode: true, faxNumber: true, phone: true, orgNpis: true,
      providers: { where: { hiddenAt: null }, select: { npiNumber: true } },
    },
  });
  return buildCatalogIndex(
    practices.map((practice) => ({ ...practice, providerNpis: practice.providers.map((provider) => provider.npiNumber) })),
  );
}

export interface RelationshipView {
  id: string;
  name: string;
  practiceName: string | null;
  type: string;
  npi: string | null;
  specialty: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  clinicLocationId: string | null;
  clinicName: string | null;
  catalog: { practiceId: string; name: string; matchedBy: string | null } | null;
  lastReferral: string | null;
  referralVolume: string | null;
  strength: string | null;
  origin: string | null;
  trs: number;
  band: 'trusted' | 'warm' | 'cold';
  createdFrom: string;
}

export function presentRelationship(
  row: SourceRelationship,
  practiceNames: Map<string, string>,
  clinicNames: Map<string, string>,
): RelationshipView {
  return {
    id: row.id,
    name: row.name,
    practiceName: row.practiceName,
    type: row.type,
    npi: row.npi,
    specialty: row.specialty,
    phone: row.phone,
    fax: row.fax,
    email: row.email,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    clinicLocationId: row.clinicLocationId,
    clinicName: row.clinicLocationId ? clinicNames.get(row.clinicLocationId) ?? null : null,
    catalog: row.practiceId
      ? { practiceId: row.practiceId, name: practiceNames.get(row.practiceId) ?? 'Catalog practice', matchedBy: row.matchedBy }
      : null,
    lastReferral: row.lastReferral,
    referralVolume: row.referralVolume,
    strength: row.strength,
    origin: row.origin,
    trs: row.trs,
    band: trustBand(row.trs),
    createdFrom: row.createdFrom,
  };
}

export async function listRelationships(organizationId: string): Promise<RelationshipView[]> {
  const rows = await prisma.sourceRelationship.findMany({
    where: { organizationId },
    orderBy: [{ trs: 'desc' }, { name: 'asc' }],
  });
  const practiceIds = [...new Set(rows.map((row) => row.practiceId).filter((id): id is string => Boolean(id)))];
  const [practices, clinics] = await Promise.all([
    practiceIds.length ? prisma.practice.findMany({ where: { id: { in: practiceIds } }, select: { id: true, name: true } }) : [],
    prisma.clinicLocation.findMany({ where: { organizationId }, select: { id: true, name: true } }),
  ]);
  const practiceNames = new Map(practices.map((row) => [row.id, row.name]));
  const clinicNames = new Map(clinics.map((row) => [row.id, row.name]));
  return rows.map((row) => presentRelationship(row, practiceNames, clinicNames));
}

/** A clinic of this subscriber by id, or by name as a spreadsheet writes it. */
export async function clinicResolver(organizationId: string): Promise<(value: string | null | undefined) => string | null> {
  const clinics = await prisma.clinicLocation.findMany({ where: { organizationId }, select: { id: true, name: true, city: true } });
  return (value) => {
    const text = (value ?? '').trim().toLowerCase();
    if (!text) return null;
    const hit = clinics.find((clinic) => clinic.id === value || clinic.name.toLowerCase() === text || (clinic.city ?? '').toLowerCase() === text)
      ?? clinics.find((clinic) => clinic.name.toLowerCase().includes(text));
    return hit?.id ?? null;
  };
}
