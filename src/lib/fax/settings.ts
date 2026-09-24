import prisma from '../prisma';
import { optOutLine, type OptOutSettings } from './opt-out';

/** Each subscriber's own sender and opt-out numbers; faxes carry its name, never another's. */
export async function loadFaxSettings(organizationId: string): Promise<OptOutSettings> {
  const row = await prisma.faxSettings.findUnique({ where: { organizationId } });
  return { senderName: row?.senderName ?? '', optOutPhone: row?.optOutPhone ?? '', optOutFax: row?.optOutFax ?? '' };
}

export async function saveFaxSettings(input: Partial<OptOutSettings>, organizationId: string): Promise<OptOutSettings> {
  const clean = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 120) || null : null);
  const data = {
    senderName: clean(input.senderName),
    optOutPhone: clean(input.optOutPhone),
    optOutFax: clean(input.optOutFax),
  };
  await prisma.faxSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
  return loadFaxSettings(organizationId);
}

export { optOutLine };
