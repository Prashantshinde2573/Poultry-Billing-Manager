import { useSearchParams } from 'react-router-dom';
import { api } from '@/services/api/endpoints';
import { useApiQuery } from '@/hooks/useApiQuery';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState } from '@/components/ui/Feedback';
import { PaymentForm } from '@/features/payments/PaymentForm';

export default function ReceivePaymentPage() {
  const [params] = useSearchParams();
  const q = useApiQuery(() => api.listCustomers({ status: 'ALL' }), []);
  return (
    <div>
      <PageHeader title="Receive Payment" subtitle="Record money received — partial payments and old dues are fine." />
      {q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : (
        <PaymentForm customers={q.data?.customers ?? []} customersLoading={q.loading} initialCustomerId={params.get('customer') ?? undefined} />
      )}
    </div>
  );
}
