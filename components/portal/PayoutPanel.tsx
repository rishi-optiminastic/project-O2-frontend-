"use client";

import { useEffect, useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { Attachments, DOC_CATEGORIES } from "@/components/portal/Attachments";
import type { ApprovalDeskData } from "@/lib/finance";
import { PageHeading, Table, Row, Cell, Empty, Field, inputClass, StatusPill, Panel } from "@/components/portal/ui";
import { Modal } from "@/components/portal/Modal";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { api, ApiError, type Approval } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/utils";
import { FIELD_RULES, NAME_MAX, NUMBER_RULES, TEXT_MAX, matchesRule } from "@/lib/validation";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { useMonth, withMonth } from "@/lib/month";
import { emitPortalEvent, PORTAL_EVENTS, usePortalEvent } from "@/lib/events";

/**
 * The full payout / payment-approval flow — list, create, CEO sign-off, and
 * the Manager's payment-reference release. Self-contained so it can power both
 * the standalone /portal/approvals page and the Invoices "Payout" tab.
 *
 * Pass `title`/`description` to render a PageHeading (standalone page); omit
 * them for a compact toolbar (tab usage).
 */
export function PayoutPanel({ title, description }: { title?: string; description?: string }) {
  const { hasRole } = useAuth();
  const [month] = useMonth();
  const { data, loading, refetch } = useApi<Approval[]>(withMonth("/approvals", month));
  const [createOpen, setCreateOpen] = useState(false);
  const [active, setActive] = useState<Approval | null>(null);
  const [view, setView] = useState<"all" | "cfo" | "ceo">("all");
  const [openError, setOpenError] = useState<string | null>(null);
  // Requests raised from the floating button elsewhere in the portal.
  usePortalEvent(PORTAL_EVENTS.paymentRequested, refetch);

  async function openDetail(id: number) {
    setOpenError(null);
    try {
      setActive(await api.get<Approval>(`/approvals/${id}`));
    } catch (e) {
      setOpenError(e instanceof ApiError ? e.message : "Could not open the request");
    }
  }

  // A link such as /portal/approvals?open=12 (from a vendor invoice) opens that request.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("open"));
    if (!id) return;
    api.get<Approval>(`/approvals/${id}`).then(setActive, (e) =>
      setOpenError(e instanceof ApiError ? e.message : "Could not open the request"),
    );
  }, []);

  const newButton = (
    <Button size="sm" magnetic={false} onClick={() => setCreateOpen(true)}>
      <Plus className="h-4 w-4" /> New request
    </Button>
  );

  return (
    <div className="flex flex-col gap-8">
      {title ? (
        <PageHeading
          title={title}
          description={description}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <MonthFilter />
              {newButton}
            </div>
          }
        />
      ) : (
        <div className="flex items-center justify-end">{newButton}</div>
      )}

      {(hasRole("CFO") || hasRole("ADMIN_CEO")) && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setView("all")} className={tabClass(view === "all")}>All requests</button>
          {hasRole("CFO") && <button onClick={() => setView("cfo")} className={tabClass(view === "cfo")}>CFO desk</button>}
          {hasRole("ADMIN_CEO") && <button onClick={() => setView("ceo")} className={tabClass(view === "ceo")}>CEO desk</button>}
        </div>
      )}
      {openError && <p role="alert" className="text-sm text-danger">⚠ {openError}</p>}

      {view !== "all" ? (
        <ApproverDesk key={`${view}-${active?.status ?? ""}`} stage={view} onOpen={openDetail} />
      ) : data && data.length > 0 ? (
        <Table head={["Payee", "Amount", "Net payable", "Status", "Raised"]}>
          {data.map((a) => (
            <Row key={a.id} onClick={() => openDetail(a.id)}>
              <Cell className="font-medium">{a.payee_name}</Cell>
              <Cell>{formatINR(a.amount)}</Cell>
              <Cell>{formatINR(a.net_payable)}</Cell>
              <Cell>
                <StatusPill status={a.status} />
              </Cell>
              <Cell className="text-ink-40">{formatDate(a.created_at)}</Cell>
            </Row>
          ))}
        </Table>
      ) : (
        <Empty message={loading ? "Loading approvals…" : "No approval requests yet."} />
      )}

      <CreateApproval open={createOpen} onOpenChange={setCreateOpen} />
      {active && (
        <ApprovalDetail
          approval={active}
          onClose={() => setActive(null)}
          onChanged={async () => {
            await openDetail(active.id);
            refetch();
          }}
        />
      )}
    </div>
  );
}

/** Raise an outgoing payment for CFO, then CEO, sign-off. */
export function CreateApproval({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    const tax = Number(fd.get("tax_deductions") || 0);
    try {
      await api.post("/approvals", {
        payee_name: fd.get("payee_name"),
        amount,
        purpose: fd.get("purpose"),
        tax_deductions: tax,
        net_payable: amount - tax,
        bank_details: fd.get("bank_details"),
      });
      onOpenChange(false);
      emitPortalEvent(PORTAL_EVENTS.paymentRequested);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Record a payment"
      description="Money going out to a vendor or other payee. It goes to the CFO, then the CEO, and is released once the bank reference (UTR) is entered.">
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Payee name">
          <input name="payee_name" required maxLength={NAME_MAX} className={inputClass} />
        </Field>
        <Field label="Amount (₹)">
          <input name="amount" {...NUMBER_RULES.positiveMoney} required className={inputClass} />
        </Field>
        <Field label="Tax deductions (₹)">
          <input name="tax_deductions" {...NUMBER_RULES.money} defaultValue={0} className={inputClass} />
        </Field>
        <Field label="Purpose">
          <input name="purpose" maxLength={TEXT_MAX} className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Bank details">
            <input name="bank_details" maxLength={TEXT_MAX} placeholder="Bank · A/C · IFSC" className={inputClass} />
          </Field>
        </div>
        {error && <p className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
        <div className="sm:col-span-2 flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Saving…" : "Create request"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ApprovalDetail({ approval, onClose, onChanged }: { approval: Approval; onClose: () => void; onChanged: () => void }) {
  const { hasRole } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [reference, setReference] = useState("");

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/approvals/${approval.id}/${path}`, body);
      setComment("");
      setReference("");
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const s = approval.status;
  const isCreator = approval.requested_by_id != null && approval.requested_by_id === user?.id;
  const showSubmit = s === "Draft" || s === "CFO Rejected" || s === "CEO Rejected";
  // The creator never approves their own request; the CEO acts only after a recorded CFO approval.
  const showCfo = s === "Submitted for CFO Approval" && hasRole("CFO") && !isCreator;
  const showCeo = s === "Submitted for CEO Approval" && hasRole("ADMIN_CEO") && !isCreator && approval.cfo_approved_by_id != null;
  const legacyNoCfo = s === "Submitted for CEO Approval" && approval.cfo_approved_by_id == null;
  const showRelease = s === "Payment Ready" && hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const paid = s === "Payment Released" || s === "Payment Verified";
  const decided = s !== "Draft" && !s.endsWith("Rejected");

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={approval.payee_name} description={approval.purpose ?? "Payment approval"}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusPill status={approval.status} />
          <span className="text-2xl font-extralight tabular-nums">{formatINR(approval.net_payable)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {[
            ["Gross amount", formatINR(approval.amount)],
            ["Tax deducted", formatINR(approval.tax_deductions)],
            ["Net payable", formatINR(approval.net_payable)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-line bg-white/50 p-4">
              <p className="text-xs text-ink-40">{k}</p>
              <p className="mt-1 font-medium tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        {approval.bank_details && <p className="text-sm text-secondary">Bank · {approval.bank_details}</p>}
        <div className="grid grid-cols-1 gap-2 text-xs text-ink-40 sm:grid-cols-2">
          <span>CFO approval: {approval.cfo_approved_at ? formatDate(approval.cfo_approved_at) : "pending"}</span>
          <span>CEO approval: {approval.ceo_approved_at ? formatDate(approval.ceo_approved_at) : "pending"}</span>
          {approval.vendor_invoice_id && (
            <a href={`/portal/vendors/invoices/${approval.vendor_invoice_id}`} className="text-secondary underline">
              Vendor invoice #{approval.vendor_invoice_id}
            </a>
          )}
          {isCreator && <span>You raised this request, so others approve it.</span>}
        </div>
        {legacyNoCfo && (
          <p className="rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
            Sent to the CEO before the CFO stage existed. The CEO can reject it so it is resubmitted through the CFO.
          </p>
        )}
        {!paid && (
          <button onClick={() => setEditing((v) => !v)} className="w-fit text-xs text-secondary underline">
            {editing ? "Close edit" : "Edit request"}
          </button>
        )}
        {editing && (
          <EditApproval approval={approval} warnInvalidate={decided} onSaved={() => { setEditing(false); onChanged(); }} />
        )}
        {approval.payment_reference && (
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-mist/50 px-4 py-3 text-sm">
            <span className="text-xs tracking-eyebrow text-secondary">Payment reference</span>
            <span className="font-medium tabular-nums">{approval.payment_reference}</span>
          </div>
        )}

        {/* Actions */}
        {showCfo && (
          <Panel className="!rounded-2xl">
            <p className="mb-1 text-sm font-medium">CFO review</p>
            <p className="mb-3 text-xs text-secondary">Check the invoice, tax deductions, bank details, project budget and documents below.</p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comment (needed to reject)"
              maxLength={TEXT_MAX}
              rows={2}
              className={inputClass + " h-auto py-2.5"}
            />
            <div className="mt-3 flex gap-3">
              <Button size="sm" magnetic={false} disabled={busy} onClick={() => act("cfo", { approve: true, comment })}>
                <Check className="h-4 w-4" /> Approve and send to CEO
              </Button>
              <Button size="sm" variant="secondary" magnetic={false} disabled={busy || !comment.trim()} onClick={() => act("cfo", { approve: false, comment })}>
                <X className="h-4 w-4" /> Reject
              </Button>
            </div>
          </Panel>
        )}
        {(showCeo || (legacyNoCfo && hasRole("ADMIN_CEO") && !isCreator)) && (
          <Panel className="!rounded-2xl">
            <p className="mb-3 text-sm font-medium">CEO decision</p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment (needed to reject)"
              maxLength={TEXT_MAX}
              rows={2}
              className={inputClass + " h-auto py-2.5"}
            />
            <div className="mt-3 flex gap-3">
              {showCeo && (
                <Button size="sm" magnetic={false} disabled={busy} onClick={() => act("ceo", { approve: true, comment })}>
                  <Check className="h-4 w-4" /> Approve
                </Button>
              )}
              <Button size="sm" variant="secondary" magnetic={false} disabled={busy || !comment.trim()} onClick={() => act("ceo", { approve: false, comment })}>
                <X className="h-4 w-4" /> Reject
              </Button>
            </div>
          </Panel>
        )}

        {showSubmit && (
          <Button size="sm" magnetic={false} disabled={busy} onClick={() => act("submit")}>
            {s === "Draft" ? "Submit for CFO approval" : "Resubmit for CFO approval"}
          </Button>
        )}
        {showRelease && (
          <Panel className="!rounded-2xl">
            <p className="text-sm font-medium">Complete payment</p>
            <p className="mt-1 text-xs text-secondary">
              Approved by the CFO and the CEO. Make the payout, then enter its bank reference (UTR) to release it.
            </p>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Payment reference / UTR (required)"
              {...FIELD_RULES.bankReference}
              className={inputClass + " mt-3"}
            />
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                magnetic={false}
                disabled={busy || !matchesRule(FIELD_RULES.bankReference, reference)}
                onClick={() => act("release", { payment_reference: reference.trim() })}
              >
                <Check className="h-4 w-4" /> Mark paid &amp; complete
              </Button>
            </div>
          </Panel>
        )}
        {error && <p className="text-sm text-danger">⚠ {error}</p>}

        <Attachments
          bare
          entityType="payment_approval"
          entityId={approval.id}
          categories={DOC_CATEGORIES.payment_approval}
          title="Supporting documents"
          canUpload={!paid}
        />

        {/* Audit trail */}
        <div>
          <p className="mb-3 text-xs tracking-eyebrow text-secondary">Approval audit trail</p>
          <ol className="relative flex flex-col gap-4 border-l border-line pl-5">
            {approval.actions?.length ? (
              approval.actions.map((a) => (
                <li key={a.id} className="relative">
                  <span className="metallic absolute -left-[26px] top-1 h-3 w-3 rounded-full" />
                  <p className="text-sm font-medium">{a.decision}</p>
                  <p className="text-xs text-ink-40">
                    {a.approver_name} · {a.approver_role} · {formatDate(a.created_at)}
                  </p>
                  {a.comments && <p className="mt-1 text-xs text-secondary">“{a.comments}”</p>}
                  {a.changes && <p className="mt-1 font-mono text-[11px] text-ink-40">{a.changes}</p>}
                </li>
              ))
            ) : (
              <li className="text-sm text-ink-40">No actions yet.</li>
            )}
          </ol>
        </div>
      </div>
    </Modal>
  );
}

/** Edit a request. After it has been submitted, a change to the money or bank voids the approvals. */
function EditApproval({ approval, warnInvalidate, onSaved }: { approval: Approval; warnInvalidate: boolean; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/approvals/${approval.id}`, {
        payee_name: fd.get("payee_name"),
        amount: Number(fd.get("amount")),
        tax_deductions: Number(fd.get("tax_deductions") || 0),
        purpose: fd.get("purpose") || null,
        bank_details: fd.get("bank_details") || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
      setSaving(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 rounded-2xl border border-line p-4 sm:grid-cols-2">
      {warnInvalidate && (
        <p className="sm:col-span-2 rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
          Changing the payee, amount, deductions or bank details throws away the approvals so far. It must go through the CFO and CEO again.
        </p>
      )}
      <Field label="Payee"><input name="payee_name" required defaultValue={approval.payee_name} maxLength={NAME_MAX} className={inputClass} /></Field>
      <Field label="Amount (₹)"><input name="amount" {...NUMBER_RULES.positiveMoney} required defaultValue={approval.amount} className={inputClass} /></Field>
      <Field label="Tax deductions (₹)"><input name="tax_deductions" {...NUMBER_RULES.money} defaultValue={approval.tax_deductions} className={inputClass} /></Field>
      <Field label="Purpose"><input name="purpose" defaultValue={approval.purpose ?? ""} maxLength={TEXT_MAX} className={inputClass} /></Field>
      <div className="sm:col-span-2">
        <Field label="Bank details"><input name="bank_details" defaultValue={approval.bank_details ?? ""} maxLength={TEXT_MAX} className={inputClass} /></Field>
      </div>
      {error && <p className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" size="sm" magnetic={false} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}

/** One approver's dashboard: what waits for them, and what they approved or rejected. */
export function ApproverDesk({ stage, onOpen }: { stage: "cfo" | "ceo"; onOpen: (id: number) => void }) {
  const { data, loading } = useApi<ApprovalDeskData>(`/approvals/desk?stage=${stage}`);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const rows = data?.[tab] ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(["pending", "approved", "rejected"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={"rounded-full px-4 py-1.5 text-sm " + (tab === t ? "bg-foreground text-white" : "border border-line text-secondary")}>
            {t[0].toUpperCase() + t.slice(1)} ({data?.[t].length ?? 0})
          </button>
        ))}
      </div>
      {rows.length ? (
        <Table head={["Payee", "Net payable", "Status", "Raised"]}>
          {rows.map((a) => (
            <Row key={a.id} onClick={() => onOpen(a.id)}>
              <Cell className="font-medium">{a.payee_name}</Cell>
              <Cell>{formatINR(a.net_payable)}</Cell>
              <Cell><StatusPill status={a.status} /></Cell>
              <Cell className="text-ink-40">{formatDate(a.created_at)}</Cell>
            </Row>
          ))}
        </Table>
      ) : (
        <Empty message={loading ? "Loading…" : tab === "pending" ? "Nothing is waiting for you." : `No ${tab} requests.`} />
      )}
    </div>
  );
}

function tabClass(active: boolean): string {
  return "rounded-full px-4 py-1.5 text-sm transition-colors " + (active ? "bg-foreground text-white" : "border border-line text-secondary hover:text-foreground");
}
