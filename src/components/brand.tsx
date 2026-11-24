export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-2xl bg-ink text-white" style={{ width: size, height: size }}>
      <svg viewBox="0 0 32 32" width={size * 0.6} height={size * 0.6} aria-hidden>
        <path d="M9 27V6h8a7 7 0 0 1 0 14h-8" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="24" cy="25" r="3.2" fill="#2BB5A8" />
      </svg>
    </span>
  );
}
