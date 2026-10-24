import type { CustomerStatement, OutstandingReport, Report, Settings } from '@/types/api';
import { downloadBlob, downloadCsv, safeFilename } from '@/utils/csv';
import { buildOutstandingPdf, buildReportPdf, buildStatementPdf } from '@/utils/pdf';
import { formatINR } from '@/utils/money';
import { formatDate, formatRange } from '@/utils/dates';
import { methodLabel, TXN_TYPE_LABELS } from '@/utils/labels';
import { openWhatsApp, shareFile } from '@/utils/whatsapp';

/** CSV columns use plain numbers (no ₹ / commas) so Excel can sum them. */

export function statementCsv(st: CustomerStatement) {
  const headers = ['Date', 'Type', 'Transaction ID', 'Birds', 'Weight (kg)', 'Rate per kg', 'Bill / Debit', 'Payment / Credit', 'Payment method', 'Reference', 'Notes', 'Running balance'];
  const rows = [
    ['', 'Opening balance', '', '', '', '', '', '', '', '', '', st.openingBalance],
    ...st.rows.map((r) => {
      const t = r.transaction;
      return [t.transactionDate, TXN_TYPE_LABELS[t.transactionType], t.transactionId, t.birdCount, t.weightKg, t.ratePerKg, r.debit || '', r.credit || '', methodLabel(t.paymentMethod), t.referenceNumber, t.notes, r.runningBalance];
    }),
    ['', 'Closing balance', '', st.totals.birds, st.totals.weightKg, '', st.totals.billing + st.totals.adjustmentsDebit, st.totals.payments + st.totals.adjustmentsCredit, '', '', '', st.closingBalance],
  ];
  downloadCsv(safeFilename(`Statement_${st.customer.customerName}_${st.range.start}_to_${st.range.end}`), headers, rows);
}

export function reportCsv(r: Report, label: string) {
  const headers = ['Date', 'Customer ID', 'Customer', 'Type', 'Transaction ID', 'Birds', 'Weight (kg)', 'Rate per kg', 'Bill amount', 'Payment amount', 'Adjustment debit', 'Adjustment credit', 'Payment method', 'Reference', 'Notes', 'Entered by'];
  const rows = r.rows.map((t) => [
    t.transactionDate, t.customerId, t.customerName, TXN_TYPE_LABELS[t.transactionType], t.transactionId,
    t.birdCount, t.weightKg, t.ratePerKg,
    t.transactionType === 'BILL' ? t.billAmount : '', t.transactionType === 'PAYMENT' ? t.paymentAmount : '',
    t.transactionType === 'ADJUSTMENT' ? t.billAmount || '' : '', t.transactionType === 'ADJUSTMENT' ? t.paymentAmount || '' : '',
    methodLabel(t.paymentMethod), t.referenceNumber, t.notes, t.createdBy,
  ]);
  rows.push([]);
  rows.push(['TOTAL', '', '', '', '', r.totals.birds, r.totals.weightKg, r.totals.avgRatePerKg || '', r.totals.billing, r.totals.payments, r.totals.adjustmentsDebit, r.totals.adjustmentsCredit, '', '', '', '']);
  rows.push(['Closing outstanding at ' + r.range.end, '', '', '', '', '', '', '', r.totals.closingOutstanding]);
  rows.push(['Current outstanding (today)', '', '', '', '', '', '', '', r.totals.currentOutstanding]);
  downloadCsv(safeFilename(`${label}_${r.range.start}_to_${r.range.end}`), headers, rows);
}

export function reportByCustomerCsv(r: Report, label: string) {
  const headers = ['Customer ID', 'Customer', 'Mobile', 'Status', 'Birds', 'Weight (kg)', 'Billing', 'Payments', 'Adjustment debit', 'Adjustment credit', 'Opening balance', 'Closing balance', 'Current balance'];
  const rows = r.byCustomer.map((c) => [c.customerId, c.customerName, c.phone, c.status, c.birds, c.weightKg, c.billing, c.payments, c.adjustmentsDebit, c.adjustmentsCredit, c.openingBalance, c.closingBalance, c.currentBalance]);
  downloadCsv(safeFilename(`${label}_by_customer_${r.range.start}_to_${r.range.end}`), headers, rows);
}

export function outstandingCsv(r: OutstandingReport) {
  const headers = ['Customer ID', 'Customer', 'Mobile', 'Status', 'Balance', 'Last bill date', 'Last payment date', 'Days since last payment'];
  const rows = r.rows.map((x) => [x.customerId, x.customerName, x.phone, x.status, x.balance, x.lastBillDate, x.lastPaymentDate, x.daysSinceLastPayment ?? '']);
  rows.push([]);
  rows.push(['TOTAL RECEIVABLE', '', '', '', r.totals.receivable]);
  rows.push(['ADVANCES HELD', '', '', '', r.totals.advances]);
  downloadCsv(safeFilename(`Outstanding_as_of_${r.asOf}`), headers, rows);
}

export function statementText(st: CustomerStatement, businessName: string) {
  return [
    `*${businessName}*`,
    `Statement for ${st.customer.customerName}`,
    `Period: ${formatRange(st.range.start, st.range.end)}`,
    `Opening balance: ${formatINR(st.openingBalance)}`,
    `Bills: ${formatINR(st.totals.billing)} (${st.totals.billCount})`,
    `Payments: ${formatINR(st.totals.payments)} (${st.totals.paymentCount})`,
    `Closing balance on ${formatDate(st.range.end)}: ${formatINR(st.closingBalance)}`,
    st.currentBalance >= 0 ? `*Balance due today: ${formatINR(st.currentBalance)}*` : `*Advance with us: ${formatINR(-st.currentBalance)}*`,
  ].join('\n');
}

export async function statementPdf(st: CustomerStatement, settings: Settings) {
  const blob = await buildStatementPdf(st, settings);
  return { blob, name: safeFilename(`Statement_${st.customer.customerName}_${st.range.start}_to_${st.range.end}`) + '.pdf' };
}

export async function downloadStatementPdf(st: CustomerStatement, settings: Settings) {
  const { blob, name } = await statementPdf(st, settings);
  downloadBlob(blob, name);
}

/** Share sheet with the PDF where supported; else download + WhatsApp text. */
export async function shareStatement(st: CustomerStatement, settings: Settings): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const { blob, name } = await statementPdf(st, settings);
  const text = statementText(st, settings.businessName);
  const r = await shareFile(blob, name, text);
  if (r === 'shared') return 'shared';
  if (r === 'cancelled') return 'cancelled';
  downloadBlob(blob, name);
  openWhatsApp(st.customer.phone, text);
  return 'downloaded';
}

export async function downloadReportPdf(r: Report, settings: Settings, title: string, customerName?: string) {
  const blob = await buildReportPdf(r, settings, title, customerName);
  downloadBlob(blob, safeFilename(`${title}_${r.range.start}_to_${r.range.end}`) + '.pdf');
}

export async function downloadOutstandingPdf(r: OutstandingReport, settings: Settings) {
  const blob = await buildOutstandingPdf(r, settings);
  downloadBlob(blob, safeFilename(`Outstanding_as_of_${r.asOf}`) + '.pdf');
}

export function reportText(r: Report, title: string, businessName: string) {
  return [
    `*${businessName} — ${title}*`,
    formatRange(r.range.start, r.range.end),
    `Billing: ${formatINR(r.totals.billing)} (${r.totals.billCount} bills)`,
    `Payments received: ${formatINR(r.totals.payments)} (${r.totals.paymentCount})`,
    `Birds: ${r.totals.birds} · Weight: ${r.totals.weightKg} kg`,
    `Outstanding today: ${formatINR(r.totals.currentOutstanding)}`,
  ].join('\n');
}
