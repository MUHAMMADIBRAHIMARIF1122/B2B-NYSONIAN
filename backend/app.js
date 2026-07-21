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

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
  "https://b2b.nysonik.com",
  "http://b2b.nysonik.com",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    if (origin.endsWith(".vercel.app")) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "x-api-key"],
}));

// ── Body size limit ───────────────────────────────────────────────────────────
app.use(express.json({ limit: "50kb" }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Write endpoints: 60 requests/min/IP
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Please slow down." },
});

// Read endpoints: 120 requests/min/IP (prevents data scraping)
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Please slow down." },
});

// ── API key authentication ────────────────────────────────────────────────────
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.error("FATAL: API_KEY not set — server will reject all requests");
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
    // ── Legacy b2b.entries columns (kept for backward compat) ─────────────────
    await pool.query("ALTER TABLE b2b.entries ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD'");
    await pool.query("ALTER TABLE b2b.entries ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT ''");
    await pool.query("ALTER TABLE b2b.entries ADD COLUMN IF NOT EXISTS fulfillment_ready_date DATE");
    await pool.query("ALTER TABLE b2b.entries ADD COLUMN IF NOT EXISTS customer_po TEXT DEFAULT ''");

    // ── b2b.clients — one row per company ─────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS b2b.clients (
        id             SERIAL PRIMARY KEY,
        company        TEXT UNIQUE NOT NULL,
        customer       TEXT        NOT NULL DEFAULT '',
        payment_terms  TEXT        NOT NULL DEFAULT '',
        delivery       TEXT        NOT NULL DEFAULT 'Company',
        currency       TEXT        NOT NULL DEFAULT 'USD',
        remarks        TEXT        NOT NULL DEFAULT '',
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      INSERT INTO b2b.clients (company, customer, payment_terms, delivery, currency, updated_at)
      SELECT DISTINCT ON (company)
        company, COALESCE(customer,''),
        COALESCE(payment_terms,''), COALESCE(delivery,'Company'), COALESCE(currency,'USD'), NOW()
      FROM b2b.entries
      WHERE company IS NOT NULL AND company <> ''
      ORDER BY company, id DESC
      ON CONFLICT (company) DO NOTHING
    `);

    // ── b2b.fulfillment — per-order fulfillment tracking ──────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS b2b.fulfillment (
        id                     SERIAL PRIMARY KEY,
        order_key              TEXT UNIQUE NOT NULL,
        fulfillment_status     TEXT NOT NULL DEFAULT '',
        fulfilled_month        TEXT NOT NULL DEFAULT '',
        shipment_date          DATE,
        delivery               TEXT NOT NULL DEFAULT 'Company',
        fulfillment_ready_date DATE,
        updated_at             TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── b2b.orders — one row per order (invoice header) ───────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS b2b.orders (
        id                SERIAL PRIMARY KEY,
        order_no          TEXT UNIQUE NOT NULL,
        client_id         INTEGER REFERENCES b2b.clients(id) ON DELETE SET NULL,
        company           TEXT NOT NULL DEFAULT '',
        customer          TEXT NOT NULL DEFAULT '',
        invoice           TEXT NOT NULL DEFAULT '',
        invoice_date      DATE,
        payment_terms     TEXT NOT NULL DEFAULT '',
        due_date          DATE,
        status            TEXT NOT NULL DEFAULT '',
        payment_rec_date  DATE,
        payment_rec_month TEXT NOT NULL DEFAULT '',
        currency          TEXT NOT NULL DEFAULT 'USD',
        customer_po       TEXT NOT NULL DEFAULT '',
        remarks           TEXT NOT NULL DEFAULT '',
        finance_remarks   TEXT NOT NULL DEFAULT '',
        closed_won        TEXT NOT NULL DEFAULT '',
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── b2b.order_items — one row per line item ────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS b2b.order_items (
        id          SERIAL PRIMARY KEY,
        order_id    INTEGER NOT NULL REFERENCES b2b.orders(id) ON DELETE CASCADE,
        entry_id    INTEGER,
        product     TEXT           NOT NULL DEFAULT '',
        sku         TEXT           NOT NULL DEFAULT '',
        qty         INTEGER        NOT NULL DEFAULT 0,
        unit_price  NUMERIC(12,2)  NOT NULL DEFAULT 0,
        total       NUMERIC(12,2)  NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ    DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON b2b.order_items(order_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS order_items_entry_id_idx ON b2b.order_items(entry_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS orders_client_id_idx    ON b2b.orders(client_id)`);

    // ── Migrate b2b.entries → b2b.orders (idempotent) ─────────────────────────
    // NOTE: b2b.entries stores date columns as text — cast with NULLIF to avoid errors
    await pool.query(`
      INSERT INTO b2b.orders (
        order_no, client_id, company, customer, invoice, invoice_date,
        payment_terms, due_date, status, payment_rec_date, payment_rec_month,
        currency, customer_po, remarks, finance_remarks, closed_won, created_at
      )
      SELECT DISTINCT ON (e.order_no)
        e.order_no,
        c.id,
        COALESCE(e.company,''),
        COALESCE(e.customer,''),
        COALESCE(e.invoice,''),
        NULLIF(e.invoice_date,'')::date,
        COALESCE(e.payment_terms,''),
        NULLIF(e.due_date,'')::date,
        COALESCE(e.status,''),
        NULLIF(e.payment_rec_date,'')::date,
        COALESCE(e.payment_rec_month,''),
        COALESCE(e.currency,'USD'),
        COALESCE(e.customer_po,''),
        COALESCE(e.remarks,''),
        COALESCE(e.finance_remarks,''),
        COALESCE(e.closed_won,''),
        e.created_at
      FROM b2b.entries e
      LEFT JOIN b2b.clients c ON c.company = e.company
      WHERE e.order_no IS NOT NULL AND e.order_no <> ''
      ORDER BY e.order_no, e.id DESC
      ON CONFLICT (order_no) DO NOTHING
    `);

    // ── Migrate b2b.entries → b2b.order_items (idempotent) ────────────────────
    await pool.query(`
      INSERT INTO b2b.order_items (order_id, entry_id, product, sku, qty, unit_price, total, created_at)
      SELECT
        o.id,
        e.id,
        COALESCE(e.product,''),
        COALESCE(e.sku,''),
        COALESCE(e.qty,0),
        COALESCE(e.unit_price,0),
        COALESCE(e.total,0),
        e.created_at
      FROM b2b.entries e
      JOIN b2b.orders o ON o.order_no = e.order_no
      WHERE NOT EXISTS (
        SELECT 1 FROM b2b.order_items oi WHERE oi.entry_id = e.id
      )
    `);

    // ── Migrate fulfillment data from entries → b2b.fulfillment (idempotent) ──
    // shipment_date is text in entries — cast it
    await pool.query(`
      INSERT INTO b2b.fulfillment
        (order_key, fulfillment_status, fulfilled_month, shipment_date, delivery, fulfillment_ready_date, updated_at)
      SELECT
        order_no,
        COALESCE(fulfillment_status,''),
        COALESCE(fulfilled_month,''),
        NULLIF(shipment_date,'')::date,
        COALESCE(delivery,'Company'),
        fulfillment_ready_date,
        NOW()
      FROM (
        SELECT DISTINCT ON (order_no)
          order_no, fulfillment_status, fulfilled_month, shipment_date, delivery, fulfillment_ready_date
        FROM b2b.entries
        WHERE order_no IS NOT NULL AND order_no <> ''
          AND (
            (shipment_date         IS NOT NULL AND shipment_date <> '') OR
            (fulfilled_month       IS NOT NULL AND fulfilled_month <> '') OR
            (fulfillment_status    IS NOT NULL AND fulfillment_status <> '')
          )
        ORDER BY order_no, id DESC
      ) latest
      ON CONFLICT (order_key) DO NOTHING
    `);

    console.log("[DB] Migrations complete");
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

// ── DB helpers ────────────────────────────────────────────────────────────────

// Upsert client, return its id
async function getOrCreateClient(company, customer, paymentTerms, delivery, currency) {
  const { rows } = await pool.query(`
    INSERT INTO b2b.clients (company, customer, payment_terms, delivery, currency, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (company) DO UPDATE SET
      customer      = EXCLUDED.customer,
      payment_terms = EXCLUDED.payment_terms,
      delivery      = EXCLUDED.delivery,
      currency      = EXCLUDED.currency,
      updated_at    = NOW()
    RETURNING id
  `, [
    company.trim(), customer.trim(),
    paymentTerms || "", delivery || "Company", currency || "USD",
  ]);
  return rows[0].id;
}

// Insert an order header row, return { id, order_no, created_at }
async function insertOrderRow(clientId, header) {
  const { rows } = await pool.query(`
    INSERT INTO b2b.orders (
      order_no, client_id, company, customer, invoice, invoice_date,
      payment_terms, due_date, status, payment_rec_date, payment_rec_month,
      currency, customer_po, remarks, finance_remarks, closed_won
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    RETURNING id, order_no, created_at
  `, [
    header.orderNo,
    clientId,
    header.company.trim(),
    header.customer.trim(),
    header.invoice.trim(),
    header.invoiceDate   || null,
    header.paymentTerms  || "",
    header.dueDate       || null,
    header.status        || "",
    header.paymentRecDate  || null,
    header.paymentRecMonth || "",
    header.currency      || "USD",
    (header.customerPO   || "").trim(),
    (header.remarks      || "").trim(),
    (header.financeRemarks || "").trim(),
    (header.closedWon    || "").trim(),
  ]);
  return rows[0];
}

// Insert a line item into order_items, return its id
async function insertOrderItem(orderId, item) {
  const total = Number(((item.qty || 0) * (item.unitPrice || 0)).toFixed(2));
  const { rows } = await pool.query(`
    INSERT INTO b2b.order_items (order_id, product, sku, qty, unit_price, total)
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING id
  `, [
    orderId,
    (item.product || "").trim(),
    (item.sku     || "").trim(),
    item.qty,
    item.unitPrice,
    total,
  ]);
  return rows[0].id;
}

// Remove orders that have no remaining line items
async function pruneEmptyOrders() {
  await pool.query(`
    DELETE FROM b2b.orders
    WHERE id NOT IN (SELECT DISTINCT order_id FROM b2b.order_items)
  `);
}

// ── GET /api/b2b-entries ──────────────────────────────────────────────────────
// Returns flat rows (one per line item) joined from orders + order_items + clients
app.get("/api/b2b-entries", requireApiKey, readLimiter, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        oi.id,
        o.id          AS order_id,
        o.client_id,
        o.order_no,
        o.company,
        o.customer,
        o.invoice,
        o.invoice_date,
        o.payment_terms,
        o.due_date,
        o.status,
        o.payment_rec_date,
        o.payment_rec_month,
        o.currency,
        o.customer_po,
        o.remarks,
        o.finance_remarks,
        o.closed_won,
        o.created_at,
        oi.product,
        oi.sku,
        oi.qty,
        oi.unit_price,
        oi.total,
        ''::text  AS fulfillment_status,
        NULL::date AS fulfillment_ready_date
      FROM b2b.order_items oi
      JOIN b2b.orders o ON o.id = oi.order_id
      ORDER BY o.created_at DESC, oi.id ASC
    `);
    res.json({ ok: true, entries: rows });
  } catch (err) {
    console.error("DB fetch entries error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to fetch entries." });
  }
});

// ── DELETE /api/b2b-entries ───────────────────────────────────────────────────
// ids are order_items.id values
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
      `DELETE FROM b2b.order_items WHERE id IN (${placeholders})`, safe
    );
    // Remove orders that now have zero line items
    await pruneEmptyOrders();
    console.log(`[-] Deleted ${rowCount} item${rowCount === 1 ? "" : "s"}`);
    res.json({ ok: true, deleted: rowCount });
  } catch (err) {
    console.error("DB delete error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to delete entries." });
  }
});

// ── GET /api/clients ──────────────────────────────────────────────────────────
app.get("/api/clients", requireApiKey, readLimiter, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        c.id              AS client_id,
        c.company, c.customer, c.payment_terms, c.delivery, c.currency,
        c.remarks, c.created_at, c.updated_at,
        COUNT(oi.id)::int                                                                  AS invoice_count,
        COALESCE(SUM(oi.total), 0)::float                                                  AS total_invoiced,
        COALESCE(SUM(CASE WHEN o.status IN ('Paid','Received') THEN oi.total ELSE 0 END), 0)::float
                                                                                           AS total_received,
        MAX(o.invoice_date)                                                                AS last_invoice_date,
        MAX(o.payment_rec_date)                                                            AS last_payment_date
      FROM b2b.clients c
      LEFT JOIN b2b.orders     o  ON o.client_id = c.id
      LEFT JOIN b2b.order_items oi ON oi.order_id = o.id
      GROUP BY c.id, c.company, c.customer, c.payment_terms, c.delivery, c.currency,
               c.remarks, c.created_at, c.updated_at
      ORDER BY total_invoiced DESC
    `);
    res.json({ ok: true, clients: rows });
  } catch (err) {
    console.error("DB fetch clients error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to fetch clients." });
  }
});

// ── PATCH /api/fulfillment/:orderKey ─────────────────────────────────────────
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
    const safeDate = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : null;

    if (fulfillmentStatus === "") {
      await pool.query(`DELETE FROM b2b.fulfillment WHERE order_key = $1`, [orderNo]);
    } else {
      await pool.query(`
        INSERT INTO b2b.fulfillment
          (order_key, fulfillment_status, fulfilled_month, shipment_date, delivery, fulfillment_ready_date, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,NOW())
        ON CONFLICT (order_key) DO UPDATE SET
          fulfillment_status     = EXCLUDED.fulfillment_status,
          fulfilled_month        = CASE WHEN EXCLUDED.fulfilled_month <> '' THEN EXCLUDED.fulfilled_month ELSE b2b.fulfillment.fulfilled_month END,
          shipment_date          = COALESCE(EXCLUDED.shipment_date, b2b.fulfillment.shipment_date),
          delivery               = CASE WHEN EXCLUDED.delivery <> '' THEN EXCLUDED.delivery ELSE b2b.fulfillment.delivery END,
          fulfillment_ready_date = COALESCE(EXCLUDED.fulfillment_ready_date, b2b.fulfillment.fulfillment_ready_date),
          updated_at             = NOW()
      `, [
        orderNo,
        fulfillmentStatus,
        fulfilledMonth || "",
        safeDate(shipmentDate),
        delivery || "Company",
        safeDate(readyDate),
      ]);
    }

    console.log(`[~] Fulfillment: order=${orderNo}, status=${fulfillmentStatus}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("Fulfillment update error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to update fulfillment.", detail: err.message });
  }
});

// ── GET /api/fulfillment ──────────────────────────────────────────────────────
app.get("/api/fulfillment", requireApiKey, readLimiter, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT order_key, fulfillment_status, fulfilled_month, shipment_date, delivery, fulfillment_ready_date
       FROM b2b.fulfillment ORDER BY updated_at DESC`
    );
    res.json({ ok: true, fulfillment: rows });
  } catch (err) {
    console.error("Fulfillment fetch error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to fetch fulfillment data." });
  }
});

// ── POST /api/b2b-invoice ─────────────────────────────────────────────────────
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

  let orderId, orderNo, createdAt;
  const itemIds = [];

  try {
    const clientId = await getOrCreateClient(
      header.company, header.customer,
      header.paymentTerms, header.delivery, header.currency
    );
    const order = await insertOrderRow(clientId, header);
    orderId   = order.id;
    orderNo   = order.order_no;
    createdAt = order.created_at;

    for (const item of lineItems) {
      itemIds.push(await insertOrderItem(orderId, item));
    }
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

  console.log(`[+] Invoice saved: ${itemIds.length} line(s), order=${orderNo}`);
  res.json({
    ok: true,
    ids:       itemIds,
    orderNo,
    createdAt,
    ...(xeroResult || {}),
  });
});

// ── PATCH /api/b2b-order/:orderNo ─────────────────────────────────────────────
// Replace all line items for an order (used by AddB2B edit mode)
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
    // Find existing order
    const { rows: existing } = await pool.query(
      `SELECT id FROM b2b.orders WHERE order_no = $1`, [orderNo]
    );
    if (existing.length === 0) {
      return res.status(404).json({ ok: false, error: "Order not found" });
    }
    const orderId = existing[0].id;

    // Upsert client
    const clientId = await getOrCreateClient(
      header.company, header.customer,
      header.paymentTerms, header.delivery, header.currency
    );

    // Update order header
    await pool.query(`
      UPDATE b2b.orders SET
        client_id         = $1,
        company           = $2,
        customer          = $3,
        invoice           = $4,
        invoice_date      = $5,
        payment_terms     = $6,
        due_date          = $7,
        status            = $8,
        payment_rec_date  = $9,
        payment_rec_month = $10,
        currency          = $11,
        customer_po       = $12,
        remarks           = $13,
        finance_remarks   = $14,
        closed_won        = $15,
        updated_at        = NOW()
      WHERE id = $16
    `, [
      clientId,
      header.company.trim(),
      header.customer.trim(),
      header.invoice.trim(),
      header.invoiceDate    || null,
      header.paymentTerms   || "",
      header.dueDate        || null,
      header.status         || "",
      header.paymentRecDate   || null,
      header.paymentRecMonth  || "",
      header.currency       || "USD",
      (header.customerPO    || "").trim(),
      (header.remarks       || "").trim(),
      (header.financeRemarks || "").trim(),
      (header.closedWon     || "").trim(),
      orderId,
    ]);

    // Replace line items
    await pool.query(`DELETE FROM b2b.order_items WHERE order_id = $1`, [orderId]);
    const itemIds = [];
    for (const item of lineItems) {
      itemIds.push(await insertOrderItem(orderId, item));
    }

    console.log(`[~] Order updated: ${itemIds.length} line(s), order=${orderNo}`);
    res.json({ ok: true, ids: itemIds, orderNo });
  } catch (err) {
    console.error("DB update error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to update entry. Please try again." });
  }
});

// ── PATCH /api/b2b-row/:id ────────────────────────────────────────────────────
// Inline-edit a single line item. id = order_items.id
// Uses a DB transaction: item fields → order_items, header fields → orders
app.patch("/api/b2b-row/:id", requireApiKey, writeLimiter, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid id" });
  }

  // Fields that live in b2b.order_items
  const ITEM_FIELD_MAP = {
    product:   { col: "product",    fn: v => (isStr(v, 300) ? v.trim() : null) },
    sku:       { col: "sku",        fn: v => (isStr(v, 100) ? v.trim() : null) },
    qty:       { col: "qty",        fn: v => (isNum(Number(v)) ? Number(v) : null) },
    unitPrice: { col: "unit_price", fn: v => (isNum(Number(v)) ? Number(v) : null) },
    total:     { col: "total",      fn: v => (isNum(Number(v)) ? Number(v) : null) },
  };

  // Fields that live in b2b.orders
  const ORDER_FIELD_MAP = {
    customer:        { col: "customer",          fn: v => (isStr(v, 200) ? v.trim() : null) },
    company:         { col: "company",           fn: v => (isStr(v, 200) ? v.trim() : null) },
    invoice:         { col: "invoice",           fn: v => (isStr(v, 100) ? v.trim() : null) },
    invoiceDate:     { col: "invoice_date",      fn: v => isDate(v) ? (v || null) : null },
    paymentTerms:    { col: "payment_terms",     fn: v => ALLOWED_PAYMENT_TERMS.includes(v) ? v : null },
    dueDate:         { col: "due_date",          fn: v => isDate(v) ? (v || null) : null },
    orderNo:         { col: "order_no",          fn: v => (isStr(v, 30) ? v.trim() : null) },
    status:          { col: "status",            fn: v => ALLOWED_STATUS.includes(v) ? v : null },
    paymentRecDate:  { col: "payment_rec_date",  fn: v => isDate(v) ? (v || null) : null },
    paymentRecMonth: { col: "payment_rec_month", fn: v => (isStr(v, 50) ? v : null) },
    remarks:         { col: "remarks",           fn: v => (isStr(v, 1000) ? v : null) },
    financeRemarks:  { col: "finance_remarks",   fn: v => (isStr(v, 1000) ? v : null) },
    closedWon:       { col: "closed_won",        fn: v => (isStr(v, 200) ? v.trim() : null) },
    currency:        { col: "currency",          fn: v => ALLOWED_CURRENCIES.includes(v) ? v : null },
    customerPO:      { col: "customer_po",       fn: v => (isStr(v, 200) ? v.trim() : null) },
  };

  // Build item SET clause
  const itemSet = [];
  const itemVals = [];
  for (const [jsKey, { col, fn }] of Object.entries(ITEM_FIELD_MAP)) {
    if (!(jsKey in req.body)) continue;
    const safe = fn(req.body[jsKey]);
    if (safe === null && req.body[jsKey] !== "" && req.body[jsKey] !== null) {
      return res.status(400).json({ ok: false, error: `Invalid value for ${jsKey}` });
    }
    itemVals.push(safe);
    itemSet.push(`${col} = $${itemVals.length}`);
  }

  // Build order SET clause
  const orderSet = [];
  const orderVals = [];
  for (const [jsKey, { col, fn }] of Object.entries(ORDER_FIELD_MAP)) {
    if (!(jsKey in req.body)) continue;
    const safe = fn(req.body[jsKey]);
    if (safe === null && req.body[jsKey] !== "" && req.body[jsKey] !== null) {
      return res.status(400).json({ ok: false, error: `Invalid value for ${jsKey}` });
    }
    orderVals.push(safe);
    orderSet.push(`${col} = $${orderVals.length}`);
  }

  // Fields that belong in b2b.fulfillment (shipment / delivery info)
  const fulfillmentFields = {};
  if ("delivery"      in req.body && ALLOWED_DELIVERY.includes(req.body.delivery))  fulfillmentFields.delivery      = req.body.delivery;
  if ("shipmentDate"  in req.body && isDate(req.body.shipmentDate))                 fulfillmentFields.shipmentDate  = req.body.shipmentDate || null;
  if ("fulfilledMonth" in req.body && isStr(req.body.fulfilledMonth, 50))           fulfillmentFields.fulfilledMonth = req.body.fulfilledMonth || "";

  if (itemSet.length === 0 && orderSet.length === 0 && Object.keys(fulfillmentFields).length === 0) {
    return res.status(400).json({ ok: false, error: "No valid fields to update" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Resolve the order_id and order_no for this line item
    const { rows: itemRows } = await client.query(
      `SELECT oi.order_id, o.order_no
       FROM b2b.order_items oi
       JOIN b2b.orders o ON o.id = oi.order_id
       WHERE oi.id = $1`, [id]
    );
    if (itemRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Row not found" });
    }
    const orderId = itemRows[0].order_id;
    const orderNo = itemRows[0].order_no;

    // Update order_items
    if (itemSet.length > 0) {
      itemVals.push(id);
      await client.query(
        `UPDATE b2b.order_items SET ${itemSet.join(", ")} WHERE id = $${itemVals.length}`,
        itemVals
      );
    }

    // Update orders (+ re-link client if company changed)
    if (orderSet.length > 0) {
      // If company is being changed, upsert the client and update client_id
      if ("company" in req.body && req.body.company?.trim()) {
        const company  = req.body.company.trim();
        const customer = req.body.customer?.trim() || "";
        const { rows: clientRows } = await client.query(`
          INSERT INTO b2b.clients (company, customer, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (company) DO UPDATE SET customer = EXCLUDED.customer, updated_at = NOW()
          RETURNING id
        `, [company, customer]);
        const newClientId = clientRows[0].id;
        orderVals.push(newClientId);
        orderSet.push(`client_id = $${orderVals.length}`);
      }
      orderSet.push(`updated_at = NOW()`);
      orderVals.push(orderId);
      await client.query(
        `UPDATE b2b.orders SET ${orderSet.join(", ")} WHERE id = $${orderVals.length}`,
        orderVals
      );
    }

    // Upsert fulfillment fields (delivery, shipmentDate, fulfilledMonth) into b2b.fulfillment
    if (Object.keys(fulfillmentFields).length > 0) {
      const safeDate = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : null;
      await client.query(`
        INSERT INTO b2b.fulfillment (order_key, fulfillment_status, fulfilled_month, shipment_date, delivery, updated_at)
        VALUES ($1, '', $2, $3, $4, NOW())
        ON CONFLICT (order_key) DO UPDATE SET
          fulfilled_month = CASE WHEN $2 <> '' THEN $2 ELSE b2b.fulfillment.fulfilled_month END,
          shipment_date   = COALESCE($3, b2b.fulfillment.shipment_date),
          delivery        = CASE WHEN $4 <> '' THEN $4 ELSE b2b.fulfillment.delivery END,
          updated_at      = NOW()
      `, [
        orderNo,
        fulfillmentFields.fulfilledMonth ?? "",
        safeDate(fulfillmentFields.shipmentDate),
        fulfillmentFields.delivery ?? "",
      ]);
    }

    await client.query("COMMIT");
    console.log(`[~] Row ${id} updated`);
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Row patch error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to update row." });
  } finally {
    client.release();
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

module.exports = app;
