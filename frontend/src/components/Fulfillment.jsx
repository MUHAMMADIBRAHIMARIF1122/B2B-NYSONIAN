import { useState, useMemo } from "react";
import { useData } from "../context/DataContext";
import {
  CheckCircle2, Clock, Package, Search,
  ChevronDown, ChevronUp, Check, X, Truck,
  Calendar, RefreshCw,
} from "lucide-react";

const API_KEY = import.meta.env.VITE_API_KEY;
const fmt = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const MONTHS = (() => {
  const list = [];
  const now = new Date();
  for (let i = -3; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    list.push(d.toLocaleString("en-US", { month: "long" }) + "-" + d.getFullYear());
  }
  return list;
})();

const DELIVERY = ["Company", "Self"];

// Module-level components prevent focus loss on re-render
function StatusBadge({ status }) {
  if (status === "available") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Available
    </span>
  );
  if (status === "unavailable") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      Not available
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      Pending review
    </span>
  );
}

function FieldInput({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function Fulfillment() {
  const { transactions, refreshEntries } = useData();
  const [tab, setTab]         = useState("pending");
  const [expanded, setExpanded]   = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [actionType, setActionType]   = useState(null);
  const [formData, setFormData]   = useState({ fulfilledMonth: "", shipmentDate: "", delivery: "Company", readyDate: "" });
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [search, setSearch]     = useState("");

  const orders = useMemo(() => {
    const map = {};
    transactions.filter(t => t.qty > 0 && t.status !== "Paid").forEach(t => {
      const key = t.orderNo || t.invoice || String(t.id);
      if (!map[key]) {
        map[key] = {
          orderNo:              t.orderNo || "",
          invoice:              t.invoice || "",
          company:              t.company,
          customer:             t.customer,
          paymentTerms:         t.paymentTerms,
          invoiceDate:          t.invoiceDate,
          dueDate:              t.dueDate,
          status:               t.status,
          items:                [],
          total:                0,
          fulfillment:          t.fulfillment || "",
          fulfillmentReadyDate: t.fulfillmentReadyDate || null,
          fulfilledMonth:       t.fulfilledMonth || "",
          shipmentDate:         t.shipmentDate  || "",
          delivery:             t.delivery      || "Company",
        };
      }
      map[key].items.push(t);
      map[key].total += (t.total || 0);
      if (t.fulfillment) {
        map[key].fulfillment          = t.fulfillment;
        map[key].fulfillmentReadyDate = t.fulfillmentReadyDate;
        map[key].fulfilledMonth       = t.fulfilledMonth || map[key].fulfilledMonth;
        map[key].shipmentDate         = t.shipmentDate  || map[key].shipmentDate;
        map[key].delivery             = t.delivery      || map[key].delivery;
      }
    });
    return Object.values(map);
  }, [transactions]);

  const pending   = orders.filter(o => !o.fulfillment);
  const available = orders.filter(o => o.fulfillment === "available");
  const unavail   = orders.filter(o => o.fulfillment === "unavailable");

  const pendingValue   = pending.reduce((s, o) => s + o.total, 0);
  const availableValue = available.reduce((s, o) => s + o.total, 0);
  const unavailValue   = unavail.reduce((s, o) => s + o.total, 0);

  const baseList = tab === "pending" ? pending : tab === "available" ? available : unavail;
  const list = search
    ? baseList.filter(o =>
        o.company.toLowerCase().includes(search.toLowerCase()) ||
        o.invoice.toLowerCase().includes(search.toLowerCase())
      )
    : baseList;

  function startAction(orderKey, type) {
    setActiveOrder(orderKey);
    setActionType(type);
    setFormData({ fulfilledMonth: "", shipmentDate: "", delivery: "Company", readyDate: "" });
    setSaveError(null);
  }
  function cancelAction() { setActiveOrder(null); setActionType(null); setSaveError(null); }

  async function saveAvailable(orderKey) {
    if (!formData.fulfilledMonth) { setSaveError("Please select fulfilled month."); return; }
    if (!formData.shipmentDate)   { setSaveError("Please enter shipment date."); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch(`/api/fulfillment/${encodeURIComponent(orderKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
          fulfillmentStatus: "available",
          fulfilledMonth:    formData.fulfilledMonth,
          shipmentDate:      formData.shipmentDate,
          delivery:          formData.delivery,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setSaveError(body.error || "Failed to save."); setSaving(false); return; }
      refreshEntries();
      cancelAction();
    } catch { setSaveError("Cannot reach server."); }
    setSaving(false);
  }

  async function saveUnavailable(orderKey) {
    if (!formData.readyDate) { setSaveError("Please set an estimated ready date."); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch(`/api/fulfillment/${encodeURIComponent(orderKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ fulfillmentStatus: "unavailable", readyDate: formData.readyDate }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setSaveError(body.error || "Failed to save."); setSaving(false); return; }
      refreshEntries();
      cancelAction();
    } catch { setSaveError("Cannot reach server."); }
    setSaving(false);
  }

  async function resetFulfillment(orderKey) {
    try {
      await fetch(`/api/fulfillment/${encodeURIComponent(orderKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ fulfillmentStatus: "" }),
      });
      refreshEntries();
    } catch {}
  }

  return (
    <div className="max-w-screen-xl space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fulfillment & Delivery</h1>
          <p className="text-sm text-gray-400 mt-1">
            Review orders from sales and confirm stock availability.
          </p>
        </div>
        <button onClick={refreshEntries}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors">
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Pending</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock size={15} className="text-amber-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{pending.length}</p>
          <p className="text-xs text-gray-400 mt-1.5">{fmt(pendingValue)} awaiting review</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Ready to Ship</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Truck size={15} className="text-emerald-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-emerald-600">{available.length}</p>
          <p className="text-xs text-gray-400 mt-1.5">{fmt(availableValue)} confirmed</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Not Available</span>
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <X size={15} className="text-red-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-red-600">{unavail.length}</p>
          <p className="text-xs text-gray-400 mt-1.5">{fmt(unavailValue)} back-ordered</p>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
          {[
            { key: "pending",   label: "Pending",       count: pending.length,   color: "amber"   },
            { key: "available", label: "Available",      count: available.length, color: "emerald" },
            { key: "unavail",   label: "Not Available",  count: unavail.length,   color: "red"     },
          ].map(({ key, label, count, color }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              {label}
              <span className={`min-w-[20px] h-5 flex items-center justify-center px-1.5 rounded-full text-[11px] font-bold transition-colors ${
                tab === key
                  ? color === "amber"   ? "bg-amber-100 text-amber-700"
                  : color === "emerald" ? "bg-emerald-100 text-emerald-700"
                  :                       "bg-red-100 text-red-700"
                  : "bg-gray-200 text-gray-500"
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search company or invoice…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full sm:w-64 pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Order Cards */}
      <div className="space-y-3">
        {list.map(order => {
          const orderKey    = order.orderNo || order.invoice;
          const isExpanded  = expanded === orderKey;
          const isActioning = activeOrder === orderKey;
          const isAvailable = order.fulfillment === "available";
          const isUnavail   = order.fulfillment === "unavailable";

          return (
            <div key={orderKey} className={`bg-white rounded-xl border overflow-hidden transition-shadow hover:shadow-sm ${
              isAvailable ? "border-emerald-200" : isUnavail ? "border-red-200" : "border-gray-200"
            }`}>
              {/* Color stripe */}
              <div className={`h-1 ${isAvailable ? "bg-emerald-400" : isUnavail ? "bg-red-400" : "bg-amber-400"}`} />

              <div className="px-6 py-5">
                {/* Top: company + status + total */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-base font-bold text-gray-900">{order.company}</h3>
                      <StatusBadge status={order.fulfillment} />
                      {order.invoice && (
                        <span className="font-mono text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                          {order.invoice}
                        </span>
                      )}
                      {order.orderNo && (
                        <span className="font-mono text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                          {order.orderNo}
                        </span>
                      )}
                    </div>
                    {order.customer && (
                      <p className="text-sm text-gray-500 mt-0.5">{order.customer}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">{fmt(order.total)}</p>
                      {order.paymentTerms && (
                        <p className="text-xs text-gray-400">{order.paymentTerms}</p>
                      )}
                    </div>
                    <button onClick={() => setExpanded(isExpanded ? null : orderKey)}
                      className="p-2 text-gray-300 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  </div>
                </div>

                {/* Products table */}
                <div className="mt-4 rounded-lg border border-gray-100 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-3 py-2 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Product</th>
                        <th className="text-left px-3 py-2 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">SKU</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Qty</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item, i) => (
                        <tr key={i} className={i < order.items.length - 1 ? "border-b border-gray-50" : ""}>
                          <td className="px-3 py-2.5 font-medium text-gray-800">{item.product || "—"}</td>
                          <td className="px-3 py-2.5 font-mono text-gray-400">{item.sku || "—"}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{item.qty}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-gray-800">{fmt(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Action area */}
                <div className="mt-4">

                  {/* Pending — choose action */}
                  {!order.fulfillment && !isActioning && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-sm text-gray-500 font-medium">Is this order ready to ship?</p>
                      <button onClick={() => startAction(orderKey, "available")}
                        className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 active:bg-emerald-800 transition-colors">
                        <Check size={14} /> Yes, available
                      </button>
                      <button onClick={() => startAction(orderKey, "unavailable")}
                        className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
                        <X size={14} /> Not available
                      </button>
                    </div>
                  )}

                  {/* Available form */}
                  {isActioning && actionType === "available" && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mt-1">
                      <p className="text-sm font-semibold text-emerald-800 mb-4">Confirm availability — fill shipment details</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <FieldInput label="Fulfilled month" required>
                          <select value={formData.fulfilledMonth}
                            onChange={e => setFormData(f => ({ ...f, fulfilledMonth: e.target.value }))}
                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 appearance-none">
                            <option value="">Select…</option>
                            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </FieldInput>
                        <FieldInput label="Shipment date" required>
                          <input type="date" value={formData.shipmentDate}
                            onChange={e => setFormData(f => ({ ...f, shipmentDate: e.target.value }))}
                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                        </FieldInput>
                        <FieldInput label="Delivery method">
                          <select value={formData.delivery}
                            onChange={e => setFormData(f => ({ ...f, delivery: e.target.value }))}
                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 appearance-none">
                            {DELIVERY.map(d => <option key={d}>{d}</option>)}
                          </select>
                        </FieldInput>
                      </div>
                      {saveError && <p className="text-xs text-red-600 mb-3">{saveError}</p>}
                      <div className="flex items-center gap-2">
                        <button onClick={() => saveAvailable(orderKey)} disabled={saving}
                          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                          <CheckCircle2 size={14} /> {saving ? "Saving…" : "Confirm & Save"}
                        </button>
                        <button onClick={cancelAction}
                          className="px-4 py-2 text-sm text-gray-500 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Unavailable form */}
                  {isActioning && actionType === "unavailable" && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-5 mt-1">
                      <p className="text-sm font-semibold text-red-800 mb-4">Mark as unavailable — when will it be ready?</p>
                      <div className="flex items-end gap-4 flex-wrap">
                        <FieldInput label="Estimated ready date" required>
                          <input type="date" value={formData.readyDate}
                            onChange={e => setFormData(f => ({ ...f, readyDate: e.target.value }))}
                            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-300" />
                        </FieldInput>
                        <div className="flex items-center gap-2 pb-0.5">
                          <button onClick={() => saveUnavailable(orderKey)} disabled={saving || !formData.readyDate}
                            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors">
                            {saving ? "Saving…" : "Confirm"}
                          </button>
                          <button onClick={cancelAction}
                            className="px-4 py-2 text-sm text-gray-500 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                      {saveError && <p className="text-xs text-red-600 mt-2">{saveError}</p>}
                    </div>
                  )}

                  {/* Available summary */}
                  {isAvailable && !isActioning && (
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                          <Truck size={16} className="text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-emerald-800">Ready to ship</p>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-emerald-700 flex-wrap">
                            {order.fulfilledMonth && (
                              <span className="flex items-center gap-1">
                                <Calendar size={10} /> {order.fulfilledMonth}
                              </span>
                            )}
                            {order.shipmentDate && <span>· Ships {fmtDate(order.shipmentDate)}</span>}
                            {order.delivery      && <span>· {order.delivery} delivery</span>}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => resetFulfillment(orderKey)}
                        className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors">
                        Undo
                      </button>
                    </div>
                  )}

                  {/* Unavailable summary */}
                  {isUnavail && !isActioning && (
                    <div className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                          <Clock size={16} className="text-red-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-red-800">Not available</p>
                          {order.fulfillmentReadyDate ? (
                            <p className="text-xs text-red-600 mt-0.5">
                              Estimated ready: {fmtDate(order.fulfillmentReadyDate)}
                            </p>
                          ) : (
                            <p className="text-xs text-red-400 mt-0.5">No ETA set</p>
                          )}
                        </div>
                      </div>
                      <button onClick={() => resetFulfillment(orderKey)}
                        className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors">
                        Undo
                      </button>
                    </div>
                  )}

                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
                    {[
                      ["Invoice #",       order.invoice],
                      ["Order #",         order.orderNo],
                      ["Invoice date",    order.invoiceDate  ? fmtDate(order.invoiceDate)  : null],
                      ["Due date",        order.dueDate      ? fmtDate(order.dueDate)      : null],
                      ["Payment terms",   order.paymentTerms],
                      ["Payment status",  order.status],
                    ].filter(([, v]) => v).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
                        <p className="text-sm font-medium text-gray-800">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {list.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-gray-200 rounded-xl bg-gray-50/40">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Package size={24} className="text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-500">
              {tab === "pending"   ? "All caught up — no pending orders" :
               tab === "available" ? "No orders marked available yet" :
                                     "No unavailable orders"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {tab === "pending"   ? "New orders from sales will appear here." :
               tab === "available" ? "Confirmed available orders will show here." :
                                     "Back-ordered items will appear here."}
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
