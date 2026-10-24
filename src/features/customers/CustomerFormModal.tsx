import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Customer } from '@/types/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { customerSchema, type CustomerFormValues } from '@/validation/schemas';
import { api } from '@/services/api/endpoints';
import { ApiRequestError, newRequestId } from '@/services/api/client';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
  customer?: Customer;
  onSaved: (c: Customer) => void;
}

interface Dup { customerId: string; customerName: string; phone: string; status: string }

export function CustomerFormModal({ open, onClose, customer, onSaved }: Props) {
  const toast = useToast();
  const { isOwner } = useAuth();
  const editing = !!customer;
  // One requestId per form session: a double-click or network retry cannot create two customers.
  const requestId = useMemo(() => newRequestId(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [error, setError] = useState<string | null>(null);
  const [dups, setDups] = useState<Dup[] | null>(null);
  const { register, handleSubmit, formState, reset, setError: setFieldError } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    values: customer
      ? { customerName: customer.customerName, phone: customer.phone, address: customer.address, notes: customer.notes, openingBalance: String(customer.openingBalance || '') }
      : { customerName: '', phone: '', address: '', notes: '', openingBalance: '' },
  });

  const close = () => {
    setError(null);
    setDups(null);
    reset();
    onClose();
  };

  const submit = async (v: CustomerFormValues, allowDuplicate = false) => {
    setError(null);
    try {
      if (editing && customer) {
        const r = await api.updateCustomer({
          customerId: customer.customerId, expectedVersion: customer.version, customerName: v.customerName, phone: v.phone,
          address: v.address ?? '', notes: v.notes ?? '', openingBalance: v.openingBalance || '0', allowDuplicate,
        });
        toast.success('Customer updated');
        onSaved(r.customer);
      } else {
        const r = await api.createCustomer({ customerName: v.customerName, phone: v.phone, address: v.address, notes: v.notes, openingBalance: v.openingBalance || '0', allowDuplicate }, requestId);
        toast.success(`${r.customer.customerName} added (${r.customer.customerId}). Sheet tab created.`);
        onSaved(r.customer);
      }
      setDups(null);
      reset();
    } catch (e) {
      const err = e as ApiRequestError;
      if (err.code === 'DUPLICATE_CUSTOMER') {
        setDups((err.details?.matches as Dup[]) ?? []);
        return;
      }
      if (err.code === 'CONFLICT') {
        setError('This customer was changed by someone else. Close and reopen to see the latest details.');
        return;
      }
      if (err.field && err.code === 'VALIDATION_ERROR') setFieldError(err.field as keyof CustomerFormValues, { message: err.message });
      setError(err.message);
    }
  };

  const e = formState.errors;
  const openingLocked = editing && !isOwner;
  return (
    <Modal
      open={open}
      onClose={close}
      locked={formState.isSubmitting}
      title={editing ? 'Edit customer' : 'Add customer'}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={formState.isSubmitting}>Cancel</Button>
          {dups
            ? <Button variant="danger" loading={formState.isSubmitting} onClick={handleSubmit((v) => submit(v, true))}>Save anyway</Button>
            : <Button loading={formState.isSubmitting} onClick={handleSubmit((v) => submit(v))}>{editing ? 'Save changes' : 'Add customer'}</Button>}
        </>
      }
    >
      <form className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); void handleSubmit((v) => submit(v))(); }} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        {dups && (
          <Alert tone="warning">
            <p className="font-medium">A customer with the same name or mobile number already exists:</p>
            <ul className="mt-1 list-disc pl-5">
              {dups.map((d) => <li key={d.customerId}>{d.customerName} · {d.phone} ({d.customerId}{d.status === 'INACTIVE' ? ', archived' : ''})</li>)}
            </ul>
            <p className="mt-1">If this really is a different person, choose “Save anyway”. Each customer gets their own ID and sheet tab.</p>
          </Alert>
        )}
        <TextField label="Customer name" autoComplete="off" {...register('customerName')} error={e.customerName?.message} />
        <TextField label="Mobile number" type="tel" inputMode="tel" placeholder="98765 43210" {...register('phone')} error={e.phone?.message} hint="10-digit Indian mobile, or include the country code with +" />
        <TextField label="Address (optional)" {...register('address')} error={e.address?.message} />
        <TextField
          label="Opening balance (optional)"
          inputMode="decimal"
          prefix="₹"
          disabled={openingLocked}
          {...register('openingBalance')}
          error={e.openingBalance?.message}
          hint={openingLocked ? 'Only the owner can change an opening balance.' : 'Amount the customer already owed before using this app. Use a minus sign for an advance.'}
        />
        <TextAreaField label="Notes (optional)" {...register('notes')} error={e.notes?.message} />
      </form>
    </Modal>
  );
}
