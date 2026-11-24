-- PoulGo · 0011 party_statement: running balance computed before aggregation
-- (an aggregate cannot contain a window function).
create or replace function public.party_statement(p_business_id uuid, p_party_id uuid, p_ledger text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_open numeric; v_rows jsonb; v_close numeric; v_sign integer;
begin
  perform private.require_office(p_business_id);
  if p_ledger = 'PAYABLE' then perform private.require_perm(p_business_id, 'suppliers'); end if;
  if not exists (select 1 from public.parties where id = p_party_id and business_id = p_business_id) then raise exception 'NOT_FOUND: party'; end if;
  v_sign := case when p_ledger = 'RECEIVABLE' then 1 else -1 end;
  v_open := private.party_balance(p_party_id, p_ledger, p_from - 1);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id, 'date', x.txn_date, 'type', x.entry_type, 'description', x.description, 'debit', x.debit, 'credit', x.credit,
      'source_type', x.source_type, 'source_id', x.source_id, 'is_reversal', x.reversal_of is not null, 'balance', x.running)
    order by x.txn_date, x.created_at, x.id), '[]'::jsonb)
  into v_rows
  from (
    select l.*, v_open + sum((l.debit - l.credit) * v_sign) over (order by l.txn_date, l.created_at, l.id) as running
    from public.ledger_transactions l
    where l.party_id = p_party_id and l.ledger = p_ledger and l.txn_date between p_from and p_to
  ) x;
  v_close := private.party_balance(p_party_id, p_ledger, p_to);
  return jsonb_build_object('opening', v_open, 'closing', v_close, 'current', private.party_balance(p_party_id, p_ledger), 'rows', v_rows,
    'from', p_from, 'to', p_to);
end $$;
