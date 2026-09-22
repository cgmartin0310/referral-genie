import type { ResearchJudge } from './judge';

/**
 * Stub for a later TypeSafe Jev judge.
 * When Jev is connected, `createResearchJudge` should return this implementation
 * instead of the LLM judge. The job still fetches public pages and still
 * refuses phone, fax, and email values that are not in the page text.
 */
export function createJevJudge(): ResearchJudge {
  return {
    id: 'jev',
    async extract() {
      throw new Error('TypeSafe Jev is not connected. Research uses the LLM judge.');
    },
  };
}
