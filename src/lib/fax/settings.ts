import prisma from '../prisma';
import { optOutLine, type OptOutSettings } from './opt-out';

export class FaxSettingsError extends Error {}

export interface FaxSettings extends OptOutSettings {
  /** No opt-out line: the company stated it has prior express permission from every practice it faxes. */
  suppressOptOut: boolean;
  consentAttestedAt: string | null;
  consentAttestedBy: string | null;
}

/** Each subscriber's own sender and opt-out numbers; faxes carry its name, never another's. */
export async function loadFaxSettings(organizationId: string): Promise<FaxSettings> {
  const row = await prisma.faxSettings.findUnique({ where: { organizationId } });
  return {
    senderName: row?.senderName ?? '',
    optOutPhone: row?.optOutPhone ?? '',
    optOutFax: row?.optOutFax ?? '',
    suppressOptOut: row?.suppressOptOut ?? false,
    consentAttestedAt: row?.consentAttestedAt?.toISOString() ?? null,
    consentAttestedBy: row?.consentAttestedBy ?? null,
  };
}

/**
 * Save the sender and opt-out numbers. Leaving the opt-out line off takes an
 * explicit statement (consentAttested: true) that the company has prior
 * express permission from every practice it faxes; who made it, and when, is kept.
 */
export async function saveFaxSettings(
  input: Partial<OptOutSettings> & { suppressOptOut?: unknown; consentAttested?: unknown },
  organizationId: string,
  actor: string,
): Promise<FaxSettings> {
  const clean = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 120) || null : null);
  const current = await prisma.faxSettings.findUnique({ where: { organizationId } });
  const suppress = input.suppressOptOut === undefined ? current?.suppressOptOut ?? false : input.suppressOptOut === true;
  if (suppress && !current?.suppressOptOut && input.consentAttested !== true) {
    throw new FaxSettingsError('To leave the opt-out line off, confirm you have permission from every practice you fax.');
  }
  const data = {
    senderName: clean(input.senderName),
    optOutPhone: clean(input.optOutPhone),
    optOutFax: clean(input.optOutFax),
    suppressOptOut: suppress,
    ...(suppress && !current?.suppressOptOut ? { consentAttestedAt: new Date(), consentAttestedBy: actor } : {}),
  };
  await prisma.faxSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
  return loadFaxSettings(organizationId);
}

export { optOutLine };
