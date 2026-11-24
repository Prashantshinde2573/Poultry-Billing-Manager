'use client';
import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Sheet } from './ui/sheet';
import { btnClass } from './ui/core';
import { useI18n } from '@/lib/i18n/client';
import { waLink } from '@/lib/whatsapp';
import { logWhatsapp } from '@/app/actions/parties';

/**
 * Preview → edit → open WhatsApp click-to-chat. Logs only that a share was
 * initiated; it never claims the message was delivered or read.
 */
export function WhatsAppSheet({ open, onClose, phone, text, partyId, type, date }: {
  open: boolean; onClose: () => void; phone: string | null; text: string; partyId: string | null; type: string; date: string | null;
}) {
  const { t } = useI18n();
  const [msg, setMsg] = useState(text);
  useEffect(() => { if (open) setMsg(text); }, [open, text]);
  return (
    <Sheet open={open} onClose={onClose} title={t('wa.preview')}
      footer={
        <>
          <button type="button" className={btnClass('outline')} onClick={onClose}>{t('c.cancel')}</button>
          <a href={waLink(phone, msg)} target="_blank" rel="noreferrer" className={btnClass('ink', 'md', 'bg-[#128C4A] hover:bg-[#0f7a40]')}
            onClick={() => { void logWhatsapp(partyId, type, date, phone ?? '', msg); onClose(); }}>
            <MessageCircle className="h-5 w-5" /> {t('wa.open')}
          </a>
        </>
      }>
      {!phone && <p className="mb-2 rounded-xl bg-[#FCF0DC] px-3 py-2 text-sm text-[#9A5E0B]">{t('wa.noPhone')}</p>}
      <p className="mb-2 text-sm text-ink-muted">{t('wa.edit')}</p>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={12}
        className="input h-auto whitespace-pre-wrap py-3 font-[inherit] text-[15px] leading-relaxed" aria-label={t('wa.preview')} />
      <p className="mt-2 text-xs text-ink-muted">{t('wa.note')}</p>
    </Sheet>
  );
}
