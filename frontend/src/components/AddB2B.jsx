import { useState } from "react";
import { useData } from "../context/DataContext";
import { CheckCircle } from "lucide-react";
import StatusBadge from "./StatusBadge";

const PAYMENT_TERMS = ["Net 0", "Net 30", "Net 40", "Net 45", "Net 60"];
const STATUSES      = ["Received", "Paid", "Partially Received", "Due"];
const DELIVERY      = ["Company", "Self"];
const MONTHS        = [
  "", "June-2025", "July-2025", "August-2025", "September-2025",
  "October-2025", "November-2025", "December-2025",
  "January-2026", "February-2026", "March-2026",
  "April-2026", "May-2026", "June-2026", "July-2026",
  "August-2026", "September-2026", "October-2026",
];

const empty = {
  customer: "", company: "", product: "", invoice: "",
  invoiceDate: "", sku: "", qty: "", unitPrice: "",
  paymentTerms: "", dueDate: "", orderNo: "",
  status: "", paymentRecDate: "", shipmentDate: "",
  fulfilledMonth: "", paymentRecMonth: "",
  delivery: "Company", remarks: "", financeRemarks: "",
};

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const input  = (extra = "") => `w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-shadow ${extra}`;
const select = () => `w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400`;

function Label({ children, req }) {
  return (
    <label className="block text-[13px] text-gray-500 mb-1.5">
      {children}{req && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function Divider({ title }) {
  return (
    <div className="pt-2 pb-1">
      <p className="text-sm font-semibold text-gray-700 mb-4">{title}</p>
    </div>
  );
}

export default function AddB2B() {
  const { addTransaction } = useData();
  const [form, setForm]     = useState(empty);
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);

  const total = (parseFloat(form.qty) || 0) * (parseFloat(form.unitPrice) || 0);

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: false }));
  }

  function validate() {
    const e = {};
    if (!form.customer.trim())                              e.customer    = true;
    if (!form.company.trim())                               e.company     = true;
    if (!form.invoice.trim())                               e.invoice     = true;
    if (!form.invoiceDate)                                  e.invoiceDate = true;
    if (!form.qty || isNaN(form.qty) || Number(form.qty) <= 0) e.qty     = true;
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const entry = {
      customer:        form.customer.trim(),
      company:         form.company.trim(),
      product:         form.product.trim(),
      invoice:         form.invoice.trim(),
      invoiceDate:     form.invoiceDate,
      sku:             form.sku.trim(),
      qty:             Number(form.qty),
      unitPrice:       parseFloat(form.unitPrice) || 0,
      total,
      paymentTerms:    form.paymentTerms || "Net 40",
      dueDate:         form.dueDate,
      orderNo:         form.orderNo.trim(),
      status:          form.status || "Due",
      paymentRecDate:  form.paymentRecDate,
      shipmentDate:    form.shipmentDate,
      fulfilledMonth:  form.fulfilledMonth,
      paymentRecMonth: form.paymentRecMonth,
      delivery:        form.delivery,
      remarks:         form.remarks.trim(),
      financeRemarks:  form.financeRemarks.trim(),
      closedWon:       "",
    };

    try {
      await fetch("/api/b2b-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
    } catch (err) {
      console.error("Failed to save to DB:", err);
    }

    addTransaction(entry);
    setSuccess(true);
    setTimeout(() => { setSuccess(false); setForm(empty); setErrors({}); }, 3000);
  }

  const e = (k) => errors[k] ? "border-red-300 focus:ring-red-300 focus:border-red-300" : "";

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={26} className="text-emerald-500" />
          </div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">Entry added</h2>
          <p className="text-sm text-gray-400">Now visible across Dashboard, Transactions, and Client Tracker.</p>
        </div>
      </div>
    );
  }

  const hasPreview = form.company || form.customer || form.invoice || total > 0;

  return (
    <div className="max-w-screen-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">New B2B Entry</h1>
        <p className="text-sm text-gray-400 mt-0.5">Adds to Transactions, Dashboard, and Client Tracker.</p>
      </div>

      <div className="flex gap-8 items-start">

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} className="flex-1 min-w-0 space-y-7">

          {/* Who */}
          <div>
            <Divider title="Who is this for?" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label req>Customer name</Label>
                <input value={form.customer} onChange={e => set("customer", e.target.value)}
                  placeholder="Jerry Kallman" className={input(this?.e?.("customer") || e("customer"))} />
              </div>
              <div>
                <Label req>Company</Label>
                <input value={form.company} onChange={e => set("company", e.target.value)}
                  placeholder="Airline International" className={input(e("company"))} />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Product */}
          <div>
            <Divider title="What are they buying?" />
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label>Product</Label>
                <input value={form.product} onChange={e => set("product", e.target.value)}
                  placeholder="Carry-On Black" className={input()} />
              </div>
              <div>
                <Label>SKU</Label>
                <input value={form.sku} onChange={e => set("sku", e.target.value)}
                  placeholder="AllB1" className={input()} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <Label req>Invoice #</Label>
                <input value={form.invoice} onChange={e => set("invoice", e.target.value)}
                  placeholder="1020" className={input(e("invoice"))} />
              </div>
              <div>
                <Label req>Invoice date</Label>
                <input type="date" value={form.invoiceDate} onChange={e => set("invoiceDate", e.target.value)}
                  className={input(e("invoiceDate"))} />
              </div>
              <div>
                <Label>Order #</Label>
                <input value={form.orderNo} onChange={e => set("orderNo", e.target.value)}
                  placeholder="MO2500" className={input()} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label req>Quantity</Label>
                <input type="number" min="1" value={form.qty} onChange={e => set("qty", e.target.value)}
                  placeholder="0" className={input(e("qty"))} />
              </div>
              <div>
                <Label>Unit price</Label>
                <input type="number" min="0" step="0.01" value={form.unitPrice}
                  onChange={e => set("unitPrice", e.target.value)}
                  placeholder="0.00" className={input()} />
              </div>
              <div>
                <Label>Total</Label>
                <div className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm font-semibold text-gray-700 h-[38px] flex items-center">
                  {total > 0 ? fmt(total) : <span className="text-gray-300 font-normal text-xs">auto-calculated</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Payment */}
          <div>
            <Divider title="Payment details" />
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label>Terms</Label>
                <select value={form.paymentTerms} onChange={e => set("paymentTerms", e.target.value)} className={select()}>
                  <option value="">Select…</option>
                  {PAYMENT_TERMS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label>Due date</Label>
                <input type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} className={input()} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <select value={form.status} onChange={e => set("status", e.target.value)} className={select()}>
                  <option value="">Select…</option>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label>Payment received date</Label>
                <input type="date" value={form.paymentRecDate} onChange={e => set("paymentRecDate", e.target.value)} className={input()} />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Fulfillment */}
          <div>
            <Divider title="Fulfillment" />
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <Label>Fulfilled month</Label>
                <select value={form.fulfilledMonth} onChange={e => set("fulfilledMonth", e.target.value)} className={select()}>
                  {MONTHS.map(m => <option key={m} value={m}>{m || "Select…"}</option>)}
                </select>
              </div>
              <div>
                <Label>Shipment date</Label>
                <input type="date" value={form.shipmentDate} onChange={e => set("shipmentDate", e.target.value)} className={input()} />
              </div>
              <div>
                <Label>Delivery</Label>
                <select value={form.delivery} onChange={e => set("delivery", e.target.value)} className={select()}>
                  {DELIVERY.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Payment rec. month</Label>
                <select value={form.paymentRecMonth} onChange={e => set("paymentRecMonth", e.target.value)} className={select()}>
                  {MONTHS.map(m => <option key={m} value={m}>{m || "Select…"}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Notes */}
          <div>
            <Divider title="Notes" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Remarks</Label>
                <textarea value={form.remarks} onChange={e => set("remarks", e.target.value)}
                  placeholder="Anything worth noting…" rows={3}
                  className={`${input()} resize-none`} />
              </div>
              <div>
                <Label>Finance remarks</Label>
                <textarea value={form.financeRemarks} onChange={e => set("financeRemarks", e.target.value)}
                  placeholder="e.g. bad debt, June-2026…" rows={3}
                  className={`${input()} resize-none`} />
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between pt-2 pb-6">
            <p className="text-xs text-gray-400"><span className="text-red-400">*</span> required fields</p>
            <button type="submit"
              className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">
              Add entry
            </button>
          </div>

        </form>

        {/* ── Live preview ── */}
        <div className="w-64 shrink-0 sticky top-6">
          <p className="text-[11px] text-gray-400 font-medium mb-3">Preview</p>
          <div className={`bg-white border rounded-xl p-4 transition-all duration-300 ${hasPreview ? "border-gray-200 shadow-sm" : "border-dashed border-gray-200"}`}>
            {hasPreview ? (
              <div className="space-y-3">
                <div>
                  <p className="text-[13px] font-semibold text-gray-900 leading-tight">
                    {form.company || <span className="text-gray-300">Company</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {form.customer || <span className="text-gray-300">Customer name</span>}
                  </p>
                </div>

                {(form.invoice || form.invoiceDate) && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {form.invoice && <span className="font-mono font-semibold text-indigo-600">INV {form.invoice}</span>}
                    {form.invoiceDate && <span className="text-gray-300">·</span>}
                    {form.invoiceDate && <span>{new Date(form.invoiceDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
                  </div>
                )}

                {form.product && (
                  <p className="text-xs text-gray-500 truncate">{form.product}{form.sku && <span className="text-gray-300 ml-1">· {form.sku}</span>}</p>
                )}

                {total > 0 && (
                  <div className="pt-2 border-t border-gray-50">
                    <p className="text-2xl font-bold text-gray-900 tracking-tight">{fmt(total)}</p>
                    {form.qty && form.unitPrice && (
                      <p className="text-xs text-gray-400 mt-0.5">{form.qty} × {fmt(parseFloat(form.unitPrice))}</p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <StatusBadge status={form.status} />
                  {form.paymentTerms && (
                    <span className="text-xs text-gray-400">{form.paymentTerms}</span>
                  )}
                </div>

                {form.dueDate && (
                  <p className="text-xs text-gray-400">
                    Due {new Date(form.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-300 text-center py-6 leading-relaxed">
                Fill in the form and you'll see a preview here.
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
