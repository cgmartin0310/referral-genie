import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import prisma from '../prisma';
import { DEFAULT_ORGANIZATION_ID } from '../org';
import { optOutLine, stampPdf, type OptOutSettings } from './opt-out';

export async function loadFaxSettings(): Promise<OptOutSettings> {
  const row = await prisma.faxSettings.findUnique({ where: { organizationId: DEFAULT_ORGANIZATION_ID } });
  return { senderName: row?.senderName ?? '', optOutPhone: row?.optOutPhone ?? '', optOutFax: row?.optOutFax ?? '' };
}

export async function saveFaxSettings(input: Partial<OptOutSettings>): Promise<OptOutSettings> {
  const clean = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 120) || null : null);
  const data = {
    senderName: clean(input.senderName),
    optOutPhone: clean(input.optOutPhone),
    optOutFax: clean(input.optOutFax),
  };
  await prisma.faxSettings.upsert({
    where: { organizationId: DEFAULT_ORGANIZATION_ID },
    create: { organizationId: DEFAULT_ORGANIZATION_ID, ...data },
    update: data,
  });
  return loadFaxSettings();
}

export class FaxDocumentError extends Error {}

/**
 * The campaign document with the opt-out line on every page, written next to
 * the original under public/uploads. Returns its path. Only PDFs can be
 * stamped; a Word file must be saved as PDF first.
 */
export async function stampedDocumentPath(documentUrl: string, line: string): Promise<string> {
  const path = documentUrl.replace(/^https?:\/\/[^/]+/, '');
  if (!/^\/uploads\/[^/]+\.pdf$/i.test(path)) {
    throw new FaxDocumentError('The fax document must be a PDF so the opt-out line can go on every page. Save it as PDF and upload it again.');
  }
  const uploads = join(process.cwd(), 'public', 'uploads');
  const bytes = await readFile(join(uploads, path.slice('/uploads/'.length))).catch(() => {
    throw new FaxDocumentError('The fax document is missing on the server. Upload it again.');
  });
  const stamped = await stampPdf(bytes, line);
  await mkdir(uploads, { recursive: true });
  const name = `optout-${randomUUID()}.pdf`;
  await writeFile(join(uploads, name), stamped);
  return `/uploads/${name}`;
}

export { optOutLine };
