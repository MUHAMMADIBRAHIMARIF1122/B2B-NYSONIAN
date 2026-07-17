import { useState } from "react";
import { useData } from "./context/DataContext";
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
  const { loading } = useData();
  const [activeTab,   setActiveTab]   = useState(() => localStorage.getItem("activeTab") || "dashboard");
  const [pageKey,     setPageKey]     = useState(0);
  // Default: open on desktop, closed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const active = TABS.find(t => t.id === activeTab);

  function switchTab(id) {
    setActiveTab(id);
    localStorage.setItem("activeTab", id);
    setPageKey(k => k + 1);
    // Auto-close sidebar on mobile after navigation
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-950">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar
          Mobile:  fixed overlay (slides in/out via width)
          Desktop: sticky inline (affects layout flow via width) */}
      <aside
        className="fixed md:sticky top-0 left-0 z-30 h-screen flex flex-col bg-slate-900 border-r border-slate-800 overflow-hidden transition-all duration-250 ease-in-out md:shrink-0"
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
                <p className="text-[13px] font-semibold text-slate-100 leading-tight whitespace-nowrap">Nysonian Inc.</p>
                <p className="text-[10px] text-slate-400 whitespace-nowrap">Finance</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isAdd = tab.id === "add";
              return (
                <div key={tab.id}>
                  {isAdd && <div className="border-t border-slate-800 my-2" />}
                  <button
                    onClick={() => switchTab(tab.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? isAdd
                          ? "bg-indigo-600 text-white"
                          : "bg-indigo-900/50 text-indigo-300"
                        : isAdd
                          ? "text-indigo-400 hover:bg-indigo-900/30 border border-dashed border-indigo-700"
                          : "text-slate-400 hover:text-slate-100 hover:bg-slate-700"
                    }`}
                  >
                    <Icon size={14} className={isActive ? (isAdd ? "text-white" : "text-indigo-400") : isAdd ? "text-indigo-400" : "text-slate-500"} />
                    <span className="flex-1 text-left">{tab.label}</span>
                    {isActive && !isAdd && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />}
                  </button>
                </div>
              );
            })}
          </nav>

          <div className="px-4 py-4 mt-auto">
            <p className="text-[11px] text-slate-500">Data as of Jul 2025</p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-12 flex items-center px-4 border-b border-slate-800 bg-slate-900 gap-3 shrink-0">
          {/* Menu button — always visible on mobile, visible on desktop when sidebar closed */}
          {(!sidebarOpen) && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors shrink-0"
            >
              <Menu size={15} />
            </button>
          )}
          <div className="flex items-center gap-1.5 text-[13px] min-w-0">
            <span className="text-slate-500 shrink-0 hidden sm:block">Nysonian Inc.</span>
            <ChevronRight size={12} className="text-slate-600 shrink-0 hidden sm:block" />
            <span className="text-slate-100 font-medium truncate">{active?.label}</span>
          </div>
        </header>

        {loading && (
          <div className="h-0.5 w-full bg-slate-800 overflow-hidden shrink-0">
            <div className="h-full bg-indigo-400 animate-pulse w-full" />
          </div>
        )}

        <main key={pageKey} className="flex-1 overflow-auto p-4 sm:p-6 page-enter">
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
