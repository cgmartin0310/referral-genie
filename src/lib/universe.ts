/** Paragon's outreach ladder for a catalog practice (spec P9a). */
export const OUTREACH_STAGES = [
  { key: 'queued', label: 'Queued' },
  { key: 'outreach_active', label: 'Outreach active' },
  { key: 'rc_identified', label: 'Coordinator identified' },
  { key: 'engaged', label: 'Engaged' },
  { key: 'graduated', label: 'Graduated' },
] as const;

export type OutreachStage = (typeof OUTREACH_STAGES)[number]['key'];

export function isStage(value: unknown): value is OutreachStage {
  return OUTREACH_STAGES.some((stage) => stage.key === value);
}

/**
 * The stage after an edit. Naming the referral coordinator on a practice
 * still queued or in outreach moves it to coordinator identified; an
 * explicit stage always wins.
 */
export function nextStage(current: string, patch: { stage?: unknown; rcName?: unknown }): OutreachStage {
  if (isStage(patch.stage)) return patch.stage;
  const named = typeof patch.rcName === 'string' && patch.rcName.trim() !== '';
  if (named && (current === 'queued' || current === 'outreach_active')) return 'rc_identified';
  return isStage(current) ? current : 'queued';
}

/** What a call can end in (spec P9 call-verify outcomes plus the coordinator conversation). */
export const CALL_OUTCOMES = [
  { key: 'rc_reached', label: 'Reached the referral coordinator' },
  { key: 'rc_named', label: 'Got the coordinator\'s name, not reached' },
  { key: 'gatekeeper', label: 'Front desk, no coordinator' },
  { key: 'voicemail', label: 'Voicemail' },
  { key: 'no_answer', label: 'No answer' },
  { key: 'callback', label: 'Asked for a call back' },
  { key: 'fax_confirmed', label: 'Confirmed the fax number' },
  { key: 'wrong_number', label: 'Wrong number' },
  { key: 'dnc_request', label: 'Asked not to be contacted' },
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number]['key'];

export function isCallOutcome(value: unknown): value is CallOutcome {
  return CALL_OUTCOMES.some((outcome) => outcome.key === value);
}

/**
 * The ladder stage after a call. Any call starts outreach on a queued
 * practice; learning or reaching the coordinator marks them identified;
 * reaching them again once identified counts as engaged. A later stage is
 * never walked back.
 */
export function stageAfterCall(current: string, outcome: CallOutcome): OutreachStage {
  const order: OutreachStage[] = ['queued', 'outreach_active', 'rc_identified', 'engaged', 'graduated'];
  const at = Math.max(0, order.indexOf(current as OutreachStage));
  let target: OutreachStage = 'outreach_active';
  if (outcome === 'rc_named') target = 'rc_identified';
  if (outcome === 'rc_reached') target = current === 'rc_identified' ? 'engaged' : 'rc_identified';
  return order[Math.max(at, order.indexOf(target))];
}

export const DEFAULT_CALL_SCRIPT =
  'Hi, this is {caller} with Paragon. We work with local pediatric therapy providers (speech, occupational, and physical therapy). ' +
  'Who handles therapy referrals for {practice}? ... Could I get their name and the best number or fax for referrals? ' +
  'We will send a short update on availability, and you will see status back on every referral. ' +
  'If you would rather we not contact you, just say so and we will stop.';
