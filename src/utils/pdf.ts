import type { CustomerStatement, OutstandingReport, Report, Settings, Transaction } from '@/types/api';
import { formatAmountPlain, formatNumber } from './money';
import { formatDateShort, formatDateTime } from './dates';
import { methodLabel, TXN_TYPE_LABELS } from './labels';

/**
 * PDF generation (client-side, jsPDF + autoTable, loaded on demand).
 * jsPDF's built-in fonts have no ₹ glyph, so PDFs print amounts as "Rs."
 * rather than embedding a large font file.
 */

type JsPDF = import('jspdf').jsPDF;

const TEAL: [number, number, number] = [13, 148, 136];
const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];

const rs = (n: number) => 'Rs. ' + formatAmountPlain(n);
const signedRs = (n: number) => (n < 0 ? 'Rs. ' + formatAmountPlain(-n) + ' (advance)' : rs(n));

async function loadLibs() {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return { jsPDF, autoTable: autoTableMod.default };
}

function header(doc: JsPDF, settings: Settings, title: string, subtitle: string): number {
  const w = doc.internal.pageSize.getWidth();
  let x = 14;
  if (settings.logoDataUrl) {
    try {
      const fmt = settings.logoDataUrl.includes('image/png') ? 'PNG' : settings.logoDataUrl.includes('image/webp') ? 'WEBP' : 'JPEG';
      doc.addImage(settings.logoDataUrl, fmt, 14, 10, 16, 16);
      x = 34;
    } catch {
      /* ignore bad logo */
    }
  }
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(settings.businessName || 'Poultry Business', x, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const contact = [settings.businessPhone, settings.businessEmail, settings.gstin ? 'GSTIN ' + settings.gstin : ''].filter(Boolean).join('  |  ');
  if (contact) doc.text(contact, x, 21);
  if (settings.businessAddress) doc.text(doc.splitTextToSize(settings.businessAddress, w - x - 70), x, 25);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...TEAL);
  doc.text(title, w - 14, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(subtitle, w - 14, 21, { align: 'right' });
  doc.text('Generated ' + formatDateTime(new Date().toISOString()), w - 14, 25, { align: 'right' });
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 31, w - 14, 31);
  return 37;
}

function footer(doc: JsPDF, settings: Settings) {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    if (settings.reportFooter) doc.text(settings.reportFooter, 14, h - 8);
    doc.text(`Page ${i} of ${pages}`, w - 14, h - 8, { align: 'right' });
  }
}

function summaryBoxes(doc: JsPDF, y: number, items: [string, string][]): number {
  const w = doc.internal.pageSize.getWidth() - 28;
  const perRow = Math.min(items.length, 4);
  const bw = (w - (perRow - 1) * 4) / perRow;
  items.forEach(([label, value], i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = 14 + col * (bw + 4);
    const yy = y + row * 18;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, yy, bw, 15, 2, 2, 'FD');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x + 3, yy + 5.5);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(value, x + 3, yy + 11.5);
    doc.setFont('helvetica', 'normal');
  });
  return y + Math.ceil(items.length / perRow) * 18 + 2;
}

const tableStyles = {
  styles: { fontSize: 8.5, cellPadding: 1.8, textColor: INK, lineColor: [226, 232, 240] as [number, number, number], lineWidth: 0.1 },
  headStyles: { fillColor: TEAL, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const },
  alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
  margin: { left: 14, right: 14 },
};

function txnDetails(t: Transaction): string {
  if (t.transactionType === 'BILL') return `${formatNumber(t.birdCount)} birds, ${formatNumber(t.weightKg)} kg @ Rs. ${formatAmountPlain(t.ratePerKg ?? 0)}`;
  if (t.transactionType === 'PAYMENT') return [methodLabel(t.paymentMethod), t.referenceNumber ? 'Ref ' + t.referenceNumber : ''].filter(Boolean).join(' · ');
  return 'Adjustment' + (t.notes ? ': ' + t.notes : '');
}

export async function buildStatementPdf(st: CustomerStatement, settings: Settings): Promise<Blob> {
  const { jsPDF, autoTable } = await loadLibs();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = header(doc, settings, 'Customer Statement', `${formatDateShort(st.range.start)} to ${formatDateShort(st.range.end)}`);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INK);
  doc.text(st.customer.customerName, 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text([`Customer ID: ${st.customer.customerId}`, st.customer.phone, st.customer.address].filter(Boolean).join('   |   '), 14, y + 5);
  y += 10;
  y = summaryBoxes(doc, y, [
    ['Opening balance', signedRs(st.openingBalance)],
    ['Bills in period', rs(st.totals.billing)],
    ['Payments in period', rs(st.totals.payments)],
    ['Closing balance', signedRs(st.closingBalance)],
  ]);
  const body: (string | number)[][] = [
    ['', 'Opening balance', '', '', '', signedRs(st.openingBalance)],
    ...st.rows.map((r) => [
      formatDateShort(r.transaction.transactionDate),
      TXN_TYPE_LABELS[r.transaction.transactionType],
      txnDetails(r.transaction) + (r.transaction.notes && r.transaction.transactionType !== 'ADJUSTMENT' ? ` — ${r.transaction.notes}` : ''),
      r.debit ? formatAmountPlain(r.debit) : '',
      r.credit ? formatAmountPlain(r.credit) : '',
      formatAmountPlain(r.runningBalance),
    ]),
    ['', 'Closing balance', '', formatAmountPlain(st.totals.billing + st.totals.adjustmentsDebit), formatAmountPlain(st.totals.payments + st.totals.adjustmentsCredit), signedRs(st.closingBalance)],
  ];
  autoTable(doc, {
    ...tableStyles,
    startY: y + 2,
    head: [['Date', 'Type', 'Details', 'Bill / Debit (Rs.)', 'Paid / Credit (Rs.)', 'Balance (Rs.)']],
    body,
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 20 }, 3: { halign: 'right', cellWidth: 26 }, 4: { halign: 'right', cellWidth: 26 }, 5: { halign: 'right', cellWidth: 30 } },
    didParseCell: (d) => {
      if (d.section === 'body' && (d.row.index === 0 || d.row.index === body.length - 1)) d.cell.styles.fontStyle = 'bold';
    },
  });
  let endY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(`Birds: ${formatNumber(st.totals.birds)}   |   Weight: ${formatNumber(st.totals.weightKg)} kg   |   Bills: ${st.totals.billCount}   |   Payments: ${st.totals.paymentCount}`, 14, endY);
  endY += 5;
  doc.text(`Current balance as of today: ${signedRs(st.currentBalance)}`, 14, endY);
  if (settings.statementNote) {
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(settings.statementNote, 180), 14, endY + 6);
  }
  footer(doc, settings);
  return doc.output('blob');
}

const REPORT_TITLES: Record<string, string> = { SUMMARY: 'Business Report', PAYMENTS: 'Payments Received', BILLING: 'Billing & Weight Report' };

export async function buildReportPdf(r: Report, settings: Settings, title?: string, customerName?: string): Promise<Blob> {
  const { jsPDF, autoTable } = await loadLibs();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  let y = header(doc, settings, title || REPORT_TITLES[r.reportType], `${formatDateShort(r.range.start)} to ${formatDateShort(r.range.end)}`);
  const filters = [
    customerName ? 'Customer: ' + customerName : '',
    r.filters.transactionType && r.reportType === 'SUMMARY' ? 'Type: ' + r.filters.transactionType : '',
    r.filters.paymentMethod ? 'Method: ' + methodLabel(r.filters.paymentMethod as never) : '',
  ].filter(Boolean).join('   |   ');
  if (filters) {
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(filters, 14, y);
    y += 5;
  }
  y = summaryBoxes(doc, y, [
    ['Total billing', rs(r.totals.billing)],
    ['Payments received', rs(r.totals.payments)],
    ['Birds / weight', `${formatNumber(r.totals.birds)} / ${formatNumber(r.totals.weightKg)} kg`],
    ['Bills / payments', `${r.totals.billCount} / ${r.totals.paymentCount}`],
    ['Closing outstanding (period end)', rs(r.totals.closingOutstanding)],
    ['Current outstanding (today)', rs(r.totals.currentOutstanding)],
    ['Average rate', r.totals.weightKg ? rs(r.totals.avgRatePerKg) + '/kg' : '-'],
    ['Adjustments (dr / cr)', `${formatAmountPlain(r.totals.adjustmentsDebit)} / ${formatAmountPlain(r.totals.adjustmentsCredit)}`],
  ]);
  if (r.byCustomer.length > 1) {
    autoTable(doc, {
      ...tableStyles,
      startY: y + 2,
      head: [['Customer', 'Birds', 'Weight (kg)', 'Billing (Rs.)', 'Payments (Rs.)', 'Opening (Rs.)', 'Closing (Rs.)', 'Current (Rs.)']],
      body: r.byCustomer.map((c) => [
        `${c.customerName} (${c.customerId})`, formatNumber(c.birds), formatNumber(c.weightKg), formatAmountPlain(c.billing),
        formatAmountPlain(c.payments), formatAmountPlain(c.openingBalance), formatAmountPlain(c.closingBalance), formatAmountPlain(c.currentBalance),
      ]),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }
  autoTable(doc, {
    ...tableStyles,
    startY: y + 2,
    head: [['Date', 'Customer', 'Type', 'Birds', 'Weight (kg)', 'Rate', 'Bill (Rs.)', 'Payment (Rs.)', 'Method / Ref', 'Notes']],
    body: r.rows.length ? r.rows.map((t) => [
      formatDateShort(t.transactionDate), t.customerName ?? t.customerId, TXN_TYPE_LABELS[t.transactionType],
      t.birdCount ?? '', t.weightKg !== null ? formatNumber(t.weightKg) : '', t.ratePerKg !== null ? formatAmountPlain(t.ratePerKg) : '',
      t.billAmount ? formatAmountPlain(t.billAmount) : '', t.paymentAmount ? formatAmountPlain(t.paymentAmount) : '',
      [methodLabel(t.paymentMethod), t.referenceNumber].filter(Boolean).join(' '), t.notes,
    ]) : [['', 'No transactions in this period', '', '', '', '', '', '', '', '']],
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 9: { cellWidth: 45 } },
  });
  footer(doc, settings);
  return doc.output('blob');
}

export async function buildOutstandingPdf(r: OutstandingReport, settings: Settings): Promise<Blob> {
  const { jsPDF, autoTable } = await loadLibs();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = header(doc, settings, 'Outstanding Balances', 'As of ' + formatDateShort(r.asOf));
  y = summaryBoxes(doc, y, [
    ['Total receivable', rs(r.totals.receivable)],
    ['Customers with dues', String(r.totals.customersWithOutstanding)],
    ['Advances held', rs(r.totals.advances)],
    ['Net outstanding', rs(r.totals.net)],
  ]);
  autoTable(doc, {
    ...tableStyles,
    startY: y + 2,
    head: [['Customer', 'Mobile', 'Last bill', 'Last payment', 'Days since payment', 'Balance (Rs.)']],
    body: r.rows.map((x) => [
      `${x.customerName}${x.status === 'INACTIVE' ? ' (archived)' : ''}`, x.phone, formatDateShort(x.lastBillDate), formatDateShort(x.lastPaymentDate),
      x.daysSinceLastPayment ?? '-', signedRs(x.balance),
    ]),
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } },
  });
  footer(doc, settings);
  return doc.output('blob');
}

export async function buildReceiptPdf(t: Transaction, customerName: string, customerPhone: string, balanceAfter: number, settings: Settings): Promise<Blob> {
  const { jsPDF, autoTable } = await loadLibs();
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const isPay = t.transactionType === 'PAYMENT';
  const y = header(doc, settings, isPay ? 'Payment Receipt' : 'Bill', formatDateShort(t.transactionDate));
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    theme: 'plain',
    head: [],
    body: [
      ['Customer', customerName],
      ['Mobile', customerPhone],
      [isPay ? 'Receipt no.' : 'Bill no.', t.transactionId],
      ['Date', formatDateShort(t.transactionDate)],
      ...(isPay
        ? [['Amount received', rs(t.paymentAmount)], ['Method', methodLabel(t.paymentMethod)], ...(t.referenceNumber ? [['Reference', t.referenceNumber]] : [])]
        : [['Birds', formatNumber(t.birdCount)], ['Weight', formatNumber(t.weightKg) + ' kg'], ['Rate', rs(t.ratePerKg ?? 0) + ' per kg'], ['Bill amount', rs(t.billAmount)]]),
      ...(t.notes ? [['Notes', t.notes]] : []),
      ['Balance after this entry', signedRs(balanceAfter)],
    ],
    columnStyles: { 0: { textColor: MUTED, cellWidth: 45 }, 1: { fontStyle: 'bold' } },
  });
  footer(doc, settings);
  return doc.output('blob');
}
