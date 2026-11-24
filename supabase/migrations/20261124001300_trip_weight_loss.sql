-- PoulGo · 0013 Real trip flow: total load weight, dead birds reported on the road, weight loss.

-- One total weight for the whole load (birds are weighed together when loading).
alter table public.trips add column if not exists loaded_weight numeric(12, 3) check (loaded_weight is null or loaded_weight >= 0);

/** Total weight of the load (driver of this trip or office). */
create or replace function public.set_trip_load_weight(p_business_id uuid, p_trip_id uuid, p_weight numeric)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare t public.trips; v_role public.member_role;
begin
  v_role := private.require_member(p_business_id);
  select * into t from public.trips where id = p_trip_id and business_id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: trip'; end if;
  if v_role = 'driver' and not private.is_trip_driver(t.id) then raise exception 'FORBIDDEN: not your trip'; end if;
  if t.status in ('SETTLED', 'CANCELLED') then raise exception 'VALIDATION: trip is closed'; end if;
  if p_weight is not null and (p_weight < 0 or p_weight > 100000) then raise exception 'VALIDATION: weight'; end if;
  update public.trips set loaded_weight = round(p_weight, 3), updated_at = now() where id = t.id;
  perform private.audit(p_business_id, 'TRIP_LOADING', 'trips', t.id, jsonb_build_object('total_weight', p_weight));
  return jsonb_build_object('trip_id', t.id, 'loaded_weight', p_weight);
end $$;

/**
 * Dead / damaged birds on the road. The driver of the trip (or the office) reports them as
 * they happen; stock goes down and the owner is told. Weight is estimated from stock.
 */
create or replace function public.report_trip_loss(p_business_id uuid, p_trip_id uuid, p_bird_size_id uuid, p_qty integer, p_kind text default 'DEATH', p_note text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare t public.trips; v_role public.member_role; s public.stock_positions; v_w numeric; r record; v_size text; v_by text;
begin
  v_role := private.require_member(p_business_id);
  select * into t from public.trips where id = p_trip_id and business_id = p_business_id;
  if not found then raise exception 'NOT_FOUND: trip'; end if;
  if v_role = 'driver' and not private.is_trip_driver(t.id) then raise exception 'FORBIDDEN: not your trip'; end if;
  if t.status not in ('LOADING', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED') then raise exception 'VALIDATION: the trip has not started or is closed'; end if;
  if p_kind not in ('DEATH', 'DAMAGE') then raise exception 'VALIDATION: loss type'; end if;
  perform private.qty(p_qty, 'quantity', false);
  if not exists (select 1 from public.bird_sizes where id = p_bird_size_id and business_id = p_business_id) then raise exception 'NOT_FOUND: bird size'; end if;
  s := private.lock_stock(p_business_id, p_bird_size_id);
  v_w := case when s.qty > 0 then least(round(s.weight_kg * p_qty / s.qty, 3), s.weight_kg) else 0 end;
  select * into r from private.stock_out(p_business_id, p_bird_size_id, p_qty, v_w, private.business_today(p_business_id),
    p_kind, t.id, 'trip', t.id, coalesce(nullif(trim(p_note), ''), case p_kind when 'DEATH' then 'Died on trip' else 'Damaged on trip' end));
  perform private.audit(p_business_id, 'STOCK_LOSS', 'trips', t.id,
    jsonb_build_object('bird_size_id', p_bird_size_id, 'qty', p_qty, 'kind', p_kind, 'weight', v_w, 'cost', r.o_cost, 'note', p_note, 'reported_by', v_role));
  select name into v_size from public.bird_sizes where id = p_bird_size_id;
  select display_name into v_by from public.business_members where business_id = p_business_id and user_id = auth.uid();
  perform private.notify(p_business_id, 'owner', 'TRIP_LOSS',
    jsonb_build_object('qty', p_qty, 'size', v_size, 'trip', t.trip_no, 'by', v_by, 'kind', p_kind), '/app/trips/' || t.id);
  return jsonb_build_object('weight_kg', v_w);
end $$;

/** Weight picture of a trip: loaded vs delivered, dead and returned birds (driver of the trip or office). */
create or replace function public.trip_weight_summary(p_business_id uuid, p_trip_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare t public.trips; v_role public.member_role;
begin
  v_role := private.require_member(p_business_id);
  select * into t from public.trips where id = p_trip_id and business_id = p_business_id;
  if not found then raise exception 'NOT_FOUND: trip'; end if;
  if v_role = 'driver' and not private.is_trip_driver(t.id) then raise exception 'FORBIDDEN: not your trip'; end if;
  return jsonb_build_object(
    'loaded_weight', t.loaded_weight,
    'loaded_birds', coalesce((select sum(loaded_qty) from public.loading_entries where trip_id = t.id), 0),
    'delivered_birds', coalesce((select sum(di.delivered_qty) from public.delivery_items di join public.deliveries d on d.id = di.delivery_id where d.trip_id = t.id), 0),
    'delivered_weight', coalesce((select sum(di.weight_kg) from public.delivery_items di join public.deliveries d on d.id = di.delivery_id where d.trip_id = t.id), 0),
    'returned_birds', coalesce((select sum(di.returned_qty) from public.delivery_items di join public.deliveries d on d.id = di.delivery_id where d.trip_id = t.id), 0),
    -- dead/damaged birds: recorded losses, or what drivers marked damaged at delivery (whichever is larger; never both)
    'lost_birds', greatest(
      coalesce((select -sum(m.qty) from public.inventory_movements m where m.trip_id = t.id and m.movement_type in ('DEATH', 'DAMAGE', 'SHORTAGE')), 0),
      coalesce((select sum(di.damaged_qty) from public.delivery_items di join public.deliveries d on d.id = di.delivery_id where d.trip_id = t.id), 0)));
end $$;

revoke execute on function public.trip_weight_summary(uuid, uuid) from anon, public;
grant execute on function public.trip_weight_summary(uuid, uuid) to authenticated, service_role;
revoke execute on function public.set_trip_load_weight(uuid, uuid, numeric), public.report_trip_loss(uuid, uuid, uuid, integer, text, text) from anon, public;
grant execute on function public.set_trip_load_weight(uuid, uuid, numeric), public.report_trip_loss(uuid, uuid, uuid, integer, text, text) to authenticated, service_role;
