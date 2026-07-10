import { createContext, useContext, useState } from "react";
import {
  transactions as initialTx,
  vendors as initialVendors,
  monthlyRevenue as staticMonthlyRevenue,
} from "../data/transactions";
import { inventory as initialInventory } from "../data/inventory";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [transactions, setTransactions] = useState(initialTx);
  const [inventory,    setInventory]    = useState(initialInventory);
  const vendors        = initialVendors;
  const monthlyRevenue = staticMonthlyRevenue;

  function addTransaction(newTx) {
    setTransactions(prev => [
      ...prev,
      { ...newTx, id: prev.length + 1, needsApproval: true, approvalStatus: "pending" },
    ]);
  }

  function removeTransactions(ids) {
    const set = new Set(ids);
    setTransactions(prev => prev.filter(t => !set.has(t.id)));
  }

  function updateTransaction(id, changes) {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
  }

  function approveTransaction(id) {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, approvalStatus: "approved", needsApproval: false } : t));
  }

  function holdTransaction(id) {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, approvalStatus: "held" } : t));
  }

  function setFulfillmentStatus(id, status, readyDate = null) {
    setTransactions(prev => prev.map(t =>
      t.id === id ? { ...t, fulfillment: status, fulfillmentReadyDate: readyDate } : t
    ));
  }

  function updateInventoryItem(id, changes) {
    setInventory(prev => prev.map(item => item.id === id ? { ...item, ...changes } : item));
  }

  function addInventoryItem(newItem) {
    setInventory(prev => [...prev, { ...newItem, id: prev.length + 1 }]);
  }

  return (
    <DataContext.Provider value={{ transactions, vendors, monthlyRevenue, addTransaction, removeTransactions, updateTransaction, approveTransaction, holdTransaction, setFulfillmentStatus, inventory, updateInventoryItem, addInventoryItem }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => useContext(DataContext);
