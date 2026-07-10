import { useState, useMemo } from "react";
import { useData } from "../context/DataContext";
import {
  CheckCircle2, XCircle, Clock, Package,
  User, FileText, Check, X, ChevronDown, ChevronUp,
} from "lucide-react";
import StatusBadge from "./StatusBadge";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function OrderCard({ tx, onMarkAvailable, onMarkUnavailable }) {
  const [open,     setOpen]     = useState(false);
  const [picking,  setPicking]  = useState(false); // showing the date input
  const [readyDate, setReadyDate] = useState("");

  const done        = !!tx.fulfillment;
  const isAvailable = tx.fulfillment === "available";
  const isUnavail   = tx.fulfillment === "unavailable";

  function submitUnavailable() {
    if (!readyDate) return;
    onMarkUnavailable(tx.id, readyDate);
    setPicking(false);
  }

  function reset() {
    onMarkAvailable(tx.id, null);   // clears fulfillment so it goes back to pending
    setPicking(false);
    setReadyDate("");
  }

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${
      isUnavail   ? "border-red-200" :
      isAvailable ? "border-emerald-200" :
                    "border-gray-200 shadow-sm"
    }`}>
      <div className="px-5 py-4">

        {/* Top row */}
        <div className="flex items-start gap-4">
          {/* Status dot */}
          <div className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${
            isAvailable ? "bg-emerald-400" :
            isUnavail   ? "bg-red-400"     :
                          "bg-amber-400"
          }`} />

          {/* Order info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[13px] font-semibold text-gray-900">{tx.company}</p>
              <span className="text-gray-300 text-xs">·</span>
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <User size={10} /> {tx.customer}
              </span>
              {tx.invoice && (
                <span className="flex items-center gap-1 font-mono text-xs font-semibold text-indigo-600">
                  <FileText size={10} /> INV {tx.invoice}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 font-medium mt-0.5">
              {tx.product || "—"}
              {tx.sku && <span className="text-gray-400 font-mono text-xs ml-2">{tx.sku}</span>}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {tx.qty} units · {fmt(tx.total)} · {tx.paymentTerms || "—"}
              {tx.invoiceDate ? ` · ${tx.invoiceDate}` : ""}
            </p>
          </div>

          {/* Status */}
          <div className="shrink-0">
            <StatusBadge status={tx.status} />
          </div>

          {/* Expand */}
          <button onClick={() => setOpen(o => !o)}
            className="p-1.5 text-gray-300 hover:text-gray-500 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Action area */}
        <div className="mt-4 ml-6">
          {/* Pending — show action buttons */}
          {!done && !picking && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-400 mr-1">Is this available?</p>
              <button
                onClick={() => onMarkAvailable(tx.id)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors">
                <Check size={14} /> Yes, available
              </button>
              <button
                onClick={() => setPicking(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                <X size={14} /> Not available
              </button>
            </div>
          )}

          {/* Date picker for unavailable */}
          {picking && (
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-xs text-gray-500">When will it be ready?</p>
              <input
                type="date"
                value={readyDate}
                onChange={e => setReadyDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
              <button
                onClick={submitUnavailable}
                disabled={!readyDate}
                className="px-4 py-1.5 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors">
                Confirm
              </button>
              <button onClick={() => setPicking(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Done — available */}
          {isAvailable && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 size={15} className="text-emerald-500" />
                <span className="text-sm font-semibold text-emerald-700">Available — ready to ship</span>
              </div>
              <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">
                Undo
              </button>
            </div>
          )}

          {/* Done — unavailable */}
          {isUnavail && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <Clock size={15} className="text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Not available</p>
                  {tx.fulfillmentReadyDate && (
                    <p className="text-xs text-red-500">
                      Ready by{" "}
                      <span className="font-semibold">
                        {new Date(tx.fulfillmentReadyDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </p>
                  )}
                </div>
              </div>
              <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">
                Undo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4">
          <div className="grid grid-cols-2 gap-x-10 gap-y-1.5 text-xs">
            {[
              ["Invoice date", tx.invoiceDate],
              ["Due date",     tx.dueDate],
              ["Order #",      tx.orderNo],
              ["Payment terms",tx.paymentTerms],
              ["Delivery",     tx.delivery],
              ["Shipment date",tx.shipmentDate],
              ["Fulfilled month", tx.fulfilledMonth],
              ["Total value",  fmt(tx.total)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-gray-100 py-1">
                <span className="text-gray-400">{label}</span>
                <span className="font-medium text-gray-700">{value || "—"}</span>
              </div>
            ))}
            {tx.remarks && (
              <div className="col-span-2 flex justify-between border-b border-gray-100 py-1">
                <span className="text-gray-400">Remarks</span>
                <span className="font-medium text-gray-700 text-right max-w-xs">{tx.remarks}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Fulfillment() {
  const { transactions, setFulfillmentStatus } = useData();
  const [tab, setTab] = useState("pending");

  const orders = useMemo(() =>
    transactions.filter(t => t.qty > 0 && t.status !== "Paid"),
    [transactions]
  );

  const pending   = useMemo(() => orders.filter(t => !t.fulfillment),                   [orders]);
  const available = useMemo(() => orders.filter(t => t.fulfillment === "available"),     [orders]);
  const unavail   = useMemo(() => orders.filter(t => t.fulfillment === "unavailable"),   [orders]);

  function markAvailable(id) {
    setFulfillmentStatus(id, "available", null);
  }

  function markUnavailable(id, readyDate) {
    setFulfillmentStatus(id, "unavailable", readyDate);
  }

  const tabCls = (t) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
    }`;

  const list = tab === "pending"    ? pending
             : tab === "available"  ? available
             :                        unavail;

  return (
    <div className="max-w-3xl space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Fulfillment & Delivery</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Review each order and confirm whether it can be fulfilled or provide a ready date.
        </p>
      </div>

      {/* Summary strip */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <div className="px-5 py-4 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
            <div>
              <p className="text-xl font-bold text-gray-900">{pending.length}</p>
              <p className="text-xs text-gray-400">Awaiting review</p>
            </div>
          </div>
          <div className="px-5 py-4 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
            <div>
              <p className="text-xl font-bold text-emerald-600">{available.length}</p>
              <p className="text-xs text-gray-400">Available</p>
            </div>
          </div>
          <div className="px-5 py-4 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
            <div>
              <p className="text-xl font-bold text-red-600">{unavail.length}</p>
              <p className="text-xs text-gray-400">Not available — ETA set</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button className={tabCls("pending")}   onClick={() => setTab("pending")}>
          Pending <span className="ml-1 text-xs opacity-60">{pending.length}</span>
        </button>
        <button className={tabCls("available")} onClick={() => setTab("available")}>
          Available <span className="ml-1 text-xs opacity-60">{available.length}</span>
        </button>
        <button className={tabCls("unavail")}   onClick={() => setTab("unavail")}>
          Not available <span className="ml-1 text-xs opacity-60">{unavail.length}</span>
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {list.map(tx => (
          <OrderCard
            key={tx.id}
            tx={tx}
            onMarkAvailable={markAvailable}
            onMarkUnavailable={markUnavailable}
          />
        ))}

        {list.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-gray-200 rounded-xl text-center">
            <Package size={26} className="text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">
              {tab === "pending"   ? "All orders have been reviewed" :
               tab === "available" ? "No orders marked available yet" :
                                     "No unavailable orders"}
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
