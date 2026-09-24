import { cleanAnswers, LAST_REFERRAL, ORIGIN, REFERRAL_VOLUME, STRENGTH, type RelationshipAnswers } from './trs';

/**
 * A subscriber's spreadsheet of existing referral sources, saved as CSV.
 * Handles quoted fields with commas, doubled quotes, and line breaks (what
 * Excel and Google Sheets write).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

/** Header names people use for each column, lower-cased with punctuation removed. */
const COLUMNS: Record<string, string[]> = {
  name: ['name', 'provider', 'provider name', 'physician', 'doctor', 'referral source', 'source', 'contact name', 'provideroffice', 'provider office'],
  practiceName: ['practice', 'practice name', 'organization', 'office', 'clinic', 'group'],
  npi: ['npi', 'npi number', 'npi #'],
  specialty: ['specialty', 'speciality', 'taxonomy'],
  phone: ['phone', 'phone number', 'telephone', 'office phone'],
  fax: ['fax', 'fax number', 'fax #', 'office fax'],
  email: ['email', 'e-mail', 'email address'],
  address: ['address', 'street', 'address 1', 'street address'],
  city: ['city', 'town'],
  state: ['state', 'st'],
  zip: ['zip', 'zip code', 'zipcode', 'postal code'],
  type: ['type', 'source type'],
  lastReferral: ['last referral', 'last referral date', 'most recent referral'],
  referralVolume: ['referrals', 'referral count', 'number of referrals', 'prior referrals', '# of referrals', '# referrals', 'total referrals', 'referrals sent'],
  strength: ['relationship', 'relationship strength', 'strength'],
  origin: ['relationship origin', 'origin', 'developed', 'where developed'],
  clinic: ['location', 'clinic location', 'our clinic', 'your clinic'],
};

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9# ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface ImportRow {
  line: number;
  name: string;
  practiceName: string | null;
  npi: string | null;
  specialty: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  type: 'practice' | 'physician' | 'school' | 'other';
  clinic: string | null;
  answers: RelationshipAnswers;
}

export interface ImportParse {
  rows: ImportRow[];
  rejected: { line: number; reason: string }[];
  /** Columns recognized, by field, for the report. */
  columns: string[];
}

const digits = (value: string) => value.replace(/\D/g, '');

/** A date, a count, or a phrase in the last-referral column, as an answer key. */
function lastReferralKey(value: string, today: Date): string | null {
  const text = norm(value);
  if (!text) return null;
  const direct = LAST_REFERRAL.find((option) => norm(option.label) === text || option.key === text);
  if (direct) return direct.key;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime()) && /\d/.test(value)) {
    const days = (today.getTime() - date.getTime()) / 86_400_000;
    if (days < 0) return null;
    if (days <= 90) return 'within_90d';
    if (days <= 180) return '91_180d';
    if (days <= 365) return '6_12m';
    if (days <= 730) return '12_24m';
    return 'over_24m';
  }
  if (/never|none|no/.test(text)) return 'none';
  return null;
}

function volumeKey(value: string): string | null {
  const text = norm(value);
  if (!text) return null;
  const direct = REFERRAL_VOLUME.find((option) => norm(option.label) === text || option.key === text);
  if (direct) return direct.key;
  const count = Number(text.replace(/[^0-9]/g, ''));
  if (!/\d/.test(text) || !Number.isFinite(count)) return null;
  if (count === 0) return 'never';
  if (count === 1) return 'one';
  if (count <= 4) return 'two_four';
  if (count <= 9) return 'five_nine';
  return 'ten_plus';
}

function optionKey(options: readonly { key: string; label: string }[], value: string): string | null {
  const text = norm(value);
  if (!text) return null;
  return options.find((option) => option.key === text || norm(option.label) === text)?.key ?? null;
}

function typeOf(value: string, hasNpi: boolean, practiceName: string | null): ImportRow['type'] {
  const text = norm(value);
  if (/school/.test(text)) return 'school';
  if (/physician|doctor|provider|individual/.test(text)) return 'physician';
  if (/practice|office|clinic|group|organization/.test(text)) return 'practice';
  if (text) return 'other';
  return hasNpi || practiceName ? 'physician' : 'practice';
}

export function parseImport(text: string, today: Date = new Date()): ImportParse {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], rejected: [{ line: 1, reason: 'The file is empty' }], columns: [] };
  const header = table[0].map(norm);
  const index: Record<string, number> = {};
  for (const [field, names] of Object.entries(COLUMNS)) {
    const found = header.findIndex((cell) => names.includes(cell));
    if (found >= 0) index[field] = found;
  }
  if (index.name === undefined && index.practiceName !== undefined) {
    // A sheet of practices only: the practice is the source.
    index.name = index.practiceName;
    delete index.practiceName;
  }
  if (index.name === undefined) {
    return {
      rows: [],
      rejected: [{ line: 1, reason: 'No name column. Name the first column Name, Provider, or Practice.' }],
      columns: Object.keys(index),
    };
  }

  const rows: ImportRow[] = [];
  const rejected: ImportParse['rejected'] = [];
  table.slice(1).forEach((cells, offset) => {
    const line = offset + 2;
    const cell = (field: string) => (index[field] === undefined ? '' : (cells[index[field]] ?? '').trim());
    const name = cell('name');
    if (!name) {
      rejected.push({ line, reason: 'No name' });
      return;
    }
    const npiDigits = digits(cell('npi'));
    if (cell('npi') && npiDigits.length !== 10) {
      rejected.push({ line, reason: `NPI "${cell('npi')}" is not 10 digits` });
      return;
    }
    const phone = digits(cell('phone'));
    const fax = digits(cell('fax'));
    const practiceName = cell('practiceName') || null;
    rows.push({
      line,
      name: name.slice(0, 200),
      practiceName: practiceName?.slice(0, 200) ?? null,
      npi: npiDigits || null,
      specialty: cell('specialty') || null,
      phone: phone.length >= 10 ? phone.slice(-10) : null,
      fax: fax.length >= 10 ? fax.slice(-10) : null,
      email: cell('email') || null,
      address: cell('address') || null,
      city: cell('city') || null,
      state: cell('state').toUpperCase().slice(0, 2) || null,
      zip: digits(cell('zip')).slice(0, 5) || null,
      type: typeOf(cell('type'), Boolean(npiDigits), practiceName),
      clinic: cell('clinic') || null,
      answers: cleanAnswers({
        lastReferral: lastReferralKey(cell('lastReferral'), today),
        referralVolume: volumeKey(cell('referralVolume')),
        strength: optionKey(STRENGTH, cell('strength')),
        origin: optionKey(ORIGIN, cell('origin')),
      }),
    });
  });
  return { rows, rejected, columns: Object.keys(index) };
}

export const TEMPLATE_CSV =
  'Name,Practice,NPI,Specialty,Phone,Fax,Email,Address,City,State,ZIP,Type,Last referral,Referrals,Relationship,Location\n' +
  'Joan Perry,Kinston Pediatric Associates,1234567893,Pediatrics,252-522-0335,252-522-4016,,2509 N Queen St,Kinston,NC,28501,Physician,2026-08-15,5,Knows us professionally,Kinston\n';
