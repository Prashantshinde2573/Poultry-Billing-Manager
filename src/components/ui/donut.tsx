/** Segmented donut (reference analytics ring). Pure SVG, no chart library. */
export const DONUT_COLORS = ['#2BB5A8', '#5FD3B0', '#F2D45C', '#F08A5D', '#7C6CE0', '#3A8FB0', '#E0533D', '#9DB0B4'];

export function Donut({ parts, center, sub, size = 260 }: { parts: { label: string; value: number }[]; center: string; sub?: string; size?: number }) {
  const total = parts.reduce((s, p) => s + Math.max(p.value, 0), 0);
  const r = 100, sw = 26, c = 2 * Math.PI * r, gap = parts.length > 1 ? 10 : 0;
  let off = 0;
  return (
    <figure className="flex w-full min-w-0 flex-col items-center">
      <svg viewBox="-130 -130 260 260" width={size} height={size} role="img" aria-label={`${sub ?? ''} ${center}`}>
        <circle r={r} fill="none" stroke="#E7F1EF" strokeWidth={sw} />
        {total > 0 && parts.map((p, i) => {
          const len = (Math.max(p.value, 0) / total) * c;
          const dash = Math.max(len - gap, 0.1);
          const el = (
            <circle key={p.label} r={r} fill="none" stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth={sw} strokeLinecap="round"
              strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-off} transform="rotate(-90)" />
          );
          off += len;
          return el;
        })}
        {sub && <text y={-12} textAnchor="middle" className="fill-ink-muted" style={{ fontSize: 15 }}>{sub}</text>}
        <text y={20} textAnchor="middle" className="fill-ink" style={{ fontSize: 26, fontWeight: 600 }}>{center}</text>
      </svg>
      {total > 0 && (
        <figcaption className="mt-3 flex w-full flex-wrap justify-center gap-x-4 gap-y-1.5 px-1 text-[14px]">
          {parts.map((p, i) => (
            <span key={p.label} className="flex shrink-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              {p.label} <b className="font-semibold">{Math.round((Math.max(p.value, 0) / total) * 100)}%</b>
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
