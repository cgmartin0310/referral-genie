/** Paragon's stages for a clinic-owner lead. Kept apart so pages can import it without the grouping code. */
export const CO_STAGES = [
  { key: 'queued', label: 'Queued' },
  { key: 'outreach_active', label: 'Outreach active' },
  { key: 'engaged', label: 'Engaged' },
  { key: 'signup_started', label: 'Signup started' },
  { key: 'converted', label: 'Converted' },
  { key: 'not_interested', label: 'Not interested' },
] as const;
