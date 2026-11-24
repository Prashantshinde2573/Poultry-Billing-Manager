-- PoulGo · 0016 Khata shows birds and weight for every bill / purchase line.
create or replace function private.doc_lines(p_source_type text, p_source_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case
    when p_source_type = 'bill' then (
      select jsonb_agg(jsonb_build_object('size', s.name, 'size_mr', s.name_mr, 'size_hi', s.name_hi, 'qty', bi.qty, 'kg', bi.weight_kg, 'rate', bi.rate) order by s.sort_order)
      from public.bill_items bi join public.bird_sizes s on s.id = bi.bird_size_id where bi.bill_id = p_source_id)
    when p_source_type = 'purchase' then (
      select jsonb_agg(jsonb_build_object('size', s.name, 'size_mr', s.name_mr, 'size_hi', s.name_hi, 'qty', pi.qty, 'kg', pi.weight_kg, 'rate', pi.rate) order by s.sort_order)
      from public.purchase_items pi join public.bird_sizes s on s.id = pi.bird_size_id where pi.purchase_id = p_source_id)
  end
$$;

create or replace function public.party_statement(p_business_id uuid, p_party_id uuid, p_ledger text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_open numeric; v_rows jsonb; v_close numeric; v_sign integer; v_birds integer; v_kg numeric;
begin
  perform private.require_office(p_business_id);
  if p_ledger = 'PAYABLE' then perform private.require_perm(p_business_id, 'suppliers'); end if;
  if not exists (select 1 from public.parties where id = p_party_id and business_id = p_business_id) then raise exception 'NOT_FOUND: party'; end if;
  v_sign := case when p_ledger = 'RECEIVABLE' then 1 else -1 end;
  v_open := private.party_balance(p_party_id, p_ledger, p_from - 1);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id, 'date', x.txn_date, 'type', x.entry_type, 'description', x.description, 'debit', x.debit, 'credit', x.credit,
      'source_type', x.source_type, 'source_id', x.source_id, 'is_reversal', x.reversal_of is not null,
      'items', case when x.entry_type in ('BILL', 'PURCHASE') then private.doc_lines(x.source_type, x.source_id) end,
      'balance', x.bal)
    order by x.txn_date, x.created_at, x.id), '[]'::jsonb)
  into v_rows
  from (select l.*, v_open + sum((l.debit - l.credit) * v_sign) over (order by l.txn_date, l.created_at, l.id) bal
        from public.ledger_transactions l
        where l.party_id = p_party_id and l.ledger = p_ledger and l.txn_date between p_from and p_to) x;
  -- birds and weight in the period (posted documents only)
  if p_ledger = 'RECEIVABLE' then
    select coalesce(sum(bi.qty), 0), coalesce(sum(bi.weight_kg), 0) into v_birds, v_kg
      from public.bill_items bi join public.bills b on b.id = bi.bill_id
      where b.customer_id = p_party_id and b.status = 'POSTED' and b.bill_date between p_from and p_to;
  else
    select coalesce(sum(pi.qty), 0), coalesce(sum(pi.weight_kg), 0) into v_birds, v_kg
      from public.purchase_items pi join public.purchases pu on pu.id = pi.purchase_id
      where pu.supplier_id = p_party_id and pu.status = 'POSTED' and pu.purchase_date between p_from and p_to;
  end if;
  v_close := private.party_balance(p_party_id, p_ledger, p_to);
  return jsonb_build_object('opening', v_open, 'closing', v_close, 'current', private.party_balance(p_party_id, p_ledger), 'rows', v_rows,
    'from', p_from, 'to', p_to, 'birds', v_birds, 'kg', v_kg);
end $$;
revoke execute on function private.doc_lines(text, uuid) from public, anon, authenticated;
