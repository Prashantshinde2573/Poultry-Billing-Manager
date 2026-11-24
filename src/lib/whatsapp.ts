import { fmtDate, inrSmart, num, type Locale } from './format';
import { localName, type TFn } from './i18n';

export interface DailySummary {
  name: string; phone: string | null; date: string; ledger: 'RECEIVABLE' | 'PAYABLE';
  lines: { size: string | null; size_mr: string | null; size_hi: string | null; qty: number; weight_kg: number | string; rate?: number | string | null; amount: number | string }[];
  total_qty: number; total_weight: number | string; bill_amount: number | string; paid_amount: number | string; adjustments: number | string;
  day_change: number | string; previous_balance: number | string; total_balance: number | string;
}

/** PRD §7.1 / §5.1 daily account message. Figures come from party_daily_summary(); nothing is recalculated here. */
export function dailySummaryMessage(s: DailySummary, t: TFn, locale: Locale, business: string): string {
  const supplier = s.ledger === 'PAYABLE';
  const sizeName = (l: DailySummary['lines'][number]) => (l.size ? localName({ name: l.size, name_mr: l.size_mr, name_hi: l.size_hi }, locale) : '');
  const lines: string[] = [`*${business}*`, `${supplier ? t('wa.supplierTitle') : t('wa.customerTitle')} — ${fmtDate(s.date, locale)}`, `${s.name}`, ''];
  if (s.lines.length) {
    const parts = s.lines.map((l) => `${sizeName(l)} ${l.qty}`).join('; ');
    lines.push(`${supplier ? t('wa.purchasedBirds') : t('wa.deliveredBirds')}: ${parts}; ${t('c.total')} ${s.total_qty}`);
    if (supplier) {
      const rates = new Set(s.lines.map((l) => String(l.rate ?? '')));
      const oneRate = rates.size === 1 && s.lines[0].rate ? ` × ${inrSmart(s.lines[0].rate)}` : '';
      lines.push(`${t('wa.weight')}: ${num(s.total_weight)} KG${oneRate} = ${inrSmart(s.bill_amount)}`);
    } else {
      lines.push(`${t('wa.weight')}: ${num(s.total_weight)} KG`);
      lines.push(`${t('wa.bill')}: ${inrSmart(s.bill_amount)}`);
    }
  } else if (Number(s.bill_amount) > 0) {
    lines.push(`${supplier ? t('wa.purchaseAmt') : t('wa.bill')}: ${inrSmart(s.bill_amount)}`);
  }
  lines.push(`${t('wa.paid')}: ${inrSmart(s.paid_amount)}`);
  if (Number(s.adjustments) !== 0) lines.push(`${t('wa.adjust')}: ${inrSmart(s.adjustments)}`);
  lines.push(`${t('wa.dayIncrease')}: ${inrSmart(s.day_change)}`);
  lines.push(`${t('wa.prev')}: ${inrSmart(s.previous_balance)}`);
  lines.push(`*${supplier ? t('wa.totalPayable') : t('wa.totalReceivable')}: ${inrSmart(s.total_balance)}*`);
  lines.push('', t('wa.thanks'));
  return lines.join('\n');
}

export function waLink(phone: string | null | undefined, text: string): string {
  const n = (phone ?? '').replace(/\D/g, '');
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
