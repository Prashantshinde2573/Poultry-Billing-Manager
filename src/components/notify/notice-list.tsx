import Link from 'next/link';
import { Bell, CheckCircle2, Crown, MessageSquareText, Truck, Wallet, AlertTriangle, CreditCard } from 'lucide-react';
import type { TFn } from '@/lib/i18n';
import { fmtDate, fmtDateTime, inr, type Locale } from '@/lib/format';
import type { Notice } from '@/lib/data/notifications';
import { Empty } from '@/components/ui/core';

const ICON: Record<string, { Icon: typeof Bell; cls: string }> = {
  COLLECTION_PENDING: { Icon: Wallet, cls: 'bg-[#FCF3E0] text-[#9A5B05]' },
  DELIVERY_DELIVERED: { Icon: CheckCircle2, cls: 'bg-[#E3F6EC] text-good' },
  DELIVERY_PARTIAL: { Icon: Truck, cls: 'bg-[#FCF3E0] text-[#9A5B05]' },
  DELIVERY_FAILED: { Icon: AlertTriangle, cls: 'bg-[#FCEAE6] text-bad' },
  PLAN_RENEWED: { Icon: Crown, cls: 'bg-aqua-soft text-aqua-deep' },
  PLAN_ENDING: { Icon: Crown, cls: 'bg-[#FCEAE6] text-bad' },
  LEAD_NEW: { Icon: MessageSquareText, cls: 'bg-aqua-soft text-aqua-deep' },
  RENEWAL_REQUEST: { Icon: Wallet, cls: 'bg-[#FCF3E0] text-[#9A5B05]' },
  PAYMENT_ONLINE: { Icon: CreditCard, cls: 'bg-[#E3F6EC] text-good' },
};

export function noticeText(n: Notice, t: TFn, locale: Locale) {
  const p = n.params ?? {};
  const vals: Record<string, string | number> = {
    ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v == null ? '' : String(v)])),
    amount: p.amount != null ? inr(p.amount, { decimals: false }) : '',
    till: p.till ? fmtDate(p.till, locale) : '',
    by: p.by || '—', party: p.party || '—', city: p.city || '', n: p.n ?? '',
  };
  const key = `notif.${n.kind}` as any;
  const txt = t(key, vals);
  return { title: txt === key ? n.kind : txt, sub: p.trip ? t('notif.trip', { trip: p.trip }) : p.reason ? String(p.reason) : '' };
}

export function NoticeList({ items, t, locale }: { items: Notice[]; t: TFn; locale: Locale }) {
  if (!items.length) return <Empty icon={<Bell className="h-6 w-6" />} title={t('notif.empty')} />;
  const fresh = items.filter((i) => i.unread);
  const old = items.filter((i) => !i.unread);
  const block = (list: Notice[], label: string) => list.length > 0 && (
    <section>
      <h2 className="mb-2 px-1 text-[13.5px] font-semibold text-ink-muted">{label}</h2>
      <ul className="card divide-y divide-line overflow-hidden">
        {list.map((n) => {
          const { Icon, cls } = ICON[n.kind] ?? { Icon: Bell, cls: 'bg-mint text-ink' };
          const { title, sub } = noticeText(n, t, locale);
          const body = (
            <div className="flex gap-3 px-4 py-3.5">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] ${cls}`}><Icon className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className={`break-words text-[15px] leading-snug ${n.unread ? 'font-semibold' : ''}`}>{title}</p>
                <p className="mt-0.5 text-[13px] text-ink-muted">{sub ? `${sub} · ` : ''}{fmtDateTime(n.at, locale)}</p>
              </div>
              {n.unread && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-aqua" aria-label={t('notif.new')} />}
            </div>
          );
          return <li key={n.id}>{n.link ? <Link href={n.link} className="press block hover:bg-mint/60">{body}</Link> : body}</li>;
        })}
      </ul>
    </section>
  );
  return <div className="space-y-6">{block(fresh, t('notif.new'))}{block(old, fresh.length ? t('notif.earlier') : '')}</div>;
}
