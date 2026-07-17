import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Area, AreaChart
} from "recharts";
import { useData } from "../context/DataContext";
import { useState } from "react";

const fmt  = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 0 }).format(v);
const fmtFull = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-lg">
      <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-3 mb-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
          <span className="text-xs text-gray-500">{p.name}:</span>
          <span className="text-xs font-bold text-gray-900">{fmtFull(p.value)}</span>
        </div>
      ))}
      {payload.length === 2 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Difference</span>
            <span className={`text-xs font-bold ${payload[1].value >= payload[0].value ? "text-emerald-600" : "text-red-500"}`}>
              {fmtFull(payload[1].value - payload[0].value)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default function RevenueChart() {
  const { monthlyRevenue } = useData();
  const [chartType, setChartType] = useState("bar");
  const totalFulfilled = monthlyRevenue.reduce((s, r) => s + r.fulfilled, 0);
  const totalReceived  = monthlyRevenue.reduce((s, r) => s + r.received, 0);
  const gap = totalReceived - totalFulfilled;

  return (
    <div className="space-y-6 max-w-screen-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Revenue Chart</h1>
          <p className="text-sm text-gray-400 mt-0.5">Monthly fulfilled vs. received — Jun 2025 to Mar 2026</p>
        </div>
        <div className="flex gap-2">
          {["bar", "area"].map(type => (
            <button
              key={type}
              onClick={() => setChartType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize border ${
                chartType === type
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                  : "text-gray-500 hover:text-gray-700 bg-white border-gray-200 hover:bg-gray-50"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Total Fulfilled</p>
          <p className="text-2xl font-bold text-indigo-600">{fmt(totalFulfilled)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Total Received</p>
          <p className="text-2xl font-bold text-emerald-600">{fmt(totalReceived)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Net Difference</p>
          <p className={`text-2xl font-bold ${gap >= 0 ? "text-emerald-600" : "text-red-500"}`}>{gap >= 0 ? "+" : ""}{fmt(gap)}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <div className="overflow-x-auto">
          <div style={{ minWidth: 700 }}>
            <ResponsiveContainer width="100%" height={360}>
              {chartType === "bar" ? (
                <BarChart data={monthlyRevenue} margin={{ top: 8, right: 24, left: 0, bottom: 4 }} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#6b7280", fontSize: 12, fontWeight: 500 }}
                    axisLine={false} tickLine={false}
                    interval={0}
                  />
                  <YAxis tickFormatter={fmt} tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(99,102,241,0.04)" }} />
                  <Legend
                    wrapperStyle={{ paddingTop: "16px" }}
                    formatter={(v) => <span style={{ color: "#6b7280", fontSize: "12px" }}>{v}</span>}
                  />
                  <Bar dataKey="fulfilled" name="Fulfilled $" fill="#6366f1" radius={[5, 5, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="received"  name="Received $"  fill="#22c55e" radius={[5, 5, 0, 0]} maxBarSize={32} />
                </BarChart>
              ) : (
                <AreaChart data={monthlyRevenue} margin={{ top: 8, right: 24, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="gFulfilled" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gReceived" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#6b7280", fontSize: 12, fontWeight: 500 }}
                    axisLine={false} tickLine={false}
                    interval={0}
                  />
                  <YAxis tickFormatter={fmt} tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(v) => <span style={{ color: "#6b7280", fontSize: "12px" }}>{v}</span>} />
                  <Area type="monotone" dataKey="fulfilled" name="Fulfilled $" stroke="#6366f1" strokeWidth={2.5} fill="url(#gFulfilled)" dot={{ fill: "#6366f1", r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                  <Area type="monotone" dataKey="received"  name="Received $"  stroke="#22c55e" strokeWidth={2.5} fill="url(#gReceived)"  dot={{ fill: "#22c55e", r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Monthly table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Monthly Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider font-semibold">Month</th>
              <th className="px-6 py-3 text-right text-xs text-gray-500 uppercase tracking-wider font-semibold">Fulfilled $</th>
              <th className="px-6 py-3 text-right text-xs text-gray-500 uppercase tracking-wider font-semibold">Received $</th>
              <th className="px-6 py-3 text-right text-xs text-gray-500 uppercase tracking-wider font-semibold">Difference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {monthlyRevenue.map((row, i) => {
              const diff = row.received - row.fulfilled;
              return (
                <tr key={row.month} className={`tr-hover ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{row.month}</td>
                  <td className="px-6 py-3 text-sm text-right text-indigo-600 font-medium">{fmtFull(row.fulfilled)}</td>
                  <td className="px-6 py-3 text-sm text-right text-emerald-600 font-medium">{fmtFull(row.received)}</td>
                  <td className={`px-6 py-3 text-sm text-right font-semibold ${diff >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {diff >= 0 ? "+" : ""}{fmtFull(diff)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50">
              <td className="px-6 py-3 text-sm font-bold text-gray-900">Total</td>
              <td className="px-6 py-3 text-sm font-bold text-right text-indigo-600">{fmtFull(totalFulfilled)}</td>
              <td className="px-6 py-3 text-sm font-bold text-right text-emerald-600">{fmtFull(totalReceived)}</td>
              <td className={`px-6 py-3 text-sm font-bold text-right ${gap >= 0 ? "text-emerald-600" : "text-red-500"}`}>{gap >= 0 ? "+" : ""}{fmtFull(gap)}</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
}
