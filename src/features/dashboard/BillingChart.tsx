import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartPoint } from '@/types/api';
import { formatINR, formatINRCompact } from '@/utils/money';
import { chartLabel, formatDate } from '@/utils/dates';

export const CHART_COLORS = { billing: '#0D9488', payments: '#6366F1' };

interface TooltipProps {
  active?: boolean;
  payload?: { dataKey: string; value: number; payload: ChartPoint }[];
  granularity: 'day' | 'month';
}

function ChartTooltip({ active, payload, granularity }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{granularity === 'day' ? formatDate(p.key) : chartLabel(p.key, 'month')}</p>
      <p><span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: CHART_COLORS.billing }} />Billing: <b className="tabular">{formatINR(p.billing)}</b></p>
      <p><span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: CHART_COLORS.payments }} />Payments: <b className="tabular">{formatINR(p.payments)}</b></p>
      {p.weightKg > 0 && <p className="mt-1 text-ink-muted">{p.birds} birds · {p.weightKg} kg</p>}
    </div>
  );
}

export function BillingChart({ data, granularity }: { data: ChartPoint[]; granularity: 'day' | 'month' }) {
  const rows = data.map((d) => ({ ...d, label: chartLabel(d.key, granularity) }));
  const interval = rows.length > 16 ? Math.ceil(rows.length / 10) - 1 : 0;
  return (
    <div className="h-72 w-full" role="img" aria-label={`Billing and payments chart, ${rows.length} ${granularity === 'day' ? 'days' : 'months'}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap={rows.length > 20 ? '15%' : '25%'}>
          <CartesianGrid vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#E2E8F0' }} tick={{ fill: '#64748B', fontSize: 11 }} interval={interval} />
          <YAxis tickFormatter={formatINRCompact} tickLine={false} axisLine={false} tick={{ fill: '#64748B', fontSize: 11 }} width={56} />
          <Tooltip content={<ChartTooltip granularity={granularity} />} cursor={{ fill: '#F1F5F9' }} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
          <Bar dataKey="billing" name="Billing" fill={CHART_COLORS.billing} radius={[3, 3, 0, 0]} maxBarSize={36} />
          <Bar dataKey="payments" name="Payments" fill={CHART_COLORS.payments} radius={[3, 3, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
