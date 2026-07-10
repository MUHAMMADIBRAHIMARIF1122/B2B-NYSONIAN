import { useState, useMemo } from "react";
import { useData } from "../context/DataContext";
import {
  ShieldCheck, ShieldAlert, ShieldX, CheckCircle2, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Check, X, Building2,
  User, FileText, Calendar,
} from "lucide-react";
import StatusBadge from "./StatusBadge";

const fmt = (n) =>
  n === 0
    ? <span className="text-gray-300 text-xs">Gift</span>
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const fmtNum = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const RISK = new Set(["Due", "Partially Received"]);

function CompanyDuesAlert({ company, transactions, excludeId }) {
  const dues = transactions.filter(
    t => t.company === company && RISK.has(t.status) && t.id !== excludeId
  );
  if (!dues.length) return null;

  const total = dues.reduce((s, t) => s + (t.total || 0), 0);
  return (
    <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
      <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
      <p className="text-xs text-amber-700">
        <span className="font-semibold">{company}</span> has {dues.length} other outstanding
        invoice{dues.length !== 1 ? "s" : ""} totalling{" "}
        <span className="font-semibold">{fmtNum(total)}</span> — review before approving.
      </p>
    </div>
  );
}

function HistorySection({ company, transactions, excludeIds }) {
  const all = transactions.filter(t => t.company === company && !excludeIds.has(t.id));
  if (!all.length) return <p className="text-xs text-gray-300 px-4 pb-4">No prior history.</p>;

  const pending = all.filter(t => RISK.has(t.status));
  const done    = all.filter(t => !RISK.has(t.status));

  return (
    <div className="space-y-3 px-4 pb-4">
      {pending.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-red-500 uppercase tracking-wider mb-1.5">Pending / outstanding</p>
          <div className="divide-y divide-gray-50 border border-red-100 rounded-lg overflow-hidden">
            {pending.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2 bg-red-50/40">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{t.product || "—"}</p>
                  <p className="text-[11px] text-gray-400">{t.invoice ? `INV ${t.invoice}` : "No invoice"} · Due {t.dueDate || "—"}</p>
                </div>
                <StatusBadge status={t.status} />
                <span className="text-xs font-semibold text-red-700 whitespace-nowrap">{fmtNum(t.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {done.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider mb-1.5">Cleared</p>
          <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden">
            {done.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2 bg-white">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{t.product || "—"}</p>
                  <p className="text-[11px] text-gray-400">{t.invoice ? `INV ${t.invoice}` : "No invoice"} · {t.paymentRecDate || t.invoiceDate}</p>
                </div>
                <StatusBadge status={t.status} />
                <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">{fmtNum(t.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ tx, transactions, onApprove, onHold, isHeld }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${isHeld ? "border-gray-200 opacity-60" : "border-amber-200 shadow-sm"}`}>
      {/* Card header */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isHeld ? "bg-gray-100" : "bg-amber-50 border border-amber-100"}`}>
            {isHeld
              ? <ShieldX size={18} className="text-gray-400" />
              : <Clock size={18} className="text-amber-500" />
            }
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[13px] font-semibold text-gray-900">{tx.company}</p>
              {isHeld && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[11px] font-semibold rounded-full">HELD</span>
              )}
              {!isHeld && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[11px] font-semibold rounded-full">NEEDS APPROVAL</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <User size={10} /> {tx.customer}
              </span>
              {tx.invoice && (
                <span className="flex items-center gap-1 text-xs font-mono text-indigo-600 font-semibold">
                  <FileText size={10} /> INV {tx.invoice}
                </span>
              )}
              {tx.invoiceDate && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Calendar size={10} /> {tx.invoiceDate}
                </span>
              )}
            </div>
          </div>

          {/* Amount + status */}
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-gray-900">{fmtNum(tx.total)}</p>
            <StatusBadge status={tx.status} />
          </div>
        </div>

        {/* Product & terms */}
        <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-gray-400 mb-0.5">Product</p>
            <p className="font-medium text-gray-700 truncate">{tx.product || "—"}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-gray-400 mb-0.5">Qty × Price</p>
            <p className="font-medium text-gray-700">{tx.qty} × {tx.unitPrice > 0 ? fmtNum(tx.unitPrice) : "Gift"}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-gray-400 mb-0.5">Terms / Due</p>
            <p className="font-medium text-gray-700">{tx.paymentTerms || "—"}{tx.dueDate ? ` · ${tx.dueDate}` : ""}</p>
          </div>
        </div>

        {/* Outstanding dues warning */}
        {!isHeld && (
          <div className="mt-3">
            <CompanyDuesAlert company={tx.company} transactions={transactions} excludeId={tx.id} />
          </div>
        )}

        {/* Actions row */}
        <div className="mt-4 flex items-center gap-2">
          <button onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {open ? "Hide" : "View"} company history
          </button>
          {!isHeld && (
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => onHold(tx.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                <X size={12} /> Hold
              </button>
              <button onClick={() => onApprove(tx.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors">
                <Check size={12} /> Approve
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expanded history */}
      {open && (
        <div className="border-t border-gray-100 bg-gray-50/50 pt-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 mb-2">
            All transactions — {tx.company}
          </p>
          <HistorySection
            company={tx.company}
            transactions={transactions}
            excludeIds={new Set([tx.id])}
          />
        </div>
      )}
    </div>
  );
}

function ApprovedCard({ tx }) {
  const [open, setOpen] = useState(false);
  const { transactions } = useData();

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 flex items-center gap-4">
        <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
          <CheckCircle2 size={15} className="text-emerald-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-gray-900">{tx.company}</p>
            <span className="text-[11px] text-gray-400">·</span>
            <span className="text-xs text-gray-400">{tx.customer}</span>
            {tx.invoice && <span className="font-mono text-xs text-indigo-500 font-semibold">INV {tx.invoice}</span>}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{tx.product}{tx.invoiceDate ? ` · ${tx.invoiceDate}` : ""}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={tx.status} />
          <span className="text-sm font-bold text-gray-700">{fmtNum(tx.total)}</span>
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-full border border-emerald-100">
            APPROVED
          </span>
          <button onClick={() => setOpen(o => !o)}
            className="p-1.5 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50/50 pt-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 mb-2">
            All transactions — {tx.company}
          </p>
          <HistorySection
            company={tx.company}
            transactions={transactions}
            excludeIds={new Set([tx.id])}
          />
        </div>
      )}
    </div>
  );
}

export default function FinanceCheck() {
  const { transactions, approveTransaction, holdTransaction } = useData();

  const pending  = useMemo(() => transactions.filter(t => t.needsApproval && t.approvalStatus === "pending"),  [transactions]);
  const held     = useMemo(() => transactions.filter(t => t.needsApproval && t.approvalStatus === "held"),     [transactions]);
  const approved = useMemo(() => transactions.filter(t => t.approvalStatus === "approved"),                    [transactions]);

  return (
    <div className="max-w-3xl space-y-8">

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Finance Check</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Review new B2B entries before they are cleared to proceed.
        </p>
      </div>

      {/* ── Needs Approval ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-800">Awaiting your approval</h2>
          {pending.length > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-[11px] font-bold rounded-full">
              {pending.length}
            </span>
          )}
        </div>

        {pending.length === 0 && held.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 border border-dashed border-gray-200 rounded-xl text-center">
            <ShieldCheck size={28} className="text-gray-200 mb-3" />
            <p className="text-sm text-gray-400 font-medium">No entries pending approval</p>
            <p className="text-xs text-gray-300 mt-1">New entries added via "Add B2B" will appear here for review</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(tx => (
              <ApprovalCard
                key={tx.id}
                tx={tx}
                transactions={transactions}
                onApprove={approveTransaction}
                onHold={holdTransaction}
                isHeld={false}
              />
            ))}
            {held.map(tx => (
              <ApprovalCard
                key={tx.id}
                tx={tx}
                transactions={transactions}
                onApprove={approveTransaction}
                onHold={holdTransaction}
                isHeld={true}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Approved ── */}
      {approved.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <h2 className="text-sm font-semibold text-gray-800">Approved by Finance</h2>
            <span className="ml-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[11px] font-bold rounded-full border border-emerald-100">
              {approved.length}
            </span>
          </div>
          <div className="space-y-2">
            {approved.map(tx => (
              <ApprovedCard key={tx.id} tx={tx} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
