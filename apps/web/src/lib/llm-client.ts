// Provider-agnostic LLM caller. Mirrors reflect/app/llm.py's shape but
// in TS, env-driven, no SDKs (just fetch). Three providers supported:
// openai, anthropic, openrouter. Returns parsed JSON for prompts that
// expect structured output, or raw text for chat completions.

export interface LlmConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'openrouter';
  apiKey: string;
  model: string;
}

export function getLlmConfig(): LlmConfig {
  const provider = (process.env.LLM_PROVIDER ?? 'openrouter') as LlmConfig['provider'];
  const apiKey =
    process.env.LLM_API_KEY ??
    (provider === 'openrouter' ? process.env.LLM_API_KEY_OPENROUTER ?? '' : '');
  return {
    enabled: (process.env.LLM_ENABLED ?? 'false').toLowerCase() === 'true',
    provider,
    apiKey,
    // Default to Gemini 2.0 Flash on OpenRouter's free tier — currently
    // less saturated than the Llama one, so fewer upstream 429s. Override
    // via LLM_MODEL env var (e.g. paid `openai/gpt-4o-mini` once credit is
    // loaded).
    model: process.env.LLM_MODEL ?? 'google/gemini-2.0-flash-exp:free',
  };
}

interface JsonObject { [key: string]: unknown }

function tryParseJsonObject(raw: string): JsonObject | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as JsonObject;
  } catch { /* fall through */ }
  // Fallback: extract first {...} block.
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as JsonObject;
    } catch { /* fall through */ }
  }
  return null;
}

/** Call the configured LLM with a single user prompt that expects JSON back. */
export async function callJsonPrompt(prompt: string, cfg: LlmConfig): Promise<JsonObject> {
  if (cfg.provider === 'openai') {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1024,
    };
    if (!cfg.model.startsWith('gpt-5')) body.temperature = 0.3;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`openai ${r.status}: ${await r.text()}`);
    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('openai returned non-string content');
    const parsed = tryParseJsonObject(content);
    if (!parsed) throw new Error('openai returned non-JSON content');
    return parsed;
  }

  if (cfg.provider === 'openrouter') {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://reflect-live-delta.vercel.app',
        'X-Title': 'reflect-live',
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        // OpenRouter routes free models across multiple providers; some
        // (e.g. Venice) cap responses at 16k tokens but OpenRouter's
        // default max_tokens is the *model's* full context window —
        // which the provider then rejects with a 400. Cap explicitly.
        max_tokens: 1024,
      }),
    });
    if (!r.ok) throw new Error(`openrouter ${r.status}: ${await r.text()}`);
    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('openrouter returned non-string content');
    const parsed = tryParseJsonObject(content);
    if (!parsed) return { summary: content, observations: [], recommendations: [] };
    return parsed;
  }

  // anthropic
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const text: unknown = data?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('anthropic returned non-string content');
  const parsed = tryParseJsonObject(text);
  if (!parsed) return { summary: text, observations: [], recommendations: [] };
  return parsed;
}
