import type { FieldProposal, ResearchExtractInput, ResearchField, ResearchJudge } from './judge';

export interface ResearchLlmConfig {
  provider: 'xai' | 'openai-compat';
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class ResearchConfigError extends Error {}

const FIELDS: ResearchField[] = [
  'website',
  'contactPhone',
  'faxNumber',
  'numberOfProviders',
  'contactEmail',
  'referralFormUrl',
  'preferredChannel',
];

export function readResearchLlmConfig(
  env: Record<string, string | undefined> = process.env,
): ResearchLlmConfig | null {
  const xaiKey = env.XAI_API_KEY?.trim() || env.GROK_API_KEY?.trim() || '';
  if (xaiKey) {
    return {
      provider: 'xai',
      apiKey: xaiKey,
      baseUrl: (env.XAI_BASE_URL?.trim() || 'https://api.x.ai/v1').replace(/\/$/, ''),
      model: env.XAI_MODEL?.trim() || env.GROK_MODEL?.trim() || 'grok-4',
    };
  }

  const apiKey = env.OPENAI_COMPAT_API_KEY?.trim() || '';
  const baseUrl = env.OPENAI_COMPAT_BASE_URL?.trim() || '';
  const model = env.OPENAI_COMPAT_MODEL?.trim() || '';
  if (apiKey && baseUrl && model) {
    return {
      provider: 'openai-compat',
      apiKey,
      baseUrl: baseUrl.replace(/\/$/, ''),
      model,
    };
  }
  return null;
}

export function researchConfigMessage(): string {
  return 'Set XAI_API_KEY or GROK_API_KEY for Grok. Otherwise set OPENAI_COMPAT_API_KEY, OPENAI_COMPAT_BASE_URL, and OPENAI_COMPAT_MODEL.';
}

export function createResearchJudge(
  env: Record<string, string | undefined> = process.env,
  deps?: { fetch?: typeof fetch },
): ResearchJudge {
  // Swap this for createJevJudge() when TypeSafe Jev is the judgment implementation.
  // Page fetch, acceptProposals, and the durable job stay the same.
  const config = readResearchLlmConfig(env);
  if (!config) throw new ResearchConfigError(researchConfigMessage());
  return createLlmJudge(config, deps);
}

export function createLlmJudge(
  config: ResearchLlmConfig,
  deps?: { fetch?: typeof fetch },
): ResearchJudge {
  return {
    id: 'llm',
    extract: (input) => llmExtract(input, config, deps?.fetch ?? fetch),
  };
}

export function proposalsFromModelJson(value: unknown): FieldProposal[] {
  const row = unwrapObject(value);
  if (!row) return [];
  const proposals: FieldProposal[] = [];
  for (const field of FIELDS) {
    const proposal = readProposal(field, row[field]);
    if (proposal) proposals.push(proposal);
  }
  return proposals;
}

async function llmExtract(
  input: ResearchExtractInput,
  config: ResearchLlmConfig,
  fetchImpl: typeof fetch,
): Promise<FieldProposal[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: [
              'Extract practice contact details from public marketing pages.',
              'Never invent a phone, fax, email, or URL. If it is not explicit on the page, return null.',
              'Ignore patient names, reviews of care, and any personal health information.',
              'Return JSON only with keys website, phone, fax, numberOfProviders, referralEmail, referralFormUrl, preferredChannel.',
              'Each present value is {"value": ..., "confidence": 0 to 1}. Use null when unsure.',
              'preferredChannel value is one of fax, portal, call, email.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              practiceName: input.practiceName,
              city: input.city,
              state: input.state,
              links: input.links.slice(0, 30),
              pages: input.pages.map((page) => ({ url: page.url, text: page.text.slice(0, 4_000) })),
            }),
          },
        ],
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`Research model returned ${response.status}. ${detail}`);
    }
    const body = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content ?? '';
    return proposalsFromResearchJson(parseJsonContent(content));
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const raw = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function unwrapObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readProposal(field: ResearchField, raw: unknown): FieldProposal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as { value?: unknown; confidence?: unknown };
  const confidence = typeof row.confidence === 'number' ? row.confidence : Number.NaN;
  if (!Number.isFinite(confidence)) return null;
  if (field === 'numberOfProviders') {
    const value = typeof row.value === 'number' ? row.value : Number(row.value);
    if (!Number.isFinite(value)) return null;
    return { field, value, confidence };
  }
  if (typeof row.value !== 'string' || row.value.trim() === '') return null;
  return { field, value: row.value.trim(), confidence };
}

export function proposalsFromResearchJson(value: unknown): FieldProposal[] {
  const row = unwrapObject(value);
  if (!row) return [];
  const mapped: Record<string, unknown> = {
    website: row.website,
    contactPhone: row.phone ?? row.contactPhone,
    faxNumber: row.fax ?? row.faxNumber,
    numberOfProviders: row.numberOfProviders,
    contactEmail: row.referralEmail ?? row.contactEmail,
    referralFormUrl: row.referralFormUrl,
    preferredChannel: row.preferredChannel,
  };
  return proposalsFromModelJson(mapped);
}
