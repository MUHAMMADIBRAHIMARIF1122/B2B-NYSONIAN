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
    ? <span className="text-slate-600 text-xs">Gift</span>
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
    <div className="flex items-start gap-2 px-3 py-2 bg-amber-900/30 border border-amber-700 rounded-lg">
      <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
      <p className="text-xs text-amber-300">
        <span className="font-semibold">{company}</span> has {dues.length} other outstanding
        invoice{dues.length !== 1 ? "s" : ""} totalling{" "}
        <span className="font-semibold">{fmtNum(total)}</span> — review before approving.
      </p>
    </div>
  );
}

function HistorySection({ company, transactions, excludeIds }) {
  const all = transactions.filter(t => t.company === company && !excludeIds.has(t.id));
  if (!all.length) return <p className="text-xs text-slate-600 px-4 pb-4">No prior history.</p>;

  const pending = all.filter(t => RISK.has(t.status));
  const done    = all.filter(t => !RISK.has(t.status));

  return (
    <div className="space-y-3 px-4 pb-4">
      {pending.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-red-400 uppercase tracking-wider mb-1.5">Pending / outstanding</p>
          <div className="divide-y divide-slate-700 border border-red-800 rounded-lg overflow-hidden">
            {pending.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2 bg-red-900/30">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-200 truncate">{t.product || "—"}</p>
                  <p className="text-[11px] text-slate-400">{t.invoice ? `INV ${t.invoice}` : "No invoice"} · Due {t.dueDate || "—"}</p>
                </div>
                <StatusBadge status={t.status} />
                <span className="text-xs font-semibold text-red-400 whitespace-nowrap">{fmtNum(t.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {done.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-1.5">Cleared</p>
          <div className="divide-y divide-slate-700 border border-slate-700 rounded-lg overflow-hidden">
            {done.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2 bg-slate-800">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-300 truncate">{t.product || "—"}</p>
                  <p className="text-[11px] text-slate-400">{t.invoice ? `INV ${t.invoice}` : "No invoice"} · {t.paymentRecDate || t.invoiceDate}</p>
                </div>
                <StatusBadge status={t.status} />
                <span className="text-xs font-semibold text-slate-300 whitespace-nowrap">{fmtNum(t.total)}</span>
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
    <div className={`bg-slate-800 border rounded-xl overflow-hidden transition-all ${isHeld ? "border-slate-600 opacity-60" : "border-amber-700 shadow-sm"}`}>
      {/* Card header */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isHeld ? "bg-slate-700" : "bg-amber-900/30 border border-amber-700"}`}>
            {isHeld
              ? <ShieldX size={18} className="text-slate-500" />
              : <Clock size={18} className="text-amber-400" />
            }
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[13px] font-semibold text-slate-100">{tx.company}</p>
              {isHeld && (
                <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-[11px] font-semibold rounded-full">HELD</span>
              )}
              {!isHeld && (
                <span className="px-2 py-0.5 bg-amber-900/40 text-amber-300 text-[11px] font-semibold rounded-full border border-amber-700">NEEDS APPROVAL</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <User size={10} /> {tx.customer}
              </span>
              {tx.invoice && (
                <span className="flex items-center gap-1 text-xs font-mono text-indigo-400 font-semibold">
                  <FileText size={10} /> INV {tx.invoice}
                </span>
              )}
              {tx.invoiceDate && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Calendar size={10} /> {tx.invoiceDate}
                </span>
              )}
            </div>
          </div>

          {/* Amount + status */}
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-slate-100">{fmtNum(tx.total)}</p>
            <StatusBadge status={tx.status} />
          </div>
        </div>

        {/* Product & terms */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-900/50 rounded-lg px-3 py-2">
            <p className="text-slate-400 mb-0.5">Product</p>
            <p className="font-medium text-slate-200 truncate">{tx.product || "—"}</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg px-3 py-2">
            <p className="text-slate-400 mb-0.5">Qty × Price</p>
            <p className="font-medium text-slate-200">{tx.qty} × {tx.unitPrice > 0 ? fmtNum(tx.unitPrice) : "Gift"}</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg px-3 py-2">
            <p className="text-slate-400 mb-0.5">Terms / Due</p>
            <p className="font-medium text-slate-200">{tx.paymentTerms || "—"}{tx.dueDate ? ` · ${tx.dueDate}` : ""}</p>
          </div>
        </div>

        {/* Outstanding dues warning */}
        {!isHeld && (
          <div className="mt-3">
            <CompanyDuesAlert company={tx.company} transactions={transactions} excludeId={tx.id} />
          </div>
        )}

        {/* Actions row */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 border border-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-700 transition-colors">
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {open ? "Hide" : "View"} company history
          </button>
          {!isHeld && (
            <div className="sm:ml-auto flex items-center gap-2">
              <button onClick={() => onHold(tx.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-400 border border-red-800 bg-red-900/30 rounded-lg hover:bg-red-900/50 transition-colors">
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
        <div className="border-t border-slate-700 bg-slate-900/50 pt-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 mb-2">
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
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <div className="px-5 py-3 flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-900/30 border border-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
          <CheckCircle2 size={15} className="text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold text-slate-100">{tx.company}</p>
            <span className="text-xs text-slate-400 hidden sm:inline">{tx.customer}</span>
            {tx.invoice && <span className="font-mono text-xs text-indigo-400 font-semibold">INV {tx.invoice}</span>}
          </div>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{tx.product}{tx.invoiceDate ? ` · ${tx.invoiceDate}` : ""}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <StatusBadge status={tx.status} />
            <span className="text-sm font-bold text-slate-300">{fmtNum(tx.total)}</span>
            <span className="px-2 py-0.5 bg-emerald-900/40 text-emerald-300 text-[11px] font-bold rounded-full border border-emerald-700">
              APPROVED
            </span>
          </div>
        </div>
        <button onClick={() => setOpen(o => !o)}
          className="p-1.5 text-slate-600 hover:text-slate-300 hover:bg-slate-700 rounded-lg transition-colors shrink-0">
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-700 bg-slate-900/50 pt-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 mb-2">
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
        <h1 className="text-xl font-semibold text-slate-100">Finance Check</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Review new B2B entries before they are cleared to proceed.
        </p>
      </div>

      {/* ── Needs Approval ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-slate-200">Awaiting your approval</h2>
          {pending.length > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-amber-900/40 text-amber-300 text-[11px] font-bold rounded-full border border-amber-700">
              {pending.length}
            </span>
          )}
        </div>

        {pending.length === 0 && held.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 border border-dashed border-slate-700 rounded-xl text-center">
            <ShieldCheck size={28} className="text-slate-600 mb-3" />
            <p className="text-sm text-slate-400 font-medium">No entries pending approval</p>
            <p className="text-xs text-slate-600 mt-1">New entries added via "Add B2B" will appear here for review</p>
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
            <CheckCircle2 size={14} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-200">Approved by Finance</h2>
            <span className="ml-1 px-2 py-0.5 bg-emerald-900/40 text-emerald-300 text-[11px] font-bold rounded-full border border-emerald-700">
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
