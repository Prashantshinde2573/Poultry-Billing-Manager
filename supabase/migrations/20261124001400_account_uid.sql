-- PoulGo · 0014 my_account also returns the verified user id + email, so pages can trust it
-- without verifying the JWT a second time (PostgREST already verified it).
create or replace function public.my_account()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb; v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null then return null; end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select jsonb_build_object(
      'super_admin', private.is_super_admin(),
      'must_change_password', coalesce((select (u.raw_user_meta_data ->> 'must_change_password')::boolean from auth.users u where u.id = v_uid), false),
      'business_id', b.id, 'business_name', b.name, 'role', m.role, 'permissions', m.permissions, 'display_name', m.display_name,
      'settings', b.settings, 'status', b.status, 'state', private.plan_state(b.id),
      'plan', jsonb_build_object('id', p.id, 'name', p.name, 'name_mr', p.name_mr, 'name_hi', p.name_hi, 'modules', p.modules,
        'max_staff', p.max_staff, 'max_drivers', p.max_drivers, 'max_vehicles', p.max_vehicles, 'monthly', p.monthly),
      'renews_at', b.renews_at, 'grace_until', b.grace_until,
      'days_left', b.renews_at - private.business_today(b.id))
    into v
  from public.business_members m
  join public.businesses b on b.id = m.business_id
  join public.plans p on p.id = b.plan_id
  where m.user_id = v_uid and m.active
  order by (m.role = 'owner') desc, m.created_at
  limit 1;
  return coalesce(v, jsonb_build_object('super_admin', private.is_super_admin(), 'business_id', null))
    || jsonb_build_object('uid', v_uid, 'email', v_email);
end $$;

/**
 * Take an order straight onto a trip: party + birds per size. Creates the order and loads
 * it onto the trip in one step (the usual way of working: orders are for today's vehicle).
 * p_items: [{bird_size_id, qty}]
 */
create or replace function public.trip_add_order(p_business_id uuid, p_trip_id uuid, p_customer_id uuid, p_items jsonb, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare t public.trips; o jsonb; v_items jsonb; v_alloc jsonb;
begin
  perform private.require_office(p_business_id);
  select * into t from public.trips where id = p_trip_id and business_id = p_business_id;
  if not found then raise exception 'NOT_FOUND: trip'; end if;
  if t.status not in ('DRAFT', 'ASSIGNED', 'LOADING') then raise exception 'VALIDATION: orders can only be added before the vehicle leaves'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('bird_size_id', e ->> 'bird_size_id', 'qty', (e ->> 'qty')::integer)), '[]'::jsonb)
    into v_items from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e where coalesce((e ->> 'qty')::integer, 0) > 0;
  if jsonb_array_length(v_items) = 0 then raise exception 'VALIDATION: enter birds for at least one size'; end if;
  o := public.create_order(p_business_id, jsonb_build_object('customer_id', p_customer_id, 'order_date', t.trip_date, 'items', v_items), p_idempotency_key);
  if coalesce((o ->> 'duplicate')::boolean, false) then return o; end if;
  -- rate: order → customer's rate → today's rate; if none is set yet it is filled in at delivery (0 = "not set")
  select jsonb_agg(jsonb_build_object('order_item_id', oi.id, 'qty', oi.ordered_qty,
      'rate', case when coalesce((select c.default_rate from public.customers c where c.party_id = p_customer_id),
                                 private.size_rate(p_business_id, oi.bird_size_id, 'SALE', t.trip_date)) is null then '0' else null end))
    into v_alloc from public.order_items oi where oi.order_id = (o ->> 'id')::uuid;
  perform public.allocate_to_trip(p_business_id, p_trip_id, v_alloc);
  return o;
end $$;
revoke execute on function public.trip_add_order(uuid, uuid, uuid, jsonb, text) from anon, public;
grant execute on function public.trip_add_order(uuid, uuid, uuid, jsonb, text) to authenticated, service_role;

/** Fill in the rate at delivery when none was set when the order was taken (driver of the trip or office). */
create or replace function public.set_allocation_rate(p_business_id uuid, p_allocation_id uuid, p_rate numeric)
returns void language plpgsql security definer set search_path = ''
as $$
declare al public.trip_allocations; v_role public.member_role;
begin
  v_role := private.require_member(p_business_id);
  select * into al from public.trip_allocations where id = p_allocation_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: order line'; end if;
  if v_role = 'driver' and not private.is_trip_driver(al.trip_id) then raise exception 'FORBIDDEN: not your trip'; end if;
  if al.rate <> 0 then raise exception 'VALIDATION: the rate is already set'; end if;
  perform private.money(p_rate, 'rate');
  update public.trip_allocations set rate = p_rate where id = al.id;
  perform private.audit(p_business_id, 'RATE_SET', 'trip_allocations', al.id, jsonb_build_object('rate', p_rate, 'by', v_role));
end $$;
revoke execute on function public.set_allocation_rate(uuid, uuid, numeric) from anon, public;
grant execute on function public.set_allocation_rate(uuid, uuid, numeric) to authenticated, service_role;

/** A bill line can never go out at rate 0. */
create or replace function private.tg_delivery_rate()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.delivered_qty > 0 and new.rate <= 0 then raise exception 'RATE_MISSING: enter the rate for this customer'; end if;
  return new;
end $$;
drop trigger if exists a_rate_check on public.delivery_items;
create trigger a_rate_check before insert on public.delivery_items for each row execute function private.tg_delivery_rate();

/** What each customer on a trip already owes (for the bill: previous + today = total). Driver of the trip or office. */
create or replace function public.trip_customer_balances(p_business_id uuid, p_trip_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_role public.member_role;
begin
  v_role := private.require_member(p_business_id);
  if not exists (select 1 from public.trips where id = p_trip_id and business_id = p_business_id) then raise exception 'NOT_FOUND: trip'; end if;
  if v_role = 'driver' and not private.is_trip_driver(p_trip_id) then raise exception 'FORBIDDEN: not your trip'; end if;
  return (select coalesce(jsonb_object_agg(c.customer_id, private.party_balance(c.customer_id, 'RECEIVABLE', null)), '{}'::jsonb)
          from (select distinct customer_id from public.trip_allocations where trip_id = p_trip_id) c);
end $$;
revoke execute on function public.trip_customer_balances(uuid, uuid) from anon, public;
grant execute on function public.trip_customer_balances(uuid, uuid) to authenticated, service_role;
