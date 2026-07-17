export default function StatusBadge({ status }) {
  const styles = {
    "Received":           "bg-emerald-900/40 text-emerald-300 border border-emerald-700",
    "Paid":               "bg-blue-900/40 text-blue-300 border border-blue-700",
    "Partially Received": "bg-amber-900/40 text-amber-300 border border-amber-700",
    "Due":                "bg-orange-900/40 text-orange-300 border border-orange-700",
    "Bad Debt":           "bg-red-900/40 text-red-300 border border-red-700",
  };
  const cls = styles[status] || "bg-slate-700/40 text-slate-400 border border-slate-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
