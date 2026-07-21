# B2B Finance — Internal ERP

Internal B2B order management system for **Nysonian Inc.** Tracks invoices, customers, payments, fulfillment, and syncs draft invoices to Xero.

Live at **https://b2b.nysonik.com**

---

## Stack

| Layer      | Tech                                      |
|------------|-------------------------------------------|
| Frontend   | React 19 + Vite + Tailwind CSS v4         |
| Backend    | Express 5 + Node.js                       |
| Database   | PostgreSQL on AWS RDS (`b2b` schema)      |
| Hosting    | EC2 (54.172.115.118) + Nginx + PM2        |
| Accounting | Xero API v2 (OAuth 2.0, ACCREC invoices)  |

---

## Project structure

```
B2B FINANCE/
├── backend/
│   ├── app.js             — Express app (routes, DB, migrations)
│   ├── server.js          — Local dev entry point (calls app.listen)
│   ├── xero.js            — Xero service (token refresh, contacts, invoices)
│   └── .env               — Secrets (never commit)
├── api/
│   └── index.js           — Vercel serverless function entry point
├── deploy/
│   ├── nginx.conf         — Nginx site config for b2b.nysonik.com
│   └── setup.sh           — One-shot server setup script
├── ecosystem.config.js    — PM2 process config
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── AddB2B.jsx           — New entry form (multi-line-item, Xero sync)
│       │   ├── Dashboard.jsx        — KPI cards, charts, insights
│       │   ├── TransactionsTable.jsx — Full order table with inline edit
│       │   ├── RevenueChart.jsx     — Monthly fulfilled vs received chart
│       │   ├── ClientTracker.jsx    — Per-client revenue view
│       │   ├── FinanceCheck.jsx     — Credit check & approval workflow
│       │   ├── Fulfillment.jsx      — Stock availability flagging
│       │   └── StatusBadge.jsx
│       ├── context/DataContext.jsx  — Global state + API calls
│       └── data/
│           ├── products.js          — Product catalog (398 SKUs)
│           ├── transactions.js      — Static seed data
│           └── inventory.js         — Initial inventory levels
├── vercel.json            — Vercel deployment config (backup)
└── package.json           — Root deps for Vercel/server
```

---

## Environment variables

**`backend/.env`** (never commit):
```env
DATABASE_URL="postgresql://user:pass@host:5432/dbname"
API_KEY="your-secret-api-key"
PORT=5009
FRONTEND_URL="https://b2b.nysonik.com"

# Xero OAuth
XERO_CLIENT_ID=your_client_id
XERO_CLIENT_SECRET=your_client_secret
XERO_REFRESH_TOKEN=auto_managed_do_not_edit_manually
XERO_TENANT_ID_DEMO=uuid-of-demo-company
XERO_TENANT_ID_REAL=
XERO_USE_DEMO=true
XERO_ACCOUNT_CODE=200
```

**`frontend/.env`** (never commit):
```env
VITE_API_KEY="same-value-as-API_KEY-above"
```

---

## Running locally

```bash
# Terminal 1 — API server
cd "B2B FINANCE"
npm install
cd backend && npm install
node backend/server.js
# → API running on http://127.0.0.1:3001

# Terminal 2 — React frontend
cd frontend
npm install
npm run dev
# → UI at http://localhost:5173
```

Or double-click **`start.bat`** for one-click startup.

---

## API endpoints

| Method | Path                        | Auth        | Description                                  |
|--------|-----------------------------|-------------|----------------------------------------------|
| GET    | `/api/b2b-entries`          | x-api-key   | Fetch all entries from DB                    |
| POST   | `/api/b2b-invoice`          | x-api-key   | Save line items to DB + create Xero DRAFT    |
| PATCH  | `/api/b2b-order/:orderNo`   | x-api-key   | Replace all line items for an order          |
| PATCH  | `/api/b2b-row/:id`          | x-api-key   | Inline-edit a single row by ID               |
| DELETE | `/api/b2b-entries`          | x-api-key   | Delete rows by IDs array                     |
| GET    | `/api/fulfillment`          | x-api-key   | Fetch all fulfillment records                |
| PATCH  | `/api/fulfillment/:orderKey`| x-api-key   | Upsert fulfillment status for an order       |
| GET    | `/api/clients`              | x-api-key   | Fetch client master records with aggregates  |
| GET    | `/api/health`               | none        | Health check `{"ok":true}`                   |

---

## Database schema

### `b2b.entries`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | Auto-generated |
| `customer` | text | Customer name |
| `company` | text | Company name |
| `product` | text | Product name |
| `invoice` | text | Invoice number |
| `invoice_date` | date | |
| `sku` | text | |
| `qty` | integer | |
| `unit_price` | numeric | |
| `total` | numeric | qty × unit_price |
| `payment_terms` | text | Net 0/30/40/45/60 |
| `due_date` | date | |
| `order_no` | text | MO-YYMMDD-XXXX |
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
| `created_at` | timestamptz | Auto-set |

### `b2b.fulfillment`

Dedicated fulfillment table — works for both static and DB-sourced orders.

| Column | Type |
|---|---|
| `order_key` | text UNIQUE |
| `fulfillment_status` | text |
| `fulfilled_month` | text |
| `shipment_date` | date |
| `delivery` | text |
| `fulfillment_ready_date` | date |
| `updated_at` | timestamptz |

### `b2b.clients`

Client master record — one row per company.

---

## Deployment — b2b.nysonik.com

Server: EC2 at `54.172.115.118`  
Path: `/home/ec2-user/b2b`

**Deploy after pushing to GitHub:**
```bash
cd /home/ec2-user/b2b
git pull
cd frontend && npm run build && sudo cp -r dist/* /var/www/b2b/dist/ && cd ..
pm2 restart b2b-api
```

**PM2 process:** `b2b-api` (id 92), port 5009  
**Nginx:** `/etc/nginx/conf.d/b2b.conf` — proxies `/api/*` to port 5009, serves `dist` for everything else  
**SSL:** Let's Encrypt cert, auto-renews

---

## Xero integration

1. User submits Add B2B form
2. Server saves to `b2b.entries` (all line items)
3. Server calls `xero.js → createInvoice()` — creates ACCREC DRAFT in Xero
4. Token auto-rotates on every use
5. Xero failure is non-fatal — DB entry is always saved

**Demo vs real:** Set `XERO_USE_DEMO=false` only when ready for production.

**Re-authenticate:** `node xero-setup.js`
