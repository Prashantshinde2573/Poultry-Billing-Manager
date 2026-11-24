# PoulGo — Poultry Business Manager 2.0

Mobile-first web app (installable PWA) for poultry trading: customers & suppliers with separate
ledgers, purchases, bird-size orders, trips, loading, deliveries → bills, driver collections with
owner verification, expenses, trip settlement, weighted-average COGS, owner-only Profit & Loss,
reports (CSV/PDF) and WhatsApp daily summaries. Marathi · हिंदी · English.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth, RLS) · Vercel.

## 1. Run on your computer

```bash
cd PoulGo
npm install
npm run dev          # http://localhost:3000
```

`.env.local` is already filled in for the Supabase project **PoulGo** (`yfefimkuiuqoqkzfggqt`).
One value is left for you:

```
SUPABASE_SERVICE_ROLE_KEY=   # Supabase → Project Settings → API Keys → "secret" key
```

It is only used on the server when the Owner adds a staff/driver login or resets a password.
Never put it in a `NEXT_PUBLIC_` variable or commit it.

## 2. First login

1. Supabase → Authentication → Sign In / Providers → Email: turn **Confirm email** off
   (or keep it on and click the link that arrives).
2. Open the app → **Create your business account** → you become the **Owner**.
3. Settings → set sale/purchase **rates** per bird size, add **vehicles**, then **Team & access**
   to add drivers/staff (they log in with their mobile number + password).

## 3. Deploy to Vercel

1. Push this folder to GitHub (e.g. `Prashantshinde2573/Poultry-Billing-Manager`).
2. vercel.com → New Project → import the repo (framework: Next.js).
3. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `LOGIN_EMAIL_DOMAIN=phone.poulgo.local`.
4. Supabase → Authentication → URL Configuration: add the Vercel URL as Site URL.

## 4. Database

`supabase/migrations/*.sql` — already applied to the PoulGo project. To recreate elsewhere:
`supabase db push` (or paste them in order into the SQL editor).

Security model:
- Every write goes through a `SECURITY DEFINER` function that first checks membership, role and
  permission (`private.require_*`). Clients cannot insert/update/delete tables directly.
- RLS is read-only and per business; drivers only see their own trips and those customers.
- Ledger, bills, payments and audit logs are immutable — corrections are voids/reversals with a reason.
- Idempotency keys on every create (double-taps and retries never post twice).

## 5. Roles

| | Owner | Staff | Driver |
|---|---|---|---|
| Customers, orders, trips, receive payment, counter bill | ✓ | ✓ | – |
| Suppliers, purchases, pay supplier | ✓ | permission | – |
| Expenses / verify driver collections / change rates / reports | ✓ | permission each | – |
| Profit & Loss, voids, settlement, opening balances, users | ✓ | – | – |
| Own trips: loading, start/finish, delivery, collection | – | – | ✓ |

Driver collections stay **pending** (not in the customer's balance) until verified.

## 6. Tests

```bash
npm test            # 22 accounting/permission tests on an in-memory Postgres (PGlite)
npm run typecheck
npm run build
```

## 7. Structure

```
src/app/(office)/     owner & staff screens     src/app/driver/   driver app
src/app/actions/      server actions (zod)      src/components/   UI
src/lib/i18n/         mr / hi / en              supabase/migrations/  schema, RLS, RPCs
docs/ARCHITECTURE.md  data model & accounting rules
```
