import { normalizeFax, planFaxSends, resolveFaxTarget } from '../practices/fax';

/**
 * Turn a clinic's referral list into the faxes a campaign will send.
 *
 * Providers at a practice who resolve to the same machine share one target,
 * so an office with 24 providers gets one page addressed to the practice. A
 * provider with their own line, when that setting is on, gets their own page.
 */

export interface AudiencePractice {
  id: string;
  name: string;
  faxNumber: string | null;
  providers: { id: string; name: string; faxNumber: string | null; useOwnFax: boolean }[];
}

export interface AudienceTarget {
  practiceId: string;
  practiceName: string;
  providerIds: string[];
  providerNames: string[];
  faxNumber: string;
  level: 'practice' | 'provider';
  toName: string;
}

export interface Audience {
  targets: AudienceTarget[];
  practices: number;
  providers: number;
  /** Practices, or people at them, with no reachable fax. */
  unreachable: { practiceId: string; practiceName: string; providerNames: string[] }[];
  /** Own-line requests that fell back to the office because no line was on file. */
  fellBack: number;
}

export function buildAudience(practices: AudiencePractice[]): Audience {
  const targets: AudienceTarget[] = [];
  const unreachable: Audience['unreachable'] = [];
  let fellBack = 0;
  let providers = 0;

  for (const practice of practices) {
    if (practice.providers.length === 0) {
      // Org-only or hand-added: one page to the office, if it has a fax.
      const number = normalizeFax(practice.faxNumber);
      if (number) {
        targets.push({
          practiceId: practice.id,
          practiceName: practice.name,
          providerIds: [],
          providerNames: [],
          faxNumber: number,
          level: 'practice',
          toName: practice.name,
        });
      } else {
        unreachable.push({ practiceId: practice.id, practiceName: practice.name, providerNames: [] });
      }
      continue;
    }

    providers += practice.providers.length;
    const plan = planFaxSends(
      practice.providers.map((provider) => resolveFaxTarget(provider, practice)),
    );
    fellBack += plan.fellBack;
    for (const send of plan.sends) {
      targets.push({
        practiceId: practice.id,
        practiceName: practice.name,
        providerIds: send.providerIds,
        providerNames: send.providerNames,
        faxNumber: send.number,
        level: send.level,
        toName: send.level === 'provider' ? send.providerNames[0] : practice.name,
      });
    }
    if (plan.unreachable.length > 0) {
      unreachable.push({
        practiceId: practice.id,
        practiceName: practice.name,
        providerNames: plan.unreachable.map((target) => target.providerName),
      });
    }
  }

  return { targets, practices: practices.length, providers, unreachable, fellBack };
}
