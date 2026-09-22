export function researchCountMessage(input: {
  loading: boolean;
  countsKnown: boolean;
  loadError: string | null;
  sourceCount: number;
  withWebsite: number;
  singleSource?: boolean;
}): string {
  if (input.loading && !input.countsKnown) return 'Loading research status…';
  if (!input.countsKnown) {
    const detail = input.loadError?.trim();
    return detail
      ? `Could not load research status. ${detail}`
      : 'Could not load research status.';
  }
  if (input.sourceCount === 0) {
    return input.singleSource
      ? 'This referral source is not available to research.'
      : 'No referral sources are saved for this clinic’s counties yet. Pull referral sources for a county that is ready.';
  }
  if (input.withWebsite === 0) {
    return input.singleSource
      ? 'This referral source has no public website yet. Enrich with Google Places again, or add a website on the source. Research skips sources without one.'
      : `None of the ${input.sourceCount} referral sources have a public website yet. Enrich with Google Places again, or open a source and add a website. Research skips sources without one.`;
  }
  return `${input.withWebsite} of ${input.sourceCount} referral sources have a public website. Sources without one are skipped.`;
}
