import { digitsOnly } from '../nppes/normalize';

/**
 * Where a provider's fax goes.
 *
 * The practice fax is the default: a referral to Dr. Smith arrives on the
 * office machine. `useOwnFax` sends to the provider's own line instead. When
 * that is on and no provider fax is on file the send falls back to the practice
 * and says so, rather than silently dropping.
 */

export interface FaxProvider {
  id: string;
  name: string;
  faxNumber: string | null;
  useOwnFax: boolean;
}

export interface FaxPractice {
  id: string;
  name: string;
  faxNumber: string | null;
}

export interface FaxTarget {
  providerId: string;
  providerName: string;
  number: string | null;
  level: 'provider' | 'practice';
  /** `useOwnFax` was set but the provider has no fax, so the practice was used. */
  fellBack: boolean;
}

export function normalizeFax(value: string | null | undefined): string | null {
  const digits = digitsOnly(value ?? '');
  if (digits.length < 10) return null;
  const last10 = digits.slice(-10);
  return /^0+$/.test(last10) ? null : last10;
}

export function resolveFaxTarget(provider: FaxProvider, practice: FaxPractice): FaxTarget {
  const own = normalizeFax(provider.faxNumber);
  const office = normalizeFax(practice.faxNumber);

  if (provider.useOwnFax && own) {
    return { providerId: provider.id, providerName: provider.name, number: own, level: 'provider', fellBack: false };
  }
  return {
    providerId: provider.id,
    providerName: provider.name,
    number: office,
    level: 'practice',
    fellBack: provider.useOwnFax && !own,
  };
}

export interface FaxSend {
  number: string;
  level: 'provider' | 'practice';
  /** Everyone the single page is addressed to. */
  providerNames: string[];
  providerIds: string[];
}

export interface FaxPlan {
  sends: FaxSend[];
  /** Providers with no reachable fax at either level. */
  unreachable: FaxTarget[];
  /** Sends that fell back from a provider line to the office. */
  fellBack: number;
}

/**
 * Collapse targets so one number receives one fax.
 *
 * Twenty-four providers at one practice share one machine. Sending twenty-four
 * pages to it costs twenty-four times as much and reads as junk fax.
 */
export function planFaxSends(targets: FaxTarget[]): FaxPlan {
  const byNumber = new Map<string, FaxSend>();
  const unreachable: FaxTarget[] = [];
  let fellBack = 0;

  for (const target of targets) {
    if (target.fellBack) fellBack += 1;
    if (!target.number) {
      unreachable.push(target);
      continue;
    }
    const existing = byNumber.get(target.number);
    if (existing) {
      existing.providerNames.push(target.providerName);
      existing.providerIds.push(target.providerId);
      // Any number that serves more than one person is an office line,
      // whichever level each provider resolved through.
      existing.level = 'practice';
      continue;
    }
    byNumber.set(target.number, {
      number: target.number,
      level: target.level,
      providerNames: [target.providerName],
      providerIds: [target.providerId],
    });
  }

  return { sends: [...byNumber.values()], unreachable, fellBack };
}
