-- PoulGo · 0008 Read models: party lists, dashboard, statements, daily WhatsApp summaries, P&L, outstanding

-- Parties with live balances. p_kind: CUSTOMER | SUPPLIER
create or replace function public.list_parties(p_business_id uuid, p_kind text, p_as_of date default null)
returns table (id uuid, name text, phone text, address text, status text, customer_type text, is_customer boolean, is_supplier boolean,
  default_rate numeric, receivable numeric, payable numeric, last_activity date, version integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_office(p_business_id);
  if p_kind = 'SUPPLIER' then perform private.require_perm(p_business_id, 'suppliers'); end if;
  return query
  select p.id, p.name, p.phone, p.address, p.status, c.customer_type, p.is_customer, p.is_supplier,
    case when p_kind = 'SUPPLIER' then s.default_purchase_rate else c.default_rate end,
    case when p.is_customer then coalesce(sum(l.debit - l.credit) filter (where l.ledger = 'RECEIVABLE'), 0) end,
    case when p.is_supplier and private.has_perm(p_business_id, 'suppliers') then coalesce(sum(l.credit - l.debit) filter (where l.ledger = 'PAYABLE'), 0) end,
    max(l.txn_date) filter (where l.entry_type <> 'OPENING'),
    p.version
  from public.parties p
  left join public.customers c on c.party_id = p.id
  left join public.suppliers s on s.party_id = p.id
  left join public.ledger_transactions l on l.party_id = p.id and (p_as_of is null or l.txn_date <= p_as_of)
  where p.business_id = p_business_id and ((p_kind = 'CUSTOMER' and p.is_customer) or (p_kind = 'SUPPLIER' and p.is_supplier))
  group by p.id, c.customer_type, c.default_rate, s.default_purchase_rate
  order by p.name;
end $$;

-- Ledger statement with running balance. Balance sign follows the ledger (positive = owed).
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
      'id', id, 'date', txn_date, 'type', entry_type, 'description', description, 'debit', debit, 'credit', credit,
      'source_type', source_type, 'source_id', source_id, 'is_reversal', reversal_of is not null,
      'balance', v_open + sum((debit - credit) * v_sign) over (order by txn_date, created_at, id))
    order by txn_date, created_at, id), '[]'::jsonb)
  into v_rows
  from public.ledger_transactions
  where party_id = p_party_id and ledger = p_ledger and txn_date between p_from and p_to;
  v_close := private.party_balance(p_party_id, p_ledger, p_to);
  return jsonb_build_object('opening', v_open, 'closing', v_close, 'current', private.party_balance(p_party_id, p_ledger), 'rows', v_rows,
    'from', p_from, 'to', p_to);
end $$;

-- Daily WhatsApp summary data for one party and one date (PRD §5.1, §7.1).
create or replace function public.party_daily_summary(p_business_id uuid, p_party_id uuid, p_ledger text, p_date date)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare p public.parties; v_lines jsonb; v_bill numeric; v_paid numeric; v_adj numeric; v_prev numeric; v_total numeric;
  v_qty integer; v_w numeric;
begin
  perform private.require_office(p_business_id);
  if p_ledger = 'PAYABLE' then perform private.require_perm(p_business_id, 'suppliers'); end if;
  select * into p from public.parties where id = p_party_id and business_id = p_business_id;
  if not found then raise exception 'NOT_FOUND: party'; end if;

  if p_ledger = 'RECEIVABLE' then
    select coalesce(jsonb_agg(jsonb_build_object('size', s.name, 'size_mr', s.name_mr, 'size_hi', s.name_hi, 'qty', x.qty, 'weight_kg', x.w, 'amount', x.amt) order by s.sort_order), '[]'::jsonb),
           coalesce(sum(x.qty), 0), coalesce(sum(x.w), 0)
      into v_lines, v_qty, v_w
    from (select bi.bird_size_id, sum(bi.qty) qty, sum(bi.weight_kg) w, sum(bi.amount) amt
          from public.bill_items bi join public.bills b on b.id = bi.bill_id
          where b.customer_id = p_party_id and b.bill_date = p_date and b.status = 'POSTED' group by bi.bird_size_id) x
    left join public.bird_sizes s on s.id = x.bird_size_id;
    select coalesce(sum(final_amount), 0) into v_bill from public.bills where customer_id = p_party_id and bill_date = p_date and status = 'POSTED';
    select coalesce(sum(amount), 0) into v_paid from public.payments where party_id = p_party_id and direction = 'IN' and payment_date = p_date and status = 'CONFIRMED';
  else
    select coalesce(jsonb_agg(jsonb_build_object('size', s.name, 'size_mr', s.name_mr, 'size_hi', s.name_hi, 'qty', x.qty, 'weight_kg', x.w, 'rate', x.rate, 'amount', x.amt) order by s.sort_order), '[]'::jsonb),
           coalesce(sum(x.qty), 0), coalesce(sum(x.w), 0)
      into v_lines, v_qty, v_w
    from (select pi.bird_size_id, sum(pi.qty) qty, sum(pi.weight_kg) w, sum(pi.amount) amt,
                 case when count(distinct pi.rate) = 1 then min(pi.rate) end rate
          from public.purchase_items pi join public.purchases pu on pu.id = pi.purchase_id
          where pu.supplier_id = p_party_id and pu.purchase_date = p_date and pu.status = 'POSTED' group by pi.bird_size_id) x
    left join public.bird_sizes s on s.id = x.bird_size_id;
    select coalesce(sum(final_amount), 0) into v_bill from public.purchases where supplier_id = p_party_id and purchase_date = p_date and status = 'POSTED';
    select coalesce(sum(amount), 0) into v_paid from public.payments where party_id = p_party_id and direction = 'OUT' and payment_date = p_date and status = 'CONFIRMED';
  end if;

  v_prev := private.party_balance(p_party_id, p_ledger, p_date - 1);
  v_total := private.party_balance(p_party_id, p_ledger, p_date);
  v_adj := v_total - v_prev - (v_bill - v_paid); -- adjustments/reversals posted that day

  return jsonb_build_object('party_id', p.id, 'name', p.name, 'phone', p.phone, 'date', p_date, 'ledger', p_ledger,
    'lines', v_lines, 'total_qty', v_qty, 'total_weight', v_w,
    'bill_amount', v_bill, 'paid_amount', v_paid, 'adjustments', v_adj,
    'day_change', v_total - v_prev, 'previous_balance', v_prev, 'total_balance', v_total);
end $$;

create or replace function public.log_whatsapp_share(p_business_id uuid, p_party_id uuid, p_type text, p_date date, p_phone text, p_preview text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_office(p_business_id);
  insert into public.whatsapp_share_logs (business_id, party_id, message_type, summary_date, phone, message_preview, actor)
  values (p_business_id, p_party_id, p_type, p_date, p_phone, left(p_preview, 2000), auth.uid());
end $$;

-- Outstanding receivables or payables as of a date.
create or replace function public.outstanding_report(p_business_id uuid, p_ledger text, p_as_of date)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_rows jsonb;
begin
  perform private.require_office(p_business_id);
  if p_ledger = 'PAYABLE' then perform private.require_perm(p_business_id, 'suppliers'); end if;
  select coalesce(jsonb_agg(r order by (r ->> 'balance')::numeric desc), '[]'::jsonb) into v_rows from (
    select jsonb_build_object('party_id', p.id, 'name', p.name, 'phone', p.phone, 'status', p.status,
      'balance', sum(case when p_ledger = 'RECEIVABLE' then l.debit - l.credit else l.credit - l.debit end),
      'last_payment', max(l.txn_date) filter (where l.entry_type = 'PAYMENT')) r
    from public.parties p join public.ledger_transactions l on l.party_id = p.id and l.ledger = p_ledger and l.txn_date <= p_as_of
    where p.business_id = p_business_id
    group by p.id
    having sum(case when p_ledger = 'RECEIVABLE' then l.debit - l.credit else l.credit - l.debit end) <> 0
  ) q;
  return jsonb_build_object('as_of', p_as_of, 'ledger', p_ledger, 'rows', v_rows,
    'total_owed', coalesce((select sum((e ->> 'balance')::numeric) from jsonb_array_elements(v_rows) e where (e ->> 'balance')::numeric > 0), 0),
    'total_advance', coalesce((select -sum((e ->> 'balance')::numeric) from jsonb_array_elements(v_rows) e where (e ->> 'balance')::numeric < 0), 0));
end $$;

-- Profit & Loss (Owner only). Sales and COGS are recognised on bill date.
create or replace function public.get_pnl(p_business_id uuid, p_from date, p_to date, p_log boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_sales numeric; v_cogs numeric; v_loss numeric; v_exp numeric; v_uncosted numeric; v_unsettled integer; v_pending numeric;
  v_cash_in numeric; v_cash_out numeric; v_purch numeric; v_trips jsonb; v_daily jsonb; v_exp_cat jsonb; v_reasons jsonb := '[]'::jsonb;
begin
  perform private.require_owner(p_business_id);
  if p_from > p_to then raise exception 'VALIDATION: start date must be before end date'; end if;
  if p_log then perform private.audit(p_business_id, 'PNL_VIEW', 'businesses', p_business_id, jsonb_build_object('from', p_from, 'to', p_to)); end if;

  select coalesce(sum(final_amount), 0) into v_sales from public.bills where business_id = p_business_id and status = 'POSTED' and bill_date between p_from and p_to;
  select coalesce(sum(ca.cost_amount), 0), coalesce(sum(ca.uncosted_weight), 0) into v_cogs, v_uncosted
    from public.cost_allocations ca join public.bills b on b.id = ca.bill_id
    where ca.business_id = p_business_id and b.bill_date between p_from and p_to;
  select coalesce(-sum(cost_amount), 0) into v_loss from public.inventory_movements
    where business_id = p_business_id and movement_type in ('DAMAGE', 'DEATH', 'SHORTAGE') and movement_date between p_from and p_to;
  select coalesce(sum(amount), 0) into v_exp from public.expenses where business_id = p_business_id and status = 'ACTIVE' and expense_date between p_from and p_to;
  select coalesce(sum(amount) filter (where direction = 'IN'), 0), coalesce(sum(amount) filter (where direction = 'OUT'), 0)
    into v_cash_in, v_cash_out from public.payments where business_id = p_business_id and status = 'CONFIRMED' and payment_date between p_from and p_to;
  select coalesce(sum(final_amount), 0) into v_purch from public.purchases where business_id = p_business_id and status = 'POSTED' and purchase_date between p_from and p_to;
  select count(distinct t.id) into v_unsettled from public.trips t join public.bills b on b.trip_id = t.id
    where t.business_id = p_business_id and t.status <> 'SETTLED' and b.status = 'POSTED' and b.bill_date between p_from and p_to;
  select coalesce(sum(amount), 0) into v_pending from public.payments where business_id = p_business_id and status = 'PENDING_VERIFICATION';

  if v_uncosted > 0 then v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'UNCOSTED_STOCK', 'weight_kg', v_uncosted)); end if;
  if v_unsettled > 0 then v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'UNSETTLED_TRIPS', 'count', v_unsettled)); end if;
  if v_pending > 0 then v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'PENDING_COLLECTIONS', 'amount', v_pending)); end if;

  select coalesce(jsonb_agg(x order by x ->> 'date'), '[]'::jsonb) into v_trips from (
    select jsonb_build_object('trip_id', t.id, 'trip_no', t.trip_no, 'date', t.trip_date, 'status', t.status,
      'sales', coalesce((select sum(b.final_amount) from public.bills b where b.trip_id = t.id and b.status = 'POSTED'), 0),
      'cogs', coalesce((select sum(ca.cost_amount) from public.cost_allocations ca join public.bills b on b.id = ca.bill_id where b.trip_id = t.id), 0)
            + coalesce((select -sum(m.cost_amount) from public.inventory_movements m where m.trip_id = t.id and m.movement_type in ('DAMAGE', 'DEATH', 'SHORTAGE')), 0),
      'expenses', coalesce((select sum(e.amount) from public.expenses e where e.trip_id = t.id and e.status = 'ACTIVE'), 0)) x
    from public.trips t where t.business_id = p_business_id and t.trip_date between p_from and p_to and t.status <> 'CANCELLED'
  ) q;
  select coalesce(jsonb_agg(x || jsonb_build_object('gross', (x ->> 'sales')::numeric - (x ->> 'cogs')::numeric,
      'net', (x ->> 'sales')::numeric - (x ->> 'cogs')::numeric - (x ->> 'expenses')::numeric)), '[]'::jsonb)
    into v_trips from jsonb_array_elements(v_trips) x;

  select coalesce(jsonb_agg(jsonb_build_object('date', d, 'sales', s, 'cogs', c, 'expenses', e, 'net', s - c - e) order by d), '[]'::jsonb) into v_daily
  from (
    select g::date d,
      coalesce((select sum(final_amount) from public.bills where business_id = p_business_id and status = 'POSTED' and bill_date = g::date), 0) s,
      coalesce((select sum(ca.cost_amount) from public.cost_allocations ca join public.bills b on b.id = ca.bill_id where ca.business_id = p_business_id and b.bill_date = g::date), 0)
        + coalesce((select -sum(cost_amount) from public.inventory_movements where business_id = p_business_id and movement_type in ('DAMAGE', 'DEATH', 'SHORTAGE') and movement_date = g::date), 0) c,
      coalesce((select sum(amount) from public.expenses where business_id = p_business_id and status = 'ACTIVE' and expense_date = g::date), 0) e
    from generate_series(p_from, least(p_to, p_from + 366), interval '1 day') g
  ) z;

  select coalesce(jsonb_agg(jsonb_build_object('category', c.name, 'category_mr', c.name_mr, 'category_hi', c.name_hi, 'amount', x.a) order by x.a desc), '[]'::jsonb)
    into v_exp_cat
  from (select category_id, sum(amount) a from public.expenses where business_id = p_business_id and status = 'ACTIVE' and expense_date between p_from and p_to group by category_id) x
  join public.expense_categories c on c.id = x.category_id;

  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'sales', v_sales, 'cogs_goods', v_cogs, 'stock_loss', v_loss, 'cogs', v_cogs + v_loss,
    'gross_profit', v_sales - v_cogs - v_loss, 'expenses', v_exp, 'net_profit', v_sales - v_cogs - v_loss - v_exp,
    'provisional', jsonb_array_length(v_reasons) > 0, 'provisional_reasons', v_reasons,
    'receivable_total', (select coalesce(sum(debit - credit), 0) from public.ledger_transactions where business_id = p_business_id and ledger = 'RECEIVABLE' and txn_date <= p_to),
    'payable_total', (select coalesce(sum(credit - debit), 0) from public.ledger_transactions where business_id = p_business_id and ledger = 'PAYABLE' and txn_date <= p_to),
    'cash_collected', v_cash_in, 'supplier_payments', v_cash_out, 'net_cash', v_cash_in - v_cash_out, 'purchases', v_purch,
    'pending_collections', v_pending,
    'stock', (select coalesce(jsonb_agg(jsonb_build_object('size', s.name, 'size_mr', s.name_mr, 'size_hi', s.name_hi, 'qty', sp.qty, 'weight_kg', sp.weight_kg, 'cost', sp.cost_amount) order by s.sort_order), '[]'::jsonb)
              from public.stock_positions sp join public.bird_sizes s on s.id = sp.bird_size_id where sp.business_id = p_business_id),
    'trips', v_trips, 'daily', v_daily, 'expenses_by_category', v_exp_cat);
end $$;

-- Owner / staff dashboard for one day.
create or replace function public.get_dashboard(p_business_id uuid, p_date date default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_role public.member_role; d date; v_sup boolean; v_out jsonb; v_sizes jsonb; v_trips jsonb; v_pnl jsonb;
begin
  v_role := private.require_office(p_business_id);
  d := coalesce(p_date, private.business_today(p_business_id));
  v_sup := private.has_perm(p_business_id, 'suppliers');

  select coalesce(jsonb_agg(jsonb_build_object('bird_size_id', s.id, 'name', s.name, 'name_mr', s.name_mr, 'name_hi', s.name_hi,
      'ordered', coalesce((select sum(oi.ordered_qty) from public.order_items oi join public.orders o on o.id = oi.order_id
                           where o.business_id = p_business_id and o.order_date = d and o.status <> 'CANCELLED' and oi.bird_size_id = s.id), 0),
      'loaded', coalesce((select sum(l.loaded_qty) from public.loading_entries l join public.trips t on t.id = l.trip_id
                          where t.business_id = p_business_id and t.trip_date = d and t.status <> 'CANCELLED' and l.bird_size_id = s.id), 0),
      'delivered', coalesce((select sum(di.delivered_qty) from public.delivery_items di join public.deliveries dl on dl.id = di.delivery_id
                             where dl.business_id = p_business_id and (dl.delivered_at at time zone 'Asia/Kolkata')::date = d and di.bird_size_id = s.id), 0),
      'remaining', coalesce((select sum(oi.ordered_qty - oi.delivered_qty) from public.order_items oi join public.orders o on o.id = oi.order_id
                             where o.business_id = p_business_id and o.order_date <= d and o.status not in ('CANCELLED', 'COMPLETED', 'DRAFT') and oi.bird_size_id = s.id), 0)
    ) order by s.sort_order), '[]'::jsonb)
    into v_sizes
  from public.bird_sizes s where s.business_id = p_business_id and s.active;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'trip_no', t.trip_no, 'status', t.status, 'trip_date', t.trip_date,
      'driver', dr.name, 'vehicle', v.registration_no,
      'customers', (select count(distinct a.customer_id) from public.trip_allocations a where a.trip_id = t.id),
      'delivered', (select count(*) from public.deliveries x where x.trip_id = t.id)) order by t.trip_date, t.trip_no), '[]'::jsonb)
    into v_trips
  from public.trips t left join public.drivers dr on dr.id = t.driver_id left join public.vehicles v on v.id = t.vehicle_id
  where t.business_id = p_business_id and t.status not in ('SETTLED', 'CANCELLED') and t.trip_date <= d;

  v_out := jsonb_build_object(
    'date', d, 'role', v_role,
    'sales_today', (select coalesce(sum(final_amount), 0) from public.bills where business_id = p_business_id and status = 'POSTED' and bill_date = d),
    'bills_today', (select count(*) from public.bills where business_id = p_business_id and status = 'POSTED' and bill_date = d),
    'received_today', (select coalesce(sum(amount), 0) from public.payments where business_id = p_business_id and direction = 'IN' and status = 'CONFIRMED' and payment_date = d),
    'pending_verification', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0)) from public.payments where business_id = p_business_id and status = 'PENDING_VERIFICATION'),
    'receivable_total', (select coalesce(sum(debit - credit), 0) from public.ledger_transactions where business_id = p_business_id and ledger = 'RECEIVABLE'),
    'customers_with_dues', (select count(*) from (select party_id from public.ledger_transactions where business_id = p_business_id and ledger = 'RECEIVABLE' group by party_id having sum(debit - credit) > 0) x),
    'sizes', v_sizes,
    'active_trips', v_trips,
    'pending_deliveries', (select count(*) from (select distinct a.trip_id, a.customer_id from public.trip_allocations a join public.trips t on t.id = a.trip_id
                            where t.business_id = p_business_id and t.status in ('ASSIGNED', 'LOADING', 'DISPATCHED', 'IN_PROGRESS')
                              and not exists (select 1 from public.deliveries x where x.trip_id = a.trip_id and x.customer_id = a.customer_id)) q),
    'unsettled_trips', (select count(*) from public.trips where business_id = p_business_id and status in ('IN_PROGRESS', 'COMPLETED') and trip_date < d)
  );
  if v_sup then
    v_out := v_out || jsonb_build_object(
      'purchases_today', (select coalesce(sum(final_amount), 0) from public.purchases where business_id = p_business_id and status = 'POSTED' and purchase_date = d),
      'supplier_paid_today', (select coalesce(sum(amount), 0) from public.payments where business_id = p_business_id and direction = 'OUT' and status = 'CONFIRMED' and payment_date = d),
      'payable_total', (select coalesce(sum(credit - debit), 0) from public.ledger_transactions where business_id = p_business_id and ledger = 'PAYABLE'));
  end if;
  if v_role = 'owner' then
    v_pnl := public.get_pnl(p_business_id, d, d, false);
    v_out := v_out || jsonb_build_object('profit', jsonb_build_object('gross_profit', v_pnl -> 'gross_profit', 'net_profit', v_pnl -> 'net_profit',
      'sales', v_pnl -> 'sales', 'cogs', v_pnl -> 'cogs', 'expenses', v_pnl -> 'expenses', 'provisional', v_pnl -> 'provisional', 'provisional_reasons', v_pnl -> 'provisional_reasons'));
  end if;
  return v_out;
end $$;

-- Driver home: own open trips with progress (no money beyond what they collected).
create or replace function public.driver_trips(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_member(p_business_id);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'trip_no', t.trip_no, 'trip_date', t.trip_date, 'status', t.status,
      'vehicle', v.registration_no,
      'customers', (select count(distinct a.customer_id) from public.trip_allocations a where a.trip_id = t.id),
      'delivered', (select count(*) from public.deliveries x where x.trip_id = t.id),
      'birds', (select coalesce(sum(a.allocated_qty), 0) from public.trip_allocations a where a.trip_id = t.id),
      'collected', (select coalesce(sum(p.amount), 0) from public.payments p where p.trip_id = t.id and p.collected_by = auth.uid() and p.status <> 'VOID' and p.status <> 'REJECTED'))
    order by t.trip_date desc, t.trip_no desc), '[]'::jsonb)
    from public.trips t left join public.vehicles v on v.id = t.vehicle_id
    where t.business_id = p_business_id and private.is_trip_driver(t.id));
end $$;

grant execute on all functions in schema public to authenticated;
revoke execute on all functions in schema public from anon, public;
