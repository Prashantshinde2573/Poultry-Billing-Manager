import { formatINR } from '@/utils/money';

/** Balance display: due = red, advance = green, settled = muted. */
export function BalanceText({ value, className = '' }: { value: number; className?: string }) {
  const tone = value > 0.004 ? 'text-danger' : value < -0.004 ? 'text-success' : 'text-ink-muted';
  return (
    <span className={`tabular font-semibold ${tone} ${className}`}>
      {formatINR(Math.abs(value))}
      {value < -0.004 && <span className="ml-1 text-xs font-medium">adv.</span>}
    </span>
  );
}
