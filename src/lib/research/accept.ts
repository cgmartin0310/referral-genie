import type { FieldProposal, ResearchField } from './judge';

const MIN_CONFIDENCE: Record<ResearchField, number> = {
  website: 0.7,
  contactPhone: 0.85,
  faxNumber: 0.85,
  numberOfProviders: 0.85,
  contactEmail: 0.8,
  referralFormUrl: 0.8,
  preferredChannel: 0.8,
};

const CHANNELS = new Set(['fax', 'portal', 'call', 'email']);

export type RejectReason = 'low_confidence' | 'not_on_page';

export interface AcceptResult {
  updates: Partial<Record<ResearchField, string | number>>;
  accepted: { field: ResearchField; confidence: number }[];
  rejected: number;
  /** Why each unused proposal was dropped, so a run can say what it saw. */
  rejections: { field: ResearchField; reason: RejectReason }[];
  /** Proposals for fields that already had a value or were edited by a person. */
  skippedFilled: number;
}

export function acceptProposals(input: {
  current: Partial<Record<ResearchField, unknown>>;
  overriddenFields: string[];
  pageText: string;
  links: string[];
  fetchedUrls: string[];
  proposals: FieldProposal[];
}): AcceptResult {
  const blocked = new Set(input.overriddenFields);
  const updates: AcceptResult['updates'] = {};
  const accepted: AcceptResult['accepted'] = [];
  const rejections: AcceptResult['rejections'] = [];
  let rejected = 0;
  let skippedFilled = 0;

  for (const proposal of input.proposals) {
    if (blocked.has(proposal.field) || !isBlank(input.current[proposal.field])) {
      skippedFilled += 1;
      continue;
    }
    if (!isConfident(proposal)) {
      rejected += 1;
      rejections.push({ field: proposal.field, reason: 'low_confidence' });
      continue;
    }
    if (!supportedByPage(proposal, input.pageText, input.links, input.fetchedUrls)) {
      rejected += 1;
      rejections.push({ field: proposal.field, reason: 'not_on_page' });
      continue;
    }
    updates[proposal.field] = proposal.field === 'numberOfProviders'
      ? Number(proposal.value)
      : proposal.field === 'preferredChannel'
        ? String(proposal.value).trim().toLowerCase()
        : String(proposal.value).trim();
    accepted.push({ field: proposal.field, confidence: proposal.confidence });
  }

  return { updates, accepted, rejected, rejections, skippedFilled };
}

function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'number') return !Number.isFinite(value) || value <= 0;
  return String(value).trim() === '';
}

function isConfident(proposal: FieldProposal): boolean {
  return Number.isFinite(proposal.confidence) && proposal.confidence >= MIN_CONFIDENCE[proposal.field];
}

function supportedByPage(
  proposal: FieldProposal,
  pageText: string,
  links: string[],
  fetchedUrls: string[],
): boolean {
  const text = pageText.toLowerCase();
  if (proposal.field === 'contactPhone' || proposal.field === 'faxNumber') {
    return phoneInText(String(proposal.value), pageText);
  }
  if (proposal.field === 'contactEmail') {
    const email = String(proposal.value).trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && text.includes(email);
  }
  if (proposal.field === 'website') {
    const url = normalizeUrl(String(proposal.value));
    return url != null && fetchedUrls.some((fetched) => normalizeUrl(fetched) === url);
  }
  if (proposal.field === 'referralFormUrl') {
    const url = normalizeUrl(String(proposal.value));
    return url != null && links.some((link) => normalizeUrl(link) === url);
  }
  if (proposal.field === 'numberOfProviders') {
    const count = Number(proposal.value);
    if (!Number.isInteger(count) || count < 1 || count > 100) return false;
    return new RegExp(`(^|\\D)${count}(\\D|$)`).test(pageText);
  }
  if (proposal.field === 'preferredChannel') {
    const channel = String(proposal.value).trim().toLowerCase();
    if (!CHANNELS.has(channel)) return false;
    if (channel === 'fax') return /\bfax\b/i.test(pageText);
    if (channel === 'portal') return /portal|online referral|referral form/i.test(pageText);
    if (channel === 'call') return /\b(call|phone)\b/i.test(pageText);
    return /\b(e-?mail)\b/i.test(pageText);
  }
  return false;
}

function phoneInText(phone: string, text: string): boolean {
  const digits = phone.replace(/\D/g, '');
  const last10 = digits.length >= 10 ? digits.slice(-10) : '';
  if (last10.length !== 10 || /^0+$/.test(last10)) return false;
  return text.replace(/\D/g, '').includes(last10);
}

function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}
