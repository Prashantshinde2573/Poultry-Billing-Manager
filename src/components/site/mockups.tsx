import type { TFn } from '@/lib/i18n';

/** A phone frame drawn in HTML (no images), sized by its parent. */
export function Phone({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-[46px] bg-[#0A1A1D] p-[10px] shadow-[0_40px_80px_-30px_rgba(14,42,47,0.55)] ${className}`}>
      <div className="absolute left-1/2 top-[18px] z-10 h-[22px] w-[90px] -translate-x-1/2 rounded-full bg-[#0A1A1D]" aria-hidden />
      <div className="relative h-full overflow-hidden rounded-[36px] bg-canvas">{children}</div>
    </div>
  );
}

/** Owner dashboard, miniature (mirrors the real app's home screen). */
export function DashboardMock({ t }: { t: TFn }) {
  return (
    <div className="flex h-full flex-col gap-3 px-4 pb-4 pt-12 text-ink" aria-hidden>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D9F2EE] text-[13px] font-semibold text-[#12645C]">SP</span>
        <div className="leading-tight"><p className="text-[11px] text-ink-muted">{t('site.mockGreeting')}</p><p className="text-[14px] font-semibold">Shubham Patil</p></div>
      </div>
      <div>
        <p className="text-[11.5px] text-ink-muted">{t('site.mockReceivable')}</p>
        <p className="tabular text-[27px] font-semibold leading-tight tracking-[-0.02em]">₹1,38,577</p>
      </div>
      <div className="stripe-card flex h-[118px] flex-col justify-between rounded-[20px] p-4 text-white">
        <p className="tabular text-[20px] font-medium">₹15,623</p>
        <div><p className="text-[11px] text-white/70">{t('site.mockSales')}</p><p className="text-[12px]">UPI ₹8,000 · Cash ₹10,000</p></div>
      </div>
      <div className="rounded-[16px] border border-line bg-white p-3">
        <p className="text-[12px] font-medium">{t('site.mockTrip')}</p>
        <div className="mt-2 h-1.5 rounded-full bg-ink/[0.07]"><div className="h-1.5 w-2/3 rounded-full bg-aqua" /></div>
      </div>
      <div className="space-y-2 rounded-[16px] border border-line bg-white p-3 text-[12px]">
        {[['Hotel Gharkul', '₹52,378'], ['Ramesh Chicken', '₹46,923'], ['Mauli Chicken', '₹18,540']].map(([n, v]) => (
          <div key={n} className="flex justify-between"><span>{n}</span><span className="tabular font-semibold">{v}</span></div>
        ))}
      </div>
    </div>
  );
}

/** Driver screen, miniature: big steppers. */
export function DriverMock() {
  return (
    <div className="flex h-full flex-col gap-3 px-4 pb-4 pt-12 text-ink" aria-hidden>
      <p className="text-[18px] font-semibold">Ramesh Chicken Center</p>
      <p className="-mt-2 text-[12px] text-ink-muted">मोठा · 60</p>
      {[['पोहोचले', '58'], ['परत', '0'], ['मृत', '2']].map(([l, v]) => (
        <div key={l}>
          <p className="mb-1 text-[11.5px] font-medium text-ink-soft">{l}</p>
          <div className="flex h-12 items-center rounded-[14px] border border-line bg-white">
            <span className="flex w-12 justify-center text-[20px]">−</span>
            <span className="tabular flex-1 text-center text-[20px] font-semibold">{v}</span>
            <span className="flex w-12 justify-center text-[20px]">+</span>
          </div>
        </div>
      ))}
      <div className="rounded-[14px] border border-line bg-white px-3 py-2.5"><p className="text-[11px] text-ink-muted">वजन</p><p className="tabular text-[18px] font-semibold">128.6 kg</p></div>
      <div className="mt-auto rounded-[16px] bg-ink p-3 text-white"><p className="text-[11px] text-white/70">बिल</p><p className="tabular text-[22px] font-semibold">₹14,918</p></div>
    </div>
  );
}

/** The evening WhatsApp hisab a trader receives (the product's signature moment). */
export function WhatsAppHisab({ t, className = '' }: { t: TFn; className?: string }) {
  return (
    <figure className={`w-[270px] rounded-[18px] rounded-tl-[4px] bg-[#E7FFDB] p-4 text-[13.5px] leading-snug text-[#111B21] shadow-[0_24px_50px_-20px_rgba(14,42,47,0.45)] ${className}`}>
      <p className="text-[12px] font-semibold text-[#1F8A5B]">{t('site.mockWaFrom')}</p>
      <p className="mt-1 font-semibold">*{t('site.demoBubbleTitle')}*</p>
      <dl className="tabular mt-2 space-y-1">
        <div className="flex justify-between gap-4"><dt>{t('site.demoBirds')}</dt><dd>60 · 132.4 kg</dd></div>
        <div className="flex justify-between gap-4"><dt>{t('site.demoBill')}</dt><dd>₹15,358</dd></div>
        <div className="flex justify-between gap-4"><dt>{t('site.demoPaid')}</dt><dd>₹10,000</dd></div>
        <div className="mt-1 flex justify-between gap-4 border-t border-[#1F8A5B]/20 pt-1.5 font-semibold"><dt>{t('site.demoDue')}</dt><dd>₹9,858</dd></div>
      </dl>
      <p className="mt-2 text-right text-[11px] text-[#667781]">7:42 pm ✓✓</p>
    </figure>
  );
}
