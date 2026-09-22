import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { acceptProposals } from './accept';
import { extractLinks, fetchPracticePages, htmlToText, practiceUrl } from './html';
import { proposalsFromResearchJson, readResearchLlmConfig } from './llm';
import { nextIngestProvenance, researchProvenance, stripOverriddenFields } from '../provenance';

const PAGE = `
  <html><body>
    <h1>River Pediatrics</h1>
    <p>Call the office at (252) 555-0142. Fax referrals to 252-555-0199.</p>
    <p>Our 4 physicians welcome referrals. Send records to referrals@river.example.</p>
    <a href="/refer">Referral form</a>
    <a href="https://evil.example/phish">Ignore</a>
  </body></html>
`;

describe('practice page research', () => {
  it('reads public marketing text and same-site links', async () => {
    assert.equal(htmlToText(PAGE).includes('252-555-0199'), true);
    const links = extractLinks(PAGE, 'https://river.example/');
    assert.equal(links.some((link) => link.href === 'https://river.example/refer'), true);
    assert.equal(practiceUrl('http://127.0.0.1/admin'), null);
    assert.equal(practiceUrl('river.example'), 'https://river.example/');

    const bundle = await fetchPracticePages('https://river.example', {
      fetch: async (input) => {
        const url = String(input);
        const html = url.endsWith('/refer')
          ? '<html><body><p>Submit the referral form. Fax is preferred.</p></body></html>'
          : PAGE;
        return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
      },
    });
    assert.equal(bundle.pages.length >= 1, true);
    assert.equal(bundle.text.includes('Fax referrals'), true);
  });

  it('fills a fax only when the page contains that number', () => {
    const kept = acceptProposals({
      current: { faxNumber: null, contactPhone: null, contactEmail: null, numberOfProviders: null, preferredChannel: null, referralFormUrl: null },
      overriddenFields: [],
      pageText: htmlToText(PAGE),
      links: ['https://river.example/refer'],
      fetchedUrls: ['https://river.example/'],
      proposals: [
        { field: 'faxNumber', value: '252-555-0199', confidence: 0.95 },
        { field: 'faxNumber', value: '252-555-0000', confidence: 0.99 },
        { field: 'contactPhone', value: '252-555-0142', confidence: 0.9 },
        { field: 'contactEmail', value: 'referrals@river.example', confidence: 0.9 },
        { field: 'numberOfProviders', value: 4, confidence: 0.9 },
        { field: 'preferredChannel', value: 'fax', confidence: 0.9 },
        { field: 'referralFormUrl', value: 'https://river.example/refer', confidence: 0.9 },
        { field: 'website', value: 'https://invented.example', confidence: 0.99 },
      ],
    });
    assert.equal(kept.updates.faxNumber, '252-555-0199');
    assert.equal(kept.updates.contactPhone, '252-555-0142');
    assert.equal(kept.updates.contactEmail, 'referrals@river.example');
    assert.equal(kept.updates.numberOfProviders, 4);
    assert.equal(kept.updates.preferredChannel, 'fax');
    assert.equal(kept.updates.referralFormUrl, 'https://river.example/refer');
    assert.equal(kept.updates.website, undefined);
    assert.equal(kept.rejected >= 1, true);
  });

  it('leaves overridden and already filled fields alone', () => {
    const kept = acceptProposals({
      current: { faxNumber: '252-555-0100', contactPhone: null },
      overriddenFields: ['contactPhone'],
      pageText: htmlToText(PAGE),
      links: [],
      fetchedUrls: [],
      proposals: [
        { field: 'faxNumber', value: '252-555-0199', confidence: 0.99 },
        { field: 'contactPhone', value: '252-555-0142', confidence: 0.99 },
      ],
    });
    assert.deepEqual(kept.updates, {});
    assert.equal(kept.rejected, 0);
  });

  it('drops a low-confidence fax instead of guessing', () => {
    const kept = acceptProposals({
      current: { faxNumber: null },
      overriddenFields: [],
      pageText: htmlToText(PAGE),
      links: [],
      fetchedUrls: [],
      proposals: [{ field: 'faxNumber', value: '252-555-0199', confidence: 0.4 }],
    });
    assert.equal(kept.updates.faxNumber, undefined);
    assert.equal(kept.rejected, 1);
  });

  it('prefers an xAI key and parses model JSON', () => {
    const xai = readResearchLlmConfig({
      XAI_API_KEY: 'xai-key',
      XAI_MODEL: 'grok-test',
      OPENAI_COMPAT_API_KEY: 'other',
      OPENAI_COMPAT_BASE_URL: 'https://example.test/v1',
      OPENAI_COMPAT_MODEL: 'other-model',
    });
    assert.equal(xai?.provider, 'xai');
    assert.equal(xai?.model, 'grok-test');
    assert.equal(readResearchLlmConfig({}), null);

    const proposals = proposalsFromResearchJson({
      fax: { value: '252-555-0199', confidence: 0.91 },
      phone: null,
      referralEmail: { value: 'referrals@river.example', confidence: 0.88 },
    });
    assert.deepEqual(proposals.map((row) => row.field), ['faxNumber', 'contactEmail']);
  });

  it('keeps research confidence when a later ingest runs, and a human edit wins', () => {
    const researched = researchProvenance(
      { origin: 'places', confidence: 0.8, overriddenBy: null, overriddenAt: null, overriddenFields: [] },
      [{ field: 'faxNumber', confidence: 0.95 }],
    );
    assert.equal(researched.fieldConfidence?.faxNumber, 0.95);
    const ingested = nextIngestProvenance(researched, 0.7, 'places');
    assert.equal(ingested.origin, 'mixed');
    assert.equal(ingested.fieldConfidence?.faxNumber, 0.95);
    const update = stripOverriddenFields(
      { faxNumber: '252-555-0000', contactPhone: '252-555-0142' },
      ['faxNumber'],
    );
    assert.equal(update.faxNumber, undefined);
    assert.equal(update.contactPhone, '252-555-0142');
  });
});
