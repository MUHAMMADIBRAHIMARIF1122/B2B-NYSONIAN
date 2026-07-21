# B2B Finance — Project Documentation

> Last updated: July 2026  
> Stack: React 19 + Vite + Tailwind CSS v4 | Express 5 + PostgreSQL | Self-hosted on EC2 at b2b.nysonik.com

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Folder Structure](#3-folder-structure)
4. [Running Locally](#4-running-locally)
5. [Environment Variables](#5-environment-variables)
6. [Database](#6-database)
7. [API Server](#7-api-server)
8. [Frontend — Pages & Components](#8-frontend--pages--components)
   - [App Shell](#app-shell-appjsx)
   - [Dashboard](#dashboard)
   - [Transactions Table](#transactions-table)
   - [Revenue Chart](#revenue-chart)
   - [Client Tracker](#client-tracker)
   - [Finance Check](#finance-check)
   - [Fulfillment](#fulfillment)
   - [Add B2B](#add-b2b)
9. [Global State — DataContext](#9-global-state--datacontext)
10. [Product Catalog](#10-product-catalog)
11. [Order Number Logic](#11-order-number-logic)
12. [Deployment](#12-deployment)
13. [GitHub](#13-github)
14. [Data Flow Diagram](#14-data-flow-diagram)
15. [Business Logic Reference](#15-business-logic-reference)
16. [Change Log](#16-change-log)

---

## 1. Project Overview

Internal B2B finance dashboard for **Nysonian Inc.** built to manage order-to-cash (O2C) workflows including:

- Recording B2B sales entries (Add B2B form)
- Viewing all transactions with search, filter, sort, inline edit, bulk delete
- Finance approval — check company dues before approving new orders
- Fulfillment tracking — manual flag of stock availability with ETA dates
- Revenue charts and client analytics

---

## 2. Architecture

### Production (b2b.nysonik.com)

```
Browser → Nginx (443 HTTPS)
              ├── /api/*  → Node.js :5009  (Express backend — PM2 process b2b-api)
              └── /*      → /var/www/b2b/dist  (built React SPA)
                                        │
                                        ▼
                               PostgreSQL on AWS RDS
                               schema: b2b
                               tables: entries, fulfillment, clients
```

### Local development

```
React :5173  →  Vite proxy /api/*  →  Express :3001  →  PostgreSQL RDS
```

- **DataContext** fetches both `/api/b2b-entries` and `/api/fulfillment` on load, merges into `transactions`
- **fulfillmentMap** keyed by `orderNo || invoice` — overlaid onto transactions for display
- **products.js** is static — no DB reads for SKU lookups

---

## 3. Folder Structure

```
F:\B2B FINANCE\
├── backend/
│   ├── app.js             ← Express app (all routes, DB pool, migrations)
│   ├── server.js          ← Local dev entry (calls app.listen on :3001)
│   ├── xero.js            ← Xero OAuth service
│   └── .env               ← Secrets (never commit)
├── api/
│   └── index.js           ← Vercel serverless entry point
├── deploy/
│   ├── nginx.conf         ← Nginx site config for b2b.nysonik.com
│   └── setup.sh           ← One-shot server setup script
├── ecosystem.config.js    ← PM2 process config
├── vercel.json            ← Vercel deployment config (backup)
├── package.json           ← Root deps (express, pg, cors, etc.)
├── start.bat              ← One-click local startup
├── DOCS.md                ← This file
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js     ← Vite config with /api proxy + Tailwind plugin
│   ├── index.html
│   └── src/
│       ├── App.jsx        ← Root component, tab navigation, sidebar
│       ├── index.css      ← Global styles + Tailwind directives
│       ├── main.jsx       ← React DOM mount
│       │
│       ├── context/
│       │   └── DataContext.jsx ← All shared state + API fetching
│       │
│       ├── hooks/
│       │   └── useCountUp.js   ← Animated number counter hook
│       │
│       ├── components/
│       │   ├── Dashboard.jsx
│       │   ├── TransactionsTable.jsx
│       │   ├── RevenueChart.jsx
│       │   ├── ClientTracker.jsx
│       │   ├── FinanceCheck.jsx
│       │   ├── Fulfillment.jsx
│       │   ├── AddB2B.jsx
│       │   └── StatusBadge.jsx
│       │
│       └── data/
│           ├── products.js     ← Full product+SKU+color+inventory catalog (398 SKUs)
│           ├── transactions.js ← Static seed data
│           └── inventory.js   ← Initial inventory levels
│
└── scripts/
    ├── seed-from-local.js     ← One-time DB seed from transactions.js
    └── sync-from-sheets.js    ← Google Sheets → PostgreSQL sync
```

---

## 4. Running Locally

### Option A — One click
Double-click **`start.bat`**. It opens two terminal windows (API server + React dev server) and launches the browser at `http://localhost:5173`.

### Option B — Manual
```bash
# Terminal 1 — API server
cd "F:\B2B FINANCE"
node server.js

# Terminal 2 — React frontend
cd "F:\B2B FINANCE\frontend"
npm run dev
```

### Prerequisites
- Node.js installed
- PostgreSQL reachable (see `.env`)
- `npm install` run in both root and `frontend/` directories

---

## 5. Environment Variables

**`backend/.env`** — not committed to git

| Variable | Description |
|---|---|
| `DATABASE_URL` | Full PostgreSQL connection string |
| `API_KEY` | Secret key — must match `VITE_API_KEY` in frontend |
| `PORT` | API server port (production: 5009, local: 3001) |
| `FRONTEND_URL` | Allowed CORS origin (e.g. `https://b2b.nysonik.com`) |
| `XERO_*` | Xero OAuth credentials (see Xero section) |

**`frontend/.env`** — not committed to git

| Variable | Description |
|---|---|
| `VITE_API_KEY` | Must match `API_KEY` in backend — baked into frontend at build time |

---

## 6. Database

### Connection
- Host: `54.172.115.118:5432`
- Database: `erp_maindb`
- User: `nysonian`

### Schema: `b2b`
All new form submissions go into `b2b.entries`.

### Table: `b2b.entries`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | Auto-generated |
| `customer` | text | Customer name |
| `company` | text | Company name |
| `product` | text | Product name |
| `invoice` | text | Invoice number |
| `invoice_date` | date | |
| `sku` | text | Product SKU |
| `qty` | integer | |
| `unit_price` | numeric | |
| `total` | numeric | qty × unit_price |
| `payment_terms` | text | Net 0/30/40/45/60 |
| `due_date` | date | |
| `order_no` | text | MO-YYMMDD-XXXX format |
| `status` | text | Received / Paid / Partially Received / Due |
| `payment_rec_date` | date | |
| `shipment_date` | date | |
| `fulfilled_month` | text | e.g. "July-2025" |
| `payment_rec_month` | text | |
| `delivery` | text | Company / Self |
| `remarks` | text | |
| `finance_remarks` | text | |
| `closed_won` | text | |
| `currency` | text | USD / GBP / EUR etc. |
| `fulfillment_status` | text | available / unavailable |
| `fulfillment_ready_date` | date | |
| `customer_po` | text | Customer purchase order number |
| `created_at` | timestamptz | Auto-set by DB |

### Table: `b2b.fulfillment`

Dedicated fulfillment table — works for static and DB-sourced orders alike.

| Column | Type | Notes |
|---|---|---|
| `order_key` | text UNIQUE | orderNo or invoice |
| `fulfillment_status` | text | available / unavailable |
| `fulfilled_month` | text | |
| `shipment_date` | date | |
| `delivery` | text | Company / Self |
| `fulfillment_ready_date` | date | ETA when unavailable |
| `updated_at` | timestamptz | |

### Table: `b2b.clients`

One row per company — auto-populated from entries.

All three tables are **auto-migrated on server startup** via `runMigrations()` in `backend/app.js`.

---

## 7. API Server

File: `backend/app.js`

All routes require `x-api-key` header (except `/api/health`).

### `GET /api/b2b-entries`
Returns all rows from `b2b.entries` ordered by `created_at DESC`.

### `POST /api/b2b-invoice`
Saves multiple line items for one invoice + triggers Xero DRAFT creation.

```json
{
  "header": {
    "customer": "Jerry Kallman", "company": "Airline International",
    "invoice": "1020", "invoiceDate": "2026-07-16",
    "customerPO": "PO-12345",
    "dueDate": "2026-08-15", "paymentTerms": "Net 30",
    "orderNo": "MO-260716-XYZW", "status": "Due", "currency": "USD"
  },
  "lineItems": [
    { "product": "Carry-On", "sku": "AllG1", "qty": 10, "unitPrice": 120.00 }
  ]
}
```

### `PATCH /api/b2b-row/:id`
Inline-edits a single row in `b2b.entries`. Accepts any subset of editable fields. Builds a dynamic `SET` clause — only updates what you send.

### `PATCH /api/fulfillment/:orderKey`
Upserts fulfillment data into `b2b.fulfillment`. Sending `fulfillmentStatus: ""` deletes the record (resets to pending).

### `GET /api/fulfillment`
Returns all records from `b2b.fulfillment`.

### `GET /api/clients`
Returns client master records with aggregated invoice count, total invoiced, total received.

### `DELETE /api/b2b-entries`
Deletes rows by ID array: `{ "ids": [1, 2, 3] }`

### `GET /api/health`
`{ "ok": true }` — no auth required.

---

## 8. Frontend — Pages & Components

### App Shell (`App.jsx`)

- Renders the sidebar + header + main content area
- **Tab persistence**: active tab saved to `localStorage` key `"activeTab"` — survives page reloads
- **pageKey**: increments on every tab switch, passed as `key` to `<main>` to force full remount of the active page
- Sidebar collapses to `0px` width (with CSS transition); reopens via hamburger icon in header

**Tabs:**

| id | Label | Component |
|---|---|---|
| `dashboard` | Dashboard | `<Dashboard />` |
| `transactions` | Transactions | `<TransactionsTable />` |
| `revenue` | Revenue Chart | `<RevenueChart />` |
| `clients` | Client Tracker | `<ClientTracker />` |
| `finance` | Finance Check | `<FinanceCheck />` |
| `fulfillment` | Fulfillment | `<Fulfillment />` |
| `add` | Add B2B | `<AddB2B />` |

---

### Dashboard

Calculates and displays key financial metrics from `DataContext`.

**KPI Cards:**
- **Total Fulfilled** — sum of `monthlyRevenue[].fulfilled`
- **Total Received** — sum of `monthlyRevenue[].received`
- **Outstanding** — sum of transactions where `status === "Partially Received"`
- **Bad Debt** — sum of transactions where `financeRemarks === "bad debt"`

**Other panels:**
- Company count, invoice count, total line items
- Payment status breakdown (Received / Paid / Partially Received / Due)
- Top 5 clients by total revenue with animated bar chart

**Animations:** KPI values count up from 0 on load (850ms). Bar widths animate in with staggered delays.

---

### Transactions Table

Full-featured data grid. All data from `DataContext.transactions`.

**Features:**
- **Search** — searches customer, company, product, invoice, sku
- **Filter** — by company or status
- **Sort** — click any column header, toggles asc/desc
- **Sticky headers** — `thead` uses `sticky top-0 z-10`
- **Multi-select** — checkboxes, select-all with indeterminate state
- **Bulk delete** — with two-click confirmation, syncs to DB
- **Inline edit** — select one row → "Edit row" → all fields become editable inputs/selects, total auto-calculated → saved to DB via `PATCH /api/b2b-row/:id` then `refreshEntries()`
- **Selection toolbar** — shows row count + total amount when rows selected

---

### Revenue Chart

Recharts-based visualisation of monthly fulfilled vs received revenue.  
Data from `DataContext.monthlyRevenue`.

---

### Client Tracker

Per-company breakdown of all orders, totals, and outstanding amounts.  
Data from `DataContext.transactions`.

---

### Finance Check

**O2C Stage: Credit Check & Approval**

Implements a manual finance approval workflow. Splits transactions into three buckets:

```
pending  → needsApproval === true  AND  approvalStatus === "pending"
held     → needsApproval === true  AND  approvalStatus === "held"
approved → approvalStatus === "approved"
```

**Flow:**
1. When a new entry is added via Add B2B, it gets `needsApproval: true`, `approvalStatus: "pending"`
2. Finance person sees it in the **Awaiting Approval** section
3. Each card shows: company, customer, product, qty × price, total, terms, status badge
4. **Company dues alert**: if the same company has other transactions with status `"Due"` or `"Partially Received"`, a warning is shown listing each outstanding invoice
5. Actions:
   - **Hold** → `approvalStatus: "held"` — card dims, stays in the held sub-section
   - **Approve** → `approvalStatus: "approved"`, `needsApproval: false` — moves to Approved section
6. Approved transactions show in a compact read-only list with expand toggle
7. **Company history** panel expands to show full breakdown of pending vs cleared invoices

**Risk detection:**
```js
const RISK = new Set(["Due", "Partially Received"])
```
Any transaction from the same company matching these statuses triggers the dues warning.

---

### Fulfillment

**O2C Stage: Fulfillment & Delivery**

Manual per-order stock availability flagging. No automatic inventory checking — a person reviews each order and marks it.

**Tabs:** Pending / Available / Not Available

**Orders displayed:** `transactions` where `qty > 0` AND `status !== "Paid"` (paid orders don't need fulfillment tracking)

**OrderCard states:**

| State | Description | Action |
|---|---|---|
| Pending | No decision made | "Yes, available" or "Not available" buttons |
| Not Available (date picker) | After clicking "Not available" | Date input appears — enter ETA, click Confirm |
| Available | Marked ready to ship | Green badge, Undo link |
| Not Available (confirmed) | Has ETA date | Red badge + ETA date shown, Undo link |

**Undo**: clicking undo resets `fulfillment` to `null`, moving the order back to Pending tab.

**Data written:** `setFulfillmentStatus(id, "available" | "unavailable", readyDate?)`

---

### Add B2B

Form for creating new B2B entries. Writes to both **database** and **DataContext** on submit.

#### Sections

1. **Who is this for?** — Customer name + Company (autocomplete from existing transactions)
2. **Invoice details** — Invoice # (auto-incremented) + Invoice Date + **Customer PO #** + Order # (auto-generated)
3. **What are they buying?** — Product & Colour + SKU + Qty + Unit Price + Line Total (multi-line support)
4. **Payment details** — Terms + Due Date + Currency + Status + Payment Received Date
5. **Notes** — Remarks + Finance Remarks

#### Customer/Company Autocomplete

- Options built from all unique customers/companies in `DataContext.transactions`
- Selecting an existing customer **auto-fills**: company, payment terms, delivery (from most recent matching transaction)
- Selecting an existing company **auto-fills**: payment terms, delivery
- "Existing customer" notice shown when a match is found

#### Product & Colour Dropdown

- Options: all `"Product — Color"` strings from `productCatalog` (398+ entries), sorted
- Selecting a variant **auto-fills** the SKU field immediately
- Scrollable dropdown (`max-h-60` with `overflow-y-auto`)
- Type any substring to filter (e.g. "Forest", "Carry", "Blush")

#### SKU Field

- Full scrollable autocomplete from all SKUs in `productCatalog`
- Typing a known SKU **back-fills** the Product & Colour field
- Color hint shown below field (e.g. "Forest Green · auto-filled from SKU")

#### Order Number

- Auto-generated on every new form open
- Format: `MO-YYMMDD-XXXX` where XXXX is 4 random characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- No ambiguous characters (0/O/1/I excluded)
- Read-only field — no regenerate button (intentional)
- Unique per entry; generated fresh on each form reset

#### Validation (required fields)

- Customer name
- Company
- Invoice #
- Invoice date
- Quantity (must be > 0)

#### Submission

1. Validates form
2. POSTs to `/api/b2b-entries` — saves to PostgreSQL
3. Calls `addTransaction()` — saves to DataContext (in-memory, visible immediately across all tabs)
4. Shows success screen for 3 seconds, then resets form with a new order number

#### Live Preview

Sidebar panel (sticky, right side) shows a live card preview as you type: company, customer, order number, invoice, product+colour+SKU, total, status, terms, due date.

---

## 9. Global State — DataContext

File: `frontend/src/context/DataContext.jsx`

All components consume state via `useData()` hook. On load, `fetchAll()` fetches both `/api/b2b-entries` and `/api/fulfillment` in parallel, merges them into `transactions`.

### Shape

```js
{
  transactions: Transaction[],   // merged: static + DB + fulfillmentMap overlay
  monthlyRevenue: MonthlyRevenue[],
  inventory: InventoryItem[],
  loading: boolean,

  refreshEntries(),              // re-fetches both endpoints
  addTransaction(),              // no-op — DB is source of truth
  removeTransactions(ids),       // deletes from DB + local state
  updateTransaction(id, changes),// optimistic local update (used before API call)
  approveTransaction(id),
  holdTransaction(id),
  setFulfillmentStatus(),        // no-op — fulfillment goes through API
  updateInventoryItem(id, changes),
  addInventoryItem(newItem),
}
```

### Transaction Object

```js
{
  id: number,
  customer: string,
  company: string,
  product: string,
  invoice: string,
  invoiceDate: string,
  customerPO: string,
  sku: string,
  qty: number,
  unitPrice: number,
  total: number,
  paymentTerms: string,           // "Net 0" | "Net 30" | "Net 40" | "Net 45" | "Net 60"
  dueDate: string,
  orderNo: string,                // "MO-YYMMDD-XXXX"
  status: string,                 // "Received" | "Paid" | "Partially Received" | "Due"
  paymentRecDate: string,
  shipmentDate: string,
  fulfilledMonth: string,
  paymentRecMonth: string,
  delivery: string,               // "Company" | "Self"
  remarks: string,
  financeRemarks: string,         // "bad debt" triggers red styling + KPI tracking
  closedWon: string,
  currency: string,
  fulfillment: string,            // "available" | "unavailable" | ""
  fulfillmentReadyDate: string | null,
}
```

---

## 10. Product Catalog

File: `frontend/src/data/products.js`

Auto-generated from two source files:
1. `active_products_variants_inventory.csv` — Shopify product variants export (has inventory levels)
2. `Untitled spreadsheet.xlsx` (converted to CSV) — full SKU master list (has additional SKUs)

**Stats:** 398 entries, 53 distinct product names

### Entry Shape

```js
{ product: string, sku: string, color: string, inventory: number | null }
```

`inventory: null` = SKU exists in the Excel master list but not in the Shopify inventory export.

### Exported Helpers

| Function | Description |
|---|---|
| `productCatalog` | Full array of all entries |
| `productNames` | Sorted unique product name strings |
| `variantsForProduct(name)` | Returns `[{ sku, color, inventory }]` for a product |
| `skusForProduct(name)` | Returns `string[]` of SKUs for a product |
| `productForSku(sku)` | Returns product name string (case-insensitive) or `null` |
| `colorForSku(sku)` | Returns color string or `null` |
| `inventoryForSku(sku)` | Returns inventory number or `null` |

### Regenerating the Catalog

If the source files are updated, re-run:

```bash
python scripts/generate-products.py
```

Or run the inline Python block used during development (documented in git history).

### What's excluded

- Pre-Order variants (same SKU as main product)
- Bundles and sets with no individual SKU
- Spare parts (wheel caps, screws, springs, hinges)
- Packaging (carton boxes, dust covers)
- Internal/system items (gift cards, subscriptions, free gifts)

---

## 11. Order Number Logic

Every new B2B entry gets a unique order number generated client-side at form open.

**Format:** `MO-YYMMDD-XXXX`

```
MO       → prefix, always the same
YYMMDD   → current date (e.g. 260716 = July 16, 2026)
XXXX     → 4 random characters from: ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```

**Excluded characters:** `0, O, 1, I` — removed to avoid visual ambiguity when reading or typing order numbers.

**Collision risk:** extremely low (32^4 = 1,048,576 combinations per day).

**Code:**
```js
function generateOrderNo() {
  const now   = new Date();
  const yy    = String(now.getFullYear()).slice(2);
  const mm    = String(now.getMonth() + 1).padStart(2, "0");
  const dd    = String(now.getDate()).padStart(2, "0");
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand  = Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  return `MO-${yy}${mm}${dd}-${rand}`;
}
```

---

## 12. Deployment

### Production — b2b.nysonik.com (EC2)

- **Server:** AWS EC2 at `54.172.115.118`
- **Path:** `/home/ec2-user/b2b`
- **Process manager:** PM2 (`b2b-api`, id 92, port 5009)
- **Web server:** Nginx — serves `dist` for frontend, proxies `/api/*` to port 5009
- **SSL:** Let's Encrypt (auto-renews)

**Deploy after pushing to GitHub:**
```bash
cd /home/ec2-user/b2b
git pull
cd frontend && npm run build && sudo cp -r dist/* /var/www/b2b/dist/ && cd ..
pm2 restart b2b-api
```

**Nginx config:** `/etc/nginx/conf.d/b2b.conf`  
**PM2 config:** `ecosystem.config.js` in repo root

### Backup — Vercel

`vercel.json` is still configured. The repo auto-deploys to Vercel on push to `main` as a backup. The Vercel deployment uses `api/index.js` as a serverless function.

### Local development

```bash
node backend/server.js   # API on :3001
cd frontend && npm run dev  # UI on :5173
```

---

## 13. GitHub

Repository: `https://github.com/Ibrarf/B2B-NYSONIAN`

**`.gitignore` includes:**
- `.env` (database credentials)
- `node_modules/`
- `.claude/` (Claude Code settings)
- `frontend/dist/` (build output)

---

## 14. Data Flow Diagram

```
User fills Add B2B form
        │
        ▼
  Validate form
  (customer, company, invoice, invoiceDate, qty required)
        │
        ├──────────────────────────────────────────────────────┐
        ▼                                                      ▼
  POST /api/b2b-entries                              addTransaction() in DataContext
  (Express → PostgreSQL)                             (in-memory, instant UI update)
        │                                                      │
        ▼                                                      ▼
  b2b.entries row saved                              All components re-render:
  (id, orderNo, createdAt returned)                  Dashboard KPIs update
                                                     FinanceCheck shows new pending card
                                                     Fulfillment shows new pending order
                                                     Transactions Table shows new row
```

---

## 15. Business Logic Reference

### Finance Check — Who sees what

| Condition | Where it appears |
|---|---|
| `needsApproval: true` + `approvalStatus: "pending"` | Awaiting Approval section |
| `needsApproval: true` + `approvalStatus: "held"` | Held sub-section (dimmed) |
| `approvalStatus: "approved"` | Approved section (compact read-only) |

### Finance Check — Company dues warning

Triggered when the company of a pending order has **any other** transaction with status `"Due"` or `"Partially Received"`. The warning lists each outstanding invoice with its amount.

### Fulfillment — Which orders appear

Only orders where:
- `qty > 0`
- `status !== "Paid"`

Paid orders are considered complete and don't need fulfillment action.

### Dashboard — Bad Debt detection

Any transaction where `financeRemarks` (case-sensitive) equals `"bad debt"` is counted in the Bad Debt KPI.

### Transactions — Finance Remarks styling

If `financeRemarks` includes the substring `"bad debt"` the cell renders in red.

### Status values

| Value | Meaning |
|---|---|
| `Due` | Invoice issued, payment not received |
| `Partially Received` | Some payment received, balance outstanding |
| `Received` | Full payment received |
| `Paid` | Fully settled and closed |

---

## 16. Change Log

| Date | Change |
|---|---|
| Jul 2026 | Initial build: Dashboard, Transactions, Revenue Chart, Client Tracker |
| Jul 2026 | Added Finance Check page (O2C Stage 02 — Credit & Approval) |
| Jul 2026 | Added Fulfillment page (manual availability flagging + ETA dates) |
| Jul 2026 | Created Express API server + `b2b` schema in PostgreSQL |
| Jul 2026 | `start.bat` — one-click startup for both servers |
| Jul 2026 | Tab persistence via `localStorage` (survives page reload) |
| Jul 2026 | Sticky table headers in Transactions page |
| Jul 2026 | Add B2B: customer/company autocomplete with auto-fill from history |
| Jul 2026 | Add B2B: auto-generated order numbers (`MO-YYMMDD-XXXX`) |
| Jul 2026 | Product catalog rebuilt — 398 SKUs, 53 products, color + inventory per SKU |
| Jul 2026 | Product & Colour combined dropdown — selecting variant auto-fills SKU |
| Jul 2026 | Invoice auto-number — scans numeric and INV-xxx formats to find true max |
| Jul 2026 | Refactored backend: `backend/app.js` (Express app) + `backend/server.js` (local listen) |
| Jul 2026 | Added `api/index.js` Vercel serverless entry point |
| Jul 2026 | Deployed to Vercel with `vercel.json` — rewrites `/api/*` to serverless function |
| Jul 2026 | Added `b2b.fulfillment` dedicated table — fulfillment persists across page loads for all orders |
| Jul 2026 | DataContext: `fetchAll()` fetches entries + fulfillment in parallel, merges via `fulfillmentMap` |
| Jul 2026 | Dashboard: At-Risk Accounts changed to only flag past-due dates (not future) |
| Jul 2026 | Transactions: inline edit now persists to DB via `PATCH /api/b2b-row/:id` |
| Jul 2026 | Added `PATCH /api/b2b-row/:id` endpoint — inline-edits single row with dynamic SET clause |
| Jul 2026 | Self-hosted deployment on EC2 at b2b.nysonik.com (Nginx + PM2 + Let's Encrypt SSL) |
| Jul 2026 | Added `deploy/nginx.conf`, `deploy/setup.sh`, `ecosystem.config.js` to repo |
| Jul 2026 | Add B2B: added Customer PO # field, saved to `b2b.entries.customer_po` |
| Jul 2026 | `DOCS.md` + `README.md` updated to reflect current architecture |
