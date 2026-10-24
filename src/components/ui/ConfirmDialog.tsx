import { useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { TextField } from './Field';

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  onConfirm: (input: string) => Promise<void> | void;
  onClose: () => void;
  /** If set, the user must type this text to enable the button */
  requireText?: string;
  /** If set, show a free-text input (e.g. reason) that must be non-empty */
  inputLabel?: string;
  inputPlaceholder?: string;
  minInputLength?: number;
}

export function ConfirmDialog({ open, title, children, confirmLabel, tone = 'danger', onConfirm, onClose, requireText, inputLabel, inputPlaceholder, minInputLength = 0 }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = requireText ? text.trim() === requireText : inputLabel ? text.trim().length >= minInputLength : true;

  const close = () => {
    if (busy) return;
    setText('');
    onClose();
  };
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(text.trim());
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      locked={busy}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
          <Button variant={tone} onClick={confirm} loading={busy} disabled={!valid}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="space-y-4 text-[15px] text-ink">{children}</div>
      {(requireText || inputLabel) && (
        <TextField
          wrapClassName="mt-4"
          label={requireText ? <>Type <strong>{requireText}</strong> to confirm</> : inputLabel}
          placeholder={inputPlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
        />
      )}
    </Modal>
  );
}
