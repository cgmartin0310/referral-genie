import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * The opt-out line every outbound fax carries, on every page: who sent it,
 * and a free phone and fax number to stop further faxes.
 */

export interface OptOutSettings {
  senderName: string;
  optOutPhone: string;
  optOutFax: string;
}

function formatNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : value.trim();
}

/** Null until a sender, phone, and fax are all set; a campaign does not send without them. */
export function optOutLine(settings: Partial<OptOutSettings> | null | undefined): string | null {
  const sender = settings?.senderName?.trim();
  const phone = settings?.optOutPhone?.trim();
  const fax = settings?.optOutFax?.trim();
  if (!sender || !phone || !fax) return null;
  return `Sent by ${sender}. To stop receiving faxes from us, call ${formatNumber(phone)} or fax ${formatNumber(fax)}, free of charge. We honor requests within 30 days.`;
}

/**
 * What a company's faxes carry, and whether they can go out. Normally the
 * opt-out line, which needs a sender, phone, and fax. A company that states it
 * has prior express permission from every practice it faxes can leave the line
 * off; its sender name still goes on the cover sheet.
 */
export function faxNotice(settings: (Partial<OptOutSettings> & { suppressOptOut?: boolean }) | null | undefined): {
  line: string | null;
  ready: boolean;
  problem: string | null;
} {
  if (settings?.suppressOptOut) {
    const ready = Boolean(settings.senderName?.trim());
    return { line: null, ready, problem: ready ? null : 'Set the sender name in Settings before sending. It goes on the cover sheet.' };
  }
  const line = optOutLine(settings);
  return {
    line,
    ready: line !== null,
    problem: line ? null : 'Set the sender name, opt-out phone, and opt-out fax in Settings before sending. Every fax page carries them.',
  };
}

/** The cover sheet message with the opt-out line after it. */
export function withOptOut(message: string, line: string): string {
  const trimmed = message.trim();
  return trimmed ? `${trimmed}\n\n${line}` : line;
}

const MARGIN = 18;
const MAX_SIZE = 8;
const MIN_SIZE = 5.5;

/**
 * Stamp the line along the bottom edge of every page, on a white band so it
 * reads over whatever the page has there. The type shrinks to fit narrow pages.
 */
export async function stampPdf(bytes: Uint8Array, line: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const page of pdf.getPages()) {
    const { width } = page.getSize();
    const room = width - MARGIN * 2;
    let size = MAX_SIZE;
    while (size > MIN_SIZE && font.widthOfTextAtSize(line, size) > room) size -= 0.25;
    const textWidth = Math.min(font.widthOfTextAtSize(line, size), room);
    const x = Math.max(MARGIN, (width - textWidth) / 2);
    const y = 8;
    page.drawRectangle({ x: x - 4, y: y - 3, width: textWidth + 8, height: size + 6, color: rgb(1, 1, 1) });
    page.drawText(line, { x, y, size, font, color: rgb(0, 0, 0), maxWidth: room });
  }
  return pdf.save();
}
