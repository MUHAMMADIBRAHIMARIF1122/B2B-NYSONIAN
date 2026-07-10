/**
 * Google Sheets → PostgreSQL sync
 *
 * Reads every row from the sheet, inserts new ones (by sheet_row number),
 * and updates changed ones. Safe to run repeatedly.
 *
 * Run once:    node scripts/sync-from-sheets.js
 * Run on loop: node scripts/sync-from-sheets.js --watch   (checks every 5 min)
 *
 * Setup needed (one-time):
 *   1. Go to https://console.cloud.google.com
 *   2. Create a project → Enable "Google Sheets API"
 *   3. Create a Service Account → download JSON key → save as credentials.json in this folder
 *   4. Share your Google Sheet with the service account email (viewer is enough)
 *   5. Set SHEET_ID below to your spreadsheet ID (from the URL)
 */

const { google } = require("googleapis");
const { Pool }   = require("pg");
const path       = require("path");

// ── CONFIG ──────────────────────────────────────────────────────────────────
const SHEET_ID      = "YOUR_SPREADSHEET_ID_HERE";   // ← paste your sheet ID
const SHEET_RANGE   = "Sheet1!A2:W";                // ← adjust tab name / range
const CREDENTIALS   = path.join(__dirname, "../credentials.json");
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
// ────────────────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: "postgresql://nysonian:NysonianERP@54.172.115.118:5432/erp_maindb",
});

// Column index map — adjust to match your sheet's column order
// A=0, B=1, C=2 ...
const COL = {
  customer:        0,
  company:         1,
  product:         2,
  invoice:         3,
  invoiceDate:     4,
  sku:             5,
  qty:             6,
  unitPrice:       7,
  total:           8,
  paymentTerms:    9,
  dueDate:         10,
  orderNo:         11,
  status:          12,
  paymentRecDate:  13,
  shipmentDate:    14,
  fulfilledMonth:  15,
  paymentRecMonth: 16,
  delivery:        17,
  remarks:         18,
  financeRemarks:  19,
  closedWon:       20,
};

function cell(row, key) {
  return (row[COL[key]] || "").toString().trim();
}

async function sync() {
  console.log(`[${new Date().toISOString()}] Starting sync...`);

  // Auth
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // Fetch sheet data
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE,
  });

  const rows = response.data.values || [];
  console.log(`  Sheet has ${rows.length} data rows`);

  let inserted = 0;
  let updated  = 0;
  let unchanged = 0;

  for (let i = 0; i < rows.length; i++) {
    const row      = rows[i];
    const sheetRow = i + 2; // +2 because row 1 is header, data starts at row 2

    // Skip completely empty rows
    if (!cell(row, "customer") && !cell(row, "invoice")) continue;

    const qty       = parseFloat(cell(row, "qty"))       || 0;
    const unitPrice = parseFloat(cell(row, "unitPrice")) || 0;
    const total     = parseFloat(cell(row, "total"))     || (qty * unitPrice);

    const values = [
      cell(row, "customer"),
      cell(row, "company"),
      cell(row, "product"),
      cell(row, "invoice"),
      cell(row, "invoiceDate"),
      cell(row, "sku"),
      qty,
      unitPrice,
      total,
      cell(row, "paymentTerms"),
      cell(row, "dueDate"),
      cell(row, "orderNo"),
      cell(row, "status"),
      cell(row, "paymentRecDate"),
      cell(row, "shipmentDate"),
      cell(row, "fulfilledMonth"),
      cell(row, "paymentRecMonth"),
      cell(row, "delivery"),
      cell(row, "remarks"),
      cell(row, "financeRemarks"),
      cell(row, "closedWon"),
      sheetRow,
    ];

    const res = await pool.query(
      `INSERT INTO store.b2b_entries (
        customer, company, product, invoice, invoice_date, sku,
        qty, unit_price, total, payment_terms, due_date, order_no,
        status, payment_rec_date, shipment_date, fulfilled_month,
        payment_rec_month, delivery, remarks, finance_remarks, closed_won,
        sheet_row, source
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'sheet'
      )
      ON CONFLICT (sheet_row) DO UPDATE SET
        customer         = EXCLUDED.customer,
        company          = EXCLUDED.company,
        product          = EXCLUDED.product,
        invoice          = EXCLUDED.invoice,
        invoice_date     = EXCLUDED.invoice_date,
        sku              = EXCLUDED.sku,
        qty              = EXCLUDED.qty,
        unit_price       = EXCLUDED.unit_price,
        total            = EXCLUDED.total,
        payment_terms    = EXCLUDED.payment_terms,
        due_date         = EXCLUDED.due_date,
        order_no         = EXCLUDED.order_no,
        status           = EXCLUDED.status,
        payment_rec_date = EXCLUDED.payment_rec_date,
        shipment_date    = EXCLUDED.shipment_date,
        fulfilled_month  = EXCLUDED.fulfilled_month,
        payment_rec_month = EXCLUDED.payment_rec_month,
        delivery         = EXCLUDED.delivery,
        remarks          = EXCLUDED.remarks,
        finance_remarks  = EXCLUDED.finance_remarks,
        closed_won       = EXCLUDED.closed_won
      WHERE
        store.b2b_entries.customer         IS DISTINCT FROM EXCLUDED.customer OR
        store.b2b_entries.status           IS DISTINCT FROM EXCLUDED.status   OR
        store.b2b_entries.total            IS DISTINCT FROM EXCLUDED.total    OR
        store.b2b_entries.payment_rec_date IS DISTINCT FROM EXCLUDED.payment_rec_date
      RETURNING (xmax = 0) AS is_insert`,
      values
    );

    if (res.rowCount === 0) {
      unchanged++;
    } else if (res.rows[0]?.is_insert) {
      inserted++;
      console.log(`  + Row ${sheetRow}: ${cell(row, "company")} — ${cell(row, "invoice")} (new)`);
    } else {
      updated++;
      console.log(`  ~ Row ${sheetRow}: ${cell(row, "company")} — ${cell(row, "invoice")} (updated)`);
    }
  }

  console.log(`  Done. +${inserted} new  ~${updated} updated  =${unchanged} unchanged\n`);
}

async function main() {
  const watch = process.argv.includes("--watch");

  try {
    await sync();
  } catch (err) {
    console.error("Sync error:", err.message);
  }

  if (watch) {
    console.log(`Watching — next check in ${POLL_INTERVAL / 60000} minutes...`);
    setInterval(async () => {
      try {
        await sync();
      } catch (err) {
        console.error("Sync error:", err.message);
      }
    }, POLL_INTERVAL);
  } else {
    await pool.end();
  }
}

main();
