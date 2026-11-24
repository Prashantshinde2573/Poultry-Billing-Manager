-- PoulGo · 0015 Indexes for the lookups the app makes on every trip / party screen,
-- and RLS policies that evaluate auth.uid() once per query instead of once per row.

create index if not exists bills_trip_idx on public.bills (trip_id) where trip_id is not null;
create index if not exists expenses_trip_idx on public.expenses (trip_id) where trip_id is not null;
create index if not exists purchases_trip_idx on public.purchases (trip_id) where trip_id is not null;
create index if not exists purchases_supplier_idx on public.purchases (supplier_id);
create index if not exists inventory_movements_trip_idx on public.inventory_movements (trip_id) where trip_id is not null;
create index if not exists delivery_items_delivery_idx on public.delivery_items (delivery_id);
create index if not exists deliveries_customer_idx on public.deliveries (customer_id);
create index if not exists trip_allocations_customer_idx on public.trip_allocations (customer_id);
create index if not exists trip_allocations_order_item_idx on public.trip_allocations (order_item_id);
create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists order_items_business_idx on public.order_items (business_id);
create index if not exists payments_delivery_idx on public.payments (delivery_id) where delivery_id is not null;
create index if not exists loading_entries_business_idx on public.loading_entries (business_id);
create index if not exists bill_items_business_idx on public.bill_items (business_id);
create index if not exists purchase_items_business_idx on public.purchase_items (business_id);
create index if not exists plan_requests_business_idx on public.plan_requests (business_id);
create index if not exists trips_vehicle_idx on public.trips (vehicle_id);

alter policy profiles_read on public.profiles
  using (id = (select auth.uid()) or exists (
    select 1 from public.business_members me
    join public.business_members them on them.business_id = me.business_id
    where me.user_id = (select auth.uid()) and me.active and me.role = 'owner' and them.user_id = profiles.id));

alter policy members_read on public.business_members
  using (user_id = (select auth.uid()) or private.is_owner(business_id));

alter policy drivers_read on public.drivers
  using (private.is_office(business_id) or user_id = (select auth.uid()));

alter policy payments_read on public.payments
  using (
    (direction = 'IN' and private.is_office(business_id))
    or (direction = 'OUT' and private.has_perm(business_id, 'suppliers'))
    or (collected_by = (select auth.uid()))
  );
