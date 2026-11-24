'use client';
import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { Button } from '@/components/ui/core';
import { buildPdf, downloadBlob, downloadCsv, pdfMoney, safeName } from '@/lib/pdf';

export interface ReportSpec { title: string; pdfTitle: string; subtitle: string; head: string[]; pdfHead: string[]; rows: (string | number)[][]; pdfRows?: (string | number)[][]; money: number[]; summary?: [string, string][] }

export function ReportExport({ spec, business, footer }: { spec: ReportSpec; business: string; footer?: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const name = safeName(`${business}_${spec.pdfTitle}_${spec.subtitle}`);
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => downloadCsv(name, spec.head, spec.rows)}><Download className="h-4 w-4" /> {t('c.csv')}</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          const blob = await buildPdf({
            business, title: spec.pdfTitle, subtitle: spec.subtitle, summary: spec.summary, footer,
            tables: [{ head: spec.pdfHead, body: (spec.pdfRows ?? spec.rows).map((r) => r.map((v, i) => (spec.money.includes(i) ? pdfMoney(v) : v))), align: spec.pdfHead.map((_, i) => (spec.money.includes(i) || typeof spec.rows[0]?.[i] === 'number' ? 'right' : 'left')) }],
          });
          downloadBlob(blob, name + '.pdf');
        } finally { setBusy(false); }
      }}><FileText className="h-4 w-4" /> {t('c.pdf')}</Button>
    </div>
  );
}
