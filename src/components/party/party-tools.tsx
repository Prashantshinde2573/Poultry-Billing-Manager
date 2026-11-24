'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileSpreadsheet, MessageCircle, Scale, Archive, RotateCcw } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { Button } from '@/components/ui/core';
import { Sheet } from '@/components/ui/sheet';
import { TextInput, Segmented } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { WhatsAppSheet } from '@/components/whatsapp-sheet';
import { dailySummaryMessage, type DailySummary } from '@/lib/whatsapp';
import { buildPdf, downloadBlob, downloadCsv, pdfMoney, safeName } from '@/lib/pdf';
import { ledgerAdjustment, setPartyStatus } from '@/app/actions/parties';
import { errorKey } from '@/lib/errors';
import { todayIST } from '@/lib/format';

export function DailyShareButton({ summary, business, partyId }: { summary: DailySummary; business: string; partyId: string }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const text = dailySummaryMessage(summary, t, locale, business);
  return (
    <>
      <Button className="w-full bg-[#128C4A] hover:bg-[#0f7a40]" onClick={() => setOpen(true)}><MessageCircle className="h-5 w-5" /> {t('p.dailySummary')} · WhatsApp</Button>
      <WhatsAppSheet open={open} onClose={() => setOpen(false)} phone={summary.phone} text={text} partyId={partyId}
        type={summary.ledger === 'PAYABLE' ? 'SUPPLIER_DAILY' : 'CUSTOMER_DAILY'} date={summary.date} />
    </>
  );
}

export interface StatementData { opening: number | string; closing: number | string; current: number | string; from: string; to: string; birds?: number | string; kg?: number | string;
  rows: { date: string; type: string; description: string | null; debit: string; credit: string; balance: string }[] }

type DocItem = { size: string; qty: number; kg: number | string; rate: number | string };
const items = (r: any): DocItem[] => (Array.isArray(r.items) ? r.items : []);
const docBirds = (r: any) => (items(r).length ? items(r).reduce((s, i) => s + Number(i.qty), 0) : '');
const docKg = (r: any) => (items(r).length ? Number(items(r).reduce((s, i) => s + Number(i.kg), 0).toFixed(3)) : '');
const docDetails = (r: any) => items(r).map((i) => `${i.size} ${i.qty} / ${Number(i.kg)}kg @ ${Number(i.rate)}`).join(', ');

export function StatementExport({ st, party, business, ledger, footer }: { st: StatementData; party: string; business: string; ledger: string; footer?: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const title = ledger === 'PAYABLE' ? 'Supplier Statement' : 'Customer Statement';
  const fname = safeName(`${title}_${party}_${st.from}_${st.to}`);
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          const blob = await buildPdf({
            business, title, subtitle: `${st.from} to ${st.to}`, party, footer,
            summary: [['Opening', pdfMoney(st.opening)], ['Closing', pdfMoney(st.closing)], ['Today', pdfMoney(st.current)], ['Birds', String(st.birds ?? 0)], ['Weight', `${Number(st.kg ?? 0).toFixed(1)} kg`]],
            tables: [{ head: ['Date', 'Entry', 'Details', 'Birds', 'Kg', 'Debit', 'Credit', 'Balance'], align: ['left', 'left', 'left', 'right', 'right', 'right', 'right', 'right'],
              body: [['', 'Opening', '', '', '', '', '', pdfMoney(st.opening)], ...st.rows.map((r) => [r.date, r.type, docDetails(r) || (r.description ?? ''), docBirds(r), docKg(r), Number(r.debit) ? pdfMoney(r.debit) : '', Number(r.credit) ? pdfMoney(r.credit) : '', pdfMoney(r.balance)])] }],
          });
          downloadBlob(blob, fname + '.pdf');
        } finally { setBusy(false); }
      }}><Download className="h-4 w-4" /> {t('c.pdf')}</Button>
      <Button variant="outline" size="sm" onClick={() => downloadCsv(fname, ['Date', 'Entry', 'Details', 'Birds', 'Kg', 'Debit', 'Credit', 'Balance'],
        [['', 'Opening', '', '', '', '', '', Number(st.opening)], ...st.rows.map((r) => [r.date, r.type, docDetails(r) || (r.description ?? ''), docBirds(r), docKg(r), Number(r.debit) || '', Number(r.credit) || '', Number(r.balance)])])}>
        <FileSpreadsheet className="h-4 w-4" /> {t('c.csv')}
      </Button>
    </div>
  );
}

export function OwnerPartyTools({ partyId, ledgers, status }: { partyId: string; ledgers: ('RECEIVABLE' | 'PAYABLE')[]; status: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ledger: ledgers[0], direction: 'DECREASE' as 'INCREASE' | 'DECREASE', amount: '', reason: '', date: todayIST() });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Scale className="h-4 w-4" /> {t('p.adjustment')}</Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => {
        const r = await setPartyStatus(partyId, status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
        if (!r.ok) toast(t(errorKey(r.code), { detail: r.detail }), 'err');
      })}>{status === 'ACTIVE' ? <><Archive className="h-4 w-4" /> {t('p.archive')}</> : <><RotateCcw className="h-4 w-4" /> {t('p.reactivate')}</>}</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('p.adjustment')} locked={pending}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>{t('c.cancel')}</Button>
          <Button disabled={pending} onClick={() => start(async () => {
            setErr(null);
            const r = await ledgerAdjustment({ party_id: partyId, ...f });
            if (!r.ok) { setErr(t(errorKey(r.code), { detail: r.detail })); return; }
            toast(t('c.saved')); setOpen(false);
          })}>{t('c.save')}</Button></>}>
        <div className="space-y-4">
          {ledgers.length > 1 && <Segmented value={f.ledger} onChange={(v) => setF({ ...f, ledger: v })} options={ledgers.map((l) => ({ value: l, label: l === 'RECEIVABLE' ? t('p.receivable') : t('p.payable') }))} />}
          <Segmented value={f.direction} onChange={(v) => setF({ ...f, direction: v })} options={[{ value: 'DECREASE', label: t('p.decrease') }, { value: 'INCREASE', label: t('p.increase') }]} />
          <TextInput label={t('c.amount')} prefix="₹" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <TextInput label={t('c.date')} type="date" max={todayIST()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <TextInput label={t('c.reason')} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          {err && <p className="text-sm text-bad">{err}</p>}
        </div>
      </Sheet>
    </div>
  );
}
