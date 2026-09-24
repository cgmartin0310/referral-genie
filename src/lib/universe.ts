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
