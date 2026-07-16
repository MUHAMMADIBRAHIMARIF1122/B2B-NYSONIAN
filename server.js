require("dotenv").config();

const express            = require("express");
const cors               = require("cors");
const helmet             = require("helmet");
const rateLimit          = require("express-rate-limit");
const { Pool }           = require("pg");
const { createInvoice }  = require("./xero");

const app = express();

// ── Security headers (XSS, clickjacking, MIME sniffing, etc.) ────────────────
app.use(helmet());

// ── CORS — restrict to known origins only ────────────────────────────────────
const ALLOWED_ORIGINS = [
  "http://localhost:5173",       // Vite dev
  "http://localhost:4173",       // Vite preview
  process.env.FRONTEND_URL,     // Production URL (set in .env)
].filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Allow requests with no origin (same-origin, curl, Postman in dev)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));

// ── Body size limit — prevent oversized payload attacks ──────────────────────
app.use(express.json({ limit: "50kb" }));

// ── Rate limiting — max 60 write requests per minute per IP ─────────────────
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

// ── Input validators ──────────────────────────────────────────────────────────
const ALLOWED_STATUS         = ["Received", "Paid", "Partially Received", "Due", ""];
const ALLOWED_PAYMENT_TERMS  = ["Net 0", "Net 30", "Net 40", "Net 45", "Net 60", ""];
const ALLOWED_DELIVERY       = ["Company", "Self", ""];
const ALLOWED_CURRENCIES     = ["USD", "GBP", "EUR", "CAD", "AUD", "NZD", "SGD", "HKD", "JPY", "CHF", ""];

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
  if (!isStr(d.product,       300))  errors.push("product too long");
  if (!isStr(d.sku,           100))  errors.push("sku too long");
  if (!isStr(d.remarks,       1000)) errors.push("remarks too long");
  if (!isStr(d.financeRemarks,1000)) errors.push("financeRemarks too long");
  if (!isStr(d.fulfilledMonth, 50))  errors.push("fulfilledMonth too long");
  if (!isStr(d.paymentRecMonth,50))  errors.push("paymentRecMonth too long");
  if (!isStr(d.closedWon,     200))  errors.push("closedWon too long");
  if (d.currency !== undefined && !ALLOWED_CURRENCIES.includes(d.currency)) errors.push("invalid currency value");
  return errors;
}

// ── POST /api/b2b-entries ────────────────────────────────────────────────────
app.post("/api/b2b-entries", requireApiKey, writeLimiter, async (req, res) => {
  const d = req.body;

  // Validate
  const errors = validateEntry(d);
  if (errors.length) {
    return res.status(400).json({ ok: false, error: errors.join("; ") });
  }

  // Recalculate total server-side — never trust client-sent total
  const total = Number((d.qty * d.unitPrice).toFixed(2));

  try {
    const result = await pool.query(
      `INSERT INTO b2b.entries (
        customer, company, product, invoice, invoice_date, sku,
        qty, unit_price, total, payment_terms, due_date, order_no,
        status, payment_rec_date, shipment_date, fulfilled_month,
        payment_rec_month, delivery, remarks, finance_remarks, closed_won
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
      ) RETURNING id, order_no, created_at`,
      [
        d.customer.trim(), d.company.trim(), (d.product || "").trim(),
        d.invoice.trim(), d.invoiceDate || null, (d.sku || "").trim(),
        d.qty, d.unitPrice, total,
        d.paymentTerms || "", d.dueDate || null, d.orderNo,
        d.status || "", d.paymentRecDate || null, d.shipmentDate || null,
        d.fulfilledMonth || "", d.paymentRecMonth || "",
        d.delivery || "Company",
        (d.remarks || "").trim(), (d.financeRemarks || "").trim(),
        (d.closedWon || "").trim(),
      ]
    );
    const row = result.rows[0];
    // Log without sensitive financial details
    console.log(`[+] Entry saved: db_id=${row.id} order=${row.order_no}`);
    res.json({ ok: true, id: row.id, orderNo: row.order_no, createdAt: row.created_at });
  } catch (err) {
    // Log full error server-side only — never send DB internals to client
    console.error("DB insert error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to save entry. Please try again." });
  }
});

// ── POST /api/b2b-invoice ────────────────────────────────────────────────────
// Saves all line items to DB and creates one DRAFT invoice in Xero.
app.post("/api/b2b-invoice", requireApiKey, writeLimiter, async (req, res) => {
  const { header, lineItems } = req.body;

  if (!header || !Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ ok: false, error: "header and lineItems[] required" });
  }

  // Validate each combined entry
  const allErrors = [];
  lineItems.forEach((item, i) => {
    const errs = validateEntry({ ...header, ...item });
    if (errs.length) allErrors.push(`Line ${i + 1}: ${errs.join(", ")}`);
  });
  if (allErrors.length) {
    return res.status(400).json({ ok: false, error: allErrors.join("; ") });
  }

  // Insert each line item as a separate DB row
  const savedRows = [];
  try {
    for (const item of lineItems) {
      const total = Number(((item.qty || 0) * (item.unitPrice || 0)).toFixed(2));
      const result = await pool.query(
        `INSERT INTO b2b.entries (
          customer, company, product, invoice, invoice_date, sku,
          qty, unit_price, total, payment_terms, due_date, order_no,
          status, payment_rec_date, shipment_date, fulfilled_month,
          payment_rec_month, delivery, remarks, finance_remarks, closed_won
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
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
        ]
      );
      savedRows.push(result.rows[0]);
    }
  } catch (err) {
    console.error("DB insert error:", err.message);
    return res.status(500).json({ ok: false, error: "Failed to save entries. Please try again." });
  }

  // Create one Xero DRAFT invoice (non-fatal if Xero is unavailable)
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

// ── GET /api/health ───────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ── 404 catch-all ────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ ok: false, error: "Not found" }));

// ── Global error handler — prevent stack traces leaking to client ─────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "127.0.0.1", () =>
  console.log(`API server running on http://127.0.0.1:${PORT}`)
);
