'use server';
import { getCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { todayIST } from '@/lib/format';
import { fromDbError } from '@/lib/errors';
import { logError } from '@/lib/report-error';
import { generate, geminiConfigured, type GContent } from '@/lib/ai/gemini';
import { TOOL_DECLARATIONS, runTool } from '@/lib/ai/tools';

export interface ChatTurn { role: 'user' | 'assistant'; text: string }

const LANG = { mr: 'Marathi (मराठी, Devanagari script)', hi: 'Hindi (हिंदी, Devanagari script)', en: 'simple English' } as const;

/** Ask a question about the business. Answers only from the business's own data, read-only. */
export async function askAI(history: ChatTurn[]): Promise<{ ok: true; text: string; used: number; limit: number } | { ok: false; code: string; detail?: string }> {
  const ctx = await getCtx();
  if (!ctx?.businessId) return { ok: false, code: 'UNAUTHENTICATED' };
  if (ctx.role !== 'owner') return { ok: false, code: 'FORBIDDEN' };
  if (!ctx.has('ai')) return { ok: false, code: 'PLAN_FEATURE' };
  if (!geminiConfigured()) return { ok: false, code: 'AI_OFF' };
  const turns = (Array.isArray(history) ? history : []).filter((h) => h && typeof h.text === 'string' && h.text.trim()).slice(-12)
    .map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', text: h.text.slice(0, 2000) }) as ChatTurn);
  if (!turns.length || turns[turns.length - 1].role !== 'user') return { ok: false, code: 'VALIDATION' };

  const supabase = await createClient();
  const q = await supabase.rpc('ai_take_question', { p_business_id: ctx.businessId });
  if (q.error) return fromDbError(q.error) as any;

  const { locale } = await getT();
  const today = todayIST();
  const system = [
    `You are the assistant inside PoulGo, a poultry trading app, for the business "${ctx.businessName}". Today is ${today} (India).`,
    'The business buys live birds from farms (suppliers), loads them in a vehicle, delivers to customers (hotels, shops), weighs at delivery and bills per kg. Sizes are like small / medium / large.',
    'Answer ONLY from the tools. Always call a tool before giving any number; never guess or invent figures, names or dates. If the tools do not have it, say so plainly.',
    'Tools are read-only. You cannot create, edit or delete anything — if asked, tell the owner which screen in the app to use.',
    `Reply in ${LANG[locale]} unless the user writes in another language. The users are traders, many with little schooling: use short, simple sentences, no jargon, no long paragraphs.`,
    'Money in Indian format with ₹ (e.g. ₹1,38,577). Weight in kg. Use a short list when comparing several parties. Bold the key number with **.',
    'Dates: "this month" = from the 1st of the current month to today; "last month" = the whole previous month; "this week" = Monday to today.',
    'If a name matches more than one party, ask which one.',
  ].join('\n');

  const contents: GContent[] = turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] }));
  try {
    for (let round = 0; round < 6; round++) {
      const reply = await generate({ contents, systemInstruction: system, tools: TOOL_DECLARATIONS });
      contents.push(reply); // send back unchanged (keeps thought signatures)
      const calls = reply.parts.filter((p) => p.functionCall);
      if (!calls.length) {
        const text = reply.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
        return { ok: true, text: text || '—', used: q.data.used, limit: q.data.limit };
      }
      const results = [];
      for (const c of calls) {
        let response: unknown;
        try { response = await runTool(c.functionCall!.name, (c.functionCall!.args ?? {}) as Record<string, any>, ctx, locale, today); }
        catch (e) { response = { error: (e as Error).message.slice(0, 200) }; }
        results.push({ functionResponse: { name: c.functionCall!.name, response: { result: response } } });
      }
      contents.push({ role: 'user', parts: results });
    }
    return { ok: true, text: locale === 'en' ? 'That needed too many steps. Please ask a shorter question.' : 'उत्तर शोधायला खूप टप्पे लागले. कृपया छोटा प्रश्न विचारा.', used: q.data.used, limit: q.data.limit };
  } catch (e) {
    await logError({ source: 'action', message: (e as Error).message, code: 'AI', path: '/app/ask' });
    return { ok: false, code: 'NETWORK' };
  }
}
