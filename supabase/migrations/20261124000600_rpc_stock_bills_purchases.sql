-- PoulGo · 0006 RPC: weighted-average stock, purchases (payables), bills (receivables), COGS

-- ------------------------------------------------------------------ stock --
create or replace function private.lock_stock(p_business_id uuid, p_bird_size_id uuid)
returns public.stock_positions language plpgsql security definer set search_path = ''
as $$
declare s public.stock_positions;
begin
  insert into public.stock_positions (business_id, bird_size_id) values (p_business_id, p_bird_size_id)
  on conflict do nothing;
  select * into s from public.stock_positions where business_id = p_business_id and bird_size_id = p_bird_size_id for update;
  return s;
end $$;

create or replace function private.stock_in(p_business_id uuid, p_size uuid, p_qty integer, p_weight numeric, p_cost numeric,
  p_date date, p_type text, p_trip uuid, p_source_type text, p_source_id uuid, p_note text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.lock_stock(p_business_id, p_size);
  update public.stock_positions set qty = qty + p_qty, weight_kg = weight_kg + p_weight, cost_amount = cost_amount + p_cost, updated_at = now()
  where business_id = p_business_id and bird_size_id = p_size;
  insert into public.inventory_movements (business_id, bird_size_id, movement_date, movement_type, qty, weight_kg, cost_amount, trip_id, source_type, source_id, note, created_by)
  values (p_business_id, p_size, p_date, p_type, p_qty, p_weight, p_cost, p_trip, p_source_type, p_source_id, p_note, auth.uid());
end $$;

-- Takes p_weight kg out of stock at weighted-average cost. Returns (cost, uncosted_weight, avg).
create or replace function private.stock_out(p_business_id uuid, p_size uuid, p_qty integer, p_weight numeric,
  p_date date, p_type text, p_trip uuid, p_source_type text, p_source_id uuid, p_note text,
  out o_cost numeric, out o_uncosted numeric, out o_avg numeric)
language plpgsql security definer set search_path = ''
as $$
declare s public.stock_positions; v_w numeric;
begin
  s := private.lock_stock(p_business_id, p_size);
  if s.weight_kg <= 0 then
    o_cost := 0; o_uncosted := p_weight; o_avg := null; v_w := 0;
  elsif s.weight_kg <= p_weight then
    o_cost := s.cost_amount; o_uncosted := p_weight - s.weight_kg; v_w := s.weight_kg;
    o_avg := round(s.cost_amount / s.weight_kg, 4);
  else
    o_avg := round(s.cost_amount / s.weight_kg, 4);
    o_cost := round(s.cost_amount * p_weight / s.weight_kg, 2); o_uncosted := 0; v_w := p_weight;
  end if;
  update public.stock_positions set
    qty = greatest(qty - p_qty, 0),
    weight_kg = weight_kg - v_w,
    cost_amount = greatest(cost_amount - o_cost, 0),
    updated_at = now()
  where business_id = p_business_id and bird_size_id = p_size;
  insert into public.inventory_movements (business_id, bird_size_id, movement_date, movement_type, qty, weight_kg, cost_amount, uncosted_weight, trip_id, source_type, source_id, note, created_by)
  values (p_business_id, p_size, p_date, p_type, -p_qty, -p_weight, -o_cost, o_uncosted, p_trip, p_source_type, p_source_id, p_note, auth.uid());
end $$;

-- Damaged / dead / short birds found at settlement: removed at average cost (a stock loss in COGS).
create or replace function public.record_stock_loss(p_business_id uuid, p_trip_id uuid, p_bird_size_id uuid, p_qty integer, p_kind text, p_note text, p_date date default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare s public.stock_positions; v_w numeric; r record;
begin
  perform private.require_owner(p_business_id);
  if p_kind not in ('DAMAGE', 'DEATH', 'SHORTAGE') then raise exception 'VALIDATION: loss type'; end if;
  perform private.qty(p_qty, 'quantity', false);
  if char_length(coalesce(trim(p_note), '')) < 3 then raise exception 'VALIDATION: a note is required'; end if;
  s := private.lock_stock(p_business_id, p_bird_size_id);
  v_w := case when s.qty > 0 then least(round(s.weight_kg * p_qty / s.qty, 3), s.weight_kg) else 0 end;
  select * into r from private.stock_out(p_business_id, p_bird_size_id, p_qty, v_w, coalesce(p_date, private.business_today(p_business_id)),
    p_kind, p_trip_id, 'trip', p_trip_id, trim(p_note));
  perform private.audit(p_business_id, 'STOCK_LOSS', 'trips', p_trip_id,
    jsonb_build_object('bird_size_id', p_bird_size_id, 'qty', p_qty, 'kind', p_kind, 'weight', v_w, 'cost', r.o_cost, 'note', p_note));
  return jsonb_build_object('weight_kg', v_w, 'cost', r.o_cost);
end $$;

-- -------------------------------------------------------------- purchases --
-- p jsonb: supplier_id, purchase_date, trip_id, vehicle_ref, notes, final_amount, adjustment_reason,
--          items: [{bird_size_id, qty, weight_kg, rate}]
create or replace function public.create_purchase(p_business_id uuid, p jsonb, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid; v_no text; it jsonb; v_calc numeric := 0; v_final numeric; v_alloc numeric := 0; v_share numeric;
  v_n integer; v_i integer := 0; v_w numeric; v_rate numeric; v_amt numeric; v_qty integer; v_total_w numeric := 0;
  v_supplier uuid := (p ->> 'supplier_id')::uuid; v_item_id uuid;
  v_date date := coalesce(nullif(p ->> 'purchase_date', '')::date, private.business_today(p_business_id));
  v_existing public.purchases;
begin
  perform private.require_perm(p_business_id, 'suppliers');
  if p_idempotency_key is not null then
    select * into v_existing from public.purchases where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if found then return jsonb_build_object('id', v_existing.id, 'purchase_no', v_existing.purchase_no, 'duplicate', true,
      'balance', private.party_balance(v_existing.supplier_id, 'PAYABLE')); end if;
  end if;
  if not exists (select 1 from public.parties where id = v_supplier and business_id = p_business_id and is_supplier) then
    raise exception 'NOT_FOUND: supplier';
  end if;
  if v_date > private.business_today(p_business_id) then raise exception 'VALIDATION: purchase date cannot be in the future'; end if;
  v_n := jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb));
  if v_n = 0 then raise exception 'VALIDATION: add at least one size line'; end if;

  -- validate lines and compute the calculated amount
  for it in select * from jsonb_array_elements(p -> 'items') loop
    if not exists (select 1 from public.bird_sizes where id = (it ->> 'bird_size_id')::uuid and business_id = p_business_id) then
      raise exception 'NOT_FOUND: bird size';
    end if;
    v_qty := private.qty((it ->> 'qty')::integer, 'birds');
    v_w := private.weight((it ->> 'weight_kg')::numeric, 'weight');
    v_rate := private.money((it ->> 'rate')::numeric, 'rate', true, false);
    v_calc := v_calc + round(v_w * v_rate, 2);
    v_total_w := v_total_w + v_w;
  end loop;

  v_final := coalesce(nullif(p ->> 'final_amount', '')::numeric, v_calc);
  perform private.money(v_final, 'final amount', true, false);
  if v_final <> v_calc then
    perform private.require_perm(p_business_id, 'rate_override');
    if char_length(coalesce(trim(p ->> 'adjustment_reason'), '')) < 3 then raise exception 'VALIDATION: a reason is required when the final amount differs'; end if;
  end if;

  v_no := private.next_number(p_business_id, 'purchase', 'PUR');
  insert into public.purchases (business_id, purchase_no, supplier_id, purchase_date, trip_id, vehicle_ref, calculated_amount, final_amount,
    adjustment_reason, notes, idempotency_key, created_by)
  values (p_business_id, v_no, v_supplier, v_date, nullif(p ->> 'trip_id', '')::uuid, nullif(trim(p ->> 'vehicle_ref'), ''), v_calc, v_final,
    case when v_final <> v_calc then trim(p ->> 'adjustment_reason') end, nullif(trim(p ->> 'notes'), ''), p_idempotency_key, auth.uid())
  returning id into v_id;

  -- lines; the final amount is spread over lines in proportion to their amounts (last line takes the remainder)
  for it in select * from jsonb_array_elements(p -> 'items') loop
    v_i := v_i + 1;
    v_qty := (it ->> 'qty')::integer; v_w := (it ->> 'weight_kg')::numeric; v_rate := (it ->> 'rate')::numeric;
    v_amt := round(v_w * v_rate, 2);
    if v_i = v_n then v_share := v_final - v_alloc;
    elsif v_calc > 0 then v_share := round(v_final * v_amt / v_calc, 2);
    else v_share := round(v_final * v_w / v_total_w, 2); end if;
    v_alloc := v_alloc + v_share;
    insert into public.purchase_items (business_id, purchase_id, bird_size_id, qty, weight_kg, rate, amount, cost_amount)
    values (p_business_id, v_id, (it ->> 'bird_size_id')::uuid, v_qty, v_w, v_rate, v_amt, v_share)
    returning id into v_item_id;
    perform private.stock_in(p_business_id, (it ->> 'bird_size_id')::uuid, v_qty, v_w, v_share, v_date, 'PURCHASE',
      nullif(p ->> 'trip_id', '')::uuid, 'purchase', v_id, v_no);
  end loop;

  perform private.post_ledger(p_business_id, v_supplier, 'PAYABLE', v_date, 'PURCHASE', 0, v_final, 'purchase', v_id, 'Purchase ' || v_no);
  perform private.audit(p_business_id, 'PURCHASE_CREATE', 'purchases', v_id,
    jsonb_build_object('purchase_no', v_no, 'calculated', v_calc, 'final', v_final, 'reason', p ->> 'adjustment_reason'));
  return jsonb_build_object('id', v_id, 'purchase_no', v_no, 'duplicate', false, 'calculated_amount', v_calc, 'final_amount', v_final,
    'balance', private.party_balance(v_supplier, 'PAYABLE'));
end $$;

create or replace function public.void_purchase(p_business_id uuid, p_purchase_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare pu public.purchases; it record; s public.stock_positions; v_today date := private.business_today(p_business_id);
begin
  perform private.require_owner(p_business_id);
  if char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'VALIDATION: a reason is required'; end if;
  select * into pu from public.purchases where id = p_purchase_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: purchase'; end if;
  if pu.status = 'VOID' then return jsonb_build_object('id', pu.id, 'status', 'VOID', 'unchanged', true); end if;
  for it in select * from public.purchase_items where purchase_id = pu.id loop
    s := private.lock_stock(p_business_id, it.bird_size_id);
    if s.weight_kg < it.weight_kg or s.cost_amount < it.cost_amount then
      raise exception 'STOCK_CONSUMED: these birds were already sold — record a supplier adjustment instead of voiding';
    end if;
    update public.stock_positions set qty = greatest(qty - it.qty, 0), weight_kg = weight_kg - it.weight_kg,
      cost_amount = cost_amount - it.cost_amount, updated_at = now()
    where business_id = p_business_id and bird_size_id = it.bird_size_id;
    insert into public.inventory_movements (business_id, bird_size_id, movement_date, movement_type, qty, weight_kg, cost_amount, source_type, source_id, note, created_by)
    values (p_business_id, it.bird_size_id, v_today, 'PURCHASE_VOID', -it.qty, -it.weight_kg, -it.cost_amount, 'purchase', pu.id, p_reason, auth.uid());
  end loop;
  perform private.reverse_source(p_business_id, 'purchase', pu.id, v_today, p_reason);
  update public.purchases set status = 'VOID', void_reason = trim(p_reason), voided_by = auth.uid(), voided_at = now() where id = pu.id;
  perform private.audit(p_business_id, 'PURCHASE_VOID', 'purchases', pu.id, jsonb_build_object('purchase_no', pu.purchase_no, 'reason', p_reason));
  return jsonb_build_object('id', pu.id, 'status', 'VOID', 'balance', private.party_balance(pu.supplier_id, 'PAYABLE'));
end $$;

-- ------------------------------------------------------------------ bills --
-- Posts a bill: lines, receivable debit, COGS. items: [{bird_size_id?, delivery_item_id?, qty, weight_kg, rate}]
create or replace function private.post_bill(p_business_id uuid, p_customer uuid, p_date date, p_delivery uuid, p_trip uuid,
  p_items jsonb, p_final numeric, p_reason text, p_notes text, p_idem text)
returns public.bills language plpgsql security definer set search_path = ''
as $$
declare b public.bills; it jsonb; v_calc numeric := 0; v_final numeric; v_no text; v_item_id uuid; v_amt numeric; r record;
  v_w numeric; v_rate numeric; v_qty integer;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    v_w := private.weight((it ->> 'weight_kg')::numeric, 'weight');
    v_rate := private.money((it ->> 'rate')::numeric, 'rate', true, false);
    perform private.qty(coalesce((it ->> 'qty')::integer, 0), 'birds');
    v_calc := v_calc + round(v_w * v_rate, 2);
  end loop;
  v_final := coalesce(p_final, v_calc);
  perform private.money(v_final, 'final amount', true, false);
  if v_final <> v_calc then
    perform private.require_perm(p_business_id, 'rate_override');
    if char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'VALIDATION: a reason is required when the final amount differs'; end if;
  end if;
  v_no := private.next_number(p_business_id, 'bill', 'BIL');
  insert into public.bills (business_id, bill_no, customer_id, delivery_id, trip_id, bill_date, calculated_amount, final_amount, adjustment_reason, notes, idempotency_key, created_by)
  values (p_business_id, v_no, p_customer, p_delivery, p_trip, p_date, v_calc, v_final, case when v_final <> v_calc then trim(p_reason) end,
    nullif(trim(p_notes), ''), p_idem, auth.uid())
  returning * into b;

  for it in select * from jsonb_array_elements(p_items) loop
    v_w := (it ->> 'weight_kg')::numeric; v_rate := (it ->> 'rate')::numeric; v_qty := coalesce((it ->> 'qty')::integer, 0);
    v_amt := round(v_w * v_rate, 2);
    insert into public.bill_items (business_id, bill_id, bird_size_id, delivery_item_id, qty, weight_kg, rate, amount)
    values (p_business_id, b.id, nullif(it ->> 'bird_size_id', '')::uuid, nullif(it ->> 'delivery_item_id', '')::uuid, v_qty, v_w, v_rate, v_amt)
    returning id into v_item_id;
    if nullif(it ->> 'bird_size_id', '') is not null then
      select * into r from private.stock_out(p_business_id, (it ->> 'bird_size_id')::uuid, v_qty, v_w, p_date, 'SALE', p_trip, 'bill', b.id, v_no);
      insert into public.cost_allocations (business_id, bill_id, bill_item_id, bird_size_id, allocation_date, weight_kg, cost_amount, uncosted_weight, avg_cost_per_kg)
      values (p_business_id, b.id, v_item_id, (it ->> 'bird_size_id')::uuid, p_date, v_w, r.o_cost, r.o_uncosted, r.o_avg);
    end if;
  end loop;

  perform private.post_ledger(p_business_id, p_customer, 'RECEIVABLE', p_date, 'BILL', v_final, 0, 'bill', b.id, 'Bill ' || v_no);
  perform private.audit(p_business_id, 'BILL_CREATE', 'bills', b.id,
    jsonb_build_object('bill_no', v_no, 'calculated', v_calc, 'final', v_final, 'delivery_id', p_delivery, 'reason', p_reason));
  return b;
end $$;

-- Direct counter sale (the v1 "Add Bill"): office users; bird size optional (needed for COGS).
-- p jsonb: customer_id, bill_date, notes, final_amount, adjustment_reason, items: [{bird_size_id, qty, weight_kg, rate}]
create or replace function public.create_direct_bill(p_business_id uuid, p jsonb, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare b public.bills; v_customer uuid := (p ->> 'customer_id')::uuid;
  v_date date := coalesce(nullif(p ->> 'bill_date', '')::date, private.business_today(p_business_id));
begin
  perform private.require_office(p_business_id);
  if p_idempotency_key is not null then
    select * into b from public.bills where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if found then return jsonb_build_object('id', b.id, 'bill_no', b.bill_no, 'final_amount', b.final_amount, 'duplicate', true,
      'balance', private.party_balance(b.customer_id, 'RECEIVABLE')); end if;
  end if;
  if not exists (select 1 from public.parties where id = v_customer and business_id = p_business_id and is_customer and status = 'ACTIVE') then
    raise exception 'NOT_FOUND: active customer';
  end if;
  if v_date > private.business_today(p_business_id) then raise exception 'VALIDATION: bill date cannot be in the future'; end if;
  if jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) = 0 then raise exception 'VALIDATION: add at least one line'; end if;
  if exists (select 1 from jsonb_array_elements(p -> 'items') e where nullif(e ->> 'bird_size_id', '') is not null
             and not exists (select 1 from public.bird_sizes s where s.id = (e ->> 'bird_size_id')::uuid and s.business_id = p_business_id)) then
    raise exception 'NOT_FOUND: bird size';
  end if;
  b := private.post_bill(p_business_id, v_customer, v_date, null, null, p -> 'items', nullif(p ->> 'final_amount', '')::numeric,
    p ->> 'adjustment_reason', p ->> 'notes', p_idempotency_key);
  return jsonb_build_object('id', b.id, 'bill_no', b.bill_no, 'final_amount', b.final_amount, 'calculated_amount', b.calculated_amount,
    'duplicate', false, 'balance', private.party_balance(v_customer, 'RECEIVABLE'));
end $$;

-- Undo a bill's COGS: put the allocated kg and cost back into stock.
create or replace function private.reverse_bill_cost(p_business_id uuid, p_bill_id uuid, p_date date, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare ca public.cost_allocations; v_qty integer;
begin
  for ca in select * from public.cost_allocations where bill_id = p_bill_id and not is_reversal loop
    select qty into v_qty from public.bill_items where id = ca.bill_item_id;
    perform private.lock_stock(p_business_id, ca.bird_size_id);
    update public.stock_positions set qty = qty + coalesce(v_qty, 0), weight_kg = weight_kg + (ca.weight_kg - ca.uncosted_weight),
      cost_amount = cost_amount + ca.cost_amount, updated_at = now()
    where business_id = p_business_id and bird_size_id = ca.bird_size_id;
    insert into public.inventory_movements (business_id, bird_size_id, movement_date, movement_type, qty, weight_kg, cost_amount, uncosted_weight, source_type, source_id, note, created_by)
    values (p_business_id, ca.bird_size_id, p_date, 'SALE_VOID', coalesce(v_qty, 0), ca.weight_kg - ca.uncosted_weight, ca.cost_amount, -ca.uncosted_weight, 'bill', p_bill_id, p_reason, auth.uid());
    insert into public.cost_allocations (business_id, bill_id, bill_item_id, bird_size_id, allocation_date, weight_kg, cost_amount, uncosted_weight, avg_cost_per_kg, is_reversal)
    values (p_business_id, p_bill_id, ca.bill_item_id, ca.bird_size_id, p_date, -ca.weight_kg, -ca.cost_amount, -ca.uncosted_weight, ca.avg_cost_per_kg, true);
  end loop;
end $$;

create or replace function public.void_bill(p_business_id uuid, p_bill_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare b public.bills; v_today date := private.business_today(p_business_id);
begin
  perform private.require_owner(p_business_id);
  if char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'VALIDATION: a reason is required'; end if;
  select * into b from public.bills where id = p_bill_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: bill'; end if;
  if b.status = 'VOID' then return jsonb_build_object('id', b.id, 'status', 'VOID', 'unchanged', true); end if;
  perform private.reverse_bill_cost(p_business_id, b.id, v_today, p_reason);
  perform private.reverse_source(p_business_id, 'bill', b.id, v_today, p_reason);
  update public.bills set status = 'VOID', void_reason = trim(p_reason), voided_by = auth.uid(), voided_at = now() where id = b.id;
  perform private.audit(p_business_id, 'BILL_VOID', 'bills', b.id, jsonb_build_object('bill_no', b.bill_no, 'amount', b.final_amount, 'reason', p_reason));
  return jsonb_build_object('id', b.id, 'status', 'VOID', 'balance', private.party_balance(b.customer_id, 'RECEIVABLE'));
end $$;

-- Owner correction of a delivery bill: voids it and posts a corrected bill for the same delivery.
-- p_items: [{bill_item_id, weight_kg, rate}] for the lines to change (others are kept as they were).
create or replace function public.correct_bill(p_business_id uuid, p_bill_id uuid, p_items jsonb, p_final_amount numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare b public.bills; nb public.bills; v_items jsonb;
begin
  perform private.require_owner(p_business_id);
  if char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'VALIDATION: a reason is required'; end if;
  select * into b from public.bills where id = p_bill_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: bill'; end if;
  if b.status <> 'POSTED' then raise exception 'VALIDATION: only a posted bill can be corrected'; end if;
  select jsonb_agg(jsonb_build_object(
      'bird_size_id', bi.bird_size_id, 'delivery_item_id', bi.delivery_item_id, 'qty', bi.qty,
      'weight_kg', coalesce((c ->> 'weight_kg')::numeric, bi.weight_kg),
      'rate', coalesce((c ->> 'rate')::numeric, bi.rate)) order by bi.id)
    into v_items
  from public.bill_items bi
  left join lateral (select e from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e where (e ->> 'bill_item_id')::uuid = bi.id limit 1) x(c) on true
  where bi.bill_id = b.id;
  perform public.void_bill(p_business_id, b.id, 'Corrected: ' || p_reason);
  nb := private.post_bill(p_business_id, b.customer_id, b.bill_date, b.delivery_id, b.trip_id, v_items, p_final_amount,
    case when p_final_amount is not null then p_reason end, b.notes, null);
  -- keep delivery lines in step with the corrected weights/rates
  update public.delivery_items di set weight_kg = (e ->> 'weight_kg')::numeric, rate = (e ->> 'rate')::numeric,
    amount = round((e ->> 'weight_kg')::numeric * (e ->> 'rate')::numeric, 2)
  from jsonb_array_elements(v_items) e
  where di.id = nullif(e ->> 'delivery_item_id', '')::uuid;
  perform private.audit(p_business_id, 'BILL_CORRECT', 'bills', nb.id, jsonb_build_object('replaces', b.id, 'reason', p_reason, 'old', b.final_amount, 'new', nb.final_amount));
  return jsonb_build_object('id', nb.id, 'bill_no', nb.bill_no, 'final_amount', nb.final_amount, 'balance', private.party_balance(b.customer_id, 'RECEIVABLE'));
end $$;
