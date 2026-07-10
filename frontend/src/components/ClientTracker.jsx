import { useState, useMemo } from "react";
import { useData } from "../context/DataContext";
import { Search } from "lucide-react";

const fmt      = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const fmtShort = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);

const COLORS = [
  { avatar: "bg-indigo-500",  ring: "ring-indigo-100", tag: "bg-indigo-50 text-indigo-600 border-indigo-100" },
  { avatar: "bg-emerald-500", ring: "ring-emerald-100", tag: "bg-emerald-50 text-emerald-600 border-emerald-100" },
  { avatar: "bg-violet-500",  ring: "ring-violet-100", tag: "bg-violet-50 text-violet-600 border-violet-100" },
  { avatar: "bg-cyan-500",    ring: "ring-cyan-100", tag: "bg-cyan-50 text-cyan-600 border-cyan-100" },
  { avatar: "bg-rose-500",    ring: "ring-rose-100", tag: "bg-rose-50 text-rose-600 border-rose-100" },
  { avatar: "bg-amber-500",   ring: "ring-amber-100", tag: "bg-amber-50 text-amber-600 border-amber-100" },
  { avatar: "bg-blue-500",    ring: "ring-blue-100", tag: "bg-blue-50 text-blue-600 border-blue-100" },
];

const ALL = "All Months";

export default function ClientTracker() {
  const { vendors, transactions } = useData();
  const [search,      setSearch]      = useState("");
  const [monthFilter, setMonthFilter] = useState(ALL);
  const [sortBy,      setSortBy]      = useState("amount");

  const clients = useMemo(() => {
    const map = {};
    vendors.forEach(v => {
      if (!map[v.vendor]) map[v.vendor] = { name: v.vendor, invoices: [], totalAmount: 0, months: new Set() };
      map[v.vendor].invoices.push(v);
      map[v.vendor].totalAmount += v.amount;
      map[v.vendor].months.add(v.month);
    });
    return Object.values(map);
  }, []);

  const b2bAmounts = useMemo(() => {
    const map = {};
    transactions.forEach(t => { map[t.company] = (map[t.company] || 0) + t.total; });
    return map;
  }, []);

  const monthList = useMemo(() => [ALL, ...new Set(vendors.map(v => v.month))], []);

  let filtered = clients;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(c => c.name.toLowerCase().includes(q));
  }
  if (monthFilter !== ALL) {
    filtered = filtered
      .map(c => ({ ...c, invoices: c.invoices.filter(i => i.month === monthFilter) }))
      .filter(c => c.invoices.length > 0)
      .map(c => ({ ...c, totalAmount: c.invoices.reduce((s, i) => s + i.amount, 0) }));
  }
  filtered = [...filtered].sort((a, b) =>
    sortBy === "amount"   ? b.totalAmount - a.totalAmount :
    sortBy === "invoices" ? b.invoices.length - a.invoices.length :
    a.name.localeCompare(b.name)
  );

  const totalAmount   = filtered.reduce((s, c) => s + c.totalAmount, 0);
  const totalInvoices = filtered.reduce((s, c) => s + c.invoices.length, 0);

  return (
    <div className="space-y-5 max-w-screen-xl">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Client Tracker</h1>
          <p className="text-sm text-gray-400 mt-0.5">All clients, invoices, and amounts</p>
        </div>
        <div className="flex gap-1.5">
          {[
            { key: "amount",   label: "By Amount" },
            { key: "invoices", label: "By Invoices" },
            { key: "name",     label: "A–Z" },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                sortBy === opt.key
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          />
        </div>
        <select
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          {monthList.map(m => (
            <option key={m} value={m}>
              {m === ALL ? "All Months" : m.replace("-2025", " '25").replace("-2026", " '26")}
            </option>
          ))}
        </select>
      </div>

      {/* Stats strip */}
      <div className="bg-white border border-gray-200 rounded-xl grid grid-cols-3 divide-x divide-gray-100">
        {[
          { label: "Clients",        value: filtered.length.toString() },
          { label: "Total Amount",   value: fmt(totalAmount) },
          { label: "Total Invoices", value: totalInvoices.toString() },
        ].map(({ label, value }) => (
          <div key={label} className="px-6 py-4">
            <p className="text-[11px] text-gray-400 font-medium mb-1.5">{label}</p>
            <p className="text-xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((client, i) => {
          const c        = COLORS[i % COLORS.length];
          const initials = client.name === "—" ? "?" :
            client.name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
          const b2bAmt   = b2bAmounts[client.name];

          return (
            <div
              key={client.name}
              className="client-card bg-white border border-gray-200 rounded-xl overflow-hidden"
            >
              {/* Card top */}
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-full ${c.avatar} ring-4 ${c.ring} flex items-center justify-center shrink-0 text-xs font-bold text-white`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{client.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {client.invoices.length} invoice{client.invoices.length !== 1 ? "s" : ""}
                        {" · "}
                        {[...client.months].length} month{[...client.months].length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold text-gray-900">{fmtShort(client.totalAmount)}</p>
                    {b2bAmt && (
                      <p className="text-[10px] text-emerald-600 font-medium mt-0.5">+{fmtShort(b2bAmt)} B2B</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100" />

              {/* Invoice list */}
              <div className="px-5 py-3 space-y-2">
                {client.invoices.map((inv, j) => (
                  <div key={j} className="flex items-center justify-between gap-3">
                    <span className="text-xs font-mono text-gray-400 shrink-0">{inv.inv}</span>
                    <span className="text-xs text-gray-300 shrink-0">
                      {inv.month.replace("-2025", "'25").replace("-2026", "'26")}
                    </span>
                    <span className="flex-1 h-px bg-gray-100" />
                    <span className="text-xs font-medium text-gray-700 shrink-0">{fmt(inv.amount)}</span>
                  </div>
                ))}
              </div>

              {/* Footer months */}
              <div className="px-5 py-3 border-t border-gray-50 flex flex-wrap gap-1">
                {[...client.months].map(m => (
                  <span
                    key={m}
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${c.tag}`}
                  >
                    {m.replace("-2025", " '25").replace("-2026", " '26")}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">No clients found.</div>
      )}
    </div>
  );
}
