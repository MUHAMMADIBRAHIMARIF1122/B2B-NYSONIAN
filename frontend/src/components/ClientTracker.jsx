import { useState, useMemo } from "react";
import { useData } from "../context/DataContext";
import { Search } from "lucide-react";

const fmt      = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtShort = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);

const COLORS = [
  { avatar: "bg-indigo-500",  ring: "ring-indigo-900",  tag: "bg-indigo-900/40 text-indigo-300 border-indigo-700" },
  { avatar: "bg-emerald-500", ring: "ring-emerald-900", tag: "bg-emerald-900/40 text-emerald-300 border-emerald-700" },
  { avatar: "bg-violet-500",  ring: "ring-violet-900",  tag: "bg-violet-900/40 text-violet-300 border-violet-700" },
  { avatar: "bg-cyan-500",    ring: "ring-cyan-900",    tag: "bg-cyan-900/40 text-cyan-300 border-cyan-700" },
  { avatar: "bg-rose-500",    ring: "ring-rose-900",    tag: "bg-rose-900/40 text-rose-300 border-rose-700" },
  { avatar: "bg-amber-500",   ring: "ring-amber-900",   tag: "bg-amber-900/40 text-amber-300 border-amber-700" },
  { avatar: "bg-blue-500",    ring: "ring-blue-900",    tag: "bg-blue-900/40 text-blue-300 border-blue-700" },
];

function statusColor(status) {
  if (status === "Paid" || status === "Received") return "text-emerald-400 bg-emerald-900/40 border-emerald-700";
  if (status === "Partially Received")             return "text-amber-400  bg-amber-900/40  border-amber-700";
  if (status === "Due")                            return "text-red-400    bg-red-900/40    border-red-700";
  return "text-slate-400 bg-slate-700/40 border-slate-600";
}

export default function ClientTracker() {
  const { transactions } = useData();
  const [search,  setSearch]  = useState("");
  const [sortBy,  setSortBy]  = useState("amount");
  const [expanded, setExpanded] = useState(null);

  // Aggregate transactions per company
  const clients = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      const key = t.company || "—";
      if (!map[key]) {
        map[key] = {
          company:      key,
          customer:     t.customer || "",
          paymentTerms: t.paymentTerms || "",
          currency:     t.currency || "USD",
          totalInvoiced: 0,
          totalReceived: 0,
          invoiceRows:   [],
          invoiceNos:    new Set(),
          statuses:      new Set(),
          lastInvoiceDate: null,
        };
      }
      const c = map[key];
      // Update customer/terms from latest entry (highest id)
      if (!c._latestId || t.id > c._latestId) {
        c._latestId   = t.id;
        c.customer    = t.customer || c.customer;
        c.paymentTerms = t.paymentTerms || c.paymentTerms;
        c.currency    = t.currency || c.currency;
      }
      c.totalInvoiced += t.total || 0;
      if (t.status === "Paid" || t.status === "Received") {
        c.totalReceived += t.total || 0;
      }
      c.invoiceNos.add(t.invoice);
      c.statuses.add(t.status);
      if (t.invoiceDate && (!c.lastInvoiceDate || t.invoiceDate > c.lastInvoiceDate)) {
        c.lastInvoiceDate = t.invoiceDate;
      }
      c.invoiceRows.push(t);
    });

    return Object.values(map).map(c => ({
      ...c,
      outstanding:  c.totalInvoiced - c.totalReceived,
      invoiceCount: c.invoiceNos.size,
      rowCount:     c.invoiceRows.length,
    }));
  }, [transactions]);

  let filtered = clients;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(c =>
      c.company.toLowerCase().includes(q) || c.customer.toLowerCase().includes(q)
    );
  }
  filtered = [...filtered].sort((a, b) =>
    sortBy === "amount"   ? b.totalInvoiced - a.totalInvoiced :
    sortBy === "received" ? b.totalReceived - a.totalReceived :
    a.company.localeCompare(b.company)
  );

  const totalInvoiced  = filtered.reduce((s, c) => s + c.totalInvoiced, 0);
  const totalReceived  = filtered.reduce((s, c) => s + c.totalReceived, 0);
  const totalOutstanding = totalInvoiced - totalReceived;

  return (
    <div className="space-y-5 max-w-screen-xl">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Client Tracker</h1>
          <p className="text-sm text-slate-400 mt-0.5">{filtered.length} client{filtered.length !== 1 ? "s" : ""} · all B2B transactions</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[
            { key: "amount",   label: "By Invoiced" },
            { key: "received", label: "By Received" },
            { key: "name",     label: "A–Z" },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                sortBy === opt.key
                  ? "bg-slate-100 text-slate-900 border-slate-100"
                  : "bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500 hover:text-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full sm:max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search clients..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-900"
        />
      </div>

      {/* Stats strip */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-700">
        {[
          { label: "Total Invoiced",   value: fmt(totalInvoiced) },
          { label: "Total Received",   value: fmt(totalReceived) },
          { label: "Outstanding",      value: fmt(totalOutstanding) },
        ].map(({ label, value }) => (
          <div key={label} className="px-6 py-4">
            <p className="text-[11px] text-slate-400 font-medium mb-1.5">{label}</p>
            <p className="text-xl font-bold text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Client cards */}
      <div className="space-y-3">
        {filtered.map((client, i) => {
          const c        = COLORS[i % COLORS.length];
          const initials = client.company === "—" ? "?" :
            client.company.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
          const isOpen   = expanded === client.company;
          const pctCollected = client.totalInvoiced > 0
            ? ((client.totalReceived / client.totalInvoiced) * 100).toFixed(0)
            : 0;

          return (
            <div
              key={client.company}
              className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden"
            >
              {/* Card top — clickable to expand */}
              <button
                onClick={() => setExpanded(isOpen ? null : client.company)}
                className="w-full text-left px-5 py-4 hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full ${c.avatar} ring-4 ${c.ring} flex items-center justify-center shrink-0 text-xs font-bold text-white`}>
                    {initials}
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">{client.company}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {client.customer && (
                        <span className="text-xs text-slate-400">{client.customer}</span>
                      )}
                      {client.paymentTerms && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${c.tag}`}>{client.paymentTerms}</span>
                      )}
                      {client.currency && client.currency !== "USD" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-slate-700 text-slate-400 border-slate-600">{client.currency}</span>
                      )}
                      <span className="text-[10px] text-slate-500">{client.invoiceCount} invoice{client.invoiceCount !== 1 ? "s" : ""} · {client.rowCount} line{client.rowCount !== 1 ? "s" : ""}</span>
                    </div>
                  </div>

                  {/* Amounts */}
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-sm font-bold text-slate-100">{fmtShort(client.totalInvoiced)}</p>
                    <p className="text-xs text-emerald-400 font-medium">{fmtShort(client.totalReceived)} received</p>
                    {client.outstanding > 0.01 && (
                      <p className="text-xs text-amber-400">{fmtShort(client.outstanding)} outstanding</p>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(pctCollected, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">{pctCollected}% collected</p>
              </button>

              {/* Expanded: invoice rows */}
              {isOpen && (
                <div className="border-t border-slate-700">
                  <div className="px-5 py-3 space-y-1.5 max-h-64 overflow-y-auto">
                    {client.invoiceRows
                      .sort((a, b) => (b.invoiceDate || "").localeCompare(a.invoiceDate || ""))
                      .map((row, j) => (
                        <div key={j} className="flex items-center gap-2 py-1.5 flex-wrap sm:flex-nowrap">
                          <span className="text-xs font-mono text-slate-500 shrink-0 min-w-[80px]">{row.invoice || "—"}</span>
                          <span className="text-xs text-slate-500 shrink-0 hidden sm:block">{row.invoiceDate || "—"}</span>
                          <span className="flex-1 text-xs text-slate-400 truncate min-w-0">{row.product || "—"}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${statusColor(row.status)}`}>{row.status || "—"}</span>
                          <span className="text-xs font-semibold text-slate-200 shrink-0 text-right">{fmt(row.total)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-slate-500 text-sm">No clients found.</div>
      )}
    </div>
  );
}
