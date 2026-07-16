import { useState, useMemo, useRef, useEffect } from "react";
import { useData } from "../context/DataContext";
import { CheckCircle, ChevronDown, UserCheck, Package, PlusCircle, X } from "lucide-react";
import StatusBadge from "./StatusBadge";
import { productCatalog, colorForSku } from "../data/products";

const PAYMENT_TERMS = ["Net 0", "Net 30", "Net 40", "Net 45", "Net 60"];
const STATUSES      = ["Received", "Paid", "Partially Received", "Due"];
const DELIVERY      = ["Company", "Self"];
const CURRENCIES    = ["USD", "GBP", "EUR", "CAD", "AUD", "NZD", "SGD", "HKD", "JPY", "CHF"];
const MONTHS        = [
  "", "June-2025", "July-2025", "August-2025", "September-2025",
  "October-2025", "November-2025", "December-2025",
  "January-2026", "February-2026", "March-2026",
  "April-2026", "May-2026", "June-2026", "July-2026",
  "August-2026", "September-2026", "October-2026",
];

// ── Order number generator ────────────────────────────────────────────────────
function generateOrderNo() {
  const now   = new Date();
  const yy    = String(now.getFullYear()).slice(2);
  const mm    = String(now.getMonth() + 1).padStart(2, "0");
  const dd    = String(now.getDate()).padStart(2, "0");
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand  = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `MO-${yy}${mm}${dd}-${rand}`;
}

// ── Autocomplete input ────────────────────────────────────────────────────────
function AutocompleteInput({ value, onChange, onSelect, options, placeholder, error, icon: Icon = UserCheck }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const filtered = useMemo(() => {
    if (!value.trim()) return options;
    const q = value.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [value, options]);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-gray-800 placeholder-gray-300
          focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-shadow pr-8
          ${error ? "border-red-300 focus:ring-red-300 focus:border-red-300" : "border-gray-200"}`}
      />
      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-y-auto max-h-60">
          {filtered.map(opt => (
            <button key={opt} type="button"
              onMouseDown={() => { onSelect(opt); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 transition-colors">
              <Icon size={12} className="text-gray-300 shrink-0" />
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const inp = (err = "") => `w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-shadow ${err}`;
const sel = () => `w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400`;

function Label({ children, req }) {
  return (
    <label className="block text-[13px] text-gray-500 mb-1.5">
      {children}{req && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}
function Divider({ title }) {
  return <p className="text-sm font-semibold text-gray-700 mb-4 pt-2">{title}</p>;
}
function FieldError({ msg }) {
  return <p className="text-xs text-red-400 mt-1">{msg || "Required"}</p>;
}

// ── Empty helpers ─────────────────────────────────────────────────────────────
const emptyLineItem = () => ({ productVariant: "", product: "", sku: "", qty: "", unitPrice: "" });

const emptyForm = () => ({
  customer: "", company: "",
  lineItems: [emptyLineItem()],
  invoice: "", invoiceDate: "",
  currency: "USD",
  paymentTerms: "", dueDate: "", orderNo: generateOrderNo(),
  status: "", paymentRecDate: "", shipmentDate: "",
  fulfilledMonth: "", paymentRecMonth: "",
  delivery: "Company", remarks: "", financeRemarks: "",
});

// ── Main component ────────────────────────────────────────────────────────────
export default function AddB2B() {
  const { addTransaction, updateTransaction, transactions } = useData();
  const [form,       setForm]       = useState(emptyForm);
  const [errors,     setErrors]     = useState({});
  const [mode,       setMode]       = useState("add"); // "add" | "success" | "edit"
  const [savedEntry, setSavedEntry] = useState(null);

  // Grand total across all line items
  const total = form.lineItems.reduce(
    (sum, item) => sum + (parseFloat(item.qty) || 0) * (parseFloat(item.unitPrice) || 0), 0
  );

  const customerOptions = useMemo(() =>
    [...new Set(transactions.map(t => t.customer).filter(Boolean))].sort(), [transactions]);
  const companyOptions = useMemo(() =>
    [...new Set(transactions.map(t => t.company).filter(Boolean))].sort(), [transactions]);
  const productVariantOptions = useMemo(() =>
    [...new Set(productCatalog.map(e => `${e.product} — ${e.color}`))].sort(), []);
  const skuOptions = useMemo(() =>
    [...new Set(productCatalog.map(e => e.sku))].sort(), []);

  function getCustomerProfile(name) {
    return transactions.filter(t => t.customer.toLowerCase() === name.toLowerCase())
      .sort((a, b) => b.id - a.id)[0] || null;
  }
  function getCompanyProfile(name) {
    return transactions.filter(t => t.company.toLowerCase() === name.toLowerCase())
      .sort((a, b) => b.id - a.id)[0] || null;
  }

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: false }));
  }

  // ── Line item handlers ────────────────────────────────────────────────────
  function addLineItem() {
    setForm(f => ({ ...f, lineItems: [...f.lineItems, emptyLineItem()] }));
  }

  function removeLineItem(idx) {
    setForm(f => ({ ...f, lineItems: f.lineItems.filter((_, i) => i !== idx) }));
    setErrors(e => {
      const next = { ...e };
      delete next[`li_${idx}_qty`];
      return next;
    });
  }

  function updateLineItem(idx, key, val) {
    setForm(f => ({
      ...f,
      lineItems: f.lineItems.map((item, i) => i === idx ? { ...item, [key]: val } : item),
    }));
    if (errors[`li_${idx}_${key}`]) setErrors(e => ({ ...e, [`li_${idx}_${key}`]: false }));
  }

  function handleVariantSelect(idx, label) {
    const entry = productCatalog.find(e => `${e.product} — ${e.color}` === label);
    setForm(f => ({
      ...f,
      lineItems: f.lineItems.map((item, i) => i !== idx ? item : {
        ...item,
        productVariant: label,
        product:        entry ? entry.product : label,
        sku:            entry ? entry.sku     : item.sku,
      }),
    }));
  }

  function handleSkuChange(idx, v) {
    const entry = productCatalog.find(e => e.sku.toLowerCase() === v.trim().toLowerCase());
    setForm(f => ({
      ...f,
      lineItems: f.lineItems.map((item, i) => i !== idx ? item : {
        ...item,
        sku:            v,
        product:        entry ? entry.product                       : item.product,
        productVariant: entry ? `${entry.product} — ${entry.color}` : item.productVariant,
      }),
    }));
  }

  // ── Customer / company select ─────────────────────────────────────────────
  function handleCustomerSelect(name) {
    const profile = getCustomerProfile(name);
    if (profile) {
      setForm(f => ({
        ...f, customer: name,
        company:      profile.company      || f.company,
        paymentTerms: profile.paymentTerms || f.paymentTerms,
        delivery:     profile.delivery     || f.delivery,
      }));
    } else {
      set("customer", name);
    }
    if (errors.customer) setErrors(e => ({ ...e, customer: false }));
  }

  function handleCompanySelect(name) {
    const profile = getCompanyProfile(name);
    if (profile) {
      setForm(f => ({
        ...f, company: name,
        paymentTerms: f.paymentTerms || profile.paymentTerms || "",
        delivery:     f.delivery    || profile.delivery     || "Company",
      }));
    } else {
      set("company", name);
    }
    if (errors.company) setErrors(e => ({ ...e, company: false }));
  }

  // ── Validation ────────────────────────────────────────────────────────────
  function validate() {
    const e = {};
    if (!form.customer.trim())  e.customer    = true;
    if (!form.company.trim())   e.company     = true;
    if (!form.invoice.trim())   e.invoice     = true;
    if (!form.invoiceDate)      e.invoiceDate = true;
    if (!form.dueDate)          e.dueDate     = true;
    form.lineItems.forEach((item, idx) => {
      if (!item.qty || isNaN(item.qty) || Number(item.qty) <= 0) e[`li_${idx}_qty`] = true;
    });
    return e;
  }

  // ── Submit (add) ──────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const header = {
      customer:        form.customer.trim(),
      company:         form.company.trim(),
      invoice:         form.invoice.trim(),
      invoiceDate:     form.invoiceDate,
      currency:        form.currency || "USD",
      paymentTerms:    form.paymentTerms || "Net 40",
      dueDate:         form.dueDate,
      orderNo:         form.orderNo,
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

    const entries = form.lineItems.map(item => ({
      ...header,
      product:   item.product.trim(),
      sku:       item.sku.trim(),
      qty:       Number(item.qty),
      unitPrice: parseFloat(item.unitPrice) || 0,
      total:     Number(((parseFloat(item.qty) || 0) * (parseFloat(item.unitPrice) || 0)).toFixed(2)),
    }));

    for (const entry of entries) {
      try {
        await fetch("/api/b2b-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": import.meta.env.VITE_API_KEY || "" },
          body: JSON.stringify(entry),
        });
      } catch (err) {
        console.error("Failed to save to DB:", err);
      }
      addTransaction(entry);
    }

    setSavedEntry({ ...header, lineItems: form.lineItems, id: transactions.length + 1 });
    setMode("success");
  }

  // ── Edit entry ────────────────────────────────────────────────────────────
  function handleEditEntry() {
    const f = savedEntry;
    setForm({
      customer:        f.customer        || "",
      company:         f.company         || "",
      lineItems:       f.lineItems       || [emptyLineItem()],
      invoice:         f.invoice         || "",
      invoiceDate:     f.invoiceDate     || "",
      currency:        f.currency        || "USD",
      paymentTerms:    f.paymentTerms    || "",
      dueDate:         f.dueDate         || "",
      orderNo:         f.orderNo         || "",
      status:          f.status          || "",
      paymentRecDate:  f.paymentRecDate  || "",
      shipmentDate:    f.shipmentDate    || "",
      fulfilledMonth:  f.fulfilledMonth  || "",
      paymentRecMonth: f.paymentRecMonth || "",
      delivery:        f.delivery        || "Company",
      remarks:         f.remarks         || "",
      financeRemarks:  f.financeRemarks  || "",
    });
    setErrors({});
    setMode("edit");
  }

  // ── Update (edit) ─────────────────────────────────────────────────────────
  async function handleUpdate(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const header = {
      customer:        form.customer.trim(),
      company:         form.company.trim(),
      invoice:         form.invoice.trim(),
      invoiceDate:     form.invoiceDate,
      currency:        form.currency || "USD",
      paymentTerms:    form.paymentTerms || "Net 40",
      dueDate:         form.dueDate,
      orderNo:         form.orderNo,
      status:          form.status || "Due",
      paymentRecDate:  form.paymentRecDate,
      shipmentDate:    form.shipmentDate,
      fulfilledMonth:  form.fulfilledMonth,
      paymentRecMonth: form.paymentRecMonth,
      delivery:        form.delivery,
      remarks:         form.remarks.trim(),
      financeRemarks:  form.financeRemarks.trim(),
    };

    const firstItem = form.lineItems[0];
    const updated = {
      ...savedEntry, ...header,
      product:   firstItem.product.trim(),
      sku:       firstItem.sku.trim(),
      qty:       Number(firstItem.qty),
      unitPrice: parseFloat(firstItem.unitPrice) || 0,
      total:     Number(((parseFloat(firstItem.qty) || 0) * (parseFloat(firstItem.unitPrice) || 0)).toFixed(2)),
    };

    updateTransaction(savedEntry.id, updated);
    setSavedEntry({ ...updated, lineItems: form.lineItems });
    setMode("success");
  }

  const errCls = (k) => errors[k] ? "border-red-300 focus:ring-red-300 focus:border-red-300" : "";

  // ── Success screen ────────────────────────────────────────────────────────
  if (mode === "success") {
    const itemCount = savedEntry?.lineItems?.length || 1;
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={26} className="text-emerald-500" />
          </div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">Entry saved</h2>
          <p className="text-sm text-gray-400 mb-1">
            {itemCount} line item{itemCount !== 1 ? "s" : ""} · INV {savedEntry?.invoice}
          </p>
          <p className="text-sm text-gray-400 mb-6">Visible across Dashboard, Transactions, and Client Tracker.</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={handleEditEntry}
              className="px-4 py-2 border border-gray-200 bg-white text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              Edit this entry
            </button>
            <button onClick={() => { setForm(emptyForm()); setErrors({}); setSavedEntry(null); setMode("add"); }}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">
              Add another entry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasPreview = form.company || form.customer || form.invoice || form.lineItems.some(li => li.product || li.productVariant) || total > 0;

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-screen-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{mode === "edit" ? "Edit Entry" : "New B2B Entry"}</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {mode === "edit"
            ? `Editing entry · Order ${savedEntry?.orderNo}`
            : "Adds to Transactions, Dashboard, and Client Tracker."}
        </p>
      </div>

      <div className="flex gap-8 items-start">
        <form onSubmit={mode === "edit" ? handleUpdate : handleSubmit} className="flex-1 min-w-0 space-y-7">

          {/* ── Who ── */}
          <div>
            <Divider title="Who is this for?" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label req>Customer name</Label>
                <AutocompleteInput value={form.customer} onChange={v => set("customer", v)}
                  onSelect={handleCustomerSelect} options={customerOptions}
                  placeholder="Jerry Kallman" error={errors.customer} />
                {errors.customer && <FieldError />}
              </div>
              <div>
                <Label req>Company</Label>
                <AutocompleteInput value={form.company} onChange={v => set("company", v)}
                  onSelect={handleCompanySelect} options={companyOptions}
                  placeholder="Airline International" error={errors.company} />
                {errors.company && <FieldError />}
              </div>
            </div>
            {(form.customer && getCustomerProfile(form.customer)) && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-indigo-600">
                <UserCheck size={12} />
                Existing customer — payment terms, company &amp; delivery pre-filled
              </div>
            )}
          </div>

          <div className="border-t border-gray-100" />

          {/* ── Invoice header ── */}
          <div>
            <Divider title="Invoice details" />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label req>Invoice #</Label>
                <input value={form.invoice} onChange={e => set("invoice", e.target.value)}
                  placeholder="1020" className={inp(errCls("invoice"))} />
                {errors.invoice && <FieldError />}
              </div>
              <div>
                <Label req>Invoice date</Label>
                <input type="date" value={form.invoiceDate} onChange={e => set("invoiceDate", e.target.value)}
                  className={inp(errCls("invoiceDate"))} />
                {errors.invoiceDate && <FieldError />}
              </div>
              <div>
                <Label>Order #</Label>
                <input value={form.orderNo} readOnly
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm font-mono text-indigo-700 font-semibold focus:outline-none cursor-default" />
                <p className="text-[11px] text-gray-400 mt-1">Auto-generated · unique per entry</p>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* ── Line items ── */}
          <div>
            <Divider title="What are they buying?" />

            {form.lineItems.map((item, idx) => {
              const lineTotal = (parseFloat(item.qty) || 0) * (parseFloat(item.unitPrice) || 0);
              return (
                <div key={idx} className="mb-3 p-4 border border-gray-100 rounded-xl bg-gray-50/30 relative">
                  {form.lineItems.length > 1 && (
                    <button type="button" onClick={() => removeLineItem(idx)}
                      className="absolute top-3 right-3 text-gray-300 hover:text-red-400 transition-colors">
                      <X size={14} />
                    </button>
                  )}
                  {form.lineItems.length > 1 && (
                    <p className="text-[11px] font-semibold text-gray-400 mb-3">Line item {idx + 1}</p>
                  )}

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <Label>Product &amp; Colour</Label>
                      <AutocompleteInput
                        value={item.productVariant}
                        onChange={v => updateLineItem(idx, "productVariant", v)}
                        onSelect={label => handleVariantSelect(idx, label)}
                        options={productVariantOptions}
                        placeholder="Carry-On: All-in-One — Forest Green"
                        icon={Package}
                      />
                      {item.product && <p className="text-[11px] text-gray-400 mt-1 truncate">{item.product}</p>}
                    </div>
                    <div>
                      <Label>SKU</Label>
                      <AutocompleteInput
                        value={item.sku}
                        onChange={v => handleSkuChange(idx, v)}
                        onSelect={v => handleSkuChange(idx, v)}
                        options={skuOptions}
                        placeholder="AllG1"
                        icon={Package}
                      />
                      {item.sku && colorForSku(item.sku) && (
                        <p className="text-[11px] text-indigo-500 mt-1 font-medium">
                          {colorForSku(item.sku)} · auto-filled from SKU
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label req>Quantity</Label>
                      <input type="number" min="1" value={item.qty}
                        onChange={e => updateLineItem(idx, "qty", e.target.value)}
                        placeholder="0"
                        className={inp(errors[`li_${idx}_qty`] ? "border-red-300 focus:ring-red-300 focus:border-red-300" : "")} />
                      {errors[`li_${idx}_qty`] && <FieldError />}
                    </div>
                    <div>
                      <Label>Unit price</Label>
                      <input type="number" min="0" step="0.01" value={item.unitPrice}
                        onChange={e => updateLineItem(idx, "unitPrice", e.target.value)}
                        placeholder="0.00" className={inp()} />
                    </div>
                    <div>
                      <Label>Line total</Label>
                      <div className="w-full px-3 py-2 bg-white border border-gray-100 rounded-lg text-sm font-semibold text-gray-700 h-[38px] flex items-center">
                        {lineTotal > 0
                          ? fmt(lineTotal)
                          : <span className="text-gray-300 font-normal text-xs">auto-calculated</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <button type="button" onClick={addLineItem}
              className="w-full py-2.5 border border-dashed border-indigo-200 rounded-xl text-sm text-indigo-500 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2">
              <PlusCircle size={14} />
              Add line item
            </button>

            {form.lineItems.length > 1 && total > 0 && (
              <div className="flex justify-end mt-3 pr-1">
                <div className="text-right">
                  <p className="text-xs text-gray-400 mb-0.5">Invoice total ({form.lineItems.length} items)</p>
                  <p className="text-2xl font-bold text-gray-900">{fmt(total)}</p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100" />

          {/* ── Payment ── */}
          <div>
            <Divider title="Payment details" />
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <Label>Terms</Label>
                <select value={form.paymentTerms} onChange={e => set("paymentTerms", e.target.value)} className={sel()}>
                  <option value="">Select…</option>
                  {PAYMENT_TERMS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label req>Due date</Label>
                <input type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)}
                  className={inp(errCls("dueDate"))} />
                {errors.dueDate && <FieldError />}
              </div>
              <div>
                <Label>Currency</Label>
                <select value={form.currency} onChange={e => set("currency", e.target.value)} className={sel()}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">Passed to Xero on sync</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <select value={form.status} onChange={e => set("status", e.target.value)} className={sel()}>
                  <option value="">Select…</option>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label>Payment received date</Label>
                <input type="date" value={form.paymentRecDate} onChange={e => set("paymentRecDate", e.target.value)} className={inp()} />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* ── Fulfillment ── */}
          <div>
            <Divider title="Fulfillment" />
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <Label>Fulfilled month</Label>
                <select value={form.fulfilledMonth} onChange={e => set("fulfilledMonth", e.target.value)} className={sel()}>
                  {MONTHS.map(m => <option key={m} value={m}>{m || "Select…"}</option>)}
                </select>
              </div>
              <div>
                <Label>Shipment date</Label>
                <input type="date" value={form.shipmentDate} onChange={e => set("shipmentDate", e.target.value)} className={inp()} />
              </div>
              <div>
                <Label>Delivery</Label>
                <select value={form.delivery} onChange={e => set("delivery", e.target.value)} className={sel()}>
                  {DELIVERY.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label>Payment rec. month</Label>
              <select value={form.paymentRecMonth} onChange={e => set("paymentRecMonth", e.target.value)} className={sel()}>
                {MONTHS.map(m => <option key={m} value={m}>{m || "Select…"}</option>)}
              </select>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* ── Notes ── */}
          <div>
            <Divider title="Notes" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Remarks</Label>
                <textarea value={form.remarks} onChange={e => set("remarks", e.target.value)}
                  placeholder="Anything worth noting…" rows={3} className={`${inp()} resize-none`} />
              </div>
              <div>
                <Label>Finance remarks</Label>
                <textarea value={form.financeRemarks} onChange={e => set("financeRemarks", e.target.value)}
                  placeholder="e.g. bad debt, June-2026…" rows={3} className={`${inp()} resize-none`} />
              </div>
            </div>
          </div>

          {/* ── Submit ── */}
          <div className="flex items-center justify-between pt-2 pb-6">
            <p className="text-xs text-gray-400"><span className="text-red-400">*</span> required fields</p>
            <div className="flex items-center gap-3">
              {mode === "edit" && (
                <button type="button" onClick={() => setMode("success")}
                  className="px-4 py-2.5 border border-gray-200 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              )}
              <button type="submit"
                className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">
                {mode === "edit" ? "Update entry" : "Add entry"}
              </button>
            </div>
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

                {form.orderNo && (
                  <p className="font-mono text-[11px] text-indigo-500 font-semibold">{form.orderNo}</p>
                )}

                {(form.invoice || form.invoiceDate) && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {form.invoice && <span className="font-mono font-semibold text-indigo-600">INV {form.invoice}</span>}
                    {form.invoiceDate && <span className="text-gray-300">·</span>}
                    {form.invoiceDate && <span>{new Date(form.invoiceDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
                  </div>
                )}

                {/* Line items preview */}
                {form.lineItems.some(li => li.product || li.productVariant) && (
                  <div className="space-y-1.5">
                    {form.lineItems.filter(li => li.product || li.productVariant).map((li, i) => (
                      <div key={i} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-gray-700 font-medium truncate">{li.productVariant || li.product}</p>
                          {li.sku && <p className="text-[10px] font-mono text-gray-400">{li.sku}</p>}
                        </div>
                        {li.qty && li.unitPrice && (
                          <p className="text-xs text-gray-500 shrink-0">{li.qty}×</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {total > 0 && (
                  <div className="pt-2 border-t border-gray-50">
                    <p className="text-2xl font-bold text-gray-900 tracking-tight">{fmt(total)}</p>
                    {form.lineItems.length === 1 && form.lineItems[0].qty && form.lineItems[0].unitPrice && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {form.lineItems[0].qty} × {fmt(parseFloat(form.lineItems[0].unitPrice))}
                      </p>
                    )}
                    {form.lineItems.length > 1 && (
                      <p className="text-xs text-gray-400 mt-0.5">{form.lineItems.length} line items</p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <StatusBadge status={form.status} />
                  {form.paymentTerms && <span className="text-xs text-gray-400">{form.paymentTerms}</span>}
                  {form.currency && form.currency !== "USD" && (
                    <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                      {form.currency}
                    </span>
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
