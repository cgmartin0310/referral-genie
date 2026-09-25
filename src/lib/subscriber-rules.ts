import { isParagonOrgName } from './tenant-rules';

/**
 * Checks on a new subscriber or invitation, before anything reaches Clerk.
 * Pure, so they are tested without Clerk.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export function subscriberInput(
  input: { name?: unknown; ownerEmail?: unknown },
  existingNames: string[],
): { name: string; ownerEmail: string } | { error: string } {
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 80) return { error: 'Enter the company name (2 to 80 characters).' };
  if (isParagonOrgName(name)) return { error: 'Paragon is the program’s own organization.' };
  if (existingNames.some((existing) => existing.trim().toLowerCase() === name.toLowerCase())) {
    return { error: `${name} is already a subscriber.` };
  }
  const ownerEmail = cleanEmail(input.ownerEmail);
  if (!ownerEmail) return { error: 'Enter the owner’s email address.' };
  return { name, ownerEmail };
}

/** Where an invitation link lands: this app's accept page, on the host the request came in on. */
export function inviteRedirectUrl(headers: { get(name: string): string | null }): string | undefined {
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return undefined;
  const proto = headers.get('x-forwarded-proto') ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}/accept-invite`;
}
