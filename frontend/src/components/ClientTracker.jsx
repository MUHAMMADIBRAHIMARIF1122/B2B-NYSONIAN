import { useState, useMemo } from "react";
import { useData } from "../context/DataContext";
import { Search } from "lucide-react";

const fmt      = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtShort = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);

const COLORS = [
  { avatar: "bg-indigo-500",  ring: "ring-indigo-100",  tag: "bg-indigo-50 text-indigo-600 border-indigo-100" },
  { avatar: "bg-emerald-500", ring: "ring-emerald-100", tag: "bg-emerald-50 text-emerald-600 border-emerald-100" },
  { avatar: "bg-violet-500",  ring: "ring-violet-100",  tag: "bg-violet-50 text-violet-600 border-violet-100" },
  { avatar: "bg-cyan-500",    ring: "ring-cyan-100",    tag: "bg-cyan-50 text-cyan-600 border-cyan-100" },
  { avatar: "bg-rose-500",    ring: "ring-rose-100",    tag: "bg-rose-50 text-rose-600 border-rose-100" },
  { avatar: "bg-amber-500",   ring: "ring-amber-100",   tag: "bg-amber-50 text-amber-600 border-amber-100" },
  { avatar: "bg-blue-500",    ring: "ring-blue-100",    tag: "bg-blue-50 text-blue-600 border-blue-100" },
];

function statusColor(status) {
  if (status === "Paid" || status === "Received") return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (status === "Partially Received")             return "text-amber-600  bg-amber-50  border-amber-200";
  if (status === "Due")                            return "text-red-600    bg-red-50    border-red-200";
  return "text-gray-500 bg-gray-50 border-gray-200";
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
          <h1 className="text-xl font-semibold text-gray-900">Client Tracker</h1>
          <p className="text-sm text-gray-400 mt-0.5">{filtered.length} client{filtered.length !== 1 ? "s" : ""} · all B2B transactions</p>
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
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full sm:max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search clients..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        />
      </div>

      {/* Stats strip */}
      <div className="bg-white border border-gray-200 rounded-xl grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
        {[
          { label: "Total Invoiced",   value: fmt(totalInvoiced) },
          { label: "Total Received",   value: fmt(totalReceived) },
          { label: "Outstanding",      value: fmt(totalOutstanding) },
        ].map(({ label, value }) => (
          <div key={label} className="px-6 py-4">
            <p className="text-[11px] text-gray-400 font-medium mb-1.5">{label}</p>
            <p className="text-xl font-bold text-gray-900">{value}</p>
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
              className="bg-white border border-gray-200 rounded-xl overflow-hidden"
            >
              {/* Card top — clickable to expand */}
              <button
                onClick={() => setExpanded(isOpen ? null : client.company)}
                className="w-full text-left px-5 py-4 hover:bg-gray-50/60 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full ${c.avatar} ring-4 ${c.ring} flex items-center justify-center shrink-0 text-xs font-bold text-white`}>
                    {initials}
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{client.company}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {client.customer && (
                        <span className="text-xs text-gray-400">{client.customer}</span>
                      )}
                      {client.paymentTerms && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${c.tag}`}>{client.paymentTerms}</span>
                      )}
                      {client.currency && client.currency !== "USD" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-gray-50 text-gray-500 border-gray-200">{client.currency}</span>
                      )}
                      <span className="text-[10px] text-gray-400">{client.invoiceCount} invoice{client.invoiceCount !== 1 ? "s" : ""} · {client.rowCount} line{client.rowCount !== 1 ? "s" : ""}</span>
                    </div>
                  </div>

                  {/* Amounts */}
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-sm font-bold text-gray-900">{fmtShort(client.totalInvoiced)}</p>
                    <p className="text-xs text-emerald-600 font-medium">{fmtShort(client.totalReceived)} received</p>
                    {client.outstanding > 0.01 && (
                      <p className="text-xs text-amber-600">{fmtShort(client.outstanding)} outstanding</p>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(pctCollected, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">{pctCollected}% collected</p>
              </button>

              {/* Expanded: invoice rows */}
              {isOpen && (
                <div className="border-t border-gray-100">
                  <div className="px-5 py-3 space-y-1.5 max-h-64 overflow-y-auto">
                    {client.invoiceRows
                      .sort((a, b) => (b.invoiceDate || "").localeCompare(a.invoiceDate || ""))
                      .map((row, j) => (
                        <div key={j} className="flex items-center gap-2 py-1.5 flex-wrap sm:flex-nowrap">
                          <span className="text-xs font-mono text-gray-400 shrink-0 min-w-[80px]">{row.invoice || "—"}</span>
                          <span className="text-xs text-gray-400 shrink-0 hidden sm:block">{row.invoiceDate || "—"}</span>
                          <span className="flex-1 text-xs text-gray-500 truncate min-w-0">{row.product || "—"}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${statusColor(row.status)}`}>{row.status || "—"}</span>
                          <span className="text-xs font-semibold text-gray-800 shrink-0 text-right">{fmt(row.total)}</span>
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
        <div className="text-center py-16 text-gray-400 text-sm">No clients found.</div>
      )}
    </div>
  );
}
