import { useState, useMemo, useRef, useEffect } from "react";
import { useData } from "../context/DataContext";
import { CheckCircle, ChevronDown, UserCheck, Package, PlusCircle, X } from "lucide-react";
import { productCatalog, colorForSku } from "../data/products";

const PAYMENT_TERMS = ["Net 0", "Net 30", "Net 40", "Net 45", "Net 60"];
const STATUSES      = ["Received", "Paid", "Partially Received", "Due"];
const DELIVERY      = ["Company", "Self"];
const CURRENCIES    = ["USD", "GBP", "EUR", "CAD", "AUD", "NZD", "SGD", "HKD", "JPY", "CHF"];
const MONTHS = (() => {
  const list = [""];
  const now = new Date();
  for (let i = -3; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    list.push(d.toLocaleString("en-US", { month: "long" }) + "-" + d.getFullYear());
  }
  return list;
})();

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
const fmt = (n, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
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
  status: "", paymentRecDate: "",
  remarks: "", financeRemarks: "",
});

// ── Layout helpers (defined outside component to prevent remount on re-render) ─
function SectionCard({ children }) {
  return <div className="bg-white border border-gray-200 rounded-xl p-6">{children}</div>;
}
function SectionTitle({ children }) {
  return <p className="text-sm font-semibold text-gray-800 mb-5">{children}</p>;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AddB2B() {
  const { refreshEntries, transactions } = useData();
  const [form,       setForm]       = useState(emptyForm);
  const [errors,     setErrors]     = useState({});
  const [mode,       setMode]       = useState("add"); // "add" | "success" | "edit"
  const [savedEntry, setSavedEntry] = useState(null);
  const [saveError,  setSaveError]  = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto-generate next invoice number when form resets to empty.
  // Scans all existing invoices (numeric "1012" or "INV-012") to find the true max.
  useEffect(() => {
    if (mode !== "add" || form.invoice !== "") return;
    if (transactions.length === 0) return;
    const nums = transactions
      .map(t => t.invoice)
      .map(inv => {
        if (/^\d+$/.test(inv))        return parseInt(inv, 10);              // "1012"
        if (/^INV-(\d+)$/i.test(inv)) return parseInt(inv.replace(/\D/g, ""), 10); // "INV-001"
        return null;
      })
      .filter(n => n !== null && !isNaN(n));
    const max = nums.length > 0 ? Math.max(...nums) : 1000;
    setForm(f => ({ ...f, invoice: `${max + 1}` }));
  }, [mode, transactions]);

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
      const qty = Number(item.qty);
      if (!item.qty || isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) e[`li_${idx}_qty`] = true;
    });
    return e;
  }

  // ── Submit (add) ──────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaveError(null);
    setSubmitting(true);

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
      shipmentDate:    null,
      fulfilledMonth:  "",
      paymentRecMonth: "",
      delivery:        "",
      remarks:         form.remarks.trim(),
      financeRemarks:  form.financeRemarks.trim(),
      closedWon:       "",
    };

    const lineItems = form.lineItems.map(item => ({
      product:   item.product.trim(),
      sku:       item.sku.trim(),
      qty:       Number(item.qty),
      unitPrice: parseFloat(item.unitPrice) || 0,
    }));

    let xeroInvoiceId = null;

    try {
      const res = await fetch("/api/b2b-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": import.meta.env.VITE_API_KEY || "" },
        body: JSON.stringify({ header, lineItems }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(body.error || `Server error ${res.status} — entry not saved to database.`);
        setSubmitting(false);
        return;
      }
      xeroInvoiceId = body.xeroInvoiceId || null;
    } catch (err) {
      setSaveError("Could not reach the server. Make sure node server.js is running on port 3001.");
      setSubmitting(false);
      return;
    }

    // Refresh DB entries so new data appears everywhere immediately
    refreshEntries();

    setSavedEntry({ ...header, lineItems: form.lineItems, id: Date.now(), xeroInvoiceId });
    setSubmitting(false);
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

    setSaveError(null);
    setSubmitting(true);

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
      shipmentDate:    null,
      fulfilledMonth:  "",
      paymentRecMonth: "",
      delivery:        "",
      remarks:         form.remarks.trim(),
      financeRemarks:  form.financeRemarks.trim(),
      closedWon:       savedEntry.closedWon || "",
    };

    const lineItems = form.lineItems.map(item => ({
      product:   item.product.trim(),
      sku:       item.sku.trim(),
      qty:       Number(item.qty),
      unitPrice: parseFloat(item.unitPrice) || 0,
    }));

    try {
      const res = await fetch(`/api/b2b-order/${encodeURIComponent(form.orderNo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-api-key": import.meta.env.VITE_API_KEY || "" },
        body: JSON.stringify({ header, lineItems }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(body.error || `Server error ${res.status} — update not saved.`);
        setSubmitting(false);
        return;
      }
    } catch (err) {
      setSaveError("Could not reach the server. Make sure node server.js is running.");
      setSubmitting(false);
      return;
    }

    // Refresh DB entries so edits appear everywhere immediately
    refreshEntries();

    setSavedEntry({ ...header, lineItems: form.lineItems, id: savedEntry.id });
    setSubmitting(false);
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
          {savedEntry?.xeroInvoiceId ? (
            <p className="text-sm text-indigo-500 mb-1 font-medium">
              Xero draft created · {savedEntry.xeroInvoiceId.slice(0, 8)}…
            </p>
          ) : (
            <p className="text-sm text-gray-300 mb-1">Xero sync pending</p>
          )}
          <p className="text-sm text-gray-400 mb-6">Visible across Dashboard, Transactions, and Client Tracker.</p>
          <button onClick={() => { setForm(emptyForm()); setErrors({}); setSavedEntry(null); setMode("add"); }}
            className="px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">
            Done
          </button>
        </div>
      </div>
    );
  }


  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-screen-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{mode === "edit" ? "Edit Entry" : "New B2B Entry"}</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {mode === "edit"
            ? `Editing entry · Order ${savedEntry?.orderNo}`
            : "Adds to Transactions, Dashboard, and Client Tracker."}
        </p>
      </div>

      <form onSubmit={mode === "edit" ? handleUpdate : handleSubmit} className="space-y-4">

          {/* ── Row 1: Who + Invoice details ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Who */}
            <SectionCard>
              <SectionTitle>Who is this for?</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="mt-3 flex items-center gap-1.5 text-xs text-indigo-600">
                  <UserCheck size={12} />
                  Existing customer — payment terms, company &amp; delivery pre-filled
                </div>
              )}
            </SectionCard>

            {/* Invoice details */}
            <SectionCard>
              <SectionTitle>Invoice details</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label req>Invoice #</Label>
                  <input value={form.invoice} onChange={e => set("invoice", e.target.value)}
                    placeholder="INV-001" className={inp(errCls("invoice"))} />
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
            </SectionCard>

          </div>

          {/* ── Line items ── */}
          <SectionCard>
            <SectionTitle>What are they buying?</SectionTitle>

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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label req>Quantity</Label>
                      <input type="number" min="1" step="1" value={item.qty}
                        onChange={e => updateLineItem(idx, "qty", e.target.value)}
                        placeholder="0"
                        className={inp(errors[`li_${idx}_qty`] ? "border-red-300 focus:ring-red-300 focus:border-red-300" : "")} />
                      {errors[`li_${idx}_qty`] && <FieldError msg="Whole number required" />}
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
                          ? fmt(lineTotal, form.currency)
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
                  <p className="text-2xl font-bold text-gray-900">{fmt(total, form.currency)}</p>
                </div>
              </div>
            )}
          </SectionCard>

          {/* ── Payment ── */}
          <SectionCard>
            <SectionTitle>Payment details</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </SectionCard>

          {/* ── Notes ── */}
          <SectionCard>
            <SectionTitle>Notes</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Remarks</Label>
                <textarea value={form.remarks} onChange={e => set("remarks", e.target.value)}
                  placeholder="Anything worth noting…" rows={3} maxLength={1000} className={`${inp()} resize-none`} />
                <p className="text-[10px] text-gray-300 mt-1 text-right">{form.remarks.length}/1000</p>
              </div>
              <div>
                <Label>Finance remarks</Label>
                <textarea value={form.financeRemarks} onChange={e => set("financeRemarks", e.target.value)}
                  placeholder="e.g. bad debt, June-2026…" rows={3} maxLength={1000} className={`${inp()} resize-none`} />
                <p className="text-[10px] text-gray-300 mt-1 text-right">{form.financeRemarks.length}/1000</p>
              </div>
            </div>
          </SectionCard>

          {/* ── Save error banner ── */}
          {saveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {saveError}
            </div>
          )}

          {/* ── Submit ── */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 py-2 pb-8">
            <p className="text-xs text-gray-400"><span className="text-red-400">*</span> required fields</p>
            <div className="flex items-center gap-3">
              {mode === "edit" && (
                <button type="button" onClick={() => setMode("success")}
                  className="px-4 py-2.5 border border-gray-200 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              )}
              <button type="submit" disabled={submitting}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? "Saving…" : mode === "edit" ? "Update entry" : "Add entry"}
              </button>
            </div>
          </div>

        </form>
      </div>
    );
}

