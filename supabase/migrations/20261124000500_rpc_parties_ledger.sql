-- PoulGo · 0005 RPC: parties (customers/suppliers), ledgers, payments

-- ------------------------------------------------------------ ledger core --
create or replace function private.post_ledger(
  p_business_id uuid, p_party_id uuid, p_ledger text, p_date date, p_entry_type text,
  p_debit numeric, p_credit numeric, p_source_type text, p_source_id uuid, p_description text, p_reversal_of uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if coalesce(p_debit, 0) = 0 and coalesce(p_credit, 0) = 0 then return null; end if;
  insert into public.ledger_transactions (business_id, party_id, ledger, txn_date, entry_type, debit, credit, source_type, source_id, reversal_of, description, created_by)
  values (p_business_id, p_party_id, p_ledger, p_date, p_entry_type, coalesce(p_debit, 0), coalesce(p_credit, 0), p_source_type, p_source_id, p_reversal_of, p_description, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Reverse every not-yet-reversed ledger row created by a source document.
create or replace function private.reverse_source(p_business_id uuid, p_source_type text, p_source_id uuid, p_date date, p_reason text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare r record; n integer := 0;
begin
  for r in
    select l.* from public.ledger_transactions l
    where l.business_id = p_business_id and l.source_type = p_source_type and l.source_id = p_source_id
      and l.reversal_of is null
      and not exists (select 1 from public.ledger_transactions x where x.reversal_of = l.id)
  loop
    perform private.post_ledger(p_business_id, r.party_id, r.ledger, p_date, 'REVERSAL', r.credit, r.debit,
      p_source_type, p_source_id, 'Reversal: ' || coalesce(p_reason, ''), r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Receivable: debit − credit. Payable: credit − debit. As of a date (inclusive) or all time.
create or replace function private.party_balance(p_party_id uuid, p_ledger text, p_as_of date default null)
returns numeric language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(case when p_ledger = 'RECEIVABLE' then debit - credit else credit - debit end), 0)
  from public.ledger_transactions
  where party_id = p_party_id and ledger = p_ledger and (p_as_of is null or txn_date <= p_as_of)
$$;

create or replace function private.normalize_phone(p_phone text)
returns text language plpgsql immutable set search_path = ''
as $$
declare d text;
begin
  if p_phone is null or trim(p_phone) = '' then return null; end if;
  d := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if left(trim(p_phone), 1) = '+' then
    if length(d) between 8 and 15 then return '+' || d; end if;
  elsif length(d) = 10 then return '+91' || d;
  elsif length(d) = 11 and left(d, 1) = '0' then return '+91' || substring(d from 2);
  elsif length(d) = 12 and left(d, 2) = '91' then return '+' || d;
  end if;
  raise exception 'VALIDATION: enter a valid 10-digit mobile number';
end $$;

-- ---------------------------------------------------------------- parties --
-- p jsonb: name, phone, address, notes, is_customer, is_supplier, customer_type, default_rate,
--          opening_receivable, default_purchase_rate, opening_payable, opening_as_of, allow_duplicate
create or replace function public.create_party(p_business_id uuid, p jsonb, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.member_role; v_id uuid; v_phone text; v_dups jsonb;
  v_is_c boolean := coalesce((p ->> 'is_customer')::boolean, false);
  v_is_s boolean := coalesce((p ->> 'is_supplier')::boolean, false);
  v_open_r numeric := coalesce(nullif(p ->> 'opening_receivable', '')::numeric, 0);
  v_open_p numeric := coalesce(nullif(p ->> 'opening_payable', '')::numeric, 0);
  v_date date := coalesce(nullif(p ->> 'opening_as_of', '')::date, private.business_today(p_business_id));
begin
  v_role := private.require_office(p_business_id);
  if v_is_s then perform private.require_perm(p_business_id, 'suppliers'); end if;
  if not (v_is_c or v_is_s) then raise exception 'VALIDATION: choose customer and/or supplier'; end if;
  if p_idempotency_key is not null then
    select id into v_id from public.parties where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  end if;
  if char_length(coalesce(trim(p ->> 'name'), '')) < 2 then raise exception 'VALIDATION: name is required'; end if;
  v_phone := private.normalize_phone(p ->> 'phone');
  perform private.money(v_open_r, 'opening receivable', true, true);
  perform private.money(v_open_p, 'opening payable', true, true);
  if (v_open_r < 0 or v_open_p < 0) and v_role <> 'owner' then raise exception 'FORBIDDEN: only the owner can record an opening advance'; end if;

  if not coalesce((p ->> 'allow_duplicate')::boolean, false) then
    select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'phone', x.phone)) into v_dups
    from public.parties x
    where x.business_id = p_business_id and (lower(x.name) = lower(trim(p ->> 'name')) or (v_phone is not null and x.phone = v_phone));
    if v_dups is not null then
      raise exception 'DUPLICATE_PARTY: a party with the same name or mobile already exists' using detail = v_dups::text;
    end if;
  end if;

  insert into public.parties (business_id, name, phone, address, notes, is_customer, is_supplier, idempotency_key, created_by)
  values (p_business_id, trim(p ->> 'name'), v_phone, nullif(trim(p ->> 'address'), ''), nullif(trim(p ->> 'notes'), ''), v_is_c, v_is_s, p_idempotency_key, auth.uid())
  returning id into v_id;

  if v_is_c then
    insert into public.customers (party_id, business_id, customer_type, default_rate, opening_receivable, opening_as_of)
    values (v_id, p_business_id, coalesce(nullif(p ->> 'customer_type', ''), 'TRADER'),
            private.money_opt(nullif(p ->> 'default_rate', '')::numeric, 'default rate', true) , v_open_r, v_date);
    perform private.post_ledger(p_business_id, v_id, 'RECEIVABLE', v_date, 'OPENING',
      greatest(v_open_r, 0), greatest(-v_open_r, 0), 'party', v_id, 'Opening balance');
  end if;
  if v_is_s then
    insert into public.suppliers (party_id, business_id, default_purchase_rate, opening_payable, opening_as_of)
    values (v_id, p_business_id, private.money_opt(nullif(p ->> 'default_purchase_rate', '')::numeric, 'purchase rate', true), v_open_p, v_date);
    perform private.post_ledger(p_business_id, v_id, 'PAYABLE', v_date, 'OPENING',
      greatest(-v_open_p, 0), greatest(v_open_p, 0), 'party', v_id, 'Opening balance');
  end if;

  perform private.audit(p_business_id, 'PARTY_CREATE', 'parties', v_id,
    jsonb_build_object('name', p ->> 'name', 'customer', v_is_c, 'supplier', v_is_s, 'opening_receivable', v_open_r, 'opening_payable', v_open_p));
  return jsonb_build_object('id', v_id, 'duplicate', false);
exception when unique_violation then
  select id into v_id from public.parties where business_id = p_business_id and idempotency_key = p_idempotency_key;
  if v_id is not null then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  raise;
end $$;

-- money() with null passthrough for optional rates
create or replace function private.money_opt(p_value numeric, p_field text, p_allow_zero boolean)
returns numeric language plpgsql immutable set search_path = ''
as $$
begin
  if p_value is null then return null; end if;
  return private.money(p_value, p_field, p_allow_zero, false);
end $$;

create or replace function public.update_party(p_business_id uuid, p_party_id uuid, p_expected_version integer, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_role public.member_role; x public.parties; v_phone text; v_diff numeric; v_new numeric; v_old numeric;
begin
  v_role := private.require_office(p_business_id);
  select * into x from public.parties where id = p_party_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: party'; end if;
  if x.is_supplier and not x.is_customer then perform private.require_perm(p_business_id, 'suppliers'); end if;
  if x.version <> p_expected_version then raise exception 'CONFLICT: this record was changed by someone else — refresh'; end if;

  if p ? 'phone' then v_phone := private.normalize_phone(p ->> 'phone'); else v_phone := x.phone; end if;
  if p ? 'name' and char_length(coalesce(trim(p ->> 'name'), '')) < 2 then raise exception 'VALIDATION: name is required'; end if;

  update public.parties set
    name = coalesce(nullif(trim(p ->> 'name'), ''), name),
    phone = v_phone,
    address = case when p ? 'address' then nullif(trim(p ->> 'address'), '') else address end,
    notes = case when p ? 'notes' then nullif(trim(p ->> 'notes'), '') else notes end,
    updated_at = now(), version = version + 1
  where id = p_party_id;

  -- add a role to an existing party (e.g. a trader who also sells to us)
  if coalesce((p ->> 'is_customer')::boolean, false) and not x.is_customer then
    update public.parties set is_customer = true where id = p_party_id;
    insert into public.customers (party_id, business_id, opening_receivable, opening_as_of)
    values (p_party_id, p_business_id, 0, private.business_today(p_business_id)) on conflict do nothing;
  end if;
  if coalesce((p ->> 'is_supplier')::boolean, false) and not x.is_supplier then
    perform private.require_perm(p_business_id, 'suppliers');
    update public.parties set is_supplier = true where id = p_party_id;
    insert into public.suppliers (party_id, business_id, opening_payable, opening_as_of)
    values (p_party_id, p_business_id, 0, private.business_today(p_business_id)) on conflict do nothing;
  end if;

  if exists (select 1 from public.customers where party_id = p_party_id) then
    update public.customers set
      customer_type = coalesce(nullif(p ->> 'customer_type', ''), customer_type),
      default_rate = case when p ? 'default_rate' then private.money_opt(nullif(p ->> 'default_rate', '')::numeric, 'default rate', true) else default_rate end
    where party_id = p_party_id;
    if p ? 'opening_receivable' then
      select opening_receivable into v_old from public.customers where party_id = p_party_id;
      v_new := private.money(coalesce(nullif(p ->> 'opening_receivable', '')::numeric, 0), 'opening receivable', true, true);
      v_diff := v_new - v_old;
      if v_diff <> 0 then
        if v_role <> 'owner' then raise exception 'FORBIDDEN: only the owner can change an opening balance'; end if;
        update public.customers set opening_receivable = v_new where party_id = p_party_id;
        perform private.post_ledger(p_business_id, p_party_id, 'RECEIVABLE', coalesce((select opening_as_of from public.customers where party_id = p_party_id), private.business_today(p_business_id)),
          'ADJUSTMENT', greatest(v_diff, 0), greatest(-v_diff, 0), 'party', p_party_id, 'Opening balance changed from ' || v_old || ' to ' || v_new);
        perform private.audit(p_business_id, 'OPENING_BALANCE_CHANGE', 'parties', p_party_id, jsonb_build_object('ledger', 'RECEIVABLE', 'old', v_old, 'new', v_new));
      end if;
    end if;
  end if;
  if exists (select 1 from public.suppliers where party_id = p_party_id) and private.has_perm(p_business_id, 'suppliers') then
    update public.suppliers set
      default_purchase_rate = case when p ? 'default_purchase_rate' then private.money_opt(nullif(p ->> 'default_purchase_rate', '')::numeric, 'purchase rate', true) else default_purchase_rate end
    where party_id = p_party_id;
    if p ? 'opening_payable' then
      select opening_payable into v_old from public.suppliers where party_id = p_party_id;
      v_new := private.money(coalesce(nullif(p ->> 'opening_payable', '')::numeric, 0), 'opening payable', true, true);
      v_diff := v_new - v_old;
      if v_diff <> 0 then
        if v_role <> 'owner' then raise exception 'FORBIDDEN: only the owner can change an opening balance'; end if;
        update public.suppliers set opening_payable = v_new where party_id = p_party_id;
        perform private.post_ledger(p_business_id, p_party_id, 'PAYABLE', coalesce((select opening_as_of from public.suppliers where party_id = p_party_id), private.business_today(p_business_id)),
          'ADJUSTMENT', greatest(-v_diff, 0), greatest(v_diff, 0), 'party', p_party_id, 'Opening payable changed from ' || v_old || ' to ' || v_new);
        perform private.audit(p_business_id, 'OPENING_BALANCE_CHANGE', 'parties', p_party_id, jsonb_build_object('ledger', 'PAYABLE', 'old', v_old, 'new', v_new));
      end if;
    end if;
  end if;

  perform private.audit(p_business_id, 'PARTY_UPDATE', 'parties', p_party_id, p - 'opening_receivable' - 'opening_payable');
  return jsonb_build_object('id', p_party_id, 'version', x.version + 1);
end $$;

create or replace function public.set_party_status(p_business_id uuid, p_party_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_owner(p_business_id);
  if p_status not in ('ACTIVE', 'INACTIVE') then raise exception 'VALIDATION: status'; end if;
  update public.parties set status = p_status, updated_at = now(), version = version + 1
  where id = p_party_id and business_id = p_business_id;
  if not found then raise exception 'NOT_FOUND: party'; end if;
  perform private.audit(p_business_id, 'PARTY_STATUS', 'parties', p_party_id, jsonb_build_object('status', p_status));
  return jsonb_build_object('id', p_party_id);
end $$;

-- Owner-only credit/debit note on either ledger.
create or replace function public.record_ledger_adjustment(p_business_id uuid, p_party_id uuid, p_ledger text, p_direction text, p_amount numeric, p_date date, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_amt numeric; v_id uuid;
begin
  perform private.require_owner(p_business_id);
  if p_ledger not in ('RECEIVABLE', 'PAYABLE') or p_direction not in ('INCREASE', 'DECREASE') then raise exception 'VALIDATION: adjustment type'; end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'VALIDATION: a reason is required'; end if;
  if not exists (select 1 from public.parties where id = p_party_id and business_id = p_business_id
                 and ((p_ledger = 'RECEIVABLE' and is_customer) or (p_ledger = 'PAYABLE' and is_supplier))) then
    raise exception 'NOT_FOUND: party';
  end if;
  v_amt := private.money(p_amount, 'amount');
  v_id := private.post_ledger(p_business_id, p_party_id, p_ledger, coalesce(p_date, private.business_today(p_business_id)), 'ADJUSTMENT',
    case when (p_ledger = 'RECEIVABLE') = (p_direction = 'INCREASE') then v_amt else 0 end,
    case when (p_ledger = 'RECEIVABLE') = (p_direction = 'INCREASE') then 0 else v_amt end,
    'adjustment', null, trim(p_reason));
  perform private.audit(p_business_id, 'LEDGER_ADJUSTMENT', 'ledger_transactions', v_id,
    jsonb_build_object('party_id', p_party_id, 'ledger', p_ledger, 'direction', p_direction, 'amount', v_amt, 'reason', p_reason));
  return jsonb_build_object('id', v_id, 'balance', private.party_balance(p_party_id, p_ledger));
end $$;

-- --------------------------------------------------------------- payments --
create or replace function private.post_payment(p public.payments)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p.direction = 'IN' then
    perform private.post_ledger(p.business_id, p.party_id, 'RECEIVABLE', p.payment_date, 'PAYMENT', 0, p.amount, 'payment', p.id,
      'Payment received (' || p.method || coalesce(' ' || p.reference, '') || ')');
  else
    perform private.post_ledger(p.business_id, p.party_id, 'PAYABLE', p.payment_date, 'PAYMENT', p.amount, 0, 'payment', p.id,
      'Payment made (' || p.method || coalesce(' ' || p.reference, '') || ')');
  end if;
end $$;

-- p jsonb: party_id, direction (IN/OUT), amount, method, reference, payment_date, notes, trip_id, confirm_overpayment
create or replace function public.record_payment(p_business_id uuid, p jsonb, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid; v_dir text := upper(coalesce(p ->> 'direction', 'IN')); v_party uuid := (p ->> 'party_id')::uuid;
  v_amt numeric; v_bal numeric; v_ledger text; v_settings jsonb; pay public.payments;
  v_date date := coalesce(nullif(p ->> 'payment_date', '')::date, private.business_today(p_business_id));
begin
  perform private.require_office(p_business_id);
  if v_dir = 'OUT' then perform private.require_perm(p_business_id, 'suppliers'); end if;
  if v_dir not in ('IN', 'OUT') then raise exception 'VALIDATION: direction'; end if;
  if p_idempotency_key is not null then
    select * into pay from public.payments where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('id', pay.id, 'duplicate', true, 'status', pay.status,
        'balance', private.party_balance(pay.party_id, case when pay.direction = 'IN' then 'RECEIVABLE' else 'PAYABLE' end));
    end if;
  end if;
  if not exists (select 1 from public.parties where id = v_party and business_id = p_business_id
                 and ((v_dir = 'IN' and is_customer) or (v_dir = 'OUT' and is_supplier))) then
    raise exception 'NOT_FOUND: party';
  end if;
  if v_date > private.business_today(p_business_id) then raise exception 'VALIDATION: payment date cannot be in the future'; end if;
  v_amt := private.money((p ->> 'amount')::numeric, 'amount');
  if coalesce(p ->> 'method', '') not in ('CASH', 'UPI', 'BANK_TRANSFER', 'OTHER') then raise exception 'VALIDATION: payment method'; end if;

  v_ledger := case when v_dir = 'IN' then 'RECEIVABLE' else 'PAYABLE' end;
  perform pg_advisory_xact_lock(hashtextextended(v_party::text, 0));
  v_bal := private.party_balance(v_party, v_ledger);
  if v_amt > greatest(v_bal, 0) then
    select settings into v_settings from public.businesses where id = p_business_id;
    if v_dir = 'IN' and not coalesce((v_settings ->> 'allow_customer_advance')::boolean, false) then
      raise exception 'OVERPAYMENT_NOT_ALLOWED: payment is more than the outstanding balance'
        using detail = jsonb_build_object('outstanding', v_bal, 'amount', v_amt, 'excess', v_amt - greatest(v_bal, 0))::text;
    end if;
    if not coalesce((p ->> 'confirm_overpayment')::boolean, false) then
      raise exception 'OVERPAYMENT_CONFIRMATION_REQUIRED: payment is more than the outstanding balance'
        using detail = jsonb_build_object('outstanding', v_bal, 'amount', v_amt, 'excess', v_amt - greatest(v_bal, 0))::text;
    end if;
  end if;

  insert into public.payments (business_id, party_id, direction, amount, method, reference, payment_date, status, source,
    trip_id, notes, collected_by, verified_by, verified_at, idempotency_key, created_by)
  values (p_business_id, v_party, v_dir, v_amt, p ->> 'method', nullif(trim(p ->> 'reference'), ''), v_date, 'CONFIRMED', 'OFFICE',
    nullif(p ->> 'trip_id', '')::uuid, nullif(trim(p ->> 'notes'), ''), auth.uid(), auth.uid(), now(), p_idempotency_key, auth.uid())
  returning * into pay;
  perform private.post_payment(pay);
  perform private.audit(p_business_id, 'PAYMENT_' || v_dir, 'payments', pay.id, jsonb_build_object('party_id', v_party, 'amount', v_amt, 'method', pay.method));
  return jsonb_build_object('id', pay.id, 'duplicate', false, 'status', pay.status, 'balance', private.party_balance(v_party, v_ledger));
end $$;

-- Owner / staff with verify_payments confirms or rejects a driver collection.
create or replace function public.verify_payment(p_business_id uuid, p_payment_id uuid, p_approve boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare pay public.payments;
begin
  perform private.require_perm(p_business_id, 'verify_payments');
  select * into pay from public.payments where id = p_payment_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: payment'; end if;
  if pay.status <> 'PENDING_VERIFICATION' then
    return jsonb_build_object('id', pay.id, 'status', pay.status, 'unchanged', true);
  end if;
  if not p_approve and char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'VALIDATION: give a reason for rejecting'; end if;
  update public.payments set status = case when p_approve then 'CONFIRMED' else 'REJECTED' end,
    verified_by = auth.uid(), verified_at = now(), status_reason = nullif(trim(p_reason), ''), version = version + 1
  where id = p_payment_id returning * into pay;
  if p_approve then perform private.post_payment(pay); end if;
  perform private.audit(p_business_id, case when p_approve then 'PAYMENT_VERIFY' else 'PAYMENT_REJECT' end, 'payments', pay.id,
    jsonb_build_object('amount', pay.amount, 'reason', p_reason));
  return jsonb_build_object('id', pay.id, 'status', pay.status,
    'balance', private.party_balance(pay.party_id, case when pay.direction = 'IN' then 'RECEIVABLE' else 'PAYABLE' end));
end $$;

create or replace function public.void_payment(p_business_id uuid, p_payment_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare pay public.payments;
begin
  perform private.require_owner(p_business_id);
  if char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'VALIDATION: a reason is required'; end if;
  select * into pay from public.payments where id = p_payment_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: payment'; end if;
  if pay.status = 'VOID' then return jsonb_build_object('id', pay.id, 'status', 'VOID', 'unchanged', true); end if;
  if pay.status = 'CONFIRMED' then
    perform private.reverse_source(p_business_id, 'payment', pay.id, private.business_today(p_business_id), p_reason);
  end if;
  update public.payments set status = 'VOID', status_reason = trim(p_reason), version = version + 1 where id = pay.id;
  perform private.audit(p_business_id, 'PAYMENT_VOID', 'payments', pay.id, jsonb_build_object('amount', pay.amount, 'reason', p_reason));
  return jsonb_build_object('id', pay.id, 'status', 'VOID',
    'balance', private.party_balance(pay.party_id, case when pay.direction = 'IN' then 'RECEIVABLE' else 'PAYABLE' end));
end $$;
