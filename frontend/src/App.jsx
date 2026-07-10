import { useState } from "react";
import Dashboard from "./components/Dashboard";
import TransactionsTable from "./components/TransactionsTable";
import RevenueChart from "./components/RevenueChart";
import ClientTracker from "./components/ClientTracker";
import AddB2B from "./components/AddB2B";
import FinanceCheck from "./components/FinanceCheck";
import Fulfillment from "./components/Fulfillment";
import {
  LayoutDashboard, TableProperties, BarChart3, Users2,
  Building2, ChevronRight, PanelLeftClose, Menu, PlusCircle, ShieldCheck, Package,
} from "lucide-react";

const TABS = [
  { id: "dashboard",    label: "Dashboard",       icon: LayoutDashboard },
  { id: "transactions", label: "Transactions",     icon: TableProperties },
  { id: "revenue",      label: "Revenue Chart",    icon: BarChart3 },
  { id: "clients",      label: "Client Tracker",   icon: Users2 },
  { id: "finance",      label: "Finance Check",    icon: ShieldCheck },
  { id: "fulfillment",  label: "Fulfillment",      icon: Package },
  { id: "add",          label: "Add B2B",          icon: PlusCircle },
];

export default function App() {
  const [activeTab,   setActiveTab]   = useState("dashboard");
  const [pageKey,     setPageKey]     = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const active = TABS.find(t => t.id === activeTab);

  function switchTab(id) {
    if (id === activeTab) return;
    setActiveTab(id);
    setPageKey(k => k + 1);
  }

  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* Sidebar */}
      <aside
        className="shrink-0 flex flex-col bg-white border-r border-gray-200 overflow-hidden transition-all duration-250 ease-in-out"
        style={{ width: sidebarOpen ? "216px" : "0px" }}
      >
        <div className="w-[216px] flex flex-col flex-1">
          {/* Logo */}
          <div className="px-4 pt-5 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                <Building2 size={13} className="text-white" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-900 leading-tight whitespace-nowrap">Nysonian Inc.</p>
                <p className="text-[10px] text-gray-400 whitespace-nowrap">Finance</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2 space-y-0.5">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isAdd = tab.id === "add";
              return (
                <div key={tab.id}>
                  {isAdd && <div className="border-t border-gray-100 my-2" />}
                  <button
                    onClick={() => switchTab(tab.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? isAdd
                          ? "bg-indigo-600 text-white"
                          : "bg-indigo-50 text-indigo-700"
                        : isAdd
                          ? "text-indigo-600 hover:bg-indigo-50 border border-dashed border-indigo-200"
                          : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                    }`}
                  >
                    <Icon size={14} className={isActive ? (isAdd ? "text-white" : "text-indigo-500") : isAdd ? "text-indigo-500" : "text-gray-400"} />
                    <span className="flex-1 text-left">{tab.label}</span>
                    {isActive && !isAdd && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />}
                  </button>
                </div>
              );
            })}
          </nav>

          <div className="px-4 py-4 mt-auto">
            <p className="text-[11px] text-gray-300">Data as of Jul 2025</p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-12 flex items-center px-5 border-b border-gray-200 bg-white gap-3 shrink-0">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors mr-1"
            >
              <Menu size={15} />
            </button>
          )}
          <div className="flex items-center gap-1.5 text-[13px]">
            <span className="text-gray-400">Nysonian Inc.</span>
            <ChevronRight size={12} className="text-gray-300" />
            <span className="text-gray-800 font-medium">{active?.label}</span>
          </div>
        </header>

        <main key={pageKey} className="flex-1 overflow-auto p-6 page-enter">
          {activeTab === "dashboard"    && <Dashboard />}
          {activeTab === "transactions" && <TransactionsTable />}
          {activeTab === "revenue"      && <RevenueChart />}
          {activeTab === "clients"      && <ClientTracker />}
          {activeTab === "finance"      && <FinanceCheck />}
          {activeTab === "fulfillment"  && <Fulfillment />}
          {activeTab === "add"          && <AddB2B />}
        </main>
      </div>
    </div>
  );
}
