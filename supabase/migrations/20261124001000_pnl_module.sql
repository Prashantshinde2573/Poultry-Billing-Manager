-- PoulGo · 0010 Profit & loss belongs to plans with the 'pnl' module
create or replace function public.get_pnl(p_business_id uuid, p_from date, p_to date, p_log boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_sales numeric; v_cogs numeric; v_loss numeric; v_exp numeric; v_uncosted numeric; v_unsettled integer; v_pending numeric;
  v_cash_in numeric; v_cash_out numeric; v_purch numeric; v_trips jsonb; v_daily jsonb; v_exp_cat jsonb; v_reasons jsonb := '[]'::jsonb;
begin
  perform private.require_owner(p_business_id);
  perform private.require_module(p_business_id, 'pnl');
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
  if v_role = 'owner' and private.has_module(p_business_id, 'pnl') then
    v_pnl := public.get_pnl(p_business_id, d, d, false);
    v_out := v_out || jsonb_build_object('profit', jsonb_build_object('gross_profit', v_pnl -> 'gross_profit', 'net_profit', v_pnl -> 'net_profit',
      'sales', v_pnl -> 'sales', 'cogs', v_pnl -> 'cogs', 'expenses', v_pnl -> 'expenses', 'provisional', v_pnl -> 'provisional', 'provisional_reasons', v_pnl -> 'provisional_reasons'));
  end if;
  return v_out;
end $$;
