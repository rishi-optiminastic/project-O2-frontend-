"use client";

import { useState } from "react";
import { Flag, Link2, MessageSquare, RotateCcw, ShieldCheck, Unlink, Download } from "lucide-react";
import { Field, inputClass, StatusPill, Empty } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Attachments, DOC_CATEGORIES } from "@/components/portal/Attachments";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import type { WorkspaceData, WorkspaceTxn } from "@/lib/finance";
import { formatDate, formatINR } from "@/lib/utils";

type Section = "matched" | "unmatched" | "mismatched";
const LABELS: Record<Section, string> = { matched: "Matched", unmatched: "Unmatched", mismatched: "Mismatched" };
const MISMATCH: Record<string, string> = { amount: "Amount", utr: "UTR", account: "Bank account", date: "Date", duplicate: "Duplicate" };

/** The reconciliation workspace: review each bank line, match, unmatch, reconcile, flag and comment. */
export function Workspace({ statementId }: { statementId?: number }) {
  const [section, setSection] = useState<Section>("unmatched");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const params = new URLSearchParams();
  if (statementId) params.set("statement_id", String(statementId));
  if (flaggedOnly) params.set("flagged", "true");
  const { data, loading, error, refetch } = useApi<WorkspaceData>(`/verification/workspace?${params}`);
  const [open, setOpen] = useState<WorkspaceTxn | null>(null);
  const rows = data?.[section] ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(LABELS) as Section[]).map((s) => (
          <button key={s} onClick={() => setSection(s)}
            className={"rounded-full px-4 py-1.5 text-sm " + (section === s ? "bg-foreground text-white" : "border border-line text-secondary hover:text-foreground")}>
            {LABELS[s]} ({data?.counts[s] ?? 0})
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-secondary">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} /> Flagged only
        </label>
      </div>
      {error && <Empty message={`Could not load the workspace: ${error}`} />}
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map((t) => (
            <li key={t.id}>
              <button onClick={() => setOpen(t)} className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-line bg-white/50 px-4 py-3 text-left text-sm transition-colors hover:bg-white">
                <span className={"w-16 text-xs font-medium " + (t.direction === "Debit" ? "text-danger" : "text-success")}>{t.direction === "Debit" ? "OUT" : "IN"}</span>
                <span className="w-24 text-xs text-ink-40">{t.txn_date ? formatDate(t.txn_date) : "-"}</span>
                <span className="w-28 font-medium tabular-nums">{formatINR(t.amount)}</span>
                <span className="min-w-0 flex-1 truncate text-secondary">{t.narration ?? "-"}</span>
                {t.flagged && <Flag className="h-4 w-4 text-warning" />}
                {t.mismatch_reasons && (
                  <span className="text-xs text-danger">{t.mismatch_reasons.split(",").map((r) => MISMATCH[r] ?? r).join(", ")} mismatch</span>
                )}
                {section === "unmatched" && t.suggestions[0] && <span className="text-xs text-ink-40">Best suggestion {t.suggestions[0].confidence}%</span>}
                <StatusPill status={t.verification_status} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !error && <Empty message={loading ? "Loading…" : `No ${LABELS[section].toLowerCase()} transactions.`} />
      )}
      {open && (
        <TransactionPanel txnId={open.id} onClose={() => setOpen(null)} onChanged={refetch} />
      )}
    </div>
  );
}

function TransactionPanel({ txnId, onClose, onChanged }: { txnId: number; onClose: () => void; onChanged: () => void }) {
  const { hasRole } = useAuth();
  const canReverse = hasRole("ADMIN_CEO", "CFO");
  const { data: t, refetch } = useApi<WorkspaceTxn>(`/verification/transactions/${txnId}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"unmatch" | "reverse" | "flag" | "unflag" | null>(null);
  const [comment, setComment] = useState("");
  const [manual, setManual] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setDialog(null);
      refetch();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  const post = (path: string, body?: unknown) => run(() => api.post(`/verification/transactions/${txnId}/${path}`, body));

  if (!t) {
    return <Modal open onOpenChange={(o) => !o && onClose()} title="Transaction"><p className="text-sm text-ink-40">Loading…</p></Modal>;
  }
  const reconciled = t.verification_status === "Reconciled";
  const matched = t.links.length > 0;

  return (
    <Modal open size="wide" onOpenChange={(o) => !o && onClose()}
      title={`${t.direction === "Debit" ? "Money out" : "Money in"} · ${formatINR(t.amount)}`}
      description={`${t.txn_date ? formatDate(t.txn_date) : "No date"} · ${t.narration ?? ""}`}>
      <div className="flex flex-col gap-5 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status={t.verification_status} />
          {t.utr_reference && <span className="font-mono text-xs">UTR {t.utr_reference}</span>}
          {t.reference && <span className="font-mono text-xs text-ink-40">Ref {t.reference}</span>}
          {t.balance != null && <span className="text-xs text-ink-40">Balance {formatINR(t.balance)}</span>}
          <span className="text-xs text-ink-40">{t.bank_name ?? ""} · {t.statement_file}</span>
          {t.open_amount > 0.01 && matched && <span className="text-xs text-warning">{formatINR(t.open_amount)} still unmatched</span>}
        </div>
        {t.flagged && <p className="rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-xs">Flagged: {t.flag_reason}</p>}
        {t.mismatch_reasons && (
          <p className="rounded-xl border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            Mismatch: {t.mismatch_reasons.split(",").map((r) => MISMATCH[r] ?? r).join(", ")}
          </p>
        )}

        {matched && (
          <section>
            <h3 className="mb-2 text-xs tracking-eyebrow text-secondary">Matched to</h3>
            <ul className="flex flex-col gap-1.5">
              {t.links.map((l) => (
                <li key={l.id} className="rounded-xl border border-line px-3 py-2">
                  <span className="font-medium">{l.target}</span> · {formatINR(l.amount)} · {l.confidence}%
                  {l.is_manual ? " · manual" : " · auto"}
                  {l.override_reason && <span className="text-ink-40"> · {l.override_reason}</span>}
                  {l.invoice_id && <a href={`/portal/invoices/${l.invoice_id}`} className="ml-2 text-xs underline">invoice</a>}
                  {l.record?.vendor_invoice_id && <a href={`/portal/vendors/invoices/${l.record.vendor_invoice_id}`} className="ml-2 text-xs underline">vendor invoice</a>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!reconciled && t.open_amount > 0.01 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs tracking-eyebrow text-secondary">Suggested matches</h3>
              <button onClick={() => setManual((v) => !v)} className="text-xs text-secondary underline">{manual ? "Back to suggestions" : "Match manually"}</button>
            </div>
            {manual ? (
              <ManualMatch txn={t} busy={busy} onSubmit={(body) => post("match", body)} />
            ) : t.suggestions.length ? (
              <ul className="flex flex-col gap-2">
                {t.suggestions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2">
                    <span className={"w-12 text-xs font-semibold " + (s.confidence >= 85 ? "text-success" : s.confidence >= 60 ? "text-warning" : "text-ink-40")}>{s.confidence}%</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{s.target}</span> · {formatINR(s.amount)}
                      <span className="block text-xs text-ink-40">{s.reasons.join(" · ")}</span>
                    </span>
                    {s.record && (
                      <Button size="sm" magnetic={false} disabled={busy}
                        onClick={() => post("match", { allocations: [{ kind: s.record!.kind, record_id: s.record!.id, amount: s.amount }] })}>
                        <Link2 className="h-4 w-4" /> Match
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-40">No suggestions. Match manually, or flag it for investigation.</p>
            )}
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          {matched && !reconciled && (
            <Button size="sm" magnetic={false} disabled={busy || t.open_amount > 0.01 || !!t.flagged} onClick={() => post("reconcile")}>
              <ShieldCheck className="h-4 w-4" /> Reconcile
            </Button>
          )}
          {matched && !reconciled && (
            <Button size="sm" variant="secondary" magnetic={false} onClick={() => setDialog("unmatch")}><Unlink className="h-4 w-4" /> Unmatch</Button>
          )}
          {reconciled && canReverse && (
            <Button size="sm" variant="secondary" magnetic={false} onClick={() => setDialog("reverse")}><RotateCcw className="h-4 w-4" /> Reverse reconciliation</Button>
          )}
          {!reconciled && !t.flagged && (
            <Button size="sm" variant="ghost" magnetic={false} onClick={() => setDialog("flag")}><Flag className="h-4 w-4" /> Flag for investigation</Button>
          )}
          {t.flagged && <Button size="sm" variant="ghost" magnetic={false} onClick={() => setDialog("unflag")}>Clear flag</Button>}
          <Button size="sm" variant="ghost" magnetic={false} onClick={() => api.download(`/verification/statements/${t.statement_id}/download`, t.statement_file ?? "statement")}>
            <Download className="h-4 w-4" /> Original statement
          </Button>
        </div>
        {reconciled && !canReverse && <p className="text-xs text-ink-40">Reconciled. Only the CFO or CEO can reverse it for correction.</p>}
        {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}

        <Attachments bare entityType="bank_transaction" entityId={t.id} categories={DOC_CATEGORIES.bank_transaction} title="Supporting evidence" />

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-xs tracking-eyebrow text-secondary"><MessageSquare className="h-4 w-4" /> Review comments</h3>
          <ol className="mb-2 flex flex-col gap-1 text-xs">
            {t.comments.map((c) => <li key={c.id}><span className="text-ink-40">{formatDate(c.created_at)} · {c.user_name}:</span> {c.body}</li>)}
          </ol>
          <div className="flex gap-2">
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" className={inputClass} />
            <Button size="sm" variant="secondary" magnetic={false} disabled={busy || !comment.trim()}
              onClick={() => post("comments", { body: comment }).then(() => setComment(""))}>Add</Button>
          </div>
        </section>

        {t.history.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs tracking-eyebrow text-secondary">Undone matches</h3>
            <ol className="flex flex-col gap-1 text-xs text-ink-40">
              {t.history.map((h) => <li key={h.id}>{h.target} · {formatINR(h.amount)} · {h.reversal_reason}</li>)}
            </ol>
          </section>
        )}
      </div>

      {dialog && (
        <ReasonPrompt
          title={{ unmatch: "Unmatch this transaction", reverse: "Reverse the reconciliation", flag: "Flag for investigation", unflag: "Clear the flag" }[dialog]}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(reason) => post(dialog, { reason })}
        />
      )}
    </Modal>
  );
}

function ManualMatch({ txn, busy, onSubmit }: { txn: WorkspaceTxn; busy: boolean; onSubmit: (body: unknown) => void }) {
  const credit = txn.direction !== "Debit";
  const [kind, setKind] = useState<string>(credit ? "invoice" : "approval");
  const [recordId, setRecordId] = useState("");
  const [amount, setAmount] = useState(String(txn.open_amount));
  const [reason, setReason] = useState("");
  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-line p-4 sm:grid-cols-4">
      <Field label="Match to">
        <Select value={kind} onValueChange={setKind} options={credit
          ? [{ value: "invoice", label: "Open invoice (records a receipt)" }, { value: "payment", label: "Recorded receipt" }]
          : [{ value: "approval", label: "Released payout" }]} />
      </Field>
      <Field label={kind === "invoice" ? "Invoice ID" : kind === "payment" ? "Receipt ID" : "Payment request ID"}>
        <input value={recordId} onChange={(e) => setRecordId(e.target.value)} inputMode="numeric" className={inputClass} />
      </Field>
      <Field label="Amount (₹)">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" className={inputClass} />
      </Field>
      <Field label="Reason (manual override)">
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="Client remittance advice" />
      </Field>
      <div className="sm:col-span-4 flex justify-end">
        <Button size="sm" magnetic={false} disabled={busy || !recordId || !Number(amount)}
          onClick={() => onSubmit({ allocations: [{ kind, record_id: Number(recordId), amount: Number(amount) }], reason: reason || null })}>
          Match
        </Button>
      </div>
    </div>
  );
}

function ReasonPrompt({ title, busy, onClose, onSubmit }: { title: string; busy: boolean; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={title} description="A reason is required and kept in the audit trail.">
      <div className="flex flex-col gap-4">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={`${inputClass} h-auto py-2.5`} />
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onClose}>Cancel</Button>
          <Button type="button" magnetic={false} disabled={busy || !reason.trim()} onClick={() => onSubmit(reason)}>Confirm</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

