import type { Settings, Transaction } from '@/types/api';
import { api } from '@/services/api/endpoints';
import { buildReceiptPdf } from '@/utils/pdf';
import { downloadBlob, safeFilename } from '@/utils/csv';
import { openWhatsApp, shareFile } from '@/utils/whatsapp';
import { formatINR, formatNumber } from '@/utils/money';
import { formatDate } from '@/utils/dates';
import { methodLabel } from '@/utils/labels';

export function receiptText(t: Transaction, customerName: string, balance: number, businessName: string): string {
  const lines = [`*${businessName}*`];
  if (t.transactionType === 'PAYMENT') {
    lines.push(`Payment received from ${customerName}`, `Date: ${formatDate(t.transactionDate)}`, `Amount: ${formatINR(t.paymentAmount)} (${methodLabel(t.paymentMethod)})`);
    if (t.referenceNumber) lines.push(`Ref: ${t.referenceNumber}`);
  } else {
    lines.push(`Bill for ${customerName}`, `Date: ${formatDate(t.transactionDate)}`, `${formatNumber(t.birdCount)} birds · ${formatNumber(t.weightKg)} kg × ${formatINR(t.ratePerKg)}/kg`, `Bill amount: ${formatINR(t.billAmount)}`);
  }
  lines.push(balance >= 0 ? `Balance due: ${formatINR(balance)}` : `Advance with us: ${formatINR(-balance)}`, '', 'Thank you!');
  return lines.join('\n');
}

/**
 * Builds the bill/receipt PDF from fresh server data (so the balance is
 * exact), then either downloads it or shares it.
 * 'wa' tries the device share sheet with the PDF; if files cannot be
 * shared it downloads the PDF and opens WhatsApp with a text summary.
 */
export async function shareTransactionReceipt(t: Transaction, settings: Settings, mode: 'pdf' | 'wa'): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const c = await api.getCustomer(t.customerId);
  const row = c.transactions?.find((x) => x.transactionId === t.transactionId);
  const fresh = row ?? t;
  const balanceAfter = row?.runningBalance ?? c.summary.balance;
  const blob = await buildReceiptPdf(fresh, c.customerName, c.phone, balanceAfter, settings);
  const name = safeFilename(`${fresh.transactionType === 'PAYMENT' ? 'Receipt' : 'Bill'}_${c.customerName}_${fresh.transactionDate}`) + '.pdf';
  const text = receiptText(fresh, c.customerName, c.summary.balance, settings.businessName);
  if (mode === 'wa') {
    const r = await shareFile(blob, name, text);
    if (r === 'shared') return 'shared';
    if (r === 'cancelled') return 'cancelled';
    downloadBlob(blob, name);
    openWhatsApp(c.phone, text);
    return 'downloaded';
  }
  downloadBlob(blob, name);
  return 'downloaded';
}
