import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { readPref, writePref } from '@/utils/prefs';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** "Install app" card: Android/Chrome uses the native prompt; iPhone gets Add-to-Home-Screen steps. */
export function InstallPrompt({ variant = 'card' }: { variant?: 'card' | 'settings' }) {
  const [, force] = useState(0);
  const [dismissed, setDismissed] = useState(() => readPref('installDismissed', false));
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  if (isStandalone()) return variant === 'settings' ? <p className="text-sm text-ink-muted">The app is installed on this device.</p> : null;
  if (variant === 'card' && dismissed) return null;
  const canPrompt = !!deferred;
  if (!canPrompt && !isIOS() && variant === 'card') return null;

  return (
    <div className={variant === 'card' ? 'relative flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-line' : 'flex items-center gap-3'}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white"><Download className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Install the app</p>
        {canPrompt ? <p className="text-ink-muted">Open it from your home screen like any other app.</p>
          : isIOS() ? <p className="text-ink-muted">Tap <Share className="inline h-3.5 w-3.5" /> Share, then “Add to Home Screen”.</p>
          : <p className="text-ink-muted">Use your browser menu → “Install app” / “Add to Home screen”.</p>}
      </div>
      {canPrompt && (
        <button type="button" className="press h-9 shrink-0 rounded-lg bg-primary px-3 text-sm font-semibold text-white" onClick={async () => {
          await deferred?.prompt();
          deferred = null;
          force((n) => n + 1);
        }}>Install</button>
      )}
      {variant === 'card' && (
        <button type="button" aria-label="Dismiss" className="absolute right-1.5 top-1.5 rounded-full p-1 text-ink-muted" onClick={() => { setDismissed(true); writePref('installDismissed', true); }}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
