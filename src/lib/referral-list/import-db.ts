import { randomUUID } from 'crypto';
import prisma from '../prisma';
import { clinicResolver, loadCatalogIndex } from '../relationships/db';
import { parseImport, type ImportRow } from '../relationships/import';
import { matchToCatalog, nameKey } from '../relationships/match';
import { trustScore } from '../relationships/trs';
import { tierFromTrustScore, type Tier } from './tiers';

export interface ListImportReport {
  /** New entries on a clinic's list. */
  added: number;
  /** Rows already on that clinic's list (their score is updated when the sheet gives one). */
  alreadyListed: number;
  /** Rows found in the shared catalog. */
  matched: number;
  /** Rows the catalog lacks, added as the subscriber's own practices. */
  addedByHand: number;
  scored: number;
  rejected: { line: number; reason: string }[];
  columns: string[];
}

/** The sheet's own score, else one from its relationship answers, else none. */
function tierFor(row: ImportRow): Tier | null {
  if (row.tier) return row.tier;
  const answered = Object.values(row.answers).some((value) => value !== null && value !== undefined);
  return answered ? tierFromTrustScore(trustScore(row.answers)) : null;
}

/**
 * Put a spreadsheet of referral sources onto the subscriber's clinic lists.
 * A row goes on the clinic its Location column names, else the chosen
 * clinic. Rows the catalog has join as catalog practices; the rest become
 * the subscriber's own practices (reused when the same name and ZIP, or the
 * same fax, was added before).
 */
export async function importToLists(input: {
  organizationId: string;
  actor: string;
  csv: string;
  defaultClinicId: string | null;
}): Promise<ListImportReport> {
  const parsed = parseImport(input.csv);
  const report: ListImportReport = { added: 0, alreadyListed: 0, matched: 0, addedByHand: 0, scored: 0, rejected: [...parsed.rejected], columns: parsed.columns };
  if (parsed.rows.length === 0) return report;

  const index = await loadCatalogIndex();
  const resolveClinic = await clinicResolver(input.organizationId);
  const defaultClinic = input.defaultClinicId ? resolveClinic(input.defaultClinicId) : null;
  const own = await prisma.practice.findMany({
    where: { organizationId: input.organizationId, practiceKey: { startsWith: 'own:' }, hiddenAt: null },
    select: { id: true, name: true, zipCode: true, faxNumber: true },
  });
  const ownByNameZip = new Map(own.map((row) => [`${nameKey(row.name)}|${row.zipCode ?? ''}`, row.id]));
  const ownByFax = new Map(own.filter((row) => row.faxNumber).map((row) => [row.faxNumber!.replace(/\D/g, '').slice(-10), row.id]));

  for (const row of parsed.rows) {
    // A Location that names none of the clinics is refused, never sent to the default.
    const named = row.clinic ? resolveClinic(row.clinic) : null;
    if (row.clinic && !named) {
      report.rejected.push({ line: row.line, reason: `No clinic named "${row.clinic}"` });
      continue;
    }
    const clinicId = named ?? defaultClinic;
    if (!clinicId) {
      report.rejected.push({ line: row.line, reason: 'No clinic chosen for this row' });
      continue;
    }
    const match = matchToCatalog(row, index);
    let practiceId = match?.practiceId ?? null;
    if (practiceId) {
      report.matched += 1;
    } else {
      const name = row.practiceName || row.name;
      practiceId = ownByNameZip.get(`${nameKey(name)}|${row.zip ?? ''}`) ?? (row.fax ? ownByFax.get(row.fax) : undefined) ?? null;
      if (!practiceId) {
        const created = await prisma.practice.create({
          data: {
            organizationId: input.organizationId,
            practiceKey: `own:${randomUUID()}`,
            formedBy: 'manual',
            name,
            address: row.address,
            city: row.city,
            state: row.state,
            zipCode: row.zip,
            phone: row.phone,
            faxNumber: row.fax,
          },
          select: { id: true },
        });
        practiceId = created.id;
        ownByNameZip.set(`${nameKey(name)}|${row.zip ?? ''}`, practiceId);
        if (row.fax) ownByFax.set(row.fax, practiceId);
        report.addedByHand += 1;
      }
    }

    const tier = tierFor(row);
    const scoreData = tier ? { tier, tierSetAt: new Date(), tierSetBy: input.actor } : {};
    const existing = await prisma.clinicPractice.findUnique({
      where: { clinicLocationId_practiceId: { clinicLocationId: clinicId, practiceId } },
      select: { id: true },
    });
    if (existing) {
      if (tier) await prisma.clinicPractice.update({ where: { id: existing.id }, data: scoreData });
      report.alreadyListed += 1;
    } else {
      await prisma.clinicPractice.create({
        data: { organizationId: input.organizationId, clinicLocationId: clinicId, practiceId, addedFrom: 'import', ...scoreData },
      });
      report.added += 1;
    }
    if (tier) report.scored += 1;
  }
  return report;
}
