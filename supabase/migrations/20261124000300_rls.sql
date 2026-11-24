-- PoulGo · 0003 Row Level Security
-- Reads are allowed by role; there are NO insert/update/delete policies.
-- Every change goes through SECURITY DEFINER RPCs (0004+), which re-check the caller.

-- Driver helpers ------------------------------------------------------------
create or replace function private.my_driver_ids(p_business_id uuid)
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select d.id from public.drivers d
  join public.business_members m on m.business_id = d.business_id and m.user_id = d.user_id and m.active
  where d.business_id = p_business_id and d.user_id = auth.uid() and d.active
$$;

create or replace function private.is_trip_driver(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and t.status not in ('SETTLED', 'CANCELLED')
      and t.driver_id in (select private.my_driver_ids(t.business_id))
  )
$$;

-- Customers a driver may see: those on the driver's own open trips.
create or replace function private.driver_can_see_party(p_party_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.trip_allocations a
    join public.trips t on t.id = a.trip_id
    where a.customer_id = p_party_id
      and t.status not in ('SETTLED', 'CANCELLED')
      and t.driver_id in (select private.my_driver_ids(t.business_id))
  )
$$;

-- Enable RLS everywhere ------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'businesses','profiles','business_members','business_counters','audit_logs','parties','customers','suppliers',
    'bird_sizes','bird_size_rates','vehicles','drivers','expense_categories','orders','order_items','trips',
    'trip_allocations','loading_entries','deliveries','delivery_items','bills','bill_items','purchases',
    'purchase_items','payments','ledger_transactions','expenses','stock_positions','inventory_movements',
    'cost_allocations','trip_settlements','whatsapp_share_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Business & membership ------------------------------------------------------
create policy businesses_read on public.businesses for select to authenticated
  using (private.is_member(id));

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.business_members me
    join public.business_members them on them.business_id = me.business_id
    where me.user_id = auth.uid() and me.active and me.role = 'owner' and them.user_id = profiles.id));

create policy members_read on public.business_members for select to authenticated
  using (user_id = auth.uid() or private.is_owner(business_id));

create policy audit_read on public.audit_logs for select to authenticated
  using (private.is_owner(business_id));

-- Masters --------------------------------------------------------------------
create policy parties_read on public.parties for select to authenticated
  using (
    (is_customer and private.is_office(business_id))
    or (is_supplier and private.has_perm(business_id, 'suppliers'))
    or (private.member_role(business_id) = 'driver' and is_customer and private.driver_can_see_party(id))
  );

create policy customers_read on public.customers for select to authenticated
  using (private.is_office(business_id));
create policy suppliers_read on public.suppliers for select to authenticated
  using (private.has_perm(business_id, 'suppliers'));

create policy bird_sizes_read on public.bird_sizes for select to authenticated
  using (private.is_member(business_id));
create policy rates_read on public.bird_size_rates for select to authenticated
  using ((kind = 'SALE' and private.is_office(business_id)) or (kind = 'PURCHASE' and private.has_perm(business_id, 'suppliers')));
create policy vehicles_read on public.vehicles for select to authenticated
  using (private.is_office(business_id) or (private.member_role(business_id) = 'driver' and exists (
    select 1 from public.trips t where t.vehicle_id = vehicles.id and private.is_trip_driver(t.id))));
create policy drivers_read on public.drivers for select to authenticated
  using (private.is_office(business_id) or user_id = auth.uid());
create policy expense_categories_read on public.expense_categories for select to authenticated
  using (private.has_perm(business_id, 'expenses'));

-- Operations -----------------------------------------------------------------
create policy orders_read on public.orders for select to authenticated
  using (private.is_office(business_id));
create policy order_items_read on public.order_items for select to authenticated
  using (private.is_office(business_id));

create policy trips_read on public.trips for select to authenticated
  using (private.is_office(business_id) or private.is_trip_driver(id));
create policy allocations_read on public.trip_allocations for select to authenticated
  using (private.is_office(business_id) or private.is_trip_driver(trip_id));
create policy loading_read on public.loading_entries for select to authenticated
  using (private.is_office(business_id) or private.is_trip_driver(trip_id));
create policy deliveries_read on public.deliveries for select to authenticated
  using (private.is_office(business_id) or private.is_trip_driver(trip_id));
create policy delivery_items_read on public.delivery_items for select to authenticated
  using (private.is_office(business_id) or exists (
    select 1 from public.deliveries d where d.id = delivery_items.delivery_id and private.is_trip_driver(d.trip_id)));

-- Accounting -----------------------------------------------------------------
create policy bills_read on public.bills for select to authenticated
  using (private.is_office(business_id));
create policy bill_items_read on public.bill_items for select to authenticated
  using (private.is_office(business_id));

create policy purchases_read on public.purchases for select to authenticated
  using (private.has_perm(business_id, 'suppliers'));
create policy purchase_items_read on public.purchase_items for select to authenticated
  using (private.has_perm(business_id, 'suppliers'));

create policy payments_read on public.payments for select to authenticated
  using (
    (direction = 'IN' and private.is_office(business_id))
    or (direction = 'OUT' and private.has_perm(business_id, 'suppliers'))
    or (collected_by = auth.uid())
  );

create policy ledger_read on public.ledger_transactions for select to authenticated
  using ((ledger = 'RECEIVABLE' and private.is_office(business_id))
      or (ledger = 'PAYABLE' and private.has_perm(business_id, 'suppliers')));

create policy expenses_read on public.expenses for select to authenticated
  using (private.has_perm(business_id, 'expenses'));

-- Inventory cost and margins are owner-level information.
create policy stock_read on public.stock_positions for select to authenticated
  using (private.has_perm(business_id, 'suppliers'));
create policy inventory_read on public.inventory_movements for select to authenticated
  using (private.has_perm(business_id, 'suppliers'));
create policy cost_alloc_read on public.cost_allocations for select to authenticated
  using (private.is_owner(business_id));

create policy settlements_read on public.trip_settlements for select to authenticated
  using (private.is_office(business_id));
create policy wa_logs_read on public.whatsapp_share_logs for select to authenticated
  using (private.is_office(business_id));

-- Counters are internal.
create policy counters_none on public.business_counters for select to authenticated using (false);

grant usage on schema public to authenticated;
revoke all on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;
