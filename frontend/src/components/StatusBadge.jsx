export default function StatusBadge({ status }) {
  const styles = {
    "Received":           "bg-green-50 text-green-700 border border-green-200",
    "Paid":               "bg-blue-50 text-blue-700 border border-blue-200",
    "Partially Received": "bg-yellow-50 text-yellow-700 border border-yellow-200",
    "Due":                "bg-orange-50 text-orange-700 border border-orange-200",
    "Bad Debt":           "bg-red-50 text-red-700 border border-red-200",
  };
  const cls = styles[status] || "bg-gray-100 text-gray-600 border border-gray-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
