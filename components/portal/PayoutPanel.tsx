"use client";

import { useState } from "react";
import { Plus, Check, X } from "lucide-react";
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
  const [month] = useMonth();
  const { data, loading, refetch } = useApi<Approval[]>(withMonth("/approvals", month));
  const [createOpen, setCreateOpen] = useState(false);
  const [active, setActive] = useState<Approval | null>(null);
  // Requests raised from the floating button elsewhere in the portal.
  usePortalEvent(PORTAL_EVENTS.paymentRequested, refetch);

  async function openDetail(id: number) {
    setActive(await api.get<Approval>(`/approvals/${id}`));
  }

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

      {data && data.length > 0 ? (
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

  const s = approval.status;
  const showSubmit = s === "Draft" || s === "CEO Rejected";
  const showCeo = s === "Submitted for CEO Approval" && hasRole("ADMIN_CEO");
  // After CEO approval the Manager (or CFO/CEO) records the payout reference to complete it.
  const showRelease = s === "Payment Ready" && hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");

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
        {approval.payment_reference && (
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-mist/50 px-4 py-3 text-sm">
            <span className="text-xs tracking-eyebrow text-secondary">Payment reference</span>
            <span className="font-medium tabular-nums">{approval.payment_reference}</span>
          </div>
        )}

        {/* Actions */}
        {showCeo && (
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
              <Button size="sm" magnetic={false} disabled={busy} onClick={() => act("ceo", { approve: true, comment })}>
                <Check className="h-4 w-4" /> Approve
              </Button>
              <Button size="sm" variant="secondary" magnetic={false} disabled={busy || !comment.trim()} onClick={() => act("ceo", { approve: false, comment })}>
                <X className="h-4 w-4" /> Reject
              </Button>
            </div>
          </Panel>
        )}

        {showSubmit && (
          <Button size="sm" magnetic={false} disabled={busy} onClick={() => act("submit")}>
            Submit for CEO approval
          </Button>
        )}
        {showRelease && (
          <Panel className="!rounded-2xl">
            <p className="text-sm font-medium">Complete payment</p>
            <p className="mt-1 text-xs text-secondary">
              Approved by the CEO. Make the payout, then enter its bank reference ID to mark it successful.
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
