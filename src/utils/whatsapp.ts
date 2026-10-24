/**
 * WhatsApp sharing.
 * - Text: opens https://wa.me/<number>?text=… (click-to-chat). This can only
 *   pre-fill TEXT; it cannot attach files.
 * - PDF: uses the device share sheet (Web Share API with files) where the
 *   browser supports it — on most Android/iOS phones the user can pick
 *   WhatsApp there. Otherwise the PDF is downloaded so the user can attach it.
 */

export function whatsappNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function whatsappUrl(phone: string | null | undefined, text: string): string {
  const n = phone ? whatsappNumber(phone) : '';
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function openWhatsApp(phone: string | null | undefined, text: string) {
  window.open(whatsappUrl(phone, text), '_blank', 'noopener,noreferrer');
}

export function canShareFiles(): boolean {
  try {
    const probe = new File([new Blob(['x'], { type: 'application/pdf' })], 'probe.pdf', { type: 'application/pdf' });
    return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Returns 'shared' | 'cancelled' | 'unsupported'. */
export async function shareFile(blob: Blob, filename: string, text: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!canShareFiles()) return 'unsupported';
  const file = new File([blob], filename, { type: blob.type || 'application/pdf' });
  try {
    await navigator.share({ files: [file], text, title: filename });
    return 'shared';
  } catch (e) {
    return (e as DOMException)?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}
