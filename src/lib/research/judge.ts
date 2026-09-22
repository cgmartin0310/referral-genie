/**
 * Judgment seam for practice-site research.
 *
 * `llm` calls an OpenAI-compatible chat API (xAI/Grok when XAI_API_KEY or
 * GROK_API_KEY is set). TypeSafe Jev can implement the same interface later
 * without changing fetch, the field guardrails, or the durable job.
 * See `createJevJudge` in ./jev.ts. Do not call it until Jev is connected.
 */

export type ResearchField =
  | 'website'
  | 'contactPhone'
  | 'faxNumber'
  | 'numberOfProviders'
  | 'contactEmail'
  | 'referralFormUrl'
  | 'preferredChannel';

export interface FieldProposal {
  field: ResearchField;
  value: string | number;
  confidence: number;
}

export interface ResearchPage {
  url: string;
  text: string;
}

export interface ResearchExtractInput {
  practiceName: string;
  city: string | null;
  state: string | null;
  pages: ResearchPage[];
  links: string[];
}

export interface ResearchJudge {
  readonly id: 'llm' | 'jev';
  extract(input: ResearchExtractInput): Promise<FieldProposal[]>;
}
