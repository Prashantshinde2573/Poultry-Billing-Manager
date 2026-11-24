/** Instant placeholder shown while a screen's data loads (keeps taps feeling immediate). */
export function PageSkeleton({ rows = 6, hero = true }: { rows?: number; hero?: boolean }) {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-full bg-ink/[0.07]" />
        <div className="space-y-2"><div className="h-3 w-24 rounded bg-ink/[0.07]" /><div className="h-5 w-40 rounded bg-ink/[0.09]" /></div>
      </div>
      {hero && <div className="h-[170px] rounded-[24px] bg-ink/[0.09]" />}
      <div className="card divide-y divide-line px-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-4">
            <div className="h-11 w-11 shrink-0 rounded-[14px] bg-ink/[0.07]" />
            <div className="flex-1 space-y-2"><div className="h-3.5 w-2/5 rounded bg-ink/[0.08]" /><div className="h-3 w-1/4 rounded bg-ink/[0.06]" /></div>
            <div className="h-4 w-16 rounded bg-ink/[0.08]" />
          </div>
        ))}
      </div>
    </div>
  );
}
