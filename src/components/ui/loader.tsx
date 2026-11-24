/** PoulGo chicken loader (animated, transparent). */
export function ChickenLoader({ size = 88, label }: { size?: number; label?: string }) {
  return (
    <span className="inline-flex flex-col items-center gap-1" role="status" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/loader.webp" width={size} height={size} alt="" className="select-none" draggable={false} />
      <span className={label ? 'text-[14px] font-medium text-ink-muted' : 'sr-only'}>{label ?? 'Loading'}</span>
    </span>
  );
}

/** Full-area loader used by route loading screens. */
export function ScreenLoader() {
  return (
    <div className="flex min-h-[55dvh] items-center justify-center" aria-busy="true">
      <ChickenLoader size={96} />
    </div>
  );
}
