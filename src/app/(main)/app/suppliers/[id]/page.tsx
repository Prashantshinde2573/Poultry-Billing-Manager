import { requireCtx } from '@/lib/session';
import { PartyDetail } from '@/components/party/party-detail';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx({ office: true, module: 'suppliers', perm: 'suppliers' });
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <PartyDetail ctx={ctx} id={id} kind="SUPPLIER" sp={sp} />;
}
