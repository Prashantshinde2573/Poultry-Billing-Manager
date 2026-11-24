# PoulGo — Poultry Business Manager 2.0 · Architecture & Accounting Design

This document is the Phase 1 output of the MVP v2.0 PRD: architecture, logical ERD, accounting rules
and the decisions from PRD §17. The database in `supabase/migrations/` implements exactly this.

## 1. Stack

| Layer | Choice |
|---|---|
| Web app | Next.js 15 (App Router) + React 19 + TypeScript, Tailwind CSS, mobile-first PWA |
| Data | Supabase PostgreSQL 17 |
| Auth | Supabase Auth (email + password; drivers/staff sign in with mobile number + password, mapped to an internal login email) |
| Security | Row Level Security on every business-owned table; all writes go through `SECURITY DEFINER` RPC functions that check membership, role and permissions from `auth.uid()` |
| Validation | Zod in server actions + strict checks inside every RPC |
| Languages | मराठी, हिंदी, English (per-user preference, stored in `profiles.preferred_language` and a cookie) |
| Hosting | Vercel (app) + Supabase (database/auth) |

The browser only ever holds the user's own session. The Supabase **service-role key is used in exactly one
place**: a server action, callable only by an Owner, that creates login accounts for staff and drivers.

## 2. Multi-tenancy

Every business-owned row has `business_id`. A user belongs to a business through `business_members`
(`role` = `owner` | `staff` | `driver`, plus a `permissions` JSON for staff). RLS helper functions live in the
non-exposed `private` schema:

- `private.member_role(business_id)` — caller's active role, or null
- `private.has_perm(business_id, perm)` — owner → true; staff → `permissions ->> perm = 'true'`; driver → false
- `private.is_trip_driver(trip_id)` — the trip's driver is linked to the caller

Tables expose **no INSERT/UPDATE/DELETE policies**. Clients can only read (through RLS) and call RPCs.

### Staff permissions (granted by the Owner)

| Key | Allows |
|---|---|
| `suppliers` | see suppliers, purchases, supplier ledger and payments; record purchases & supplier payments |
| `expenses` | record and see expenses |
| `verify_payments` | verify / reject driver collections |
| `rate_override` | change an approved sale rate or a bill/purchase final amount (with reason) |
| `reports` | business-wide reports (never P&L) |

Owner-only, always: Profit & Loss, user management, business settings, voids/reversals, trip settlement & reopening,
opening-balance changes, ledger adjustments.

### Driver

A driver sees only trips where `trips.driver_id → drivers.user_id = auth.uid()`, the allocations/deliveries of those trips,
the name/phone/address of those trips' customers, and payments they collected. No ledgers, bills, purchase prices,
supplier data, P&L or other drivers' trips.

## 3. Logical ERD

```
businesses ─┬─ business_members ── profiles(auth.users)
            ├─ business_counters (order/trip/bill/purchase numbers)
            ├─ parties ─┬─ customers (opening receivable, default rate, type)
            │           └─ suppliers (opening payable)
            ├─ bird_sizes ── bird_size_rates (SALE / PURCHASE, effective_from)
            ├─ vehicles, drivers(user_id → auth.users)
            ├─ orders ── order_items (size, ordered / allocated / delivered qty)
            ├─ trips ─┬─ trip_allocations (order_item → trip, qty)
            │         ├─ loading_entries (size, loaded qty/weight)
            │         ├─ deliveries ── delivery_items (per allocation: delivered / returned / damaged, weight, rate)
            │         └─ trip_settlements
            ├─ bills ── bill_items              (bill ↔ delivery 1:1, or direct counter sale)
            ├─ purchases ── purchase_items
            ├─ payments (IN from customer / OUT to supplier; PENDING_VERIFICATION / CONFIRMED / REJECTED / VOID)
            ├─ ledger_transactions (RECEIVABLE | PAYABLE; debit / credit; immutable)
            ├─ expense_categories, expenses
            ├─ stock_positions (per size: qty, weight, cost)   ← weighted-average cost pool
            ├─ inventory_movements (immutable)
            ├─ cost_allocations (COGS per sold bill item; immutable)
            ├─ audit_logs (immutable)
            └─ whatsapp_share_logs
```

All keys are UUID. Numbers: money `numeric(14,2)`, weight `numeric(12,3)` kg, quantity `integer` birds.

## 4. Accounting rules

**Critical principle:** purchase ≠ supplier payment; bill ≠ customer collection; cash flow ≠ profit.

### 4.1 Two separate sub-ledgers per party

One `parties` row can be a customer, a supplier or both. `ledger_transactions.ledger` separates them.

| Ledger | Debit | Credit | Balance |
|---|---|---|---|
| RECEIVABLE (customer owes us) | opening due, bill, debit adjustment, reversal of a payment | confirmed payment, credit note, reversal of a bill | Σ debit − Σ credit |
| PAYABLE (we owe supplier) | payment to supplier, debit note, reversal of a purchase | opening payable, purchase, reversal of a payment | Σ credit − Σ debit |

Ledger rows are **never updated or deleted** (trigger-enforced). A void creates an equal and opposite reversal row
pointing at the original (`reversal_of`). Opening balances are `OPENING` rows, so balances come only from the ledger.

### 4.2 Bills

- Bill line amount = actual weight × rate, rounded half-up to the nearest paisa (`round(numeric, 2)`).
- `calculated_amount` and `final_amount` are both stored; a different final amount requires a reason and the
  `rate_override` permission (or Owner).
- **One bill per delivery** (`bills.delivery_id` is unique) and every create RPC takes an idempotency key
  (`unique(business_id, idempotency_key)`), so retries and double taps never post twice.
- Direct counter bills (the v1 "Add Bill" flow) are kept: a bill with no delivery.

### 4.3 Payments

- Owner/Staff-recorded payments are `CONFIRMED` and post to the ledger immediately.
- Driver collections are `PENDING_VERIFICATION` and **do not touch the ledger** until verified
  (unless the Owner enables `driver_auto_confirm`). Rejection leaves no posting.
- Customer over-payment beyond the outstanding balance needs explicit confirmation and the business setting
  `allow_customer_advance`; supplier advances need confirmation.

### 4.4 Stock & COGS — weighted-average cost per bird size

`stock_positions` holds, per size, the birds, kg and total cost currently in stock.

- Purchase: +qty, +kg, +cost (the line's share of the purchase final amount).
- Sale (bill line with a size): cost = stock cost × sold kg ÷ stock kg, rounded to paisa; stock is reduced.
  If recorded stock is smaller than the kg sold, the shortfall is posted as **uncosted kg** and the P&L is marked
  **provisional** (a purchase is missing or stock is unreconciled). Stock never goes negative.
- Return to stock (failed/partial delivery): birds simply stay in stock — no movement.
- Damage / death / shortage (recorded in trip settlement): removed at average cost and reported as **stock loss**
  inside cost of goods.
- Void of a bill returns its kg and its allocated cost to stock. Void of a purchase is allowed only while that much
  kg is still in stock.

Unsold stock is therefore never charged to the current period's COGS.

### 4.5 Profit & Loss (Owner only)

```
Sales revenue        = Σ final_amount of posted bills dated in the period (voided bills excluded)
Cost of goods sold   = Σ cost allocations of those bills + stock losses in the period
Gross profit         = Sales − COGS
Operating expenses   = Σ active expenses in the period
Net operating profit = Gross profit − Operating expenses
```

Shown separately (never mixed into profit): customer receivable, supplier payable, cash collected, supplier
payments, net cash movement. The report is labelled **provisional** when there is uncosted kg, unsettled trips with
sales in the period, or pending driver collections.

### 4.6 Quantities

`order_items`: ordered ≥ allocated ≥ 0 and delivered ≤ ordered. Allocation checks the open quantity under a row lock,
so one order can be split across trips without over-allocation. On delivery, undelivered allocated birds are released
back to the order so they can go on another trip.

Delivery statuses: PENDING → PARTIAL / DELIVERED / FAILED. DELIVERED requires delivered qty = allocated qty and a weight
for every delivered line; PARTIAL requires a reason.

Trip statuses: DRAFT → ASSIGNED → LOADING → DISPATCHED → IN_PROGRESS → COMPLETED → SETTLED.
Completing all deliveries does not settle a trip — the Owner reviews quantities, collections, cash handover and expenses,
then closes it. Reopening needs the Owner and a reason; both are audited.

## 5. Decisions (PRD §17 — MVP defaults adopted)

| Decision | Adopted |
|---|---|
| Bird sizes | Configurable per business (seeded with Large / Medium / Small, editable, with Marathi/Hindi names) |
| Rate override | Owner and staff with `rate_override`; drivers never by default |
| Same party as customer & supplier | One `parties` row, separate RECEIVABLE / PAYABLE ledgers |
| Driver payment | Pending Owner verification by default |
| WhatsApp | wa.me click-to-chat with an editable preview; a share log records "initiated" only |
| Costing | Weighted-average cost per size |
| Unaccounted stock | Must be recorded as damage / death / shortage with a note at settlement |
| P&L visibility | Owner only |
| Trip closure | Owner only |
| Staff access | Granular permissions set by the Owner |
| Delivery → bill | The bill posts when the driver saves the delivery, using the approved rate (drivers cannot change rates). Corrections are Owner voids + re-entry, both audited. |

## 6. Migration from v1

The business chose to start fresh (no import from Google Sheets). Customers' old dues are entered as opening receivable
balances when creating them. The v1 Google Sheet stays untouched as a backup.
