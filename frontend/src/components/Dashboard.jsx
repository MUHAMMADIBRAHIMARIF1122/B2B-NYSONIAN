import { useEffect, useRef } from "react";
import { useData } from "../context/DataContext";
import { useCountUp } from "../hooks/useCountUp";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function PrimaryKPI({ label, rawValue, sub, accentBorder, valueCls, bgCls = "", delay = 0 }) {
  const counted = useCountUp(rawValue, 850, delay);

  return (
    <div
      className={`kpi-card cursor-default rounded-xl p-5 border border-gray-200 border-l-[3px] ${accentBorder} ${bgCls}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[11px] text-gray-400 font-medium mb-3">{label}</p>
      <p className={`text-[1.9rem] font-bold tracking-tight leading-none ${valueCls}`}>
        {fmt(counted)}
      </p>
      {sub && <p className="text-[11px] text-gray-400 mt-2">{sub}</p>}
    </div>
  );
}

function BarRow({ company, amount, max, index }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.style.width = `${((amount / max) * 100).toFixed(1)}%`;
    }, 300 + index * 70);
    return () => clearTimeout(t);
  }, [amount, max, index]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-gray-600 truncate">{company}</span>
        <span className="text-sm font-semibold text-gray-900 ml-3 shrink-0">{fmt(amount)}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          ref={ref}
          className="h-full bg-indigo-400 rounded-full transition-all duration-700 ease-out"
          style={{ width: "0%" }}
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { transactions, monthlyRevenue } = useData();
  const totalFulfilled  = monthlyRevenue.reduce((s, r) => s + r.fulfilled, 0);
  const totalReceived   = monthlyRevenue.reduce((s, r) => s + r.received, 0);
  const outstanding     = transactions.filter(t => t.status === "Partially Received").reduce((s, t) => s + t.total, 0);
  const badDebt         = transactions.filter(t => t.financeRemarks === "bad debt").reduce((s, t) => s + t.total, 0);
  const uniqueCompanies = [...new Set(transactions.map(t => t.company))].length;
  const uniqueInvoices  = [...new Set(transactions.map(t => t.invoice).filter(Boolean))].length;

  const byStatus = transactions.reduce((acc, t) => {
    if (!acc[t.status]) acc[t.status] = { count: 0, amount: 0 };
    acc[t.status].count++;
    acc[t.status].amount += t.total;
    return acc;
  }, {});

  const statusOrder = { "Received": 1, "Paid": 2, "Partially Received": 3, "Due": 4 };
  const statusDot   = {
    "Received":           "bg-emerald-400",
    "Paid":               "bg-blue-400",
    "Partially Received": "bg-amber-400",
    "Due":                "bg-orange-400",
  };

  const topCustomers = Object.entries(
    transactions.reduce((acc, t) => { acc[t.company] = (acc[t.company] || 0) + t.total; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="space-y-5 max-w-screen-xl">

      {/* Heading */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Overview</h1>
        <p className="text-sm text-gray-400 mt-0.5">B2B Sales & Finance — Jun 2025 to Mar 2026</p>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <PrimaryKPI
          label="Total Fulfilled"
          rawValue={Math.round(totalFulfilled)}
          sub="Jun 2025 – Mar 2026"
          accentBorder="border-l-indigo-400"
          valueCls="text-gray-900"
          bgCls="bg-white"
          delay={0}
        />
        <PrimaryKPI
          label="Total Received"
          rawValue={Math.round(totalReceived)}
          sub="Payments collected"
          accentBorder="border-l-emerald-400"
          valueCls="text-gray-900"
          bgCls="bg-white"
          delay={60}
        />
        <PrimaryKPI
          label="Outstanding"
          rawValue={Math.round(outstanding)}
          sub="Partially received"
          accentBorder="border-l-amber-400"
          valueCls="text-amber-700"
          bgCls="bg-amber-50/40"
          delay={120}
        />
        <PrimaryKPI
          label="Bad Debt"
          rawValue={Math.round(badDebt)}
          sub="EDF Brands – TR-01"
          accentBorder="border-l-red-400"
          valueCls="text-red-600"
          bgCls="bg-red-50/40"
          delay={180}
        />
      </div>

      {/* Secondary stats — one card, three columns */}
      <div className="bg-white border border-gray-200 rounded-xl grid grid-cols-3 divide-x divide-gray-100">
        {[
          { label: "B2B Companies", value: uniqueCompanies,     sub: "Unique clients"  },
          { label: "Invoices",      value: uniqueInvoices,      sub: "Unique invoices" },
          { label: "Line Items",    value: transactions.length, sub: "Total rows"      },
        ].map(({ label, value, sub }) => (
          <div key={label} className="px-6 py-4">
            <p className="text-[11px] text-gray-400 font-medium mb-1.5">{label}</p>
            <p className="text-2xl font-bold text-gray-800">{value.toLocaleString()}</p>
            <p className="text-[11px] text-gray-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Panels */}
      <div className="grid grid-cols-2 gap-4">
        {/* Payment status */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800">Payment Status</h3>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">{transactions.length} line items</p>
          <div>
            {Object.entries(byStatus)
              .sort((a, b) => (statusOrder[a[0]] || 9) - (statusOrder[b[0]] || 9))
              .map(([status, { count, amount }]) => (
                <div key={status} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[status] || "bg-gray-300"}`} />
                    <span className="text-sm text-gray-700">{status}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-400">{count} orders</span>
                    <span className="text-sm font-semibold text-gray-900 w-24 text-right">{fmt(amount)}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Top clients */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800">Top Clients by Revenue</h3>
          <p className="text-xs text-gray-400 mt-0.5 mb-5">Total invoice value</p>
          <div className="space-y-4">
            {topCustomers.map(([company, amount], i) => (
              <BarRow key={company} company={company} amount={amount} max={topCustomers[0][1]} index={i} />
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
