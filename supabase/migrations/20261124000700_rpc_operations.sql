-- PoulGo · 0007 RPC: orders, trips, allocation, loading, delivery → bill, collections, expenses, settlement

-- ----------------------------------------------------------------- orders --
create or replace function private.refresh_order_status(p_order_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare o public.orders; v_ord integer; v_alloc integer; v_del integer;
begin
  select * into o from public.orders where id = p_order_id;
  if o.status in ('CANCELLED', 'DRAFT') then return; end if;
  select sum(ordered_qty), sum(allocated_qty), sum(delivered_qty) into v_ord, v_alloc, v_del from public.order_items where order_id = p_order_id;
  update public.orders set status = case
      when v_del >= v_ord then 'COMPLETED'
      when v_alloc + v_del >= v_ord then 'ALLOCATED'
      when v_alloc + v_del > 0 then 'PARTIALLY_ALLOCATED'
      else 'CONFIRMED' end,
    updated_at = now()
  where id = p_order_id;
end $$;

-- p jsonb: customer_id, order_date, notes, draft(bool), items: [{bird_size_id, qty, expected_weight, rate}]
create or replace function public.create_order(p_business_id uuid, p jsonb, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_no text; it jsonb; v_customer uuid := (p ->> 'customer_id')::uuid; o public.orders;
  v_date date := coalesce(nullif(p ->> 'order_date', '')::date, private.business_today(p_business_id));
begin
  perform private.require_office(p_business_id);
  if p_idempotency_key is not null then
    select * into o from public.orders where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if found then return jsonb_build_object('id', o.id, 'order_no', o.order_no, 'duplicate', true); end if;
  end if;
  if not exists (select 1 from public.parties where id = v_customer and business_id = p_business_id and is_customer and status = 'ACTIVE') then
    raise exception 'NOT_FOUND: active customer';
  end if;
  if jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) = 0 then raise exception 'VALIDATION: add at least one bird size'; end if;
  if (select count(distinct e ->> 'bird_size_id') from jsonb_array_elements(p -> 'items') e) <> jsonb_array_length(p -> 'items') then
    raise exception 'VALIDATION: each bird size can appear only once in an order';
  end if;
  v_no := private.next_number(p_business_id, 'order', 'ORD');
  insert into public.orders (business_id, order_no, customer_id, order_date, status, notes, idempotency_key, created_by)
  values (p_business_id, v_no, v_customer, v_date, case when coalesce((p ->> 'draft')::boolean, false) then 'DRAFT' else 'CONFIRMED' end,
    nullif(trim(p ->> 'notes'), ''), p_idempotency_key, auth.uid())
  returning id into v_id;
  for it in select * from jsonb_array_elements(p -> 'items') loop
    if not exists (select 1 from public.bird_sizes where id = (it ->> 'bird_size_id')::uuid and business_id = p_business_id) then
      raise exception 'NOT_FOUND: bird size';
    end if;
    insert into public.order_items (business_id, order_id, bird_size_id, ordered_qty, expected_weight, rate)
    values (p_business_id, v_id, (it ->> 'bird_size_id')::uuid, private.qty((it ->> 'qty')::integer, 'birds', false),
      case when nullif(it ->> 'expected_weight', '') is null then null else private.weight((it ->> 'expected_weight')::numeric, 'expected weight') end,
      private.money_opt(nullif(it ->> 'rate', '')::numeric, 'rate', true));
  end loop;
  perform private.audit(p_business_id, 'ORDER_CREATE', 'orders', v_id, jsonb_build_object('order_no', v_no, 'customer_id', v_customer));
  return jsonb_build_object('id', v_id, 'order_no', v_no, 'duplicate', false);
exception when unique_violation then
  select * into o from public.orders where business_id = p_business_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('id', o.id, 'order_no', o.order_no, 'duplicate', true); end if;
  raise;
end $$;

create or replace function public.set_order_status(p_business_id uuid, p_order_id uuid, p_status text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare o public.orders;
begin
  perform private.require_office(p_business_id);
  select * into o from public.orders where id = p_order_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: order'; end if;
  if p_status = 'CONFIRMED' and o.status = 'DRAFT' then
    update public.orders set status = 'CONFIRMED', updated_at = now(), version = version + 1 where id = o.id;
  elsif p_status = 'CANCELLED' then
    if o.status in ('COMPLETED', 'CANCELLED') then raise exception 'VALIDATION: this order can no longer be cancelled'; end if;
    if exists (select 1 from public.order_items where order_id = o.id and allocated_qty > 0) then
      raise exception 'VALIDATION: remove this order from its trips before cancelling';
    end if;
    if char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'VALIDATION: a reason is required'; end if;
    update public.orders set status = 'CANCELLED', notes = concat_ws(' · ', notes, 'Cancelled: ' || trim(p_reason)), updated_at = now(), version = version + 1 where id = o.id;
  else
    raise exception 'VALIDATION: status change not allowed';
  end if;
  perform private.audit(p_business_id, 'ORDER_STATUS', 'orders', o.id, jsonb_build_object('from', o.status, 'to', p_status, 'reason', p_reason));
  return jsonb_build_object('id', o.id, 'status', p_status);
end $$;

-- ------------------------------------------------------------------ trips --
create or replace function public.create_trip(p_business_id uuid, p jsonb, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_no text; t public.trips; v_vehicle uuid := nullif(p ->> 'vehicle_id', '')::uuid; v_driver uuid := nullif(p ->> 'driver_id', '')::uuid;
begin
  perform private.require_office(p_business_id);
  if p_idempotency_key is not null then
    select * into t from public.trips where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if found then return jsonb_build_object('id', t.id, 'trip_no', t.trip_no, 'duplicate', true); end if;
  end if;
  if v_vehicle is not null and not exists (select 1 from public.vehicles where id = v_vehicle and business_id = p_business_id and active) then raise exception 'NOT_FOUND: vehicle'; end if;
  if v_driver is not null and not exists (select 1 from public.drivers where id = v_driver and business_id = p_business_id and active) then raise exception 'NOT_FOUND: driver'; end if;
  v_no := private.next_number(p_business_id, 'trip', 'TRP');
  insert into public.trips (business_id, trip_no, trip_date, vehicle_id, driver_id, status, notes, idempotency_key, created_by)
  values (p_business_id, v_no, coalesce(nullif(p ->> 'trip_date', '')::date, private.business_today(p_business_id)), v_vehicle, v_driver,
    case when v_driver is not null and v_vehicle is not null then 'ASSIGNED' else 'DRAFT' end, nullif(trim(p ->> 'notes'), ''), p_idempotency_key, auth.uid())
  returning id into v_id;
  perform private.audit(p_business_id, 'TRIP_CREATE', 'trips', v_id, jsonb_build_object('trip_no', v_no, 'driver_id', v_driver, 'vehicle_id', v_vehicle));
  return jsonb_build_object('id', v_id, 'trip_no', v_no, 'duplicate', false);
end $$;

create or replace function public.update_trip(p_business_id uuid, p_trip_id uuid, p_expected_version integer, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare t public.trips;
begin
  perform private.require_office(p_business_id);
  select * into t from public.trips where id = p_trip_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: trip'; end if;
  if t.version <> p_expected_version then raise exception 'CONFLICT: this trip was changed by someone else — refresh'; end if;
  if t.status not in ('DRAFT', 'ASSIGNED', 'LOADING') then raise exception 'VALIDATION: a dispatched trip cannot be edited'; end if;
  update public.trips set
    vehicle_id = case when p ? 'vehicle_id' then nullif(p ->> 'vehicle_id', '')::uuid else vehicle_id end,
    driver_id = case when p ? 'driver_id' then nullif(p ->> 'driver_id', '')::uuid else driver_id end,
    trip_date = coalesce(nullif(p ->> 'trip_date', '')::date, trip_date),
    notes = case when p ? 'notes' then nullif(trim(p ->> 'notes'), '') else notes end,
    updated_at = now(), version = version + 1
  where id = t.id returning * into t;
  if t.status = 'DRAFT' and t.driver_id is not null and t.vehicle_id is not null then
    update public.trips set status = 'ASSIGNED' where id = t.id;
  end if;
  perform private.audit(p_business_id, 'TRIP_UPDATE', 'trips', t.id, p);
  return jsonb_build_object('id', t.id, 'version', t.version);
end $$;

-- allocations: [{order_item_id, qty, rate?}]
create or replace function public.allocate_to_trip(p_business_id uuid, p_trip_id uuid, p_allocations jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare t public.trips; a jsonb; oi public.order_items; o public.orders; v_qty integer; v_open integer; v_rate numeric; v_approved numeric; n integer := 0;
begin
  perform private.require_office(p_business_id);
  select * into t from public.trips where id = p_trip_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: trip'; end if;
  if t.status not in ('DRAFT', 'ASSIGNED', 'LOADING') then raise exception 'VALIDATION: orders can only be added before dispatch'; end if;
  for a in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    select * into oi from public.order_items where id = (a ->> 'order_item_id')::uuid and business_id = p_business_id for update;
    if not found then raise exception 'NOT_FOUND: order line'; end if;
    select * into o from public.orders where id = oi.order_id;
    if o.status in ('CANCELLED', 'DRAFT', 'COMPLETED') then raise exception 'VALIDATION: order % is %', o.order_no, o.status; end if;
    v_qty := private.qty((a ->> 'qty')::integer, 'birds', false);
    v_open := oi.ordered_qty - oi.allocated_qty - oi.delivered_qty;
    if v_qty > v_open then
      raise exception 'OVER_ALLOCATION: only % birds of order % are still open', v_open, o.order_no
        using detail = jsonb_build_object('order_item_id', oi.id, 'open', v_open)::text;
    end if;
    v_approved := coalesce(oi.rate, (select c.default_rate from public.customers c where c.party_id = o.customer_id),
                           private.size_rate(p_business_id, oi.bird_size_id, 'SALE', t.trip_date));
    v_rate := coalesce(nullif(a ->> 'rate', '')::numeric, v_approved);
    if v_rate is null then
      raise exception 'RATE_MISSING: set a sale rate for this size or on the order before allocating';
    end if;
    if v_approved is not null and v_rate <> v_approved then perform private.require_perm(p_business_id, 'rate_override'); end if;
    perform private.money(v_rate, 'rate', true, false);
    insert into public.trip_allocations (business_id, trip_id, order_item_id, customer_id, bird_size_id, allocated_qty, rate)
    values (p_business_id, t.id, oi.id, o.customer_id, oi.bird_size_id, v_qty, v_rate)
    on conflict (trip_id, order_item_id) do update set allocated_qty = public.trip_allocations.allocated_qty + excluded.allocated_qty, rate = excluded.rate;
    update public.order_items set allocated_qty = allocated_qty + v_qty where id = oi.id;
    perform private.refresh_order_status(o.id);
    n := n + 1;
  end loop;
  update public.trips set updated_at = now(), version = version + 1 where id = t.id;
  perform private.audit(p_business_id, 'TRIP_ALLOCATE', 'trips', t.id, jsonb_build_object('lines', p_allocations));
  return jsonb_build_object('trip_id', t.id, 'allocated_lines', n);
end $$;

create or replace function public.remove_allocation(p_business_id uuid, p_allocation_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare a public.trip_allocations; t public.trips; v_order uuid;
begin
  perform private.require_office(p_business_id);
  select * into a from public.trip_allocations where id = p_allocation_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: allocation'; end if;
  select * into t from public.trips where id = a.trip_id for update;
  if t.status not in ('DRAFT', 'ASSIGNED', 'LOADING') then raise exception 'VALIDATION: cannot change a dispatched trip'; end if;
  update public.order_items set allocated_qty = allocated_qty - a.allocated_qty where id = a.order_item_id returning order_id into v_order;
  delete from public.trip_allocations where id = a.id;
  perform private.refresh_order_status(v_order);
  update public.trips set updated_at = now(), version = version + 1 where id = t.id;
  perform private.audit(p_business_id, 'TRIP_UNALLOCATE', 'trips', t.id, jsonb_build_object('allocation_id', a.id, 'qty', a.allocated_qty));
  return jsonb_build_object('trip_id', t.id);
end $$;

-- entries: [{bird_size_id, loaded_qty, loaded_weight}]
create or replace function public.record_loading(p_business_id uuid, p_trip_id uuid, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare t public.trips; e jsonb; v_role public.member_role;
begin
  v_role := private.require_member(p_business_id);
  select * into t from public.trips where id = p_trip_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: trip'; end if;
  if v_role = 'driver' and not private.is_trip_driver(t.id) then raise exception 'FORBIDDEN: not your trip'; end if;
  if t.status not in ('ASSIGNED', 'LOADING', 'DISPATCHED') then raise exception 'VALIDATION: loading can be recorded before the trip starts'; end if;
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    if not exists (select 1 from public.bird_sizes where id = (e ->> 'bird_size_id')::uuid and business_id = p_business_id) then raise exception 'NOT_FOUND: bird size'; end if;
    insert into public.loading_entries (business_id, trip_id, bird_size_id, loaded_qty, loaded_weight, recorded_by)
    values (p_business_id, t.id, (e ->> 'bird_size_id')::uuid, private.qty((e ->> 'loaded_qty')::integer, 'loaded birds'),
      case when nullif(e ->> 'loaded_weight', '') is null then null else private.weight((e ->> 'loaded_weight')::numeric, 'loaded weight', true) end, auth.uid())
    on conflict (trip_id, bird_size_id) do update set loaded_qty = excluded.loaded_qty, loaded_weight = excluded.loaded_weight,
      recorded_by = excluded.recorded_by, updated_at = now();
  end loop;
  if t.status = 'ASSIGNED' then update public.trips set status = 'LOADING', updated_at = now(), version = version + 1 where id = t.id; end if;
  perform private.audit(p_business_id, 'TRIP_LOADING', 'trips', t.id, jsonb_build_object('entries', p_entries));
  return jsonb_build_object('trip_id', t.id);
end $$;

create or replace function public.set_trip_status(p_business_id uuid, p_trip_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare t public.trips; v_role public.member_role; v_ok boolean := false; a record;
begin
  v_role := private.require_member(p_business_id);
  select * into t from public.trips where id = p_trip_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: trip'; end if;
  if v_role = 'driver' then
    if not private.is_trip_driver(t.id) then raise exception 'FORBIDDEN: not your trip'; end if;
    v_ok := (t.status in ('ASSIGNED', 'LOADING', 'DISPATCHED') and p_status = 'IN_PROGRESS')
         or (t.status = 'IN_PROGRESS' and p_status = 'COMPLETED');
  else
    v_ok := (t.status = 'DRAFT' and p_status in ('ASSIGNED', 'CANCELLED'))
         or (t.status = 'ASSIGNED' and p_status in ('LOADING', 'DISPATCHED', 'IN_PROGRESS', 'CANCELLED', 'DRAFT'))
         or (t.status = 'LOADING' and p_status in ('DISPATCHED', 'IN_PROGRESS', 'ASSIGNED'))
         or (t.status = 'DISPATCHED' and p_status = 'IN_PROGRESS')
         or (t.status = 'IN_PROGRESS' and p_status = 'COMPLETED');
  end if;
  if not v_ok then raise exception 'VALIDATION: cannot move trip from % to %', t.status, p_status; end if;
  if p_status = 'ASSIGNED' and (t.driver_id is null or t.vehicle_id is null) then raise exception 'VALIDATION: choose a driver and a vehicle first'; end if;
  if p_status in ('DISPATCHED', 'IN_PROGRESS') and not exists (select 1 from public.trip_allocations where trip_id = t.id) then
    raise exception 'VALIDATION: add customer orders to the trip first';
  end if;
  if p_status = 'COMPLETED' and exists (
      select 1 from (select distinct customer_id from public.trip_allocations where trip_id = t.id) c
      where not exists (select 1 from public.deliveries d where d.trip_id = t.id and d.customer_id = c.customer_id)) then
    raise exception 'VALIDATION: some customers still have no delivery entry';
  end if;
  if p_status = 'CANCELLED' then
    if exists (select 1 from public.deliveries where trip_id = t.id) then raise exception 'VALIDATION: a trip with deliveries cannot be cancelled'; end if;
    for a in select ta.*, oi.order_id from public.trip_allocations ta join public.order_items oi on oi.id = ta.order_item_id where ta.trip_id = t.id loop
      update public.order_items set allocated_qty = allocated_qty - a.allocated_qty where id = a.order_item_id;
      perform private.refresh_order_status(a.order_id);
    end loop;
    delete from public.trip_allocations where trip_id = t.id;
  end if;
  update public.trips set status = p_status, updated_at = now(), version = version + 1 where id = t.id;
  perform private.audit(p_business_id, 'TRIP_STATUS', 'trips', t.id, jsonb_build_object('from', t.status, 'to', p_status));
  return jsonb_build_object('id', t.id, 'status', p_status);
end $$;

-- ------------------------------------------------------------ collections --
create or replace function private.insert_collection(p_business_id uuid, p_trip public.trips, p_customer uuid, p_delivery uuid, c jsonb, p_idem text, p_role public.member_role)
returns public.payments language plpgsql security definer set search_path = ''
as $$
declare pay public.payments; v_auto boolean; v_status text;
begin
  if coalesce(c ->> 'method', '') not in ('CASH', 'UPI', 'BANK_TRANSFER', 'OTHER') then raise exception 'VALIDATION: payment method'; end if;
  select coalesce((settings ->> 'driver_auto_confirm')::boolean, false) into v_auto from public.businesses where id = p_business_id;
  v_status := case when p_role = 'driver' and not v_auto then 'PENDING_VERIFICATION' else 'CONFIRMED' end;
  insert into public.payments (business_id, party_id, direction, amount, method, reference, payment_date, status, source, trip_id, delivery_id,
    notes, collected_by, verified_by, verified_at, idempotency_key, created_by)
  values (p_business_id, p_customer, 'IN', private.money((c ->> 'amount')::numeric, 'amount'), c ->> 'method', nullif(trim(c ->> 'reference'), ''),
    private.business_today(p_business_id), v_status, case when p_role = 'driver' then 'DRIVER' else 'OFFICE' end, p_trip.id, p_delivery,
    nullif(trim(c ->> 'notes'), ''), auth.uid(),
    case when v_status = 'CONFIRMED' then auth.uid() end, case when v_status = 'CONFIRMED' then now() end, p_idem, auth.uid())
  returning * into pay;
  if v_status = 'CONFIRMED' then perform private.post_payment(pay); end if;
  perform private.audit(p_business_id, 'COLLECTION_' || v_status, 'payments', pay.id, jsonb_build_object('amount', pay.amount, 'method', pay.method, 'trip_id', p_trip.id));
  return pay;
end $$;

-- --------------------------------------------------------------- delivery --
-- p jsonb: items: [{allocation_id, delivered_qty, weight_kg, returned_qty, damaged_qty, rate?}],
--          reason, notes, final_amount, adjustment_reason, collection: {amount, method, reference}
create or replace function public.record_delivery(p_business_id uuid, p_trip_id uuid, p_customer_id uuid, p jsonb, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.member_role; t public.trips; d public.deliveries; it jsonb; al public.trip_allocations;
  v_status text; v_total_alloc integer := 0; v_total_del integer := 0; v_del integer; v_ret integer; v_dmg integer; v_w numeric; v_rate numeric;
  v_items jsonb := '[]'::jsonb; v_di uuid; b public.bills; pay public.payments; v_n integer; v_today date := private.business_today(p_business_id);
begin
  v_role := private.require_member(p_business_id);
  select * into t from public.trips where id = p_trip_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: trip'; end if;
  if v_role = 'driver' and not private.is_trip_driver(t.id) then raise exception 'FORBIDDEN: not your trip'; end if;

  if p_idempotency_key is not null then
    select * into d from public.deliveries where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if found then
      select * into b from public.bills where delivery_id = d.id and status = 'POSTED';
      return jsonb_build_object('delivery_id', d.id, 'status', d.status, 'bill_id', b.id, 'bill_no', b.bill_no, 'bill_amount', b.final_amount, 'duplicate', true);
    end if;
  end if;
  if t.status not in ('LOADING', 'DISPATCHED', 'IN_PROGRESS') then raise exception 'VALIDATION: start the trip before recording deliveries'; end if;
  if exists (select 1 from public.deliveries where trip_id = t.id and customer_id = p_customer_id) then
    raise exception 'DUPLICATE: delivery for this customer is already recorded on this trip';
  end if;
  select count(*) into v_n from public.trip_allocations where trip_id = t.id and customer_id = p_customer_id;
  if v_n = 0 then raise exception 'NOT_FOUND: this customer is not on this trip'; end if;
  if jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) <> v_n
     or exists (select 1 from public.trip_allocations a where a.trip_id = t.id and a.customer_id = p_customer_id
                and not exists (select 1 from jsonb_array_elements(p -> 'items') e where (e ->> 'allocation_id')::uuid = a.id)) then
    raise exception 'VALIDATION: enter every size allocated to this customer';
  end if;

  -- status from quantities
  for it in select * from jsonb_array_elements(p -> 'items') loop
    select * into al from public.trip_allocations where id = (it ->> 'allocation_id')::uuid for update;
    v_del := private.qty((it ->> 'delivered_qty')::integer, 'delivered birds');
    v_ret := private.qty(coalesce((it ->> 'returned_qty')::integer, 0), 'returned birds');
    v_dmg := private.qty(coalesce((it ->> 'damaged_qty')::integer, 0), 'damaged birds');
    if v_del + v_ret + v_dmg > al.allocated_qty then raise exception 'VALIDATION: more birds than were allocated (% max)', al.allocated_qty; end if;
    v_total_alloc := v_total_alloc + al.allocated_qty; v_total_del := v_total_del + v_del;
  end loop;
  v_status := case when v_total_del = 0 then 'FAILED' when v_total_del = v_total_alloc then 'DELIVERED' else 'PARTIAL' end;
  if v_status <> 'DELIVERED' and char_length(coalesce(trim(p ->> 'reason'), '')) < 2 then
    raise exception 'VALIDATION: give a reason for a partial or failed delivery';
  end if;

  insert into public.deliveries (business_id, trip_id, customer_id, status, reason, notes, recorded_by, idempotency_key)
  values (p_business_id, t.id, p_customer_id, v_status, nullif(trim(p ->> 'reason'), ''), nullif(trim(p ->> 'notes'), ''), auth.uid(), p_idempotency_key)
  returning * into d;

  for it in select * from jsonb_array_elements(p -> 'items') loop
    select * into al from public.trip_allocations where id = (it ->> 'allocation_id')::uuid;
    v_del := (it ->> 'delivered_qty')::integer;
    v_ret := coalesce((it ->> 'returned_qty')::integer, 0);
    v_dmg := coalesce((it ->> 'damaged_qty')::integer, 0);
    if v_del > 0 then v_w := private.weight((it ->> 'weight_kg')::numeric, 'delivered weight');
    else v_w := coalesce(nullif(it ->> 'weight_kg', '')::numeric, 0);
      if v_w <> 0 then raise exception 'VALIDATION: weight must be empty when no birds were delivered'; end if;
    end if;
    v_rate := coalesce(nullif(it ->> 'rate', '')::numeric, al.rate);
    if v_rate <> al.rate then perform private.require_perm(p_business_id, 'rate_override'); end if;
    perform private.money(v_rate, 'rate', true, false);
    insert into public.delivery_items (business_id, delivery_id, allocation_id, bird_size_id, allocated_qty, delivered_qty, returned_qty, damaged_qty, weight_kg, rate, amount)
    values (p_business_id, d.id, al.id, al.bird_size_id, al.allocated_qty, v_del, v_ret, v_dmg, v_w, v_rate, round(v_w * v_rate, 2))
    returning id into v_di;
    -- allocation is used up: delivered birds count as delivered, the rest goes back to the order
    update public.order_items set allocated_qty = allocated_qty - al.allocated_qty, delivered_qty = delivered_qty + v_del where id = al.order_item_id;
    perform private.refresh_order_status((select order_id from public.order_items where id = al.order_item_id));
    if v_del > 0 then
      v_items := v_items || jsonb_build_array(jsonb_build_object('bird_size_id', al.bird_size_id, 'delivery_item_id', v_di, 'qty', v_del, 'weight_kg', v_w, 'rate', v_rate));
    end if;
  end loop;

  if jsonb_array_length(v_items) > 0 then
    b := private.post_bill(p_business_id, p_customer_id, v_today, d.id, t.id, v_items, nullif(p ->> 'final_amount', '')::numeric,
      p ->> 'adjustment_reason', 'Trip ' || t.trip_no, null);
  end if;

  if nullif(p -> 'collection' ->> 'amount', '') is not null and (p -> 'collection' ->> 'amount')::numeric > 0 then
    pay := private.insert_collection(p_business_id, t, p_customer_id, d.id, p -> 'collection',
      case when p_idempotency_key is null then null else p_idempotency_key || ':pay' end, v_role);
  end if;

  if t.status in ('LOADING', 'DISPATCHED') then update public.trips set status = 'IN_PROGRESS' where id = t.id; end if;
  update public.trips set updated_at = now(), version = version + 1 where id = t.id;
  perform private.audit(p_business_id, 'DELIVERY_' || v_status, 'deliveries', d.id,
    jsonb_build_object('trip_id', t.id, 'customer_id', p_customer_id, 'bill_id', b.id, 'collected', pay.amount));

  return jsonb_build_object('delivery_id', d.id, 'status', v_status, 'bill_id', b.id, 'bill_no', b.bill_no, 'bill_amount', b.final_amount,
    'payment_id', pay.id, 'payment_status', pay.status, 'duplicate', false,
    'balance', case when v_role <> 'driver' then private.party_balance(p_customer_id, 'RECEIVABLE') end);
end $$;

-- A later collection from a customer on this trip (e.g. paid after delivery).
create or replace function public.record_collection(p_business_id uuid, p_trip_id uuid, p_customer_id uuid, p jsonb, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_role public.member_role; t public.trips; pay public.payments;
begin
  v_role := private.require_member(p_business_id);
  select * into t from public.trips where id = p_trip_id and business_id = p_business_id;
  if not found then raise exception 'NOT_FOUND: trip'; end if;
  if v_role = 'driver' and not private.is_trip_driver(t.id) then raise exception 'FORBIDDEN: not your trip'; end if;
  if p_idempotency_key is not null then
    select * into pay from public.payments where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if found then return jsonb_build_object('id', pay.id, 'status', pay.status, 'duplicate', true); end if;
  end if;
  if not exists (select 1 from public.trip_allocations where trip_id = t.id and customer_id = p_customer_id) then
    raise exception 'NOT_FOUND: this customer is not on this trip';
  end if;
  if t.status in ('SETTLED', 'CANCELLED') then raise exception 'VALIDATION: trip is closed'; end if;
  pay := private.insert_collection(p_business_id, t, p_customer_id, null, p, p_idempotency_key, v_role);
  return jsonb_build_object('id', pay.id, 'status', pay.status, 'duplicate', false);
end $$;

-- --------------------------------------------------------------- expenses --
-- p jsonb: expense_date, category_id, amount, trip_id, note, confirm_duplicate
create or replace function public.create_expense(p_business_id uuid, p jsonb, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare e public.expenses; v_amt numeric; v_trip uuid := nullif(p ->> 'trip_id', '')::uuid; v_cat uuid := (p ->> 'category_id')::uuid;
  v_date date := coalesce(nullif(p ->> 'expense_date', '')::date, private.business_today(p_business_id));
begin
  perform private.require_perm(p_business_id, 'expenses');
  if p_idempotency_key is not null then
    select * into e from public.expenses where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if found then return jsonb_build_object('id', e.id, 'duplicate', true); end if;
  end if;
  if not exists (select 1 from public.expense_categories where id = v_cat and business_id = p_business_id) then raise exception 'NOT_FOUND: category'; end if;
  if v_trip is not null and not exists (select 1 from public.trips where id = v_trip and business_id = p_business_id) then raise exception 'NOT_FOUND: trip'; end if;
  if v_date > private.business_today(p_business_id) then raise exception 'VALIDATION: expense date cannot be in the future'; end if;
  v_amt := private.money((p ->> 'amount')::numeric, 'amount');
  -- the same cost must not be booked twice (e.g. once on the trip and once as a general expense)
  if not coalesce((p ->> 'confirm_duplicate')::boolean, false) and exists (
      select 1 from public.expenses x where x.business_id = p_business_id and x.status = 'ACTIVE'
        and x.expense_date = v_date and x.category_id = v_cat and x.amount = v_amt) then
    raise exception 'POSSIBLE_DUPLICATE: an expense with the same date, category and amount already exists';
  end if;
  insert into public.expenses (business_id, expense_date, category_id, amount, trip_id, note, idempotency_key, created_by)
  values (p_business_id, v_date, v_cat, v_amt, v_trip, nullif(trim(p ->> 'note'), ''), p_idempotency_key, auth.uid())
  returning * into e;
  perform private.audit(p_business_id, 'EXPENSE_CREATE', 'expenses', e.id, jsonb_build_object('amount', v_amt, 'category_id', v_cat, 'trip_id', v_trip));
  return jsonb_build_object('id', e.id, 'duplicate', false);
end $$;

create or replace function public.update_expense(p_business_id uuid, p_expense_id uuid, p_expected_version integer, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare e public.expenses;
begin
  perform private.require_perm(p_business_id, 'expenses');
  select * into e from public.expenses where id = p_expense_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: expense'; end if;
  if e.status <> 'ACTIVE' then raise exception 'VALIDATION: a voided expense cannot be edited'; end if;
  if e.version <> p_expected_version then raise exception 'CONFLICT: this expense was changed by someone else — refresh'; end if;
  if exists (select 1 from public.trip_settlements s where s.trip_id = e.trip_id and s.status = 'CLOSED') then
    raise exception 'VALIDATION: the trip is settled — reopen it first';
  end if;
  update public.expenses set
    amount = case when p ? 'amount' then private.money((p ->> 'amount')::numeric, 'amount') else amount end,
    category_id = coalesce(nullif(p ->> 'category_id', '')::uuid, category_id),
    expense_date = coalesce(nullif(p ->> 'expense_date', '')::date, expense_date),
    note = case when p ? 'note' then nullif(trim(p ->> 'note'), '') else note end,
    updated_at = now(), version = version + 1
  where id = e.id;
  perform private.audit(p_business_id, 'EXPENSE_EDIT', 'expenses', e.id,
    jsonb_build_object('before', jsonb_build_object('amount', e.amount, 'category_id', e.category_id, 'date', e.expense_date), 'after', p));
  return jsonb_build_object('id', e.id);
end $$;

create or replace function public.void_expense(p_business_id uuid, p_expense_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare e public.expenses;
begin
  perform private.require_owner(p_business_id);
  if char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'VALIDATION: a reason is required'; end if;
  select * into e from public.expenses where id = p_expense_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: expense'; end if;
  update public.expenses set status = 'VOID', void_reason = trim(p_reason), updated_at = now(), version = version + 1 where id = e.id;
  perform private.audit(p_business_id, 'EXPENSE_VOID', 'expenses', e.id, jsonb_build_object('amount', e.amount, 'reason', p_reason));
  return jsonb_build_object('id', e.id, 'status', 'VOID');
end $$;

-- ------------------------------------------------------------- settlement --
create or replace function public.trip_settlement_preview(p_business_id uuid, p_trip_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare t public.trips; v_sizes jsonb; v_sales numeric; v_rep numeric; v_ver numeric; v_pending numeric; v_cash numeric; v_exp numeric; v_cust jsonb; v_cost numeric;
begin
  perform private.require_office(p_business_id);
  select * into t from public.trips where id = p_trip_id and business_id = p_business_id;
  if not found then raise exception 'NOT_FOUND: trip'; end if;

  select coalesce(jsonb_agg(x order by x ->> 'sort'), '[]'::jsonb) into v_sizes from (
    select jsonb_build_object(
      'bird_size_id', s.id, 'name', s.name, 'name_mr', s.name_mr, 'name_hi', s.name_hi, 'sort', lpad(s.sort_order::text, 4, '0'),
      'allocated', coalesce((select sum(a.allocated_qty) from public.trip_allocations a where a.trip_id = t.id and a.bird_size_id = s.id), 0),
      'loaded', (select l.loaded_qty from public.loading_entries l where l.trip_id = t.id and l.bird_size_id = s.id),
      'loaded_weight', (select l.loaded_weight from public.loading_entries l where l.trip_id = t.id and l.bird_size_id = s.id),
      'delivered', coalesce((select sum(di.delivered_qty) from public.delivery_items di join public.deliveries d on d.id = di.delivery_id where d.trip_id = t.id and di.bird_size_id = s.id), 0),
      'delivered_weight', coalesce((select sum(di.weight_kg) from public.delivery_items di join public.deliveries d on d.id = di.delivery_id where d.trip_id = t.id and di.bird_size_id = s.id), 0),
      'returned', coalesce((select sum(di.returned_qty) from public.delivery_items di join public.deliveries d on d.id = di.delivery_id where d.trip_id = t.id and di.bird_size_id = s.id), 0),
      'damaged', coalesce((select sum(di.damaged_qty) from public.delivery_items di join public.deliveries d on d.id = di.delivery_id where d.trip_id = t.id and di.bird_size_id = s.id), 0),
      'losses_recorded', coalesce((select -sum(m.qty) from public.inventory_movements m where m.trip_id = t.id and m.bird_size_id = s.id and m.movement_type in ('DAMAGE', 'DEATH', 'SHORTAGE')), 0)
    ) as x
    from public.bird_sizes s
    where s.business_id = p_business_id and (
      exists (select 1 from public.trip_allocations a where a.trip_id = t.id and a.bird_size_id = s.id)
      or exists (select 1 from public.loading_entries l where l.trip_id = t.id and l.bird_size_id = s.id))
  ) q;
  -- unexplained = loaded − delivered − returned − damaged(driver-reported)      (what the driver could not account for)
  -- unaccounted = loaded − delivered − returned − losses recorded by the owner    (must be 0, or explained, to settle)
  select coalesce(jsonb_agg(e || jsonb_build_object(
      'unexplained', case when (e ->> 'loaded') is null then null
           else (e ->> 'loaded')::int - (e ->> 'delivered')::int - (e ->> 'returned')::int - (e ->> 'damaged')::int end,
      'unaccounted', case when (e ->> 'loaded') is null then null
           else (e ->> 'loaded')::int - (e ->> 'delivered')::int - (e ->> 'returned')::int - (e ->> 'losses_recorded')::int end)), '[]'::jsonb)
    into v_sizes from jsonb_array_elements(v_sizes) e;

  select coalesce(sum(final_amount), 0) into v_sales from public.bills where trip_id = t.id and status = 'POSTED';
  select coalesce(sum(amount) filter (where status in ('PENDING_VERIFICATION', 'CONFIRMED')), 0),
         coalesce(sum(amount) filter (where status = 'CONFIRMED'), 0),
         coalesce(sum(amount) filter (where status = 'PENDING_VERIFICATION'), 0),
         coalesce(sum(amount) filter (where status = 'CONFIRMED' and method = 'CASH' and source = 'DRIVER'), 0)
    into v_rep, v_ver, v_pending, v_cash
  from public.payments where trip_id = t.id and direction = 'IN';
  select coalesce(sum(amount), 0) into v_exp from public.expenses where trip_id = t.id and status = 'ACTIVE';
  select coalesce(sum(cost_amount), 0) into v_cost from public.cost_allocations ca join public.bills b on b.id = ca.bill_id where b.trip_id = t.id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'customer_id', c.customer_id, 'name', p.name,
      'delivery_status', d.status, 'reason', d.reason,
      'bill_amount', (select b.final_amount from public.bills b where b.delivery_id = d.id and b.status = 'POSTED'),
      'collected', (select coalesce(sum(amount), 0) from public.payments y where y.trip_id = t.id and y.party_id = c.customer_id and y.status in ('PENDING_VERIFICATION', 'CONFIRMED')),
      'pending', (select coalesce(sum(amount), 0) from public.payments y where y.trip_id = t.id and y.party_id = c.customer_id and y.status = 'PENDING_VERIFICATION')
    ) order by p.name), '[]'::jsonb)
    into v_cust
  from (select distinct customer_id from public.trip_allocations where trip_id = t.id) c
  join public.parties p on p.id = c.customer_id
  left join public.deliveries d on d.trip_id = t.id and d.customer_id = c.customer_id;

  return jsonb_build_object(
    'trip_id', t.id, 'trip_no', t.trip_no, 'status', t.status, 'sizes', v_sizes, 'customers', v_cust,
    'sales_amount', v_sales, 'collections_reported', v_rep, 'collections_verified', v_ver, 'collections_pending', v_pending,
    'cash_expected', v_cash, 'expenses_amount', v_exp,
    'cogs', case when private.is_owner(p_business_id) then v_cost end,
    'pending_deliveries', (select count(*) from (select distinct customer_id from public.trip_allocations where trip_id = t.id) c
                           where not exists (select 1 from public.deliveries d where d.trip_id = t.id and d.customer_id = c.customer_id)),
    'settlement', (select to_jsonb(s) from public.trip_settlements s where s.trip_id = t.id));
end $$;

-- p jsonb: cash_handover, differences_note
create or replace function public.settle_trip(p_business_id uuid, p_trip_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare t public.trips; pv jsonb; v_cash numeric; v_note text := nullif(trim(p ->> 'differences_note'), ''); v_unexplained boolean; v_id uuid;
begin
  perform private.require_owner(p_business_id);
  select * into t from public.trips where id = p_trip_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: trip'; end if;
  if t.status = 'SETTLED' then raise exception 'VALIDATION: trip is already settled'; end if;
  if t.status not in ('IN_PROGRESS', 'COMPLETED') then raise exception 'VALIDATION: trip has not run yet'; end if;
  pv := public.trip_settlement_preview(p_business_id, p_trip_id);
  if (pv ->> 'pending_deliveries')::int > 0 then raise exception 'SETTLEMENT_BLOCKED: some customers have no delivery entry'; end if;
  if (pv ->> 'collections_pending')::numeric > 0 then raise exception 'SETTLEMENT_BLOCKED: verify or reject the pending driver collections first'; end if;
  v_cash := private.money(coalesce(nullif(p ->> 'cash_handover', '')::numeric, 0), 'cash handover', true);
  select exists (select 1 from jsonb_array_elements(pv -> 'sizes') e
                 where (e ->> 'unaccounted') is not null and (e ->> 'unaccounted')::int <> 0)
    into v_unexplained;
  if (v_unexplained or v_cash <> (pv ->> 'cash_expected')::numeric) and char_length(coalesce(v_note, '')) < 3 then
    raise exception 'SETTLEMENT_BLOCKED: explain the quantity or cash difference in the note';
  end if;

  insert into public.trip_settlements (business_id, trip_id, status, quantity_summary, sales_amount, collections_reported, collections_verified,
    cash_expected, cash_handover, expenses_amount, differences_note, closed_by, closed_at)
  values (p_business_id, t.id, 'CLOSED', pv -> 'sizes', (pv ->> 'sales_amount')::numeric, (pv ->> 'collections_reported')::numeric,
    (pv ->> 'collections_verified')::numeric, (pv ->> 'cash_expected')::numeric, v_cash, (pv ->> 'expenses_amount')::numeric, v_note, auth.uid(), now())
  on conflict (trip_id) do update set status = 'CLOSED', quantity_summary = excluded.quantity_summary, sales_amount = excluded.sales_amount,
    collections_reported = excluded.collections_reported, collections_verified = excluded.collections_verified, cash_expected = excluded.cash_expected,
    cash_handover = excluded.cash_handover, expenses_amount = excluded.expenses_amount, differences_note = excluded.differences_note,
    closed_by = excluded.closed_by, closed_at = excluded.closed_at, version = public.trip_settlements.version + 1
  returning id into v_id;
  update public.trips set status = 'SETTLED', updated_at = now(), version = version + 1 where id = t.id;
  perform private.audit(p_business_id, 'TRIP_SETTLE', 'trips', t.id,
    jsonb_build_object('cash_expected', pv ->> 'cash_expected', 'cash_handover', v_cash, 'note', v_note, 'sales', pv ->> 'sales_amount'));
  return jsonb_build_object('settlement_id', v_id, 'trip_id', t.id, 'status', 'SETTLED');
end $$;

create or replace function public.reopen_trip(p_business_id uuid, p_trip_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare t public.trips;
begin
  perform private.require_owner(p_business_id);
  if char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'VALIDATION: a reason is required'; end if;
  select * into t from public.trips where id = p_trip_id and business_id = p_business_id for update;
  if not found or t.status <> 'SETTLED' then raise exception 'VALIDATION: only a settled trip can be reopened'; end if;
  update public.trips set status = 'COMPLETED', updated_at = now(), version = version + 1 where id = t.id;
  update public.trip_settlements set status = 'REOPENED', reopened_by = auth.uid(), reopened_at = now(), reopen_reason = trim(p_reason), version = version + 1
  where trip_id = t.id;
  perform private.audit(p_business_id, 'TRIP_REOPEN', 'trips', t.id, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('trip_id', t.id, 'status', 'COMPLETED');
end $$;
