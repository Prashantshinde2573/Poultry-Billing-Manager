const PALETTE = [
  'bg-teal-100 text-teal-800', 'bg-indigo-100 text-indigo-800', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-800',
  'bg-sky-100 text-sky-800', 'bg-violet-100 text-violet-800', 'bg-lime-100 text-lime-800', 'bg-orange-100 text-orange-800',
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '')).toUpperCase();
}

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Round initials avatar with a stable colour per name (like contact lists in payment apps). */
export function Avatar({ name, size = 44, className = '' }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${colorFor(name)} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}
