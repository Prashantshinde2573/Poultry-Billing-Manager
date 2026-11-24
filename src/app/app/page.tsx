import Link from 'next/link';
import {
  ArrowDownLeft, ArrowUpRight, HandCoins, Truck, ChevronRight,
  AlertTriangle, ReceiptText, Users, ShoppingBag, Plus, MessageCircle
} from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { localName } from '@/lib/i18n';
import { inrSmart, fmtDate, num, inr } from '@/lib/format';
import { rpc, listParties, recentLedger } from '@/lib/data/queries';
import { Avatar, IconBubble, Row, SectionTitle, Badge } from '@/components/ui/core';
import { waLink } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const ctx = await requireCtx({ office: true });
  const { t, locale } = await getT();
  const [d, customers, recent] = await Promise.all([
    rpc<any>('get_dashboard', ctx),
    listParties(ctx, 'CUSTOMER'),
    recentLedger(ctx, 6)
  ]);

  const pending = d.pending_verification as { count: number; amount: string };
  const people = customers
    .filter((c) => c.status === 'ACTIVE' && Number(c.receivable) > 0)
    .sort((a, b) => Number(b.receivable) - Number(a.receivable))
    .slice(0, 8);

  const activeTrips = (d.active_trips as any[]) ?? [];
  const tripsEnabled = ctx.has('trips');

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 1. PENDING VERIFICATION ALERT (if any driver collected cash to verify) */}
      {pending?.count > 0 && (
        <Link
          href="/app/payments?tab=pending"
          className="press flex items-center gap-3 rounded-[18px] border border-[#F0D29A] bg-[#FCF3E0] px-4 py-3 text-[#7A4A08] shadow-sm"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-[14.5px]">
            {t('dash.pendingVerification')}: <b>{pending.count}</b> · {inrSmart(pending.amount)}
          </span>
          <ChevronRight className="h-5 w-5" />
        </Link>
      )}

      {/* 2. HERO: आजच्या गाड्या / डिलिव्हरी (ACTIVE DELIVERY TRIPS) */}
      {tripsEnabled && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-ink">
              {locale === 'mr' ? '🚚 आजच्या गाड्या (डिलिव्हरी ट्रिप)' : locale === 'hi' ? '🚚 आज की गाड़ियाँ (ट्रिप)' : '🚚 Active Delivery Trips'}
            </h2>
            <Link href="/app/trips" className="text-[13.5px] font-medium text-aqua-deep hover:underline">
              {t('c.viewAll')}
            </Link>
          </div>

          {activeTrips.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-aqua/40 bg-aqua/5 p-5 text-center sm:p-6">
              <span className="mx-auto flex h-13 w-13 items-center justify-center rounded-2xl bg-aqua/15 text-aqua-deep">
                <Truck className="h-7 w-7" />
              </span>
              <h3 className="mt-3 text-[16.5px] font-semibold text-ink">
                {locale === 'mr' ? 'आजची गाडी निघाली का?' : locale === 'hi' ? 'आज की गाड़ी निकली क्या?' : 'Ready to dispatch today?'}
              </h3>
              <p className="mt-1 text-[13px] text-ink-muted">
                {locale === 'mr' ? 'फार्मवरून माल उचलून दुकानांना वाटण्यासाठी नवीन ट्रिप सुरू करा.' : 'Start a trip to lift birds from farm and deliver to shops.'}
              </p>
              <Link
                href="/app/trips/new"
                className="press mt-4 inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-[14px] font-medium text-white shadow-lift hover:bg-ink-soft"
              >
                <Plus className="h-4 w-4" />
                <span>{locale === 'mr' ? 'नवीन गाडी भरा / ट्रिप सुरू करा' : 'Start New Trip'}</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {activeTrips.map((tr) => {
                const percent = tr.customers ? Math.round((tr.delivered / tr.customers) * 100) : 0;
                return (
                  <div key={tr.id} className="card p-5 shadow-sm border border-line">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink text-white">
                          <Truck className="h-6 w-6 text-aqua" />
                        </span>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[17px] font-bold text-ink">{tr.trip_no}</span>
                            <span className="rounded-full bg-mint px-2.5 py-0.5 text-[12px] font-semibold text-ink">
                              {t(`t.s.${tr.status}` as any)}
                            </span>
                          </div>
                          <p className="text-[13px] text-ink-muted">
                            {tr.driver ? `चालक: ${tr.driver}` : '—'} {tr.vehicle ? `· ${tr.vehicle}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="tabular text-[16px] font-bold text-ink">
                          {tr.delivered}/{tr.customers}
                        </span>
                        <p className="text-[11.5px] text-ink-muted">{locale === 'mr' ? 'दुकाने पूर्ण' : 'shops delivered'}</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3.5">
                      <div className="flex justify-between text-[12px] text-ink-muted mb-1">
                        <span>{locale === 'mr' ? 'डिलिव्हरी प्रोग्रेस' : 'Delivery Progress'}</span>
                        <span className="font-medium text-ink">{percent}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-ink/[0.08] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-aqua transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Action Buttons on the Trip */}
                    <div className="mt-4 flex gap-2 pt-3 border-t border-line">
                      <Link
                        href={`/app/trips/${tr.id}`}
                        className="press flex-1 flex items-center justify-center gap-2 rounded-xl bg-ink py-2.5 text-[13.5px] font-medium text-white shadow-sm hover:bg-ink-soft"
                      >
                        <span>{locale === 'mr' ? '📦 दुकानाला माल टाका / डिलिव्हरी' : '📦 Deliver / View Trip'}</span>
                      </Link>
                      <Link
                        href="/app/payments/new"
                        className="press flex items-center justify-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2.5 text-[13.5px] font-medium text-ink hover:bg-mint"
                      >
                        <HandCoins className="h-4 w-4 text-good" />
                        <span>{locale === 'mr' ? 'पैसे जमा' : 'Payment'}</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 3. ४ मुख्य सोपे बटन्स (4 PRIMARY DAILY ACTIONS) */}
      <section>
        <p className="text-[14px] font-semibold text-ink-muted mb-2.5">
          {locale === 'mr' ? 'दैनिक कामे (Daily Actions)' : 'Quick Actions'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/app/trips/new"
            className="card press flex flex-col justify-between p-4 hover:border-aqua/50 transition-colors"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-mint text-ink">
              <Truck className="h-5 w-5" />
            </span>
            <div className="mt-3">
              <p className="text-[15px] font-bold text-ink">
                {locale === 'mr' ? 'नवीन गाडी (ट्रिप)' : 'New Trip'}
              </p>
              <p className="text-[12px] text-ink-muted">
                {locale === 'mr' ? 'फार्मवरून माल भरणे' : 'Dispatch vehicle'}
              </p>
            </div>
          </Link>

          <Link
            href="/app/payments/new"
            className="card press flex flex-col justify-between p-4 hover:border-good/50 transition-colors"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E6F7EF] text-good">
              <HandCoins className="h-5 w-5" />
            </span>
            <div className="mt-3">
              <p className="text-[15px] font-bold text-ink">
                {locale === 'mr' ? 'पैसे जमा' : 'Payment In'}
              </p>
              <p className="text-[12px] text-ink-muted">
                {locale === 'mr' ? 'रोख किंवा UPI जमा' : 'Collect money'}
              </p>
            </div>
          </Link>

          <Link
            href="/app/customers"
            className="card press flex flex-col justify-between p-4 hover:border-indigo-300 transition-colors"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
              <Users className="h-5 w-5" />
            </span>
            <div className="mt-3">
              <p className="text-[15px] font-bold text-ink">
                {locale === 'mr' ? 'ग्राहक उधारी' : 'Customers'}
              </p>
              <p className="text-[12px] text-ink-muted">
                {locale === 'mr' ? 'खाते व WhatsApp बिल' : 'Ledger & dues'}
              </p>
            </div>
          </Link>

          <Link
            href="/app/purchases/new"
            className="card press flex flex-col justify-between p-4 hover:border-amber-300 transition-colors"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FEF3C7] text-[#D97706]">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <div className="mt-3">
              <p className="text-[15px] font-bold text-ink">
                {locale === 'mr' ? 'सप्लायर खरेदी' : 'New Purchase'}
              </p>
              <p className="text-[12px] text-ink-muted">
                {locale === 'mr' ? 'फार्म खरेदी नोंदवणे' : 'Farm purchase'}
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* 4. आजचा ताळेबंद (TODAY'S KEY STATS) */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/app/customers" className="card press p-4 hover:border-bad/40 transition-colors">
          <p className="text-[13px] font-medium text-ink-muted">
            {locale === 'mr' ? 'ग्राहकांकडे बाकी (मार्केट उधारी)' : t('dash.receivable')}
          </p>
          <p className="tabular mt-1 text-[26px] font-bold tracking-tight text-bad">
            {inr(d.receivable_total, { decimals: false })}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {t('dash.customersWithDues', { n: d.customers_with_dues })}
          </p>
        </Link>

        <div className="card p-4">
          <p className="text-[13px] font-medium text-ink-muted">{t('dash.salesToday')}</p>
          <p className="tabular mt-1 text-[26px] font-bold tracking-tight text-ink">
            {inrSmart(d.sales_today)}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {d.bills_today} {t('l.BILL')}
          </p>
        </div>

        <div className="card p-4">
          <p className="text-[13px] font-medium text-ink-muted">{t('dash.receivedToday')}</p>
          <p className="tabular mt-1 text-[26px] font-bold tracking-tight text-good">
            {inrSmart(d.received_today)}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {locale === 'mr' ? 'रोख व UPI जमा' : 'Cash & UPI'}
          </p>
        </div>
      </section>

      {/* 5. उधारी वसुली / तगादा (TOP DUE CUSTOMERS WITH DIRECT WHATSAPP) */}
      {people.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-ink">
              {locale === 'mr' ? 'जास्त उधारी असलेले ग्राहक (Top Dues)' : 'Top Dues'}
            </h2>
            <Link href="/app/customers" className="text-[13.5px] font-medium text-aqua-deep hover:underline">
              {t('c.viewAll')}
            </Link>
          </div>

          <div className="card divide-y divide-line overflow-hidden">
            {people.map((c) => {
              const due = Number(c.receivable);
              const waText = `नमस्कार ${c.name}, आपल्या खात्यावर PoulGo नुसार ${inr(due, { decimals: false })} बाकी आहेत. कृपया खात्री करून जमा करावेत. धन्यवाद!`;
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 p-3.5 hover:bg-mint/30 transition-colors">
                  <Link href={`/app/customers/${c.id}`} className="min-w-0 flex-1 flex items-center gap-3">
                    <Avatar name={c.name} size={42} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[15px] text-ink">{c.name}</p>
                      <p className="text-[12px] text-ink-muted truncate">
                        {c.phone || c.address || '—'}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="tabular font-bold text-[15px] text-bad">
                      {inrSmart(due)}
                    </span>
                    {c.phone ? (
                      <a
                        href={waLink(c.phone, waText)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="WhatsApp reminder"
                        className="press flex h-8 w-8 items-center justify-center rounded-full bg-[#E7F8EE] text-[#128C4A] hover:bg-[#128C4A] hover:text-white transition-colors"
                        title="WhatsApp वर तगादा पाठवा"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 6. आजचे पक्षी / स्टॉक (BIRDS TODAY - IF SIZES ARE ACTIVE) */}
      {(ctx.has('orders') || ctx.has('trips')) && (d.sizes as any[])?.length > 0 && (
        <section className="card overflow-hidden">
          <p className="px-4 pb-1 pt-4 text-[15.5px] font-semibold text-ink">{t('dash.birdsToday')}</p>
          <div className="overflow-x-auto">
            <table className="tabular w-full text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-muted border-b border-line">
                  <th className="px-4 py-2 font-medium">{t('c.size')}</th>
                  <th className="px-2 py-2 text-right font-medium">{t('dash.ordered')}</th>
                  <th className="px-2 py-2 text-right font-medium">{t('dash.loaded')}</th>
                  <th className="px-2 py-2 text-right font-medium text-good">{t('dash.delivered')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('dash.remaining')}</th>
                </tr>
              </thead>
              <tbody>
                {(d.sizes as any[]).map((s) => (
                  <tr key={s.bird_size_id} className="border-t border-line/60">
                    <td className="px-4 py-2.5 font-medium">{localName(s, locale)}</td>
                    <td className="px-2 py-2.5 text-right text-ink-muted">{num(s.ordered)}</td>
                    <td className="px-2 py-2.5 text-right font-medium">{num(s.loaded)}</td>
                    <td className="px-2 py-2.5 text-right font-semibold text-good">{num(s.delivered)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-ink">{num(s.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 7. अलिकडचे व्यवहार (RECENT ACTIVITY) */}
      {recent.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-ink">{t('c.recent')}</h2>
            <Link href="/app/payments" className="text-[13.5px] font-medium text-aqua-deep hover:underline">
              {t('c.viewAll')}
            </Link>
          </div>
          <div className="card divide-y divide-line px-4">
            {recent.map((r) => {
              const payment = r.entry_type === 'PAYMENT';
              const amount = Number(r.debit) || Number(r.credit);
              return (
                <Row
                  key={r.id}
                  href={`/app/${r.ledger === 'RECEIVABLE' ? 'customers' : 'suppliers'}/${r.party_id}`}
                  left={
                    payment ? (
                      <IconBubble tone={r.ledger === 'RECEIVABLE' ? 'good' : 'violet'}>
                        {r.ledger === 'RECEIVABLE' ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                      </IconBubble>
                    ) : (
                      <IconBubble tone="aqua">
                        <ReceiptText className="h-5 w-5" />
                      </IconBubble>
                    )
                  }
                  title={r.party_name}
                  sub={`${t(`l.${r.entry_type}` as any)} · ${fmtDate(r.txn_date, locale, false)}`}
                  amount={`${payment && r.ledger === 'RECEIVABLE' ? '+' : ''}${inrSmart(amount)}`}
                  tone={payment && r.ledger === 'RECEIVABLE' ? 'good' : undefined}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
