"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Ban, CheckCircle2, FilePen, Receipt, Send, Trash2, XCircle, Eye } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { Panel, MetricCard, Empty, StatusPill, DataField, Field, inputClass, Table, Row, Cell } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Attachments, DOC_CATEGORIES } from "@/components/portal/Attachments";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { api, ApiError, TDS_SECTIONS, type Vendor } from "@/lib/api";
import type { VendorBill, VendorBillDetail } from "@/lib/finance";
import { formatDate, formatINR } from "@/lib/utils";
import { GST_RATE_OPTIONS, NUMBER_RULES, pastDateRule } from "@/lib/validation";

const STAGES = ["Invoice Created", "Submitted", "Under Review", "Approved", "CFO Approval", "CEO Approval", "Payment Ready", "Released", "Reconciled"];
type Dialog = "reject" | "approve" | "cancel" | "revise" | "edit" | "request" | null;

export default function VendorBillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasRole } = useAuth();
  const { data: bill, loading, refetch } = useApi<VendorBillDetail>(id ? `/vendors/invoices/${id}` : null);
  const { data: vendor } = useApi<Vendor>(bill ? `/vendors/${bill.vendor_id}` : null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isManager = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const isLeader = hasRole("ADMIN_CEO", "CFO");
  const isCreator = bill?.created_by_id != null && bill.created_by_id === user?.id;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setDialog(null);
      refetch();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }
  const post = (path: string, body?: unknown) => run(() => api.post(`/vendors/invoices/${id}/${path}`, body));

  if (!loading && !bill) {
    return (
      <PortalShell>
        <Empty message="Vendor invoice not found." />
      </PortalShell>
    );
  }
  if (!bill) {
    return (
      <PortalShell>
        <Empty message="Loading…" />
      </PortalShell>
    );
  }

  const s = bill.bill_status;
  const beforeApproval = ["Invoice Created", "Submitted", "Under Review", "Rejected"].includes(s);
  const openRequest = bill.approvals.find((a) => !["CFO Rejected", "CEO Rejected"].includes(a.status));
  const stepIndex = STAGES.indexOf(bill.stage);

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <button
          onClick={() => router.push(`/portal/vendors/${bill.vendor_id}`)}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-secondary transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {bill.vendor_name}
        </button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs tracking-eyebrow text-secondary">Vendor invoice{bill.revision > 1 ? ` · revision ${bill.revision}` : ""}</p>
            <h1 className="font-sans text-4xl font-bold leading-[0.95] tracking-[-0.04em]">{bill.invoice_number}</h1>
            <p className="mt-2 text-sm text-secondary">
              {bill.vendor_name} · {formatDate(bill.invoice_date)}
              {bill.project_code && (
                <>
                  {" · "}
                  <button onClick={() => router.push(`/portal/projects/${bill.project_id}`)} className="hover:underline">
                    {bill.project_code}
                  </button>
                </>
              )}
            </p>
          </div>
          <StatusPill status={bill.stage} />
        </div>

        {/* Stage tracker */}
        {!["Rejected", "Cancelled"].includes(s) && (
          <ol className="grid grid-cols-3 gap-2 sm:grid-cols-9" aria-label="Workflow">
            {STAGES.map((stage, i) => (
              <li
                key={stage}
                className={
                  "rounded-xl border px-2 py-2 text-center text-[11px] " +
                  (i < stepIndex ? "border-line bg-mist text-secondary" : i === stepIndex ? "border-foreground bg-foreground text-white" : "border-dashed border-line text-ink-40")
                }
              >
                {stage}
              </li>
            ))}
          </ol>
        )}

        {s === "Rejected" && bill.review_comment && (
          <p className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">Rejected: {bill.review_comment}</p>
        )}
        {s === "Cancelled" && <p className="rounded-xl border border-line bg-mist px-4 py-3 text-sm">Cancelled: {bill.cancel_reason}</p>}
        {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {["Invoice Created", "Rejected"].includes(s) && (
            <Button size="sm" magnetic={false} disabled={busy} onClick={() => post("submit")}>
              <Send className="h-4 w-4" /> {s === "Rejected" ? "Resubmit for review" : "Submit for review"}
            </Button>
          )}
          {s === "Submitted" && isManager && (
            <Button size="sm" variant="secondary" magnetic={false} disabled={busy} onClick={() => post("review")}>
              <Eye className="h-4 w-4" /> Start review
            </Button>
          )}
          {["Submitted", "Under Review"].includes(s) && isManager && !isCreator && (
            <>
              <Button size="sm" magnetic={false} disabled={busy} onClick={() => setDialog("approve")}>
                <CheckCircle2 className="h-4 w-4" /> Approve
              </Button>
              <Button size="sm" variant="secondary" magnetic={false} disabled={busy} onClick={() => setDialog("reject")}>
                <XCircle className="h-4 w-4" /> Reject
              </Button>
            </>
          )}
          {beforeApproval && (isManager || isCreator) && (
            <Button size="sm" variant="secondary" magnetic={false} onClick={() => setDialog("edit")}>
              <FilePen className="h-4 w-4" /> Edit
            </Button>
          )}
          {s === "Approved" && isManager && !["Released", "Reconciled"].includes(bill.stage) && (
            <Button size="sm" variant="secondary" magnetic={false} onClick={() => setDialog("revise")}>
              <FilePen className="h-4 w-4" /> Revise (correction)
            </Button>
          )}
          {s === "Approved" && !openRequest && isManager && (
            <Button size="sm" magnetic={false} onClick={() => setDialog("request")}>
              <Receipt className="h-4 w-4" /> Request payment
            </Button>
          )}
          {openRequest && (
            <Button size="sm" variant="secondary" magnetic={false} onClick={() => router.push(`/portal/approvals?open=${openRequest.id}`)}>
              <Receipt className="h-4 w-4" /> Payment request #{openRequest.id}
            </Button>
          )}
          {s !== "Cancelled" && isManager && !["Released", "Reconciled"].includes(bill.stage) && (
            <Button size="sm" variant="ghost" magnetic={false} onClick={() => setDialog("cancel")}>
              <Ban className="h-4 w-4" /> Cancel bill
            </Button>
          )}
          {s === "Invoice Created" && !bill.submitted_at && (isManager || isCreator) && (
            <Button size="sm" variant="ghost" magnetic={false} disabled={busy}
              onClick={() => run(async () => { await api.del(`/vendors/invoices/${id}`); router.push(`/portal/vendors/${bill.vendor_id}`); })}>
              <Trash2 className="h-4 w-4" /> Delete draft
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Gross amount" value={formatINR(bill.gross_amount)} sub={`${formatINR(bill.invoice_amount)} + GST`} />
          <MetricCard label="GST" value={formatINR(bill.gst_amount)} sub={bill.is_interstate ? "IGST" : "CGST + SGST"} />
          <MetricCard label="TDS" value={formatINR(bill.tds_amount)} sub={`${bill.tds_rate}% · ${bill.tds_section ?? "-"}`} />
          <MetricCard label="Net payable" value={formatINR(bill.net_payable)} sub={bill.bank_verification} />
        </div>

        <Panel>
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            <DataField label="Report submitted" value={bill.report_submitted ? "Yes (approved)" : "No"} />
            <DataField label="Payment approval" value={bill.approval_status ?? "Not requested"} />
            <DataField label="Payment release" value={bill.released_at ? `${formatDate(bill.released_at)} · ${bill.payment_reference}` : "Not released"} />
            <DataField label="Bank verification" value={bill.bank_verification} />
            <DataField label="Submitted" value={bill.submitted_at ? formatDate(bill.submitted_at) : null} />
            <DataField label="Reviewed" value={bill.reviewed_at ? formatDate(bill.reviewed_at) : null} />
            <DataField label="Review comment" value={bill.review_comment} className="sm:col-span-2" />
          </div>
        </Panel>

        <Attachments entityType="vendor_invoice" entityId={bill.id} categories={DOC_CATEGORIES.vendor_invoice}
          title="Invoice copy and attachments" canRemove={isManager} />

        <section className="flex flex-col gap-3" aria-label="History">
          <h2 className="text-sm font-medium tracking-eyebrow text-secondary">History</h2>
          {bill.history.length ? (
            <ol className="flex flex-col gap-2 rounded-2xl border border-line bg-white/50 p-4 text-sm">
              {bill.history.map((h) => (
                <li key={h.id}>
                  <span className="text-ink-40">{formatDate(h.created_at)} · {h.user_name ?? "—"}:</span> {h.from_status} → <span className="font-medium">{h.to_status}</span>
                  {h.note && <span className="text-ink-40"> · {h.note}</span>}
                </li>
              ))}
            </ol>
          ) : (
            <Empty message="No status changes yet." />
          )}
        </section>

        {bill.revisions.length > 0 && (
          <section className="flex flex-col gap-3" aria-label="Revisions">
            <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Revisions</h2>
            <Table head={["Rev", "When", "By", "Reason", "Before", "After"]}>
              {bill.revisions.map((r) => (
                <Row key={r.id}>
                  <Cell>{r.revision}</Cell>
                  <Cell className="text-ink-40">{formatDate(r.created_at)}</Cell>
                  <Cell>{r.user_name}</Cell>
                  <Cell className="max-w-xs whitespace-normal">{r.reason}</Cell>
                  <Cell className="max-w-xs whitespace-normal font-mono text-[11px] text-ink-40">{r.before}</Cell>
                  <Cell className="max-w-xs whitespace-normal font-mono text-[11px]">{r.after}</Cell>
                </Row>
              ))}
            </Table>
          </section>
        )}

        <section className="flex flex-col gap-3" aria-label="Payment history">
          <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Payment history</h2>
          {bill.approvals.length ? (
            bill.approvals.map((a) => (
              <Panel key={a.id}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium">Request #{a.id} · {formatINR(a.net_payable)}</p>
                  <StatusPill status={a.status} />
                </div>
                <ol className="flex flex-col gap-1 text-xs text-ink-40">
                  {a.actions.map((x) => (
                    <li key={x.id}>
                      {formatDate(x.created_at)} · {x.approver_name} ({x.approver_role}): <span className="text-foreground">{x.decision}</span>
                      {x.comments && <> · {x.comments}</>}
                    </li>
                  ))}
                </ol>
              </Panel>
            ))
          ) : (
            <Empty message="No payment requested yet." />
          )}
          {bill.bank_matches.length > 0 && (
            <Table head={["Bank transaction", "Date", "UTR", "Amount", "Match"]}>
              {bill.bank_matches.map((m) => (
                <Row key={`${m.transaction_id}-${m.amount}`}>
                  <Cell>#{m.transaction_id}</Cell>
                  <Cell className="text-ink-40">{m.txn_date ? formatDate(m.txn_date) : "-"}</Cell>
                  <Cell className="font-mono text-xs">{m.utr ?? "-"}</Cell>
                  <Cell className="tabular-nums">{formatINR(m.amount)}</Cell>
                  <Cell>{m.status}</Cell>
                </Row>
              ))}
            </Table>
          )}
        </section>
      </div>

      {(dialog === "reject" || dialog === "approve") && (
        <DecisionDialog
          approve={dialog === "approve"}
          reportMissing={!bill.report_submitted && bill.project_id !== null}
          canOverride={isLeader}
          busy={busy}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={(body) => post("decision", body)}
        />
      )}
      {dialog === "cancel" && (
        <ReasonDialog title="Cancel this bill?" description="It stays on record with your reason. Any unpaid payment request is withdrawn."
          action="Cancel bill" busy={busy} error={error} onClose={() => setDialog(null)} onSubmit={(reason) => post("cancel", { reason })} />
      )}
      {(dialog === "edit" || dialog === "revise") && (
        <BillEditDialog bill={bill} revise={dialog === "revise"} busy={busy} error={error} onClose={() => setDialog(null)}
          onSubmit={(body) => run(() => dialog === "revise" ? api.post(`/vendors/invoices/${id}/revise`, body) : api.patch(`/vendors/invoices/${id}`, body))} />
      )}
      {dialog === "request" && vendor && (
        <RequestPaymentDialog bill={bill} vendor={vendor} busy={busy} error={error} onClose={() => setDialog(null)}
          onSubmit={(body) => run(async () => {
            const created = await api.post<{ id: number }>("/approvals", body);
            router.push(`/portal/approvals?open=${created.id}`);
          })} />
      )}
    </PortalShell>
  );
}

function DecisionDialog({ approve, reportMissing, canOverride, busy, error, onClose, onSubmit }: {
  approve: boolean; reportMissing: boolean; canOverride: boolean; busy: boolean; error: string | null;
  onClose: () => void; onSubmit: (body: { approve: boolean; comment: string | null; report_override: string | null }) => void;
}) {
  const [comment, setComment] = useState("");
  const [override, setOverride] = useState("");
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={approve ? "Approve this bill" : "Reject this bill"}
      description={approve ? "Approved bills can be sent for CFO and CEO payment approval." : "The bill goes back to whoever recorded it, with your comment."}>
      <div className="flex flex-col gap-4">
        <Field label={approve ? "Comment (optional)" : "Reason (required)"}>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className={`${inputClass} h-auto py-2.5`} />
        </Field>
        {approve && reportMissing && (
          <div className="rounded-2xl border border-warning/40 bg-warning/5 p-3 text-sm">
            <p>The vendor&apos;s report for this project is not approved yet.</p>
            {canOverride ? (
              <Field label="Reason to approve without it (CFO / CEO)">
                <input value={override} onChange={(e) => setOverride(e.target.value)} className={inputClass} />
              </Field>
            ) : (
              <p className="text-secondary">Approve the report first, or ask the CFO or CEO to approve the bill with a reason.</p>
            )}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onClose}>Cancel</Button>
          <Button type="button" magnetic={false} disabled={busy || (!approve && !comment.trim())}
            onClick={() => onSubmit({ approve, comment: comment || null, report_override: override || null })}>
            {approve ? "Approve" : "Reject"}
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

function ReasonDialog({ title, description, action, busy, error, onClose, onSubmit }: {
  title: string; description: string; action: string; busy: boolean; error: string | null; onClose: () => void; onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={title} description={description}>
      <div className="flex flex-col gap-4">
        <Field label="Reason">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={`${inputClass} h-auto py-2.5`} />
        </Field>
        {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onClose}>Back</Button>
          <Button type="button" magnetic={false} disabled={busy || !reason.trim()} onClick={() => onSubmit(reason)}>{action}</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

function BillEditDialog({ bill, revise, busy, error, onClose, onSubmit }: {
  bill: VendorBill; revise: boolean; busy: boolean; error: string | null; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void;
}) {
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      invoice_number: fd.get("invoice_number"),
      invoice_date: fd.get("invoice_date"),
      invoice_amount: Number(fd.get("invoice_amount")),
      gst_rate: Number(fd.get("gst_rate")),
      tds_section: fd.get("tds_section"),
    };
    if (revise) body.reason = fd.get("reason");
    onSubmit(body);
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={revise ? "Revise approved bill" : "Edit bill"}
      description={revise ? "A recorded correction. The bill goes back to review and any unpaid payment request must be approved again." : "Changes before approval. GST, TDS and net payable are recalculated."}>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Invoice number"><input name="invoice_number" required defaultValue={bill.invoice_number} className={inputClass} /></Field>
        <Field label="Invoice date"><input name="invoice_date" {...pastDateRule()} required defaultValue={bill.invoice_date} className={inputClass} /></Field>
        <Field label="Amount before GST (₹)"><input name="invoice_amount" {...NUMBER_RULES.positiveMoney} required defaultValue={bill.invoice_amount} className={inputClass} /></Field>
        <Field label="GST rate (%)"><Select name="gst_rate" options={GST_RATE_OPTIONS} defaultValue={String(bill.gst_rate ?? 18)} /></Field>
        <div className="sm:col-span-2">
          <Field label="TDS section">
            <Select name="tds_section" defaultValue={bill.tds_section ?? undefined}
              options={TDS_SECTIONS.map((s) => ({ value: s.key, label: s.label }))} />
          </Field>
        </div>
        {revise && (
          <div className="sm:col-span-2">
            <Field label="Reason for the correction"><textarea name="reason" required rows={2} className={`${inputClass} h-auto py-2.5`} /></Field>
          </div>
        )}
        {error && <p role="alert" className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onClose}>Cancel</Button>
          <Button type="submit" magnetic={false} disabled={busy}>{revise ? "Record revision" : "Save"}</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function RequestPaymentDialog({ bill, vendor, busy, error, onClose, onSubmit }: {
  bill: VendorBill; vendor: Vendor; busy: boolean; error: string | null; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [account, setAccount] = useState<string | undefined>(vendor.bank_accounts[0] ? String(vendor.bank_accounts[0].id) : undefined);
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Request payment"
      description="Creates a payment request for CFO, then CEO, approval. It is released only after both.">
      <div className="flex flex-col gap-4 text-sm">
        <p>Pay <span className="font-medium">{vendor.business_name}</span> {formatINR(bill.net_payable)} for {bill.invoice_number} (after {formatINR(bill.tds_amount)} TDS).</p>
        <Field label="Pay into">
          {vendor.bank_accounts.length ? (
            <Select value={account} onValueChange={setAccount}
              options={vendor.bank_accounts.map((a) => ({ value: String(a.id), label: `${a.bank_name} · ${a.account_number} · ${a.ifsc_code}` }))} />
          ) : (
            <p className="text-danger">This vendor has no bank account on record. Add one on the vendor page first.</p>
          )}
        </Field>
        {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onClose}>Cancel</Button>
          <Button type="button" magnetic={false} disabled={busy || !account}
            onClick={() => onSubmit({
              payee_name: vendor.business_name, amount: bill.gross_amount, tax_deductions: bill.tds_amount,
              net_payable: bill.net_payable, vendor_invoice_id: bill.id, vendor_bank_account_id: Number(account),
              purpose: `Vendor invoice ${bill.invoice_number}`,
            })}>
            Create payment request
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
