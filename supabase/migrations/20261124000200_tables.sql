-- PoulGo · 0002 Tables: masters, operations, accounting, inventory, settlement

-- ================================================================ MASTERS ==

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  phone text,
  address text,
  notes text,
  is_customer boolean not null default false,
  is_supplier boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  check (is_customer or is_supplier)
);
create unique index parties_idem on public.parties (business_id, idempotency_key) where idempotency_key is not null;
create index parties_business_idx on public.parties (business_id, name);

create table public.customers (
  party_id uuid primary key references public.parties (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_type text not null default 'TRADER' check (customer_type in ('TRADER', 'RETAILER', 'HOTEL', 'SHOP', 'OTHER')),
  default_rate numeric(14, 2) check (default_rate is null or default_rate >= 0),
  opening_receivable numeric(14, 2) not null default 0,
  opening_as_of date
);
create index customers_business_idx on public.customers (business_id);

create table public.suppliers (
  party_id uuid primary key references public.parties (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  default_purchase_rate numeric(14, 2) check (default_purchase_rate is null or default_purchase_rate >= 0),
  opening_payable numeric(14, 2) not null default 0,
  opening_as_of date
);
create index suppliers_business_idx on public.suppliers (business_id);

create table public.bird_sizes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  name_mr text,
  name_hi text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

-- Effective-dated rates. The rate for a date is the latest row with effective_from <= date.
create table public.bird_size_rates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  bird_size_id uuid not null references public.bird_sizes (id) on delete cascade,
  kind text not null check (kind in ('SALE', 'PURCHASE')),
  rate numeric(14, 2) not null check (rate >= 0),
  effective_from date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (bird_size_id, kind, effective_from)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  registration_no text not null check (char_length(registration_no) between 2 and 20),
  ownership text not null default 'OWNED' check (ownership in ('OWNED', 'RENTED')),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, registration_no)
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 2 and 80),
  phone text,
  license_no text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  name_mr text,
  name_hi text,
  is_trip_cost boolean not null default false,
  active boolean not null default true,
  unique (business_id, name)
);

-- ============================================================= OPERATIONS ==

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  order_no text not null,
  customer_id uuid not null references public.parties (id),
  order_date date not null,
  status text not null default 'CONFIRMED' check (status in ('DRAFT', 'CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED', 'COMPLETED', 'CANCELLED')),
  notes text,
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (business_id, order_no)
);
create unique index orders_idem on public.orders (business_id, idempotency_key) where idempotency_key is not null;
create index orders_date_idx on public.orders (business_id, order_date desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  bird_size_id uuid not null references public.bird_sizes (id),
  ordered_qty integer not null check (ordered_qty > 0),
  expected_weight numeric(12, 3) check (expected_weight is null or expected_weight > 0),
  rate numeric(14, 2) check (rate is null or rate >= 0),
  allocated_qty integer not null default 0,
  delivered_qty integer not null default 0,
  check (allocated_qty >= 0 and delivered_qty >= 0 and allocated_qty + delivered_qty <= ordered_qty)
);
create index order_items_order_idx on public.order_items (order_id);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  trip_no text not null,
  trip_date date not null,
  vehicle_id uuid references public.vehicles (id),
  driver_id uuid references public.drivers (id),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ASSIGNED', 'LOADING', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'SETTLED', 'CANCELLED')),
  notes text,
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (business_id, trip_no)
);
create unique index trips_idem on public.trips (business_id, idempotency_key) where idempotency_key is not null;
create index trips_date_idx on public.trips (business_id, trip_date desc);
create index trips_driver_idx on public.trips (driver_id);

-- Order item quantity placed on a trip. allocated_qty is what the driver must deliver.
create table public.trip_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id),
  customer_id uuid not null references public.parties (id),
  bird_size_id uuid not null references public.bird_sizes (id),
  allocated_qty integer not null check (allocated_qty > 0),
  rate numeric(14, 2) not null check (rate >= 0),
  created_at timestamptz not null default now(),
  unique (trip_id, order_item_id)
);
create index trip_allocations_trip_idx on public.trip_allocations (trip_id, customer_id);

create table public.loading_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  bird_size_id uuid not null references public.bird_sizes (id),
  loaded_qty integer not null check (loaded_qty >= 0),
  loaded_weight numeric(12, 3) check (loaded_weight is null or loaded_weight >= 0),
  recorded_by uuid,
  updated_at timestamptz not null default now(),
  unique (trip_id, bird_size_id)
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  customer_id uuid not null references public.parties (id),
  status text not null check (status in ('PARTIAL', 'DELIVERED', 'FAILED')),
  reason text,
  notes text,
  delivered_at timestamptz not null default now(),
  recorded_by uuid,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (trip_id, customer_id)
);
create unique index deliveries_idem on public.deliveries (business_id, idempotency_key) where idempotency_key is not null;

create table public.delivery_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  delivery_id uuid not null references public.deliveries (id) on delete cascade,
  allocation_id uuid not null references public.trip_allocations (id),
  bird_size_id uuid not null references public.bird_sizes (id),
  allocated_qty integer not null,
  delivered_qty integer not null check (delivered_qty >= 0),
  returned_qty integer not null default 0 check (returned_qty >= 0),
  damaged_qty integer not null default 0 check (damaged_qty >= 0),
  weight_kg numeric(12, 3) not null default 0 check (weight_kg >= 0),
  rate numeric(14, 2) not null check (rate >= 0),
  amount numeric(14, 2) not null default 0,
  check (delivered_qty + returned_qty + damaged_qty <= allocated_qty),
  unique (allocation_id)
);

-- ============================================================= ACCOUNTING ==

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  bill_no text not null,
  customer_id uuid not null references public.parties (id),
  delivery_id uuid references public.deliveries (id),
  trip_id uuid references public.trips (id),
  bill_date date not null,
  calculated_amount numeric(14, 2) not null,
  final_amount numeric(14, 2) not null check (final_amount >= 0),
  adjustment_reason text,
  status text not null default 'POSTED' check (status in ('POSTED', 'VOID')),
  notes text,
  void_reason text,
  voided_by uuid,
  voided_at timestamptz,
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_id, bill_no),
  check (final_amount = calculated_amount or adjustment_reason is not null)
);
create unique index bills_idem on public.bills (business_id, idempotency_key) where idempotency_key is not null;
create index bills_date_idx on public.bills (business_id, bill_date);
-- exactly one posted bill per delivery (a voided bill can be replaced by a corrected one)
create unique index bills_one_per_delivery on public.bills (delivery_id) where delivery_id is not null and status = 'POSTED';
create index bills_customer_idx on public.bills (customer_id, bill_date);

create table public.bill_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  bill_id uuid not null references public.bills (id) on delete cascade,
  bird_size_id uuid references public.bird_sizes (id),
  delivery_item_id uuid references public.delivery_items (id),
  qty integer not null default 0 check (qty >= 0),
  weight_kg numeric(12, 3) not null check (weight_kg > 0),
  rate numeric(14, 2) not null check (rate >= 0),
  amount numeric(14, 2) not null
);
create index bill_items_bill_idx on public.bill_items (bill_id);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  purchase_no text not null,
  supplier_id uuid not null references public.parties (id),
  purchase_date date not null,
  trip_id uuid references public.trips (id),
  vehicle_ref text,
  calculated_amount numeric(14, 2) not null,
  final_amount numeric(14, 2) not null check (final_amount >= 0),
  adjustment_reason text,
  status text not null default 'POSTED' check (status in ('POSTED', 'VOID')),
  notes text,
  void_reason text,
  voided_by uuid,
  voided_at timestamptz,
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_id, purchase_no),
  check (final_amount = calculated_amount or adjustment_reason is not null)
);
create unique index purchases_idem on public.purchases (business_id, idempotency_key) where idempotency_key is not null;
create index purchases_date_idx on public.purchases (business_id, purchase_date);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  bird_size_id uuid not null references public.bird_sizes (id),
  qty integer not null check (qty >= 0),
  weight_kg numeric(12, 3) not null check (weight_kg > 0),
  rate numeric(14, 2) not null check (rate >= 0),
  amount numeric(14, 2) not null,
  cost_amount numeric(14, 2) not null -- share of the purchase final amount (used for stock cost)
);
create index purchase_items_purchase_idx on public.purchase_items (purchase_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  party_id uuid not null references public.parties (id),
  direction text not null check (direction in ('IN', 'OUT')), -- IN = from customer, OUT = to supplier
  amount numeric(14, 2) not null check (amount > 0),
  method text not null check (method in ('CASH', 'UPI', 'BANK_TRANSFER', 'OTHER')),
  reference text,
  payment_date date not null,
  status text not null check (status in ('PENDING_VERIFICATION', 'CONFIRMED', 'REJECTED', 'VOID')),
  source text not null default 'OFFICE' check (source in ('OFFICE', 'DRIVER')),
  trip_id uuid references public.trips (id),
  delivery_id uuid references public.deliveries (id),
  notes text,
  collected_by uuid,
  verified_by uuid,
  verified_at timestamptz,
  status_reason text,
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  version integer not null default 1
);
create unique index payments_idem on public.payments (business_id, idempotency_key) where idempotency_key is not null;
create index payments_date_idx on public.payments (business_id, payment_date);
create index payments_party_idx on public.payments (party_id, payment_date);
create index payments_trip_idx on public.payments (trip_id);

-- The single source of truth for balances. Never updated or deleted.
create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  party_id uuid not null references public.parties (id),
  ledger text not null check (ledger in ('RECEIVABLE', 'PAYABLE')),
  txn_date date not null,
  entry_type text not null check (entry_type in ('OPENING', 'BILL', 'PAYMENT', 'PURCHASE', 'ADJUSTMENT', 'REVERSAL')),
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  source_type text,
  source_id uuid,
  reversal_of uuid references public.ledger_transactions (id),
  description text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((debit > 0) <> (credit > 0))
);
create index ledger_party_idx on public.ledger_transactions (party_id, ledger, txn_date, created_at);
create index ledger_business_idx on public.ledger_transactions (business_id, ledger, txn_date);
create unique index ledger_one_reversal on public.ledger_transactions (reversal_of) where reversal_of is not null;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  expense_date date not null,
  category_id uuid not null references public.expense_categories (id),
  amount numeric(14, 2) not null check (amount > 0),
  trip_id uuid references public.trips (id),
  note text,
  receipt_path text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'VOID')),
  void_reason text,
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create unique index expenses_idem on public.expenses (business_id, idempotency_key) where idempotency_key is not null;
create index expenses_date_idx on public.expenses (business_id, expense_date);

-- ============================================================== INVENTORY ==

-- Weighted-average cost pool per bird size.
create table public.stock_positions (
  business_id uuid not null references public.businesses (id) on delete cascade,
  bird_size_id uuid not null references public.bird_sizes (id) on delete cascade,
  qty integer not null default 0,
  weight_kg numeric(14, 3) not null default 0 check (weight_kg >= 0),
  cost_amount numeric(16, 2) not null default 0 check (cost_amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (business_id, bird_size_id)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  bird_size_id uuid not null references public.bird_sizes (id),
  movement_date date not null,
  movement_type text not null check (movement_type in ('PURCHASE', 'SALE', 'DAMAGE', 'DEATH', 'SHORTAGE', 'ADJUSTMENT', 'PURCHASE_VOID', 'SALE_VOID')),
  qty integer not null,            -- signed: + into stock, − out of stock
  weight_kg numeric(12, 3) not null,
  cost_amount numeric(14, 2) not null,
  uncosted_weight numeric(12, 3) not null default 0,
  trip_id uuid references public.trips (id),
  source_type text,
  source_id uuid,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index inventory_business_idx on public.inventory_movements (business_id, movement_date);

-- COGS for each sold bill line (and its reversal when a bill is voided).
create table public.cost_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  bill_id uuid not null references public.bills (id),
  bill_item_id uuid not null references public.bill_items (id),
  bird_size_id uuid not null references public.bird_sizes (id),
  allocation_date date not null,
  weight_kg numeric(12, 3) not null,
  cost_amount numeric(14, 2) not null,
  uncosted_weight numeric(12, 3) not null default 0,
  avg_cost_per_kg numeric(14, 4),
  is_reversal boolean not null default false,
  created_at timestamptz not null default now()
);
create index cost_allocations_bill_idx on public.cost_allocations (bill_id);
create index cost_allocations_date_idx on public.cost_allocations (business_id, allocation_date);

-- ============================================================= SETTLEMENT ==

create table public.trip_settlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  trip_id uuid not null unique references public.trips (id) on delete cascade,
  status text not null default 'CLOSED' check (status in ('CLOSED', 'REOPENED')),
  quantity_summary jsonb not null default '[]'::jsonb,
  sales_amount numeric(14, 2) not null default 0,
  collections_reported numeric(14, 2) not null default 0,
  collections_verified numeric(14, 2) not null default 0,
  cash_expected numeric(14, 2) not null default 0,
  cash_handover numeric(14, 2) not null default 0,
  expenses_amount numeric(14, 2) not null default 0,
  differences_note text,
  closed_by uuid,
  closed_at timestamptz,
  reopened_by uuid,
  reopened_at timestamptz,
  reopen_reason text,
  version integer not null default 1
);

create table public.whatsapp_share_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  party_id uuid references public.parties (id),
  message_type text not null check (message_type in ('CUSTOMER_DAILY', 'SUPPLIER_DAILY', 'TRANSACTION', 'STATEMENT', 'REMINDER', 'OTHER')),
  summary_date date,
  phone text,
  message_preview text,
  actor uuid,
  created_at timestamptz not null default now()
);

-- Immutable financial history
create trigger ledger_immutable before update or delete on public.ledger_transactions
for each row execute function private.forbid_change();
create trigger inventory_immutable before update or delete on public.inventory_movements
for each row execute function private.forbid_change();
create trigger cost_alloc_immutable before update or delete on public.cost_allocations
for each row execute function private.forbid_change();
