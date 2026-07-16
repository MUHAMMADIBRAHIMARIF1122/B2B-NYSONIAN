# B2B Finance — Internal ERP

Internal B2B order management system. Tracks invoices, customers, payments, and fulfillment. Syncs draft invoices to Xero automatically when a new entry is submitted.

---

## Stack

| Layer      | Tech                                      |
|------------|-------------------------------------------|
| Frontend   | React 19 + Vite + Tailwind CSS v4         |
| Backend    | Express 5 + Node.js                       |
| Database   | PostgreSQL (AWS RDS)                      |
| Accounting | Xero API v2 (OAuth 2.0, ACCREC invoices)  |

---

## Project structure

```
B2B FINANCE/
├── server.js          — Express API server
├── xero.js            — Xero service (token refresh, contacts, invoices)
├── xero-setup.js      — One-time OAuth setup script (run once per Xero app)
├── .env               — Secrets (never commit)
├── .gitignore
└── frontend/
    └── src/
        ├── components/
        │   ├── AddB2B.jsx         — New entry form (multi-line-item, Xero sync)
        │   ├── Dashboard.jsx      — KPI cards, charts, insights
        │   ├── Transactions.jsx   — Full order table
        │   ├── ClientTracker.jsx  — Per-client revenue view
        │   └── StatusBadge.jsx
        ├── context/DataContext.jsx
        └── data/products.js       — Product catalog (autocomplete source)
```

---

## Environment variables (`.env`)

```env
# Database
DATABASE_URL="postgresql://user:pass@host:5432/dbname"
DB_SSL=true          # uncomment when DB has SSL

# API
API_KEY="your-secret-api-key"
FRONTEND_URL="https://your-vercel-app.vercel.app"

# Xero OAuth
XERO_CLIENT_ID=your_client_id
XERO_CLIENT_SECRET=your_client_secret
XERO_REFRESH_TOKEN=auto_managed_do_not_edit_manually
XERO_TENANT_ID_DEMO=uuid-of-demo-company
XERO_TENANT_ID_REAL=          # fill when going live
XERO_USE_DEMO=true            # true = Demo Company (safe testing), false = real org
XERO_ACCOUNT_CODE=200         # GL account code (200 = Sales in Xero default chart)
```

Frontend also needs `VITE_API_KEY` in `frontend/.env`:
```env
VITE_API_KEY="same-value-as-API_KEY-above"
```

---

## Running locally

**Backend**
```bash
cd "B2B FINANCE"
npm install
node server.js
# → API running on http://127.0.0.1:3001
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
# → UI at http://localhost:5173
```

---

## API endpoints

| Method | Path                | Auth         | Description                                      |
|--------|---------------------|--------------|--------------------------------------------------|
| POST   | `/api/b2b-invoice`  | `x-api-key`  | Save all line items to DB + create Xero DRAFT    |
| POST   | `/api/b2b-entries`  | `x-api-key`  | Save a single entry to DB (no Xero, legacy)      |
| GET    | `/api/health`       | none         | Health check                                     |

### `POST /api/b2b-invoice` — request body

```json
{
  "header": {
    "customer": "Jerry Kallman",
    "company":  "Airline International",
    "invoice":  "1020",
    "invoiceDate": "2026-07-16",
    "dueDate":     "2026-08-15",
    "currency":    "USD",
    "paymentTerms": "Net 30",
    "orderNo":  "MO-260716-XYZW",
    "status":   "Due",
    "delivery": "Company",
    "remarks":  "",
    "financeRemarks": "",
    "closedWon": ""
  },
  "lineItems": [
    { "product": "Carry-On", "sku": "AllG1", "qty": 10, "unitPrice": 120.00 },
    { "product": "Duffel",   "sku": "DufB2", "qty":  5, "unitPrice":  95.00 }
  ]
}
```

### Response

```json
{
  "ok": true,
  "ids": [42, 43],
  "orderNo": "MO-260716-XYZW",
  "createdAt": "2026-07-16T10:30:00.000Z",
  "xeroInvoiceId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "xeroInvoiceNumber": "1020"
}
```

If Xero creation fails (token expired, network issue), `xeroInvoiceId` is absent but the entries are still saved to the DB — Xero failure is non-fatal.

---

## Xero integration

### How it works

1. User fills the Add B2B form and clicks **Add entry**
2. Frontend sends `POST /api/b2b-invoice` with one header + N line items
3. Server inserts each line item as a separate row in `b2b.entries`
4. Server calls `xero.js → createInvoice(header, lineItems)`
5. `xero.js` refreshes the access token if needed (auto-rotates refresh token in `.env`)
6. Looks up or creates the Xero contact by company name
7. Creates one `ACCREC` (accounts receivable) `DRAFT` invoice with all line items
8. Returns `xeroInvoiceId` — shown in the success screen

### Demo vs real org

- `XERO_USE_DEMO=true` → uses `XERO_TENANT_ID_DEMO` → targets **Demo Company (Global)**
- `XERO_USE_DEMO=false` → uses `XERO_TENANT_ID_REAL` → targets your real organisation
- **Never set `XERO_USE_DEMO=false` until you are ready for production**

### Token rotation

Xero rotates refresh tokens on every use. `xero.js` automatically writes the new token back to `.env`. Do not manually edit `XERO_REFRESH_TOKEN` after the initial setup.

### Re-authenticating (token expired or revoked)

```bash
node xero-setup.js
```

Follow the browser prompt → select **only Demo Company** → copy new `XERO_REFRESH_TOKEN` and `XERO_TENANT_ID_DEMO` into `.env`.

---

## Xero setup (first time)

1. Go to [developer.xero.com/app/manage](https://developer.xero.com/app/manage) → create a new app
2. Set **Redirect URI**: `http://localhost:3002/callback`
3. Set **Company/Application URL**: your Vercel URL (e.g. `https://yourapp.vercel.app`)
4. Scopes needed: `openid offline_access accounting.invoices accounting.contacts`
5. Copy Client ID + Secret → `.env`
6. Run `node xero-setup.js` → browser opens → authorize **Demo Company only**
7. Copy printed values into `.env`

---

## Database schema (relevant table)

```sql
-- schema: b2b, table: entries
CREATE TABLE b2b.entries (
  id                SERIAL PRIMARY KEY,
  customer          TEXT NOT NULL,
  company           TEXT NOT NULL,
  product           TEXT,
  invoice           TEXT NOT NULL,
  invoice_date      DATE,
  sku               TEXT,
  qty               INTEGER NOT NULL,
  unit_price        NUMERIC(12,2) NOT NULL,
  total             NUMERIC(12,2) NOT NULL,
  payment_terms     TEXT,
  due_date          DATE,
  order_no          TEXT,
  status            TEXT,
  payment_rec_date  DATE,
  shipment_date     DATE,
  fulfilled_month   TEXT,
  payment_rec_month TEXT,
  delivery          TEXT,
  remarks           TEXT,
  finance_remarks   TEXT,
  closed_won        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Going to production (Xero real org)

1. Set `XERO_TENANT_ID_REAL` in `.env` (get it from `xero-setup.js` output)
2. Set `XERO_USE_DEMO=false`
3. Restart the server
4. Create a test entry — verify it appears as a DRAFT in your real Xero org
5. Set invoices to APPROVED in Xero manually (or update `Status: "AUTHORISED"` in `xero.js`)
