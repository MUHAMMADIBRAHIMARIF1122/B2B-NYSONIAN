import { useEffect, useRef } from "react";
import { useData } from "../context/DataContext";
import { useCountUp } from "../hooks/useCountUp";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

// ── Reusable sub-components ───────────────────────────────────────────────────

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

// SVG donut chart — each segment drawn as a circle with stroke-dasharray trick
const STATUS_COLOR = {
  "Received":           "#34d399",
  "Paid":               "#60a5fa",
  "Partially Received": "#fbbf24",
  "Due":                "#fb923c",
};

function DonutChart({ segments }) {
  const r    = 42;
  const cx   = 60;
  const cy   = 60;
  const circ = 2 * Math.PI * r; // ≈ 263.89

  const total = segments.reduce((s, seg) => s + seg.value, 0);
  let cumLen  = 0;

  const arcs = segments.map((seg) => {
    const len        = total > 0 ? (seg.value / total) * circ : 0;
    const dasharray  = `${len.toFixed(3)} ${(circ - len).toFixed(3)}`;
    const dashoffset = -cumLen;
    cumLen += len;
    return { ...seg, dasharray, dashoffset };
  });

  return (
    <svg viewBox="0 0 120 120" className="w-32 h-32 shrink-0">
      {/* Background track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth="16" />
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth="16"
            strokeDasharray={arc.dasharray}
            strokeDashoffset={arc.dashoffset}
            strokeLinecap="butt"
          />
        ))}
      </g>
      {/* White center */}
      <circle cx={cx} cy={cy} r="30" fill="white" />
    </svg>
  );
}

// Mini paired bar chart for monthly revenue
function MiniBarChart({ data }) {
  const maxVal = Math.max(...data.map((d) => Math.max(d.fulfilled, d.received)), 1);
  const H      = 72;
  const cols   = data.length;
  const slotW  = 26;
  const W      = cols * slotW;
  const halfB  = 10; // half bar width

  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" preserveAspectRatio="none">
      {data.map((d, i) => {
        const fH  = (d.fulfilled / maxVal) * H;
        const rH  = (d.received  / maxVal) * H;
        const cx  = i * slotW + slotW / 2;
        return (
          <g key={d.month}>
            {/* Fulfilled bar (indigo) */}
            <rect
              x={cx - halfB}
              y={H - fH}
              width={halfB - 1}
              height={fH}
              fill="#a5b4fc"
              rx="1"
            />
            {/* Received bar (emerald) */}
            <rect
              x={cx + 1}
              y={H - rH}
              width={halfB - 1}
              height={rH}
              fill="#34d399"
              rx="1"
            />
            {/* Month label */}
            <text
              x={cx}
              y={H + 13}
              textAnchor="middle"
              fontSize="6.5"
              fill="#9ca3af"
            >
              {d.month}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { transactions, monthlyRevenue } = useData();

  const totalFulfilled  = monthlyRevenue.reduce((s, r) => s + r.fulfilled, 0);
  const totalReceived   = monthlyRevenue.reduce((s, r) => s + r.received,  0);
  const outstanding     = transactions.filter(t => t.status === "Partially Received").reduce((s, t) => s + t.total, 0);
  const badDebt         = transactions.filter(t => t.financeRemarks === "bad debt").reduce((s, t) => s + t.total, 0);
  const uniqueCompanies = [...new Set(transactions.map(t => t.company))].length;
  const uniqueInvoices  = [...new Set(transactions.map(t => t.invoice).filter(Boolean))].length;

  // ── Derived insights ──────────────────────────────────────────────────────
  const collectionRate = totalFulfilled > 0
    ? ((totalReceived / totalFulfilled) * 100).toFixed(1)
    : "0.0";

  const invoiceTotals = Object.values(
    transactions.reduce((acc, t) => {
      if (t.invoice && t.total > 0) acc[t.invoice] = (acc[t.invoice] || 0) + t.total;
      return acc;
    }, {})
  );
  const avgOrderValue = invoiceTotals.length > 0
    ? invoiceTotals.reduce((s, v) => s + v, 0) / invoiceTotals.length
    : 0;

  const atRiskCompanies = [...new Set(
    transactions
      .filter(t => t.status === "Due" || t.status === "Partially Received")
      .map(t => t.company)
  )];

  // ── Status breakdown ──────────────────────────────────────────────────────
  const byStatus = transactions.reduce((acc, t) => {
    if (!acc[t.status]) acc[t.status] = { count: 0, amount: 0 };
    acc[t.status].count++;
    acc[t.status].amount += t.total;
    return acc;
  }, {});

  const statusOrder = { "Received": 1, "Paid": 2, "Partially Received": 3, "Due": 4 };

  const donutSegments = Object.entries(byStatus)
    .sort((a, b) => (statusOrder[a[0]] || 9) - (statusOrder[b[0]] || 9))
    .map(([status, { count, amount }]) => ({
      label: status,
      count,
      value: amount,
      color: STATUS_COLOR[status] || "#d1d5db",
    }));

  const donutTotal = donutSegments.reduce((s, d) => s + d.value, 0);

  // ── Top clients ───────────────────────────────────────────────────────────
  const topCustomers = Object.entries(
    transactions.reduce((acc, t) => {
      acc[t.company] = (acc[t.company] || 0) + t.total;
      return acc;
    }, {})
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
        <PrimaryKPI label="Total Fulfilled"  rawValue={Math.round(totalFulfilled)} sub="Jun 2025 – Mar 2026"  accentBorder="border-l-indigo-400" valueCls="text-gray-900"   bgCls="bg-white"         delay={0}   />
        <PrimaryKPI label="Total Received"   rawValue={Math.round(totalReceived)}  sub="Payments collected"   accentBorder="border-l-emerald-400" valueCls="text-gray-900"   bgCls="bg-white"         delay={60}  />
        <PrimaryKPI label="Outstanding"      rawValue={Math.round(outstanding)}    sub="Partially received"   accentBorder="border-l-amber-400"   valueCls="text-amber-700"  bgCls="bg-amber-50/40"   delay={120} />
        <PrimaryKPI label="Bad Debt"         rawValue={Math.round(badDebt)}        sub="EDF Brands – TR-01"   accentBorder="border-l-red-400"     valueCls="text-red-600"    bgCls="bg-red-50/40"     delay={180} />
      </div>

      {/* Secondary stats */}
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

      {/* Insight mini cards */}
      <div className="grid grid-cols-3 gap-3">

        {/* Collection Rate */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-[11px] text-gray-400 font-medium mb-1">Collection Rate</p>
          <p className="text-[2rem] font-bold text-emerald-600 leading-none">{collectionRate}%</p>
          <p className="text-xs text-gray-400 mt-2">Of fulfilled revenue collected</p>
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(collectionRate, 100)}%` }}
            />
          </div>
        </div>

        {/* Avg Order Value */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-[11px] text-gray-400 font-medium mb-1">Avg Order Value</p>
          <p className="text-[2rem] font-bold text-indigo-600 leading-none">{fmt(Math.round(avgOrderValue))}</p>
          <p className="text-xs text-gray-400 mt-2">Per invoice · {invoiceTotals.length} invoices tracked</p>
        </div>

        {/* At-Risk Accounts */}
        <div className={`rounded-xl p-5 border ${atRiskCompanies.length > 0 ? "bg-orange-50/50 border-orange-200" : "bg-white border-gray-200"}`}>
          <p className="text-[11px] text-gray-400 font-medium mb-1">At-Risk Accounts</p>
          <p className={`text-[2rem] font-bold leading-none ${atRiskCompanies.length > 0 ? "text-orange-600" : "text-gray-800"}`}>
            {atRiskCompanies.length}
          </p>
          <p className="text-xs text-gray-400 mt-2">Due or Partially Received</p>
          {atRiskCompanies.length > 0 && (
            <p className="text-[11px] text-orange-500 mt-2 leading-snug">{atRiskCompanies.join(" · ")}</p>
          )}
        </div>
      </div>

      {/* Main panels row */}
      <div className="grid grid-cols-3 gap-4">

        {/* Payment Status — donut chart */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800">Payment Status</h3>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">Breakdown by revenue value</p>
          <div className="flex items-center gap-5">
            <DonutChart segments={donutSegments} />
            <div className="space-y-2.5 flex-1 min-w-0">
              {donutSegments.map(({ label, count, value, color }) => {
                const pct = donutTotal > 0 ? ((value / donutTotal) * 100).toFixed(0) : 0;
                return (
                  <div key={label}>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs text-gray-600 truncate flex-1">{label}</span>
                      <span className="text-xs font-semibold text-gray-700 shrink-0">{pct}%</span>
                    </div>
                    <p className="text-[10px] text-gray-400 pl-3.5">{fmt(value)} · {count} orders</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Top Clients */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800">Top Clients by Revenue</h3>
          <p className="text-xs text-gray-400 mt-0.5 mb-5">Total invoice value</p>
          <div className="space-y-4">
            {topCustomers.map(([company, amount], i) => (
              <BarRow key={company} company={company} amount={amount} max={topCustomers[0][1]} index={i} />
            ))}
          </div>
        </div>

        {/* Monthly Revenue Trend */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800">Monthly Revenue</h3>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">Fulfilled vs Received · last 10 months</p>
          <MiniBarChart data={monthlyRevenue} />
          <div className="flex items-center gap-5 mt-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-300" />
              <span className="text-[10px] text-gray-400">Fulfilled</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
              <span className="text-[10px] text-gray-400">Received</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
