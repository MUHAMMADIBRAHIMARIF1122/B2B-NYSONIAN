const express = require("express");
const cors    = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: "postgresql://nysonian:NysonianERP@54.172.115.118:5432/erp_maindb",
});

app.post("/api/b2b-entries", async (req, res) => {
  const d = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO store.b2b_entries (
        customer, company, product, invoice, invoice_date, sku,
        qty, unit_price, total, payment_terms, due_date, order_no,
        status, payment_rec_date, shipment_date, fulfilled_month,
        payment_rec_month, delivery, remarks, finance_remarks, closed_won
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
      ) RETURNING id`,
      [
        d.customer, d.company, d.product, d.invoice, d.invoiceDate, d.sku,
        d.qty, d.unitPrice, d.total, d.paymentTerms, d.dueDate, d.orderNo,
        d.status, d.paymentRecDate, d.shipmentDate, d.fulfilledMonth,
        d.paymentRecMonth, d.delivery, d.remarks, d.financeRemarks, d.closedWon,
      ]
    );
    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error("DB insert error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = 3001;
app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
