import { useSearchParams } from 'react-router-dom';
import { api } from '@/services/api/endpoints';
import { useApiQuery } from '@/hooks/useApiQuery';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState } from '@/components/ui/Feedback';
import { BillForm } from '@/features/billing/BillForm';

export default function AddBillPage() {
  const [params] = useSearchParams();
  const q = useApiQuery(() => api.listCustomers({ status: 'ALL' }), []);
  return (
    <div>
      <PageHeader title="Add Bill" subtitle="Birds, weight and rate — the amount is calculated for you." />
      {q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : (
        <BillForm customers={q.data?.customers ?? []} customersLoading={q.loading} initialCustomerId={params.get('customer') ?? undefined} />
      )}
    </div>
  );
}
