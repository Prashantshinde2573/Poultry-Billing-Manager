import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { geminiConfigured } from '@/lib/ai/gemini';
import { AskChat } from '@/components/ask/ask-chat';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ask' };

export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const ctx = await requireCtx({ office: true, owner: true, module: 'ai' });
  const { t } = await getT();
  const supabase = await createClient();
  const { c } = await searchParams;
  const [{ data: quota }, { data: chat }] = await Promise.all([
    supabase.rpc('ai_quota', { p_business_id: ctx.businessId }),
    c && /^[0-9a-f-]{36}$/.test(c) ? supabase.rpc('ai_chat_get', { p_business_id: ctx.businessId, p_id: c }) : Promise.resolve({ data: null }),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      {geminiConfigured()
        ? <AskChat key={c ?? 'new'} used={Number(quota?.used ?? 0)} limit={Number(quota?.limit ?? 300)} initial={chat as any} />
        : <p className="card p-5 text-[15px] text-ink-muted">{t('ask.off')}</p>}
    </div>
  );
}
