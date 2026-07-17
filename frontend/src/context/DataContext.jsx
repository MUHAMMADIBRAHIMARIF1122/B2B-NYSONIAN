import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { transactions as staticTx } from "../data/transactions";
import { inventory as initialInventory } from "../data/inventory";

const API_KEY = import.meta.env.VITE_API_KEY;
const DataContext = createContext(null);

function mapRow(r) {
  return {
    id:              r.id,
    customer:        r.customer       || "",
    company:         r.company        || "",
    product:         r.product        || "",
    invoice:         r.invoice        || "",
    invoiceDate:     r.invoice_date   || null,
    sku:             r.sku            || "",
    qty:             Number(r.qty)    || 0,
    unitPrice:       Number(r.unit_price) || 0,
    total:           Number(r.total)  || 0,
    paymentTerms:    r.payment_terms  || "",
    dueDate:         r.due_date       || null,
    orderNo:         r.order_no       || "",
    status:          r.status         || "",
    paymentRecDate:  r.payment_rec_date  || null,
    shipmentDate:    r.shipment_date  || null,
    fulfilledMonth:  r.fulfilled_month  || "",
    paymentRecMonth: r.payment_rec_month || "",
    delivery:        r.delivery       || "Company",
    remarks:         r.remarks        || "",
    financeRemarks:  r.finance_remarks || "",
    closedWon:       r.closed_won     || "",
    currency:        r.currency       || "USD",
    fulfillment:          r.fulfillment_status     || '',
    fulfillmentReadyDate: r.fulfillment_ready_date || null,
  };
}

// "July-2025" → Date for sorting
function parseMonthKey(m) {
  const [mon, yr] = m.split("-");
  return new Date(`${mon} 1, ${yr}`);
}

export function DataProvider({ children }) {
  const [dbTx,               setDbTx]               = useState([]);
  const [fulfillmentOverrides, setFulfillmentOverrides] = useState({});
  const [inventory,          setInventory]          = useState(initialInventory);
  const [loading,            setLoading]            = useState(true);

  function fetchEntries() {
    setLoading(true);
    fetch("/api/b2b-entries", { headers: { "x-api-key": API_KEY } })
      .then(r => r.json())
      .then(data => { if (data.ok) setDbTx(data.entries.map(mapRow)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchEntries(); }, []);

  // Merge static + DB: DB rows take precedence (they have authoritative IDs)
  // Apply in-memory fulfillment overrides on top (works for both static and DB rows)
  const transactions = useMemo(() => {
    const dbIds = new Set(dbTx.map(t => t.id));
    const staticOnly = staticTx.filter(t => !dbIds.has(t.id));
    const all = [...staticOnly, ...dbTx];
    if (Object.keys(fulfillmentOverrides).length === 0) return all;
    return all.map(t => {
      const ov = fulfillmentOverrides[t.id];
      return ov ? { ...t, ...ov } : t;
    });
  }, [dbTx, fulfillmentOverrides]);

  // Compute monthly revenue from merged transactions (last 10 months)
  const monthlyRevenue = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      if (t.fulfilledMonth) {
        if (!map[t.fulfilledMonth]) map[t.fulfilledMonth] = { key: t.fulfilledMonth, fulfilled: 0, received: 0 };
        map[t.fulfilledMonth].fulfilled += t.total;
      }
      if (t.paymentRecMonth) {
        if (!map[t.paymentRecMonth]) map[t.paymentRecMonth] = { key: t.paymentRecMonth, fulfilled: 0, received: 0 };
        map[t.paymentRecMonth].received += t.total;
      }
    });
    return Object.values(map)
      .sort((a, b) => parseMonthKey(a.key) - parseMonthKey(b.key))
      .slice(-10)
      .map(d => ({
        month:     d.key.split("-")[0].slice(0, 3), // "July-2025" → "Jul"
        fulfilled: d.fulfilled,
        received:  d.received,
      }));
  }, [transactions]);

  // Re-fetch after a new entry is submitted so it appears immediately
  function refreshEntries() { fetchEntries(); }

  function addTransaction() { /* no-op — DB is source of truth; call refreshEntries() after POST */ }

  function removeTransactions(ids) {
    // Optimistic update — remove from UI immediately
    const set = new Set(ids);
    setDbTx(prev => prev.filter(t => !set.has(t.id)));
    // Persist to DB — only delete DB rows (static rows have no server record)
    const dbIds = ids.filter(id => dbTx.some(t => t.id === id));
    if (dbIds.length > 0) {
      fetch("/api/b2b-entries", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ ids: dbIds }),
      }).catch(() => {});
    }
  }

  function updateTransaction(id, changes) {
    setDbTx(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
  }

  function approveTransaction(id) {
    setDbTx(prev => prev.map(t => t.id === id ? { ...t, approvalStatus: "approved", needsApproval: false } : t));
  }

  function holdTransaction(id) {
    setDbTx(prev => prev.map(t => t.id === id ? { ...t, approvalStatus: "held" } : t));
  }

  function setFulfillmentStatus(id, status, readyDate = null) {
    setFulfillmentOverrides(prev => ({
      ...prev,
      [id]: { fulfillment: status, fulfillmentReadyDate: readyDate },
    }));
  }

  function updateInventoryItem(id, changes) {
    setInventory(prev => prev.map(item => item.id === id ? { ...item, ...changes } : item));
  }

  function addInventoryItem(newItem) {
    setInventory(prev => [...prev, { ...newItem, id: prev.length + 1 }]);
  }

  return (
    <DataContext.Provider value={{
      transactions, monthlyRevenue, loading,
      addTransaction, refreshEntries, removeTransactions, updateTransaction,
      approveTransaction, holdTransaction, setFulfillmentStatus,
      inventory, updateInventoryItem, addInventoryItem,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => useContext(DataContext);
