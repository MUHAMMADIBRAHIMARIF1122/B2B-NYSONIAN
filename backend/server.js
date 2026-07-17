const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express            = require("express");
const cors               = require("cors");
const helmet             = require("helmet");
const rateLimit          = require("express-rate-limit");
const { Pool }           = require("pg");
const { createInvoice }  = require("./xero");

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS — restrict to known origins only ────────────────────────────────────
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",   // Vite fallback port
  "http://localhost:4173",   // Vite preview
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "x-api-key"],
}));

// ── Body size limit ───────────────────────────────────────────────────────────
app.use(express.json({ limit: "50kb" }));

// ── Rate limiting — 60 write requests / minute / IP ──────────────────────────
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Please slow down." },
});

// ── API key authentication ────────────────────────────────────────────────────
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.error("FATAL: API_KEY not set in .env — server will reject all requests");
}

function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}

// ── PostgreSQL connection ─────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ── Startup migrations ────────────────────────────────────────────────────────
async function runMigrations() {
  try {
    await pool.query("ALTER TABLE b2b.entries ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD'");
    console.log("[DB] entries.currency column ready");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS b2b.clients (
        id             SERIAL PRIMARY KEY,
        company        TEXT UNIQUE NOT NULL,
        customer       TEXT,
        payment_terms  TEXT,
        delivery       TEXT DEFAULT 'Company',
        currency       TEXT DEFAULT 'USD',
        remarks        TEXT DEFAULT '',
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[DB] clients table ready");

    // Backfill clients from existing entries (safe — ON CONFLICT does nothing for already-inserted rows)
    await pool.query(`
      INSERT INTO b2b.clients (company, customer, payment_terms, delivery, currency, updated_at)
      SELECT DISTINCT ON (company)
        company,
        customer,
        COALESCE(payment_terms, ''),
        COALESCE(delivery, 'Company'),
        COALESCE(currency, 'USD'),
        NOW()
      FROM b2b.entries
      WHERE company IS NOT NULL AND company <> ''
      ORDER BY company, id DESC
      ON CONFLICT (company) DO NOTHING
    `);
    console.log("[DB] clients backfill complete");

    await pool.query("ALTER TABLE b2b.entries ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT ''");
    await pool.query("ALTER TABLE b2b.entries ADD COLUMN IF NOT EXISTS fulfillment_ready_date DATE");
    console.log("[DB] fulfillment columns ready");
  } catch (err) {
    console.error("[DB] Migration error:", err.message);
  }
}
runMigrations();

// ── Input validators ──────────────────────────────────────────────────────────
const ALLOWED_STATUS        = ["Received", "Paid", "Partially Received", "Due", ""];
const ALLOWED_PAYMENT_TERMS = ["Net 0", "Net 30", "Net 40", "Net 45", "Net 60", ""];
const ALLOWED_DELIVERY      = ["Company", "Self", ""];
const ALLOWED_CURRENCIES    = ["USD", "GBP", "EUR", "CAD", "AUD", "NZD", "SGD", "HKD", "JPY", "CHF", ""];

function isDate(v) { return !v || /^\d{4}-\d{2}-\d{2}$/.test(v); }
function isStr(v, max = 500) { return typeof v === "string" && v.length <= max; }
function isNum(v) { return typeof v === "number" && isFinite(v) && v >= 0; }

function validateEntry(d) {
  const errors = [];
  if (!isStr(d.customer, 200) || !d.customer?.trim())   errors.push("customer required");
  if (!isStr(d.company,  200) || !d.company?.trim())    errors.push("company required");
  if (!isStr(d.invoice,  100) || !d.invoice?.trim())    errors.push("invoice required");
  if (!isDate(d.invoiceDate))                            errors.push("invalid invoiceDate");
  if (!isNum(d.qty) || d.qty <= 0 || !Number.isInteger(d.qty)) errors.push("qty must be positive integer");
  if (!isNum(d.unitPrice))                               errors.push("unitPrice must be non-negative number");
  if (!isStr(d.orderNo, 30))                             errors.push("invalid orderNo");
  if (!ALLOWED_STATUS.includes(d.status))                errors.push("invalid status value");
  if (!ALLOWED_PAYMENT_TERMS.includes(d.paymentTerms))   errors.push("invalid paymentTerms value");
  if (!ALLOWED_DELIVERY.includes(d.delivery))            errors.push("invalid delivery value");
  if (!isDate(d.dueDate))                                errors.push("invalid dueDate");
  if (!isDate(d.paymentRecDate))                         errors.push("invalid paymentRecDate");
  if (!isDate(d.shipmentDate))                           errors.push("invalid shipmentDate");
  if (!isStr(d.product,        300))  errors.push("product too long");
  if (!isStr(d.sku,            100))  errors.push("sku too long");
  if (!isStr(d.remarks,        1000)) errors.push("remarks too long");
  if (!isStr(d.financeRemarks, 1000)) errors.push("financeRemarks too long");
  if (!isStr(d.fulfilledMonth,  50))  errors.push("fulfilledMonth too long");
  if (!isStr(d.paymentRecMonth, 50))  errors.push("paymentRecMonth too long");
  if (!isStr(d.closedWon,      200))  errors.push("closedWon too long");
  if (d.currency !== undefined && !ALLOWED_CURRENCIES.includes(d.currency)) errors.push("invalid currency value");
  return errors;
}

// ── Shared INSERT helper ──────────────────────────────────────────────────────
async function insertLineItem(header, item) {
  const total = Number(((item.qty || 0) * (item.unitPrice || 0)).toFixed(2));
  const result = await pool.query(
    `INSERT INTO b2b.entries (
      customer, company, product, invoice, invoice_date, sku,
      qty, unit_price, total, payment_terms, due_date, order_no,
      status, payment_rec_date, shipment_date, fulfilled_month,
      payment_rec_month, delivery, remarks, finance_remarks, closed_won, currency
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
    ) RETURNING id, order_no, created_at`,
    [
      header.customer.trim(), header.company.trim(), (item.product || "").trim(),
      header.invoice.trim(), header.invoiceDate || null, (item.sku || "").trim(),
      item.qty, item.unitPrice, total,
      header.paymentTerms || "", header.dueDate || null, header.orderNo,
      header.status || "", header.paymentRecDate || null, header.shipmentDate || null,
      header.fulfilledMonth || "", header.paymentRecMonth || "",
      header.delivery || "Company",
      (header.remarks || "").trim(), (header.financeRemarks || "").trim(),
      (header.closedWon || "").trim(),
      header.currency || "USD",
    ]
  );
  return result.rows[0];
}

// ── Upsert client master record ───────────────────────────────────────────────
async function upsertClient(header) {
  await pool.query(`
    INSERT INTO b2b.clients (company, customer, payment_terms, delivery, currency, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (company) DO UPDATE SET
      customer      = EXCLUDED.customer,
      payment_terms = EXCLUDED.payment_terms,
      delivery      = EXCLUDED.delivery,
      currency      = EXCLUDED.currency,
      updated_at    = NOW()
  `, [
    header.company.trim(),
    header.customer.trim(),
    header.paymentTerms || "",
    header.delivery || "Company",
    header.currency || "USD",
  ]);
}

// ── GET /api/b2b-entries ──────────────────────────────────────────────────────
app.get("/api/b2b-entries", requireApiKey, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, customer, company, product, invoice, invoice_date, sku,
             qty, unit_price, total, payment_terms, due_date, order_no,
             status, payment_rec_date, shipment_date, fulfilled_month,
             payment_rec_month, delivery, remarks, finance_remarks, closed_won,
             currency, fulfillment_status, fulfillment_ready_date, created_at
      FROM b2b.entries
      ORDER BY created_at DESC
    `);
    res.json({ ok: true, entries: rows });
  } catch (err) {
    console.error("DB fetch entries error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to fetch entries." });
  }
});

// ── DELETE /api/b2b-entries ───────────────────────────────────────────────────
// Body: { ids: [1, 2, 3] }  — permanently deletes entries by primary key
app.delete("/api/b2b-entries", requireApiKey, writeLimiter, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ ok: false, error: "ids[] required" });
  }
  const safe = ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (safe.length === 0) {
    return res.status(400).json({ ok: false, error: "No valid ids provided" });
  }
  try {
    const placeholders = safe.map((_, i) => `$${i + 1}`).join(", ");
    const { rowCount } = await pool.query(
      `DELETE FROM b2b.entries WHERE id IN (${placeholders})`, safe
    );
    console.log(`[-] Deleted ${rowCount} entr${rowCount === 1 ? "y" : "ies"}`);
    res.json({ ok: true, deleted: rowCount });
  } catch (err) {
    console.error("DB delete error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to delete entries." });
  }
});

// ── GET /api/clients ──────────────────────────────────────────────────────────
app.get("/api/clients", requireApiKey, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        c.company,
        c.customer,
        c.payment_terms,
        c.delivery,
        c.currency,
        c.remarks,
        c.created_at,
        c.updated_at,
        COUNT(e.id)::int                                                              AS invoice_count,
        COALESCE(SUM(e.total), 0)::float                                              AS total_invoiced,
        COALESCE(SUM(CASE WHEN e.status IN ('Paid','Received') THEN e.total ELSE 0 END), 0)::float AS total_received,
        MAX(e.invoice_date)                                                           AS last_invoice_date,
        MAX(e.payment_rec_date)                                                       AS last_payment_date
      FROM b2b.clients c
      LEFT JOIN b2b.entries e ON e.company = c.company
      GROUP BY c.company, c.customer, c.payment_terms, c.delivery, c.currency,
               c.remarks, c.created_at, c.updated_at
      ORDER BY total_invoiced DESC
    `);
    res.json({ ok: true, clients: rows });
  } catch (err) {
    console.error("DB fetch clients error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to fetch clients." });
  }
});

// ── PATCH /api/fulfillment/:orderNo ───────────────────────────────────────────
app.patch("/api/fulfillment/:orderNo", requireApiKey, writeLimiter, async (req, res) => {
  const { orderNo } = req.params;
  const { fulfillmentStatus, fulfilledMonth, shipmentDate, delivery, readyDate } = req.body;

  if (!orderNo) return res.status(400).json({ ok: false, error: "orderNo required" });
  if (!["available", "unavailable", ""].includes(fulfillmentStatus ?? "")) {
    return res.status(400).json({ ok: false, error: "invalid fulfillmentStatus" });
  }
  if (delivery !== undefined && !ALLOWED_DELIVERY.includes(delivery)) {
    return res.status(400).json({ ok: false, error: "invalid delivery" });
  }

  try {
    await pool.query(`
      UPDATE b2b.entries
      SET fulfillment_status     = $1,
          fulfilled_month        = COALESCE(NULLIF($2, ''), fulfilled_month),
          shipment_date          = COALESCE($3::date, shipment_date),
          delivery               = COALESCE(NULLIF($4, ''), delivery),
          fulfillment_ready_date = $5::date
      WHERE COALESCE(NULLIF(order_no, ''), invoice) = $6
    `, [
      fulfillmentStatus ?? "",
      fulfilledMonth    || "",
      shipmentDate      || null,
      delivery          || "",
      readyDate         || null,
      orderNo,
    ]);
    console.log(`[~] Fulfillment updated: order=${orderNo}, status=${fulfillmentStatus}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("Fulfillment update error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to update fulfillment." });
  }
});

// ── POST /api/b2b-invoice ─────────────────────────────────────────────────────
// Save all line items to DB and create one Xero DRAFT invoice.
app.post("/api/b2b-invoice", requireApiKey, writeLimiter, async (req, res) => {
  const { header, lineItems } = req.body;

  if (!header || !Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ ok: false, error: "header and lineItems[] required" });
  }

  const allErrors = [];
  lineItems.forEach((item, i) => {
    const errs = validateEntry({ ...header, ...item });
    if (errs.length) allErrors.push(`Line ${i + 1}: ${errs.join(", ")}`);
  });
  if (allErrors.length) {
    return res.status(400).json({ ok: false, error: allErrors.join("; ") });
  }

  const savedRows = [];
  try {
    for (const item of lineItems) {
      savedRows.push(await insertLineItem(header, item));
    }
    await upsertClient(header);
  } catch (err) {
    console.error("DB insert error:", err.message);
    return res.status(500).json({ ok: false, error: "Failed to save entries. Please try again." });
  }

  let xeroResult = null;
  try {
    xeroResult = await createInvoice(header, lineItems);
    console.log(`[Xero] Invoice ${xeroResult.xeroInvoiceNumber} created for ${header.company}`);
  } catch (err) {
    console.error("[Xero] Invoice creation failed:", err.message);
  }

  const first = savedRows[0];
  console.log(`[+] Invoice saved: ${savedRows.length} line(s), order=${first.order_no}${xeroResult ? `, xero=${xeroResult.xeroInvoiceId}` : " (Xero skipped)"}`);

  res.json({
    ok: true,
    ids:       savedRows.map(r => r.id),
    orderNo:   first.order_no,
    createdAt: first.created_at,
    ...(xeroResult || {}),
  });
});

// ── PATCH /api/b2b-order/:orderNo ─────────────────────────────────────────────
// Replace all line items for an order and update header fields in DB.
app.patch("/api/b2b-order/:orderNo", requireApiKey, writeLimiter, async (req, res) => {
  const { orderNo } = req.params;
  const { header, lineItems } = req.body;

  if (!orderNo || !header || !Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ ok: false, error: "orderNo, header, and lineItems[] required" });
  }

  const allErrors = [];
  lineItems.forEach((item, i) => {
    const errs = validateEntry({ ...header, ...item });
    if (errs.length) allErrors.push(`Line ${i + 1}: ${errs.join(", ")}`);
  });
  if (allErrors.length) {
    return res.status(400).json({ ok: false, error: allErrors.join("; ") });
  }

  try {
    // Delete existing rows for this order, then re-insert
    await pool.query("DELETE FROM b2b.entries WHERE order_no = $1", [orderNo]);
    const savedRows = [];
    for (const item of lineItems) {
      savedRows.push(await insertLineItem(header, item));
    }
    await upsertClient(header);
    console.log(`[~] Order updated: ${savedRows.length} line(s), order=${orderNo}`);
    res.json({ ok: true, ids: savedRows.map(r => r.id), orderNo });
  } catch (err) {
    console.error("DB update error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to update entry. Please try again." });
  }
});

// ── GET /api/health ───────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ ok: false, error: "Not found" }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "127.0.0.1", () =>
  console.log(`API server running on http://127.0.0.1:${PORT}`)
);
