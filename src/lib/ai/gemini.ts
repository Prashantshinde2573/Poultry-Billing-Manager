import 'server-only';

export const geminiConfigured = () => !!process.env.GEMINI_API_KEY;
const MODEL = () => process.env.GEMINI_MODEL || 'gemini-3.6-flash';

export type GPart = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: unknown }; thoughtSignature?: string; thought?: boolean };
export type GContent = { role: 'user' | 'model'; parts: GPart[] };

/** One generateContent call (REST). Key stays on the server. */
export async function generate(body: { contents: GContent[]; systemInstruction: string; tools: unknown[] }): Promise<GContent> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(`${process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com'}/v1beta/models/${MODEL()}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: body.contents,
        systemInstruction: { parts: [{ text: body.systemInstruction }] },
        tools: [{ functionDeclarations: body.tools }],
      }),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${json?.error?.message ?? 'request failed'}`);
    const content = json?.candidates?.[0]?.content as GContent | undefined;
    if (!content?.parts) throw new Error(`Gemini returned no answer (${json?.candidates?.[0]?.finishReason ?? json?.promptFeedback?.blockReason ?? 'empty'})`);
    return { role: 'model', parts: content.parts };
  } finally {
    clearTimeout(timer);
  }
}
