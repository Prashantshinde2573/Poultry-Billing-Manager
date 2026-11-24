/* eslint-disable @next/next/no-img-element */
/** App mark: the PoulGo chicken, white on an ink tile (matches the app icon). */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%] bg-ink" style={{ width: size, height: size }}>
      <img src="/brand/mark-white.webp" alt="" width={size} height={size} className="h-[86%] w-[86%] object-contain" />
    </span>
  );
}

/** Full PoulGo wordmark (chicken + name). */
export function Wordmark({ height = 36, white = false, className = '' }: { height?: number; white?: boolean; className?: string }) {
  return <img src={white ? '/brand/logo-white.webp' : '/brand/logo.webp'} alt="PoulGo" height={height} style={{ height, width: 'auto' }} className={className} />;
}
