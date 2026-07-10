import { useState, useMemo } from "react";
import { vendors } from "../data/transactions";
import { Filter } from "lucide-react";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const fmtCompact = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);

const ALL = "All";

export default function VendorTracker() {
  const [monthFilter, setMonthFilter] = useState(ALL);
  const months   = useMemo(() => [ALL, ...new Set(vendors.map(v => v.month))], []);
  const filtered = monthFilter === ALL ? vendors : vendors.filter(v => v.month === monthFilter);
  const total    = filtered.reduce((s, v) => s + v.amount, 0);
  const maxAmt   = Math.max(...filtered.map(v => v.amount));

  const byMonth = vendors.reduce((acc, v) => {
    if (!acc[v.month]) acc[v.month] = 0;
    acc[v.month] += v.amount;
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Vendor Tracker</h1>
        <p className="text-sm text-white/40 mt-1">Inventory invoices by vendor and month</p>
      </div>

      {/* Month summary pills */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(byMonth).map(([month, amt]) => (
          <button
            key={month}
            onClick={() => setMonthFilter(month === monthFilter ? ALL : month)}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
              monthFilter === month
                ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/30"
                : "bg-white/5 text-white/50 border-white/10 hover:text-white/70"
            }`}
          >
            <span className="block text-[10px] text-white/30 mb-0.5 uppercase tracking-wider">{month.replace("-2025", " '25").replace("-2026", " '26")}</span>
            <span>{fmtCompact(amt)}</span>
          </button>
        ))}
        {monthFilter !== ALL && (
          <button onClick={() => setMonthFilter(ALL)} className="px-3 py-2 rounded-xl text-xs font-medium bg-white/5 text-white/40 border border-white/10 hover:text-white/70 transition-all">
            Clear ×
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#16181f] rounded-2xl p-5 border border-white/5">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Vendors Shown</p>
          <p className="text-2xl font-bold text-white">{filtered.length}</p>
        </div>
        <div className="bg-[#16181f] rounded-2xl p-5 border border-white/5">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Total Amount</p>
          <p className="text-2xl font-bold text-indigo-400">{fmt(total)}</p>
        </div>
        <div className="bg-[#16181f] rounded-2xl p-5 border border-white/5">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Avg per Vendor</p>
          <p className="text-2xl font-bold text-white/70">{filtered.length ? fmt(total / filtered.length) : "—"}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#16181f] rounded-2xl border border-white/5 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Vendor Invoices</h3>
          <div className="flex items-center gap-2 text-xs text-white/30">
            <Filter size={12} />
            {monthFilter === ALL ? "All months" : monthFilter}
          </div>
        </div>
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="px-6 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">#</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">Vendor</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">INV #</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-white/40 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">Month</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider w-40">Share</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v, i) => (
              <tr key={i} className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}>
                <td className="px-6 py-3 text-sm text-white/20">{i + 1}</td>
                <td className="px-6 py-3 text-sm font-medium text-white">{v.vendor}</td>
                <td className="px-6 py-3 text-xs font-mono text-indigo-400">{v.inv}</td>
                <td className="px-6 py-3 text-sm font-semibold text-right text-white">{fmt(v.amount)}</td>
                <td className="px-6 py-3 text-xs text-white/40">{v.month}</td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500/60 rounded-full"
                        style={{ width: `${(v.amount / maxAmt) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-white/25 w-10 text-right">
                      {((v.amount / total) * 100).toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10">
              <td colSpan={3} className="px-6 py-3 text-sm font-bold text-white">Total</td>
              <td className="px-6 py-3 text-sm font-bold text-right text-indigo-400">{fmt(total)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
