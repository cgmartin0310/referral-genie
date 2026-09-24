import { readFile } from 'fs/promises';
import { join } from 'path';
import prisma from '../prisma';
import { stampPdf } from './opt-out';

/**
 * Campaign fax documents, stored in the database. Files written under
 * public/uploads are lost on every deploy, so nothing is kept there.
 */

export const MAX_FAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const DOCUMENT_PATH = /^\/api\/documents\/([A-Za-z0-9_-]+)$/;
const LEGACY_PATH = /^\/uploads\/([^/]+\.pdf)$/i;

export class FaxDocumentError extends Error {}

export function documentUrl(id: string): string {
  return `/api/documents/${id}`;
}

function isPdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 1024).includes('%PDF-');
}

/** Save an uploaded PDF for one subscriber. Only PDFs: the opt-out line is drawn on every page. */
export async function saveFaxDocument(organizationId: string, name: string, bytes: Buffer) {
  if (bytes.length === 0) throw new FaxDocumentError('The file is empty.');
  if (bytes.length > MAX_FAX_DOCUMENT_BYTES) throw new FaxDocumentError('The file is larger than 10MB.');
  if (!isPdf(bytes)) {
    throw new FaxDocumentError('Upload a PDF. The opt-out line is added to every page, which needs a PDF. Save the file as PDF and upload it again.');
  }
  const row = await prisma.faxDocument.create({
    data: { organizationId, name: name.slice(0, 200) || 'document.pdf', contentType: 'application/pdf', size: bytes.length, bytes },
    select: { id: true, name: true },
  });
  return { id: row.id, name: row.name, url: documentUrl(row.id) };
}

export async function loadFaxDocument(id: string, organizationId: string) {
  return prisma.faxDocument.findFirst({ where: { id, organizationId } });
}

/**
 * A campaign's document as bytes. Campaigns made before documents moved to
 * the database point at /uploads/…; while such a file is still on this
 * server it is copied into the database and the campaign repointed.
 */
export async function campaignDocument(
  campaign: { id: string; documentUrl: string | null; documentName: string | null },
  organizationId: string,
  repoint: (url: string) => Promise<unknown>,
): Promise<{ name: string; bytes: Buffer }> {
  const path = (campaign.documentUrl ?? '').replace(/^https?:\/\/[^/]+/, '');
  const stored = path.match(DOCUMENT_PATH);
  if (stored) {
    const row = await loadFaxDocument(stored[1], organizationId);
    if (!row) throw new FaxDocumentError('The fax document is missing. Upload it again on the campaign.');
    return { name: row.name, bytes: Buffer.from(row.bytes) };
  }
  const legacy = path.match(LEGACY_PATH);
  if (!legacy) {
    throw new FaxDocumentError('The fax document must be a PDF so the opt-out line can go on every page. Save it as PDF and upload it again on the campaign.');
  }
  const bytes = await readFile(join(process.cwd(), 'public', 'uploads', legacy[1])).catch(() => null);
  if (!bytes) {
    throw new FaxDocumentError('The fax document was lost when the app was updated. Upload it again on the campaign (Edit campaign), then send.');
  }
  const saved = await saveFaxDocument(organizationId, campaign.documentName || legacy[1], bytes);
  await repoint(saved.url);
  return { name: saved.name, bytes };
}

/** The document with the opt-out line on every page, ready to attach to each fax. */
export async function stampedCampaignDocument(
  campaign: { id: string; documentUrl: string | null; documentName: string | null },
  organizationId: string,
  line: string,
  repoint: (url: string) => Promise<unknown>,
): Promise<{ fileName: string; bytes: Buffer }> {
  const document = await campaignDocument(campaign, organizationId, repoint);
  const stamped = await stampPdf(document.bytes, line).catch(() => {
    throw new FaxDocumentError('The fax document could not be read as a PDF. Save it as PDF again and upload it on the campaign.');
  });
  const base = document.name.replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60) || 'document';
  return { fileName: `${base}.pdf`, bytes: Buffer.from(stamped) };
}
