import { useState, useMemo } from "react";
import { useData } from "../context/DataContext";
import StatusBadge from "./StatusBadge";
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, Trash2, X, Pencil, Check } from "lucide-react";

const fmt = (n) =>
  n === 0
    ? <span className="text-gray-300 text-xs">Gift</span>
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const ALL = "All";

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

const ei = "w-full min-w-[70px] bg-transparent border-b border-indigo-200 focus:border-indigo-500 outline-none text-sm py-0.5 placeholder-gray-300";
const es = "w-full min-w-[80px] bg-transparent border-b border-indigo-200 focus:border-indigo-500 outline-none text-sm py-0.5 cursor-pointer";

function EditInput({ val, onChange, type = "text", min }) {
  return <input type={type} value={val ?? ""} onChange={e => onChange(e.target.value)} min={min} className={ei} />;
}
function EditSelect({ val, onChange, options }) {
  return (
    <select value={val ?? ""} onChange={e => onChange(e.target.value)} className={es}>
      {options.map(o => <option key={o} value={o}>{o || "—"}</option>)}
    </select>
  );
}

export default function TransactionsTable() {
  const { transactions, removeTransactions, updateTransaction } = useData();

  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState(ALL);
  const [companyFilter, setCompanyFilter] = useState(ALL);
  const [sortKey,       setSortKey]       = useState("id");
  const [sortDir,       setSortDir]       = useState("asc");
  const [selected,      setSelected]      = useState(new Set());
  const [confirmDel,    setConfirmDel]    = useState(false);
  const [editingId,     setEditingId]     = useState(null);
  const [editForm,      setEditForm]      = useState({});

  const companies = useMemo(() => [ALL, ...new Set(transactions.map(t => t.company))], [transactions]);
  const statuses  = useMemo(() => [ALL, ...new Set(transactions.map(t => t.status))],  [transactions]);

  const filtered = useMemo(() => {
    let rows = transactions;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.customer.toLowerCase().includes(q) ||
        r.company.toLowerCase().includes(q) ||
        r.product.toLowerCase().includes(q) ||
        r.invoice.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q)
      );
    }
    if (statusFilter  !== ALL) rows = rows.filter(r => r.status  === statusFilter);
    if (companyFilter !== ALL) rows = rows.filter(r => r.company === companyFilter);
    return [...rows].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [search, statusFilter, companyFilter, sortKey, sortDir, transactions]);

  const totalAmount = filtered.reduce((s, r) => s + r.total, 0);
  const allChecked  = filtered.length > 0 && filtered.every(r => selected.has(r.id));
  const someChecked = filtered.some(r => selected.has(r.id));
  const selCount    = [...selected].filter(id => filtered.some(r => r.id === id)).length;
  const oneSelected = selCount === 1;

  // edit helpers
  const ef = (field) => editForm[field] ?? "";
  const setEf = (field) => (val) => setEditForm(f => ({ ...f, [field]: val }));
  const editTotal = (parseFloat(editForm.qty) || 0) * (parseFloat(editForm.unitPrice) || 0);

  function startEdit() {
    const id  = [...selected].find(id => filtered.some(r => r.id === id));
    const row = transactions.find(t => t.id === id);
    setEditingId(id);
    setEditForm({ ...row });
    setConfirmDel(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  function saveEdit() {
    updateTransaction(editingId, { ...editForm, total: editTotal });
    setEditingId(null);
    setEditForm({});
    setSelected(new Set());
  }

  function toggleRow(id) {
    if (editingId) return;
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    setConfirmDel(false);
  }

  function toggleAll() {
    if (editingId) return;
    if (allChecked) {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(r => n.delete(r.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(r => n.add(r.id)); return n; });
    }
    setConfirmDel(false);
  }

  function clearSelection() { setSelected(new Set()); setConfirmDel(false); }

  function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return; }
    removeTransactions([...selected]);
    setSelected(new Set());
    setConfirmDel(false);
  }

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <ChevronsUpDown size={11} className="text-gray-300 ml-0.5 inline" />;
    return sortDir === "asc"
      ? <ChevronUp   size={11} className="text-indigo-500 ml-0.5 inline" />
      : <ChevronDown size={11} className="text-indigo-500 ml-0.5 inline" />;
  }

  const Th = ({ col, label, right }) => (
    <th onClick={() => handleSort(col)}
      className={`px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 whitespace-nowrap select-none transition-colors ${right ? "text-right" : "text-left"}`}>
      {label}<SortIcon col={col} />
    </th>
  );

  const selectCls = "px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400";

  return (
    <div className="space-y-4 max-w-screen-xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Transactions</h1>
        <p className="text-sm text-gray-400 mt-0.5">All B2B invoice line items</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search customer, product, SKU, invoice..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
        </div>
        <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className={selectCls}>
          {companies.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectCls}>
          {statuses.map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="flex items-center gap-2 text-sm sm:ml-auto">
          <span className="text-gray-400">{filtered.length} rows</span>
          <span className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 font-semibold">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalAmount)}
          </span>
        </div>
      </div>

      {/* Toolbar — edit mode */}
      {editingId && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
          <span className="text-sm font-medium text-indigo-700">Editing row — make your changes directly in the table</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={saveEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
              <Check size={13} /> Save
            </button>
            <button onClick={cancelEdit}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-white transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Toolbar — selection mode */}
      {someChecked && !editingId && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-white border border-gray-200 rounded-lg shadow-sm">
          <span className="text-sm font-medium text-gray-700">
            {selCount} row{selCount !== 1 ? "s" : ""} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            {oneSelected && !confirmDel && (
              <button onClick={startEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                <Pencil size={13} /> Edit row
              </button>
            )}
            {confirmDel ? (
              <>
                <span className="text-sm text-red-600 font-medium">Delete {selCount} row{selCount !== 1 ? "s" : ""}? This can't be undone.</span>
                <button onClick={handleDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors">
                  <Trash2 size={13} /> Yes, delete
                </button>
                <button onClick={() => setConfirmDel(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={handleDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                  <Trash2 size={13} /> Delete
                </button>
                <button onClick={clearSelection} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-220px)]">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50 sticky top-0 z-10 shadow-[0_1px_0_0_#e5e7eb]">
              <tr>
                <th className="pl-4 pr-2 py-3 w-8">
                  <input type="checkbox" checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600 cursor-pointer" />
                </th>
                <Th col="customer"       label="Customer" />
                <Th col="company"        label="Company" />
                <Th col="product"        label="Product" />
                <Th col="invoice"        label="INV #" />
                <Th col="invoiceDate"    label="Date" />
                <Th col="sku"            label="SKU" />
                <Th col="qty"            label="Qty"     right />
                <Th col="unitPrice"      label="Unit $"  right />
                <Th col="total"          label="Total $" right />
                <Th col="paymentTerms"   label="Terms" />
                <Th col="dueDate"        label="Due Date" />
                <Th col="orderNo"        label="Order #" />
                <Th col="status"         label="Status" />
                <Th col="paymentRecDate" label="Rec. Date" />
                <Th col="shipmentDate"   label="Ship Date" />
                <Th col="delivery"       label="Delivery" />
                <Th col="fulfilledMonth" label="Fulfilled Mo." />
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Remarks</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Finance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((row, i) => {
                const isSelected = selected.has(row.id);
                const isEditing  = editingId === row.id;

                if (isEditing) {
                  return (
                    <tr key={row.id} className="bg-indigo-50/70 border-l-2 border-l-indigo-400">
                      <td className="pl-4 pr-2 py-2">
                        <div className="w-3.5 h-3.5 rounded bg-indigo-400 flex items-center justify-center">
                          <Pencil size={8} className="text-white" />
                        </div>
                      </td>
                      <td className="px-3 py-2"><EditInput val={ef("customer")}    onChange={setEf("customer")} /></td>
                      <td className="px-3 py-2"><EditInput val={ef("company")}     onChange={setEf("company")} /></td>
                      <td className="px-3 py-2"><EditInput val={ef("product")}     onChange={setEf("product")} /></td>
                      <td className="px-3 py-2"><EditInput val={ef("invoice")}     onChange={setEf("invoice")} /></td>
                      <td className="px-3 py-2"><EditInput val={ef("invoiceDate")} onChange={setEf("invoiceDate")} type="date" /></td>
                      <td className="px-3 py-2"><EditInput val={ef("sku")}         onChange={setEf("sku")} /></td>
                      <td className="px-3 py-2"><EditInput val={ef("qty")}         onChange={setEf("qty")} type="number" min="0" /></td>
                      <td className="px-3 py-2"><EditInput val={ef("unitPrice")}   onChange={setEf("unitPrice")} type="number" min="0" /></td>
                      <td className="px-3 py-2 text-sm font-semibold text-indigo-600 whitespace-nowrap">
                        {editTotal > 0
                          ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(editTotal)
                          : <span className="text-gray-300 font-normal text-xs">auto</span>}
                      </td>
                      <td className="px-3 py-2"><EditSelect val={ef("paymentTerms")} onChange={setEf("paymentTerms")} options={PAYMENT_TERMS} /></td>
                      <td className="px-3 py-2"><EditInput val={ef("dueDate")}       onChange={setEf("dueDate")} type="date" /></td>
                      <td className="px-3 py-2"><EditInput val={ef("orderNo")}       onChange={setEf("orderNo")} /></td>
                      <td className="px-3 py-2"><EditSelect val={ef("status")}       onChange={setEf("status")} options={STATUSES} /></td>
                      <td className="px-3 py-2"><EditInput val={ef("paymentRecDate")} onChange={setEf("paymentRecDate")} type="date" /></td>
                      <td className="px-3 py-2"><EditInput val={ef("shipmentDate")}  onChange={setEf("shipmentDate")} type="date" /></td>
                      <td className="px-3 py-2"><EditSelect val={ef("delivery")}     onChange={setEf("delivery")} options={DELIVERY} /></td>
                      <td className="px-3 py-2"><EditSelect val={ef("fulfilledMonth")} onChange={setEf("fulfilledMonth")} options={MONTHS} /></td>
                      <td className="px-3 py-2"><EditInput val={ef("remarks")}       onChange={setEf("remarks")} /></td>
                      <td className="px-3 py-2"><EditInput val={ef("financeRemarks")} onChange={setEf("financeRemarks")} /></td>
                    </tr>
                  );
                }

                return (
                  <tr key={row.id}
                    className={`tr-hover ${isSelected ? "bg-indigo-50/60" : i % 2 === 0 ? "bg-white" : "bg-gray-50/50"} ${editingId ? "opacity-40 pointer-events-none" : ""}`}>
                    <td className="pl-4 pr-2 py-2.5">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleRow(row.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600 cursor-pointer" />
                    </td>
                    <td className="px-3 py-2.5 text-sm font-medium text-gray-900 whitespace-nowrap">{row.customer}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-600 whitespace-nowrap">{row.company}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-600 max-w-[170px] truncate" title={row.product}>{row.product || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-indigo-600 whitespace-nowrap font-semibold">{row.invoice}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-500 whitespace-nowrap">{row.invoiceDate}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-gray-400 whitespace-nowrap">{row.sku}</td>
                    <td className="px-3 py-2.5 text-sm text-right text-gray-700">{row.qty}</td>
                    <td className="px-3 py-2.5 text-sm text-right text-gray-600">{row.unitPrice > 0 ? `$${row.unitPrice}` : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-semibold text-gray-900 whitespace-nowrap">{fmt(row.total)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{row.paymentTerms}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{row.dueDate}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-gray-400 whitespace-nowrap">{row.orderNo || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><StatusBadge status={row.status} /></td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{row.paymentRecDate || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{row.shipmentDate || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{row.delivery}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{row.fulfilledMonth || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 max-w-[130px] truncate" title={row.remarks}>{row.remarks || "—"}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                      {row.financeRemarks
                        ? <span className={row.financeRemarks === "bad debt" ? "text-red-600 font-semibold" : "text-amber-600"}>{row.financeRemarks}</span>
                        : <span className="text-gray-200">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-14 text-gray-400 text-sm">No results found.</div>
        )}
      </div>
    </div>
  );
}
