import { PlugZap } from 'lucide-react';

/** Shown when the app was built without VITE_API_URL. No demo data is ever shown. */
export function NotConfiguredPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-warning"><PlugZap className="h-6 w-6" /></div>
        <h1 className="text-xl font-bold">Backend not connected</h1>
        <p className="mt-2 text-sm text-ink-muted">
          This build of Poultry Business Manager does not know where its Google Apps Script backend is. Business data is only ever read from and saved to your Google Sheet, so nothing can be shown until it is connected.
        </p>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm">
          <li>Deploy <code className="rounded bg-slate-100 px-1">apps-script/</code> as a Web App (README §C).</li>
          <li>Set <code className="rounded bg-slate-100 px-1">VITE_API_URL</code> to the Web App URL ending in <code className="rounded bg-slate-100 px-1">/exec</code> — in <code className="rounded bg-slate-100 px-1">.env</code> locally, or in Netlify → Site configuration → Environment variables.</li>
          <li>Rebuild / redeploy the site.</li>
        </ol>
      </div>
    </div>
  );
}
