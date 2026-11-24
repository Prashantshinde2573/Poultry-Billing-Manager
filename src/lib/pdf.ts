'use client';
/**
 * Client-side PDF (jsPDF + autoTable, loaded on demand). Built-in PDF fonts have
 * no ₹ or Devanagari glyphs, so PDFs use "Rs." and English labels; WhatsApp text
 * and the screens stay in the user's language.
 */
export interface PdfTable { head: string[]; body: (string | number)[][]; align?: ('left' | 'right')[] }

const money = (n: number | string) => 'Rs. ' + new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));
export const pdfMoney = money;

export async function buildPdf(opts: { business: string; title: string; subtitle: string; party?: string; summary?: [string, string][]; tables: PdfTable[]; footer?: string }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(14, 42, 47); doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(opts.business, 14, 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('PoulGo', 14, 19);
  doc.setFontSize(12); doc.text(opts.title, W - 14, 12, { align: 'right' });
  doc.setFontSize(9); doc.text(opts.subtitle, W - 14, 19, { align: 'right' });
  doc.setTextColor(14, 42, 47);
  let y = 34;
  if (opts.party) { doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(opts.party, 14, y); y += 6; doc.setFont('helvetica', 'normal'); }
  if (opts.summary?.length) {
    const per = 4, bw = (W - 28 - (per - 1) * 3) / per;
    opts.summary.forEach(([k, v], i) => {
      const x = 14 + (i % per) * (bw + 3), yy = y + Math.floor(i / per) * 16;
      doc.setFillColor(234, 248, 244); doc.roundedRect(x, yy, bw, 13, 2, 2, 'F');
      doc.setFontSize(7.5); doc.setTextColor(107, 129, 135); doc.text(k.toUpperCase(), x + 3, yy + 4.8);
      doc.setFontSize(10.5); doc.setTextColor(14, 42, 47); doc.setFont('helvetica', 'bold'); doc.text(v, x + 3, yy + 10.2); doc.setFont('helvetica', 'normal');
    });
    y += Math.ceil(opts.summary.length / per) * 16 + 2;
  }
  for (const tb of opts.tables) {
    autoTable(doc, {
      startY: y, head: [tb.head], body: tb.body,
      styles: { fontSize: 8.5, cellPadding: 1.8, textColor: [14, 42, 47], lineColor: [225, 236, 234], lineWidth: 0.1 },
      headStyles: { fillColor: [43, 181, 168], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [246, 251, 249] },
      columnStyles: Object.fromEntries((tb.align ?? []).map((a, i) => [i, { halign: a }])),
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(107, 129, 135);
    if (opts.footer) doc.text(opts.footer, 14, doc.internal.pageSize.getHeight() - 8);
    doc.text(`Page ${i} / ${pages}`, W - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
  }
  return doc.output('blob');
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** RFC 4180 CSV with BOM; text starting with = + - @ is neutralised against formula injection. */
export function csv(headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(name: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  downloadBlob(new Blob([csv(headers, rows)], { type: 'text/csv;charset=utf-8' }), name.endsWith('.csv') ? name : name + '.csv');
}

export const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 80);
