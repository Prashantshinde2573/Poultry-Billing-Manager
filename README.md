# Poultry Business Manager

**Simple Billing. Clear Accounts. Better Business.**

A mobile-first web app for a poultry wholesale / chicken-parcel business that replaces the handwritten ledger and per-customer Excel files. Bills (birds, weight, rate), payments and balances are stored in **one Google Spreadsheet that you own** — one tab per customer — and the app calculates everything from those transactions.

- Frontend: React 18 + Vite + TypeScript + Tailwind, hosted on **Netlify**
- Backend: **Google Apps Script** Web App (`apps-script/`), using SpreadsheetApp and the Sheets API
- Storage: **Google Sheets only** — no Firebase, Supabase or any other database

---

## Contents

1. [What it does](#1-what-it-does)
2. [Architecture](#2-architecture)
3. [Accounting rules](#3-accounting-rules)
4. [Google Sheets structure](#4-google-sheets-structure)
5. [Security model — read this](#5-security-model)
6. [Setup](#6-setup) — A. Prerequisites · B. Google Sheets · C. Apps Script · D. Frontend · E. Netlify
7. [API reference](#7-api-reference)
8. [Testing](#8-testing)
9. [Troubleshooting](#9-troubleshooting)
10. [Project structure](#10-project-structure)

---

## 1. What it does

| Area | Features |
|---|---|
| **Dashboard** | Day · Week · Month · 3 Months · 6 Months · 1 Year tabs + custom date range. Cards: Total Billing (Ekun Bil), Payments Received (Ekun Jama), Customers (Ekun Grahak), Outstanding (Ekun Baki, always *as of today*). Birds, kg, weighted average rate, bill/payment counts. Billing-vs-payments chart (daily or monthly), top customers, highest dues, recent transactions. |
| **Customers** | Add / edit / archive / reactivate; permanent delete only for records with no history. Search by name or mobile; sort by name, outstanding, recent activity. Every customer gets a stable ID (`C0001`) and their own sheet tab, created automatically. Duplicate name/mobile warning. |
| **Customer page** | Opening balance, totals, current balance, birds/kg, ledger with running balance (filter Day…1 Year, custom or All), bills/payments views, statement PDF / CSV / print / WhatsApp share. |
| **Add Bill** | Searchable customer picker, date defaults to today (IST), birds, kg, rate (default from Settings), live amount = kg × rate, double-submit protection, “View Bill” / “Add Another Bill” / share. |
| **Receive Payment** | Cash / Bank Transfer / UPI / Other, reference, partial payments, “Pay full” shortcut, overpayment warning + confirmation (only if advances are allowed), receipt PDF / WhatsApp. |
| **Transactions** | Every entry across customers, filters (period, customer, type, method, voided), view / edit / void, CSV export. |
| **Reports** | Daily, Weekly, Monthly, 3-Month, 6-Month, Yearly, Custom, Customer Statement, Outstanding Balances (any as-of date), Payments Received, Billing & Weight. PDF, CSV (Excel-compatible, UTF-8), print, WhatsApp. |
| **Settings** | Business name/contact/GSTIN/logo, default rate, zero-rate and advance-payment switches, report footer and statement note, connection status, user management (owner/staff), change password, audit log. |

### Phone app experience

On phones the app behaves like a payment-style mobile app rather than a website:

- **Home** — balance card (total outstanding, today's billing and receipts, with a hide-amounts eye), big *Add Bill* / *Receive* buttons, a quick-action icon grid and recent-customer avatars.
- **Bottom bar** — Home · Customers · **＋** · History · Reports. The centre ＋ opens a sheet with Add Bill, Receive Payment and Add Customer.
- **Customer screen** — contact card with Call and WhatsApp buttons, the balance, ledger history, a ⋮ menu (edit, statement PDF, share, CSV, adjustment, archive) and fixed *Add Bill* / *Receive* buttons at the bottom.
- **Entry screens** — full-screen forms with the Save button fixed at the bottom (it shows the bill amount), and a large centred amount box for payments.
- Swipeable filter chips, bottom-sheet dialogs, press feedback, 16 px inputs (no iPhone zoom) and safe-area support for notched phones.

**Install it like an app (PWA):** open the site on the phone →
- **Android (Chrome):** tap *Install* on the home-screen card, or ⋮ menu → *Install app* / *Add to Home screen*.
- **iPhone (Safari):** Share button → *Add to Home Screen*.

It then opens full-screen from its own icon, without the browser address bar, with long-press shortcuts for *Add Bill* and *Receive Payment*. Only the app's own files are cached on the phone; business data is never cached and always comes live from Google Sheets, so an internet connection is still needed to see or save entries.

---

## 2. Architecture

```
 Phone / laptop browser                 Google (your account)
┌────────────────────────┐   HTTPS POST  ┌──────────────────────────────┐
│ React app on Netlify   │ ────────────▶ │ Apps Script Web App (/exec)  │
│  • forms + validation  │  text/plain   │  • session check (every call) │
│  • charts, PDF, CSV    │  JSON body    │  • validation + LockService  │
│  • session token only  │ ◀──────────── │  • accounting (integer paise) │
└────────────────────────┘   JSON reply  │  • audit log                  │
                                         └──────────────┬───────────────┘
                                                        │ SpreadsheetApp /
                                                        ▼ Sheets API batchGet
                                         ┌──────────────────────────────┐
                                         │ Google Spreadsheet (private) │
                                         │ Clients · Settings · AuditLog │
                                         │ Dashboard · C0001 Rahul · …  │
                                         └──────────────────────────────┘
```

- **One source of truth.** Every total (dashboard, statements, outstanding) is computed by the backend on request from the Clients sheet and the customer tabs. No totals are stored that could drift.
- **Fast reads.** All customer tabs are read with one Sheets API `batchGet` call per 80 tabs, and the parsed data is cached for 5 minutes. Every write through the app invalidates the cache immediately; edits made by hand in the spreadsheet show up within 5 minutes, or immediately with the dashboard’s **Refresh** button.
- **Safe writes.** Every write runs under `LockService` (one writer at a time), re-reads the affected sheet, locates rows by **ID** (never by row number), writes with explicit cell formats and flushes before releasing the lock. Failures are returned as errors — the UI shows success only after the server confirms.
- **Idempotent creates.** Each new customer/bill/payment carries a `requestId`. A double-tap or a network retry returns the original record instead of creating a duplicate.
- **Stale-edit protection.** Customers and transactions have a `version`. An edit made from an out-of-date screen is rejected with “changed by someone else — refresh”.

---

## 3. Accounting rules

**Sign convention** (used everywhere): a positive balance means the customer owes you (*baki*); a negative balance means you hold an advance for them.

```
Current balance = Opening balance
                + Σ BILL amounts
                + Σ ADJUSTMENT debits
                − Σ PAYMENT amounts
                − Σ ADJUSTMENT credits          (VOID entries ignored)
```

- **Bill amount = weight (kg) × rate (₹/kg)**, rounded half-up to the nearest paisa. Example: 135.8 kg × ₹114 = **₹15,481.20**. All arithmetic uses integers (paise and grams) so there are no floating-point errors; the preview in the form uses the identical formula.
- Weight: up to 3 decimals (grams). Rate and amounts: up to 2 decimals. Birds: whole numbers ≥ 0. Weight must be > 0. Rate must be > 0 unless the owner enables zero-rate bills. Dates cannot be in the future.
- Payments never modify old bills. Partial payments and payments against old dues are normal PAYMENT rows.
- Overpayment: if a payment exceeds what is owed, it is **rejected** unless the owner has turned on *Allow advance payments*; then the user must confirm and the excess becomes a credit.
- Adjustments (owner-only, reason required) are for corrections like discounts or write-offs.
- Voiding keeps the row (status `VOID`, who/when/why) and excludes it from every calculation. Edits recalculate all balances from the full history.

**Period definitions** (Asia/Kolkata business dates; start and end are both **inclusive**):

| Tab | Range (example: today = Sat 24 Oct 2026) |
|---|---|
| Day | today → 24 Oct – 24 Oct |
| Week | Monday of this week → today → 19 Oct – 24 Oct |
| Month | 1st of this month → today → 1 Oct – 24 Oct |
| 3 Months | 1st of the month 3 months back → today → 1 Jul – 24 Oct |
| 6 Months | 1st of the month 6 months back → today → 1 Apr – 24 Oct |
| 1 Year | 1st of the month 12 months back → today → 1 Oct 2025 – 24 Oct 2026 |
| Custom | chosen start → chosen end |

**Activity vs balances.** Billing, payments, birds and kg are *activity within the period*. **Outstanding** on the dashboard is the *current* total across all customers (active and archived) and does not change with the period. Reports also show the **closing outstanding at the period end**, which counts only transactions dated on or before that date (plus opening balances). Customer statements show the opening balance at the start of the period, each entry with a running balance, and the closing balance.

---

## 4. Google Sheets structure

| Sheet | Contents |
|---|---|
| `Clients` | `customerId, customerName, phone, address, notes, createdAt, status (ACTIVE/INACTIVE), openingBalance, sheetName, updatedAt, version, requestId, createdBy` |
| `Settings` | `key, value, updatedAt, updatedBy` rows (business name, default rate, switches…) |
| `AuditLog` | `timestamp, user, action, customerId, transactionId, summary` — never passwords or tokens |
| `Dashboard` | Informational tab with live `COUNTIF` formulas. The app’s figures are computed live, not stored here. |
| `C0001 Rahul Chicken Centre`, `C0002 …` | One tab per customer, created automatically. Columns: `transactionId, transactionDate, transactionType (BILL/PAYMENT/ADJUSTMENT), birdCount, weightKg, ratePerKg, billAmount, paymentAmount, paymentMethod, referenceNumber, notes, createdAt, updatedAt, createdBy, status (ACTIVE/VOID), version, requestId, updatedBy, voidedAt, voidedBy, voidReason` |

- BILL rows fill birds/kg/rate/billAmount and leave payment columns empty; PAYMENT rows fill paymentAmount/method and leave bill columns empty; ADJUSTMENT rows use billAmount for a debit or paymentAmount for a credit. Nothing is ever counted twice.
- Tab names are `<ID> <name>`: characters Sheets forbids (`[ ] * ? / \ :`) and quotes are removed, length is capped, and the ID prefix keeps duplicate names unique. Renaming a customer renames the tab; the ID never changes.
- Text is written so Sheets never auto-converts it (phone numbers, dates, IDs), and text starting with `= + - @` is stored literally, never as a formula.
- **Editing by hand:** you can, but prefer the app. Rows you type without a `transactionId` are ignored (the customer page warns you) until the owner runs `repairManualRows()` in Apps Script. Dates typed as `dd/mm/yyyy` are understood. Never edit `transactionId`, `version` or `requestId`.

---

## 5. Security model

**Read this before going live.**

1. **The spreadsheet stays private.** Do not share it publicly. The Web App runs *as you* (the owner), so only your Google account needs access. Share the spreadsheet itself only with people you trust completely — anyone with edit access to the sheet can change data outside the app.
2. **Why the Web App is deployed with access “Anyone”.** A website on Netlify cannot call an Apps Script Web App restricted to “Anyone with a Google account”: Google’s sign-in redirect breaks cross-site `fetch`. So the endpoint is reachable by anyone who knows the URL, **and the URL is not treated as a secret**. Instead, every action except `healthCheck` and `login` requires a **session token** obtained by signing in to the app.
3. **App accounts.** Users and salted, peppered, iterated SHA-256 password hashes are stored in Apps Script **Script Properties** — not in the spreadsheet and never in the website. Sessions are random 192-bit tokens; only their hash is stored server-side (CacheService) and they expire after 6 hours of inactivity (max). Five wrong passwords lock a username for 15 minutes. Disabling a user or resetting a password signs them out everywhere.
4. **Roles.** **Owner**: everything. **Staff**: add customers, bills and payments; edit *their own* entries on the same day; view reports. Staff cannot void, add adjustments, change opening balances, archive/delete customers, change settings or manage users. All of this is enforced on the server.
5. **Fixed API surface.** The client can only call the named actions in `Code.gs`. It can never request an arbitrary sheet, range or formula. Every payload is validated (types, ranges, decimal places, IDs, dates, lengths); request bodies over 200 KB are rejected.
6. **No secrets in the frontend.** The only frontend setting is `VITE_API_URL`, which is public by nature. The spreadsheet ID lives in Script Properties; the owner’s Settings page shows only its last 6 characters.

**Known limitations (be honest about these):**
- Apps Script cannot see client IP addresses, so login throttling is per username, not per IP. Use strong passwords (12+ characters).
- Apps Script always returns HTTP 200; errors are in the JSON body.
- The session token is kept in the browser’s localStorage for up to 6 hours. Anyone with access to an unlocked, signed-in device can use the app — sign out on shared devices.
- Password hashing uses iterated SHA-256 (Apps Script has no bcrypt/scrypt). It is far better than plain storage, but a determined attacker who obtained the Script Properties could brute-force weak passwords.
- Google quotas apply (e.g. Apps Script ~6 min per execution, URL Fetch/Sheets read quotas, ~10 million cells per spreadsheet). For a small/medium business this is ample; a spreadsheet with hundreds of customers and tens of thousands of rows still works, but the first dashboard load after a write takes longer.

If you need Google-account sign-in instead of app passwords, host the frontend *inside* Apps Script (HtmlService) — a different deployment model that this project does not use.

---

## 6. Setup

### A. Prerequisites

- **Node.js 20+** and npm (`node -v`)
- A **Google account** (the business owner’s)
- **Google Sheets** and **Google Apps Script** (free with the account)
- A **Netlify** account (free tier is fine) and, optionally, a GitHub account for automatic deploys

### B. Google Sheets setup

1. Go to <https://sheets.new> and name the spreadsheet, e.g. *Poultry Business Books*.
2. Copy the spreadsheet ID from the URL: `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`.
3. Keep **Share** set to *Restricted*. Do not publish it to the web.
4. You do not need to create any tabs; `setup()` creates `Clients`, `Settings`, `AuditLog` and `Dashboard`, and the app creates each customer’s tab.

> **Testing first?** Create a *second* spreadsheet (e.g. *Poultry TEST*) and a second Apps Script deployment pointing at it. Never mix test entries with real customer accounts. To remove test data later, simply delete that test spreadsheet.

### C. Google Apps Script setup

1. In the spreadsheet: **Extensions → Apps Script** (or create a standalone project at <https://script.google.com>).
2. Create one script file per file in `apps-script/` with the **same name** (File ➕ → Script): `Accounting`, `Audit`, `Auth`, `Code`, `Config`, `Customers`, `Reports`, `Settings`, `Setup`, `Sheets`, `Transactions`, `Util`. Paste each file’s contents. Delete the default `Code.gs` content first (our `Code.gs` replaces it).
3. **Project Settings (⚙) → “Show appsscript.json manifest file”**, then open `appsscript.json` and replace it with `apps-script/appsscript.json`. This sets the Asia/Kolkata timezone, the V8 runtime, the spreadsheets scope and enables the **Sheets advanced service** (fast bulk reads).
   *Alternatively* use [clasp](https://github.com/google/clasp): `npm i -g @google/clasp && clasp login && clasp create --type sheets --rootDir apps-script` then `clasp push`.
4. **Project Settings → Script properties → Add script property**:

   | Property | Value |
   |---|---|
   | `SPREADSHEET_ID` | the ID from step B2 |
   | `BOOTSTRAP_USERNAME` | owner login, lowercase, e.g. `owner` |
   | `BOOTSTRAP_PASSWORD` | a strong temporary password (8+ characters; 12+ recommended) |

5. In the editor choose the function **`setup`** and click **Run**. Approve the authorisation prompt (it asks to manage your spreadsheets; “Google hasn’t verified this app” → *Advanced* → *Go to project* is expected for your own script). The log should say the master sheets were created, the owner account was created and **BOOTSTRAP_PASSWORD was removed**.
6. **Deploy → New deployment → ⚙ Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
   - Click **Deploy** and copy the **Web app URL** ending in `/exec`.
   See §5 for why “Anyone” is required and how requests are still protected.
7. Test the health check: open `<your /exec URL>?action=healthCheck` in a browser. You should see JSON like
   `{"success":true,"data":{"status":"ok","spreadsheetReachable":true,"setupComplete":true,…}}`.
8. **Updating the backend later:** after changing code, use **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**. This keeps the same URL. (Creating a *new deployment* changes the URL.)

Other editor functions (Run from the editor only — they are not reachable from the web):
- `resetOwnerPassword()` — set `BOOTSTRAP_USERNAME` + `BOOTSTRAP_PASSWORD` again, run it; the password is reset and the property deleted.
- `repairManualRows()` — gives IDs to rows typed into customer tabs by hand.
- `clearDataCache()` — forces fresh reads after manual spreadsheet edits.

### D. Frontend setup (local)

```bash
cd poultry-business-manager
npm install
cp .env.example .env          # then edit .env:
# VITE_API_URL=https://script.google.com/macros/s/XXXXXXXX/exec
npm run dev                   # http://localhost:5173
```

Sign in with the owner username/password from step C4. Then open **Settings** to enter the business name, contact details, logo and default rate, and add staff users.

Other commands:

```bash
npm test             # 73 automated tests (backend accounting + frontend utils)
npm run typecheck    # TypeScript
npm run build        # production bundle in dist/
npm run preview      # serve dist/ locally
```

**Trying the UI without Google:** `npm run dev:local-backend` starts the real `apps-script/*.gs` code in Node against an *empty in-memory* spreadsheet on port 8787 (sign in as `owner` / `localdev123`). Then run `VITE_API_URL=http://localhost:8787 npm run dev`. All data disappears when you stop it. This is for development only.

### E. Netlify deployment

1. Push this folder to a GitHub repository (the `.gitignore` already excludes `.env`, `node_modules` and `dist`).
2. Netlify → **Add new site → Import an existing project** → choose the repo.
3. Build settings are read from `netlify.toml`: build command `npm run build`, publish directory `dist`, Node 20.
4. **Site configuration → Environment variables → Add**: `VITE_API_URL` = your `/exec` URL.
5. **Deploy**. SPA routing (`/customers/C0001` on refresh) is handled by the redirect rule in `netlify.toml` and `public/_redirects`.
6. Open the live URL → the sign-in page should show **“Connected to Google Sheets”**. Sign in, add a customer and check that a new tab appears in the spreadsheet.

*No Git?* Run `npm run build` with `VITE_API_URL` set in `.env`, then drag the `dist/` folder onto <https://app.netlify.com/drop>.

> Changing `VITE_API_URL` requires a **rebuild** (Netlify → Deploys → Trigger deploy), because Vite bakes it in at build time.

---

## 7. API reference

Single endpoint: `POST <WEB_APP_URL>` with header `Content-Type: text/plain;charset=utf-8` and body

```json
{ "action": "createBill", "token": "<session token>", "requestId": "<uuid for create actions>", "payload": { } }
```

Success: `{ "success": true, "data": { … }, "message": "Bill saved" }`
Error: `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Weight (kg) must be greater than zero", "field": "weightKg" } }`

| Action | Who | Payload (main fields) |
|---|---|---|
| `healthCheck` | public | — (also `GET ?action=healthCheck`) |
| `login` / `logout` / `me` | public / user | `username, password` |
| `changePassword` | user | `currentPassword, newPassword` |
| `getDashboard` | user | `period` (`DAY, WEEK, MONTH, QUARTER, HALF_YEAR, YEAR, CUSTOM`), `start, end` (CUSTOM), `fresh` |
| `getDashboardSummary`, `getDashboardChartData` | user | same as `getDashboard` (subsets) |
| `listCustomers` | user | `status` (`ALL/ACTIVE/INACTIVE`), `search`, `fresh` |
| `getCustomer` | user | `customerId`, `includeTransactions` |
| `createCustomer` | user | `customerName, phone, address, notes, openingBalance, allowDuplicate` + `requestId` |
| `updateCustomer` | user (opening balance: owner) | `customerId, expectedVersion`, changed fields |
| `archiveCustomer` | owner | `customerId, status` (`INACTIVE` archive / `ACTIVE` reactivate) |
| `deleteCustomer` | owner | `customerId, confirmName` — only with no transactions and zero opening balance |
| `createCustomerSheet` | user | `customerId` — repairs/creates the customer tab |
| `listTransactions` | user | period fields, `customerId, transactionType, paymentMethod, includeVoid, limit, offset` |
| `getTransaction` | user | `customerId, transactionId` |
| `createBill` | user | `customerId, transactionDate, birdCount, weightKg, ratePerKg, notes` + `requestId` |
| `createPayment` | user | `customerId, transactionDate, amount, paymentMethod, referenceNumber, notes, confirmOverpayment` + `requestId` |
| `createAdjustment` | owner | `customerId, transactionDate, direction (DEBIT/CREDIT), amount, notes` + `requestId` |
| `updateTransaction` | owner, or staff for own same-day entries | `customerId, transactionId, expectedVersion`, changed fields |
| `voidTransaction` | owner | `customerId, transactionId, expectedVersion, reason` |
| `getCustomerStatement` | user | `customerId` + period fields |
| `getReports` | user | `reportType` (`SUMMARY/PAYMENTS/BILLING`) + period fields, `customerId, transactionType, paymentMethod` — also the data source for PDF/CSV exports |
| `getOutstandingReport` | user | `asOf, includeZero` |
| `getSettings` / `updateSettings` | user / owner | settings keys |
| `getSystemStatus`, `getAuditLog`, `listUsers`, `createUser`, `updateUser` | owner | — |

Error codes: `VALIDATION_ERROR, UNAUTHENTICATED, INVALID_CREDENTIALS, RATE_LIMITED, FORBIDDEN, NOT_FOUND, CONFLICT, DUPLICATE, DUPLICATE_CUSTOMER, HAS_HISTORY, CUSTOMER_INACTIVE, OVERPAYMENT_NOT_ALLOWED, OVERPAYMENT_CONFIRMATION_REQUIRED, LOCK_TIMEOUT, CONFIG_ERROR, PERMISSION_ERROR, BAD_REQUEST, UNKNOWN_ACTION, INTERNAL_ERROR`.

Amounts are rupees with up to 2 decimals; weights kg with up to 3; dates `YYYY-MM-DD`. Send numbers as strings (e.g. `"135.8"`) to avoid any floating-point ambiguity.

---

## 8. Testing

### Automated (`npm test`)

`tests/backend/` loads the **real** `apps-script/*.gs` files into Node with in-memory fakes of SpreadsheetApp, the Sheets API, CacheService, PropertiesService, LockService and Utilities. No Google account and no real data are involved. Every backend test runs twice — with SpreadsheetApp reads and with Sheets API `batchGet` reads — and must give identical results. `tests/unit/` covers money formatting/parsing, CSV escaping, IST dates, WhatsApp links and form validation.

| # | Test-plan item | Covered by |
|---|---|---|
| 1–2 | Create customer; tab created | `(1,2,11) creates a customer with a dedicated tab` |
| 3 | Bill amount | `(3) bill amount = weight × rate with exact paise` (₹15,481.20, 0.1×0.3, half-up rounding) |
| 4–7 | Partial + same-day payments, multiple same-day bills, outstanding | `(4,5,6,7)` |
| 8 | Edit old bill → balance recalculated; stale edit rejected | `(8)` |
| 9 | Void → totals exclude it, row kept | `(9)` |
| 10 | Opening balance | `(10)` |
| 11 | Customer with zero transactions | `(1,2,11)` |
| 12 | Duplicate names | `(12)` + tab-name sanitising test |
| 13 | Duplicate submissions | `(13)` same `requestId` → one record |
| 14–15 | Period filters & custom boundaries (incl. Sunday/Monday and midnight IST) | `(14,15)` ×2 |
| 16–17 | Historical closing balances; outstanding across customers | `(16,17)` |
| 18–19 | Statement & CSV export | `(18)` + `csv.test.ts`; PDF/CSV downloads checked in the browser run below |
| 20 | Mobile layout | browser run at 390×844 (below) |
| 21 | Unauthorised requests | `(21)`, login lockout, staff permissions, session expiry |
| 22 | API errors / missing spreadsheet permission | `configuration errors` |
| — | Overpayment rules, numeric validation, formula injection, archive vs delete, rename keeps ID, adjustments, audit log without secrets, cache invalidation, manual rows, missing tab recovery | individual tests |

### Browser walkthrough

A Playwright run against `npm run dev:local-backend` exercised: sign-in (wrong and correct password), empty states, add customer with opening balance, duplicate warning, bill entry with live ₹15,481.20 preview and a double-click (saved once), second customer/bill, partial UPI payment, overpayment rejection, dashboard totals and period tabs, editing a bill and voiding a payment from the customer page with correct new balances, statement PDF and CSV download, reports PDF/CSV, outstanding report, transactions with voided entries, saving settings, and the phone layout (no horizontal scrolling).

### What must be tested by you with real credentials

The automated tests cannot reach Google. After deploying, run through this once on a **test spreadsheet** (§6B):

1. `?action=healthCheck` returns `spreadsheetReachable: true, setupComplete: true`.
2. Sign in on the Netlify site from a phone and a laptop.
3. Add a customer → a tab `C0001 …` appears in the spreadsheet.
4. Add a bill and two payments; confirm the rows and the dashboard.
5. Edit and void an entry; check the AuditLog sheet.
6. Download a statement PDF and CSV; open the CSV in Excel/Sheets.
7. Share a statement to WhatsApp from a phone.
8. Sign in as a staff user and confirm void/settings are blocked.
9. Call the API without a token (e.g. `curl -X POST -d '{"action":"listCustomers"}' <URL>`) → `UNAUTHENTICATED`.

Then point a fresh deployment (or update `SPREADSHEET_ID`) at the real spreadsheet.

---

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| **“Backend not connected”** page | `VITE_API_URL` was empty at build time. Set it (.env or Netlify env vars) and rebuild. |
| **“Could not reach the server”** / CORS error in the console | Use the `/exec` URL (not `/dev`). The deployment must be *Execute as: Me* and *Who has access: Anyone*. After editing the code, publish a **new version** of the existing deployment. Corporate networks or ad-blockers sometimes block `script.google.com`. |
| **“Unexpected response (HTTP 200/302)”** | The URL points to a Google sign-in page — access is not set to *Anyone*, or the URL is wrong. |
| **CONFIG_ERROR: spreadsheet could not be opened** | Check `SPREADSHEET_ID` in Script properties and that the deploying account can edit the spreadsheet. |
| **PERMISSION_ERROR** | Re-run `setup()` in the editor to re-authorise (needed after scopes change), then publish a new deployment version. |
| **Sign-in says setup not complete** | Run `setup()` with `BOOTSTRAP_USERNAME`/`BOOTSTRAP_PASSWORD` set. |
| **Forgot the owner password** | Set `BOOTSTRAP_USERNAME` + `BOOTSTRAP_PASSWORD` again and run `resetOwnerPassword()`. |
| **“Too many failed attempts”** | Wait 15 minutes. |
| **Missing worksheet tab** (tab deleted/renamed by hand) | Open the customer → **Repair sheet**. If the tab was only renamed, rename it back to the value in the `sheetName` column of `Clients`. |
| **Balance looks wrong** | Check for rows edited by hand: wrong `transactionType`, amounts typed as text, a `VOID` status, or rows without `transactionId` (run `repairManualRows()`). Press **Refresh** on the dashboard (or run `clearDataCache()`). Balances are always recomputed from the rows, so fixing the row fixes the balance. |
| **Dashboard slow with many customers** | Make sure the Sheets advanced service is enabled (Settings page shows “Fast bulk reads: Enabled”). |
| **System busy (LOCK_TIMEOUT)** | Another save was in progress; retry. Creates are retried automatically and safely. |
| **PDF export fails or ₹ shows oddly** | PDFs print amounts as “Rs.” because the built-in PDF fonts have no ₹ glyph. If a logo breaks the PDF, remove it in Settings and upload a simple PNG. Pop-up/download blockers can stop the file; allow downloads for the site. |
| **WhatsApp did not attach the PDF** | Click-to-chat links can only pre-fill text. On phones that support it, the app opens the share sheet with the PDF (pick WhatsApp). Otherwise it downloads the PDF and opens WhatsApp with a summary — attach the downloaded file in the chat. |
| **Unauthorised API requests** | Expected without a valid session. Tokens expire after 6 h; sign in again. Disabling a user ends their sessions immediately. |

---

## 10. Project structure

```
poultry-business-manager/
├── apps-script/              Google Apps Script backend (copy into the script editor)
│   ├── Code.gs               doGet/doPost, router, response envelope
│   ├── Config.gs             sheet names, headers, limits
│   ├── Auth.gs               users, password hashing, sessions, roles
│   ├── Customers.gs          customer CRUD + automatic tabs
│   ├── Transactions.gs       bills, payments, adjustments, edit, void
│   ├── Accounting.gs         pure balance/period/statement maths
│   ├── Reports.gs            dashboard, statements, reports, outstanding
│   ├── Settings.gs, Audit.gs, Sheets.gs, Util.gs, Setup.gs
│   └── appsscript.json       manifest (timezone, scopes, Sheets service)
├── src/
│   ├── components/           UI primitives, PeriodFilter, CustomerPicker, mobile/ (app bar, sheets, avatars)
│   ├── context/              auth, settings, toasts
│   ├── features/             dashboard, customers, billing, payments, transactions, reports
│   ├── hooks/                useApiQuery (auto-refresh after writes)
│   ├── layouts/              sidebar + mobile header/bottom bar
│   ├── pages/                one file per route
│   ├── services/api/         typed client, endpoints, session, change events
│   ├── types/                API contract types
│   ├── utils/                money, dates, CSV, PDF, WhatsApp
│   └── validation/           zod schemas
├── tests/
│   ├── backend/              harness + backend tests (each runs on both read paths)
│   ├── unit/                 frontend utility tests
│   └── local-backend.ts      dev-only in-memory backend server
├── public/                 manifest.webmanifest, sw.js, app icons, _redirects
├── netlify.toml
├── .env.example
└── package.json, vite.config.ts, vitest.config.mjs, tailwind.config.ts, tsconfig*.json
```

No credentials, tokens or real customer data are included in this repository.
