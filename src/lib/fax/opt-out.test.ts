import { faxNotice } from './opt-out';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { optOutLine, stampPdf, withOptOut } from './opt-out';

const settings = { senderName: 'Boom Therapy Group', optOutPhone: '7042403500', optOutFax: '888-555-0140' };

describe('fax opt-out line', () => {
  it('names the sender and a free phone and fax to stop faxes', () => {
    assert.equal(
      optOutLine(settings),
      'Sent by Boom Therapy Group. To stop receiving faxes from us, call (704) 240-3500 or fax (888) 555-0140, free of charge. We honor requests within 30 days.',
    );
  });

  it('is missing until the sender, phone, and fax are all set', () => {
    assert.equal(optOutLine(null), null);
    assert.equal(optOutLine({ ...settings, optOutFax: ' ' }), null);
  });

  it('follows the cover sheet message', () => {
    assert.equal(withOptOut('Please see the attached.', 'LINE'), 'Please see the attached.\n\nLINE');
    assert.equal(withOptOut('', 'LINE'), 'LINE');
  });

  it('stamps every page and keeps the page count', async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    for (let index = 0; index < 3; index += 1) {
      source.addPage([612, 792]).drawText(`Page ${index + 1}`, { x: 72, y: 700, size: 14, font });
    }
    const stamped = await stampPdf(await source.save(), optOutLine(settings) as string);
    const reloaded = await PDFDocument.load(stamped);
    assert.equal(reloaded.getPageCount(), 3);

    // Read the text back where pdftotext is installed (it is on build machines with poppler).
    let text: string | null = null;
    try {
      const dir = mkdtempSync(join(tmpdir(), 'optout-'));
      const file = join(dir, 'stamped.pdf');
      writeFileSync(file, stamped);
      text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
    } catch {
      text = null;
    }
    if (text !== null) {
      const pages = text.split('\f').filter((page) => page.trim());
      assert.equal(pages.length, 3);
      for (const page of pages) assert.match(page.replace(/\s+/g, ' '), /To stop receiving faxes from us, call \(704\) 240-3500/);
    }
  });
});

describe('leaving the opt-out line off', () => {
  const full = { senderName: 'Boom Therapy', optOutPhone: '704-240-3500', optOutFax: '888-555-0140' };
  it('prints the line by default, and needs all three fields', () => {
    assert.equal(faxNotice(full).ready, true);
    assert.match(faxNotice(full).line ?? '', /To stop receiving faxes/);
    assert.equal(faxNotice({ senderName: 'Boom Therapy' }).ready, false);
  });
  it('prints nothing when the company has consent, but still needs a sender', () => {
    assert.deepEqual(faxNotice({ ...full, suppressOptOut: true }), { line: null, ready: true, problem: null });
    assert.equal(faxNotice({ senderName: 'Boom Therapy', suppressOptOut: true }).ready, true);
    assert.equal(faxNotice({ suppressOptOut: true }).ready, false);
  });
});
