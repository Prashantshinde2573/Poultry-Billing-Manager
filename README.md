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
Two values are left for you:

```
SUPABASE_SERVICE_ROLE_KEY=   # Supabase → Project Settings → API Keys → "secret" key
SUPER_ADMIN_EMAILS=          # your email, e.g. prashant@example.com
```

The service key is used only on the server: creating owner/staff/driver logins and resetting passwords.
Never put it in a `NEXT_PUBLIC_` variable or commit it.

## 2. How the business works (same model as Restropi)

| Who | Where | What |
|---|---|---|
| Anyone | `/` website, `/pricing` | Features, prices (from your Plans), enquiry form, WhatsApp |
| **You (super admin)** | `/admin` | Add businesses + owner login (temporary password), plans & prices, record payments / renew, grace period, suspend, enquiries, revenue |
| Owner & staff | `/app` | Only the features in their plan. Reminders before the plan ends; read-only when it ends; renew by UPI from **Plan & billing** |
| Driver | `/driver` | Own trips: loading, deliveries, cash |

There is **no public sign-up**. You create every client.

### First time: create your super admin login
1. Put your email in `.env.local`: `SUPER_ADMIN_EMAILS=you@example.com` (and the service key, below).
2. Open `/admin/login`. While no super admin exists, it shows **Create the super admin**. Fill it once; the form then disappears for good.
3. `/admin` → **Settings**: add your UPI ID, payee name and WhatsApp number (owners see these on the renew screen).
4. `/admin` → **Plans**: set your prices and what each plan includes.
5. **Add business** → share the login + temporary password (copy or WhatsApp). The owner sets their own password at first sign-in.

### Plans (editable in /admin → Plans)
| | Basic ₹499 | Business ₹999 | Pro ₹1,999 |
|---|---|---|---|
| Customers, bills, payments, WhatsApp hisab, statements | ✓ | ✓ | ✓ |
| Suppliers & purchases, orders, trips + driver app, expenses | – | ✓ | ✓ |
| Profit & loss, stock cost | – | – | ✓ |
| Staff / drivers / vehicles | 1 / 0 / 0 | 3 / 3 / 3 | unlimited |

6 months = 5× monthly, 1 year = 10× monthly (editable). Plan rules are enforced in the database, not just hidden in the app.

### Plan states
Active → (ends) → **Grace** (if you give one; app still works) → **Ended** (read-only: data visible, no new entries) · **Suspended** (team sees a "paused" screen). Recording a payment extends from the later of today and the current end date and switches the business back on.

## 3. Deploy to Vercel

1. Push this folder to GitHub (e.g. `Prashantshinde2573/Poultry-Billing-Manager`).
2. vercel.com → New Project → import the repo (framework: Next.js).
3. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPER_ADMIN_EMAILS`, `LOGIN_EMAIL_DOMAIN=phone.poulgo.local`.
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
npm test            # 32 accounting, permission and plan tests on an in-memory Postgres (PGlite)
npm run typecheck
npm run build
```

## 7. Structure

```
src/app/page.tsx      website                   src/app/admin/    super admin console
src/app/app/          owner & staff screens     src/app/driver/   driver app
src/app/actions/      server actions (zod)      src/components/   UI
src/lib/i18n/         mr / hi / en              supabase/migrations/  schema, RLS, RPCs
docs/ARCHITECTURE.md  data model & accounting rules
```
