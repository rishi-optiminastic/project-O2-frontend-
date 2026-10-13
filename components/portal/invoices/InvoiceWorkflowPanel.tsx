"use client";

import { useState } from "react";
import { Check, Copy, MessageSquareWarning, Send, ShieldCheck, Undo2, UserCheck } from "lucide-react";
import { Panel, Field, inputClass } from "@/components/portal/ui";
import { Modal } from "@/components/portal/Modal";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { api, ApiError, type Invoice, type InvoiceWorkflowResult } from "@/lib/api";
import { WORKFLOW_STEPS, workflowStep } from "@/lib/invoice";
import { formatDate, formatINR, cn } from "@/lib/utils";

type Dialog = "manual" | "issue" | "return" | null;

const ISSUER_ROLES = ["ADMIN_CEO", "CFO", "FINANCE_MANAGER"] as const;

export function InvoiceWorkflowPanel({
  invoice,
  clientName,
  onChanged,
}: {
  invoice: Invoice;
  clientName: string;
  onChanged: () => void;
}) {
  const { user, hasRole } = useAuth();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState<Pick<InvoiceWorkflowResult, "link_url" | "emailed"> | null>(null);

  const isCreator = invoice.created_by_id !== null && invoice.created_by_id === user?.id;
  const canIssue = hasRole(...ISSUER_ROLES) && !isCreator;

  async function run(action: () => Promise<InvoiceWorkflowResult | Invoice>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if ("link_url" in result) setShared({ link_url: result.link_url, emailed: result.emailed });
      setDialog(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const send = () => run(() => api.post<InvoiceWorkflowResult>(`/invoices/${invoice.id}/send-to-client`));
  const issue = () => run(() => api.post<InvoiceWorkflowResult>(`/invoices/${invoice.id}/issue`));

  function submitNote(e: React.FormEvent<HTMLFormElement>, path: "client-approval" | "return", field: "note" | "reason") {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get(field) ?? "");
    run(() => api.post<Invoice>(`/invoices/${invoice.id}/${path}`, { [field]: value }));
  }

  return (
    <Panel className="flex flex-col gap-6">
      <StageTracker invoice={invoice} />

      <StageMessage invoice={invoice} clientName={clientName} isCreator={isCreator} canIssue={canIssue} />

      {shared?.link_url && <SharedLink url={shared.link_url} emailed={shared.emailed} />}

      {error && !dialog && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}

      <div className="flex flex-wrap gap-3">
        {(invoice.status === "Draft" || invoice.status === "Changes Requested") && (
          <Button size="sm" magnetic={false} onClick={send} disabled={busy}>
            <Send className="h-4 w-4" /> Send to client for approval
          </Button>
        )}
        {invoice.status === "Awaiting Client" && (
          <Button size="sm" variant="secondary" magnetic={false} onClick={send} disabled={busy}>
            <Send className="h-4 w-4" /> Resend approval link
          </Button>
        )}
        {["Draft", "Changes Requested", "Awaiting Client"].includes(invoice.status) && (
          <Button size="sm" variant="secondary" magnetic={false} onClick={() => setDialog("manual")} disabled={busy}>
            <UserCheck className="h-4 w-4" /> Client approved offline
          </Button>
        )}
        {invoice.status === "Client Approved" && canIssue && (
          <>
            <Button size="sm" magnetic={false} onClick={() => setDialog("issue")} disabled={busy}>
              <ShieldCheck className="h-4 w-4" /> Approve and send tax invoice
            </Button>
            <Button size="sm" variant="secondary" magnetic={false} onClick={() => setDialog("return")} disabled={busy}>
              <Undo2 className="h-4 w-4" /> Return for changes
            </Button>
          </>
        )}
      </div>

      <Modal
        open={dialog === "manual"}
        onOpenChange={(open) => setDialog(open ? "manual" : null)}
        title="Record client approval"
        description="Use this when the client confirmed outside the link, for example by email, phone or WhatsApp."
      >
        <form onSubmit={(e) => submitNote(e, "client-approval", "note")} className="flex flex-col gap-4">
          <Field label="How and by whom was it approved?">
            <textarea
              name="note"
              required
              rows={3}
              placeholder="Approved on WhatsApp by R. Shah (Accounts), 6 Oct"
              className={cn(inputClass, "h-auto py-2.5")}
            />
          </Field>
          {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" size="sm" magnetic={false} onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="submit" size="sm" magnetic={false} disabled={busy}>{busy ? "Saving…" : "Record approval"}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={dialog === "issue"}
        onOpenChange={(open) => setDialog(open ? "issue" : null)}
        title="Issue tax invoice"
        description="This is the legal GST document. It cannot be edited afterwards."
      >
        <div className="flex flex-col gap-4 text-sm">
          <ul className="flex flex-col gap-2 text-secondary">
            <li>· The next tax invoice number is assigned and today becomes the invoice date.</li>
            <li>· GST of {formatINR(invoice.gst_amount)} becomes payable for this month&apos;s return.</li>
            <li>· The invoice is locked. Corrections need a credit note.</li>
            <li>· {clientName} receives a link to view and download it.</li>
          </ul>
          {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" size="sm" magnetic={false} onClick={() => setDialog(null)}>Cancel</Button>
            <Button size="sm" magnetic={false} onClick={issue} disabled={busy}>{busy ? "Issuing…" : `Issue for ${formatINR(invoice.total_amount)}`}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={dialog === "return"}
        onOpenChange={(open) => setDialog(open ? "return" : null)}
        title="Return for changes"
        description="The proforma goes back to the team. The client will need to approve the corrected version."
      >
        <form onSubmit={(e) => submitNote(e, "return", "reason")} className="flex flex-col gap-4">
          <Field label="What needs to change?">
            <textarea name="reason" required rows={3} className={cn(inputClass, "h-auto py-2.5")} />
          </Field>
          {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" size="sm" magnetic={false} onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="submit" size="sm" magnetic={false} disabled={busy}>{busy ? "Returning…" : "Return to team"}</Button>
          </div>
        </form>
      </Modal>
    </Panel>
  );
}

function StageTracker({ invoice }: { invoice: Invoice }) {
  const current = workflowStep(invoice);
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Invoice approval stages">
      {WORKFLOW_STEPS.map((step, i) => {
        const done = i < current || (i === current && invoice.is_issued);
        const active = i === current && !done;
        return (
          <li key={step.key} className="flex items-center gap-3" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
                done && "bg-foreground text-background",
                active && "border-2 border-foreground text-foreground",
                !done && !active && "border border-dashed border-ink-40 text-ink-40",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn("text-sm", done || active ? "text-foreground" : "text-secondary")}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function StageMessage({
  invoice,
  clientName,
  isCreator,
  canIssue,
}: {
  invoice: Invoice;
  clientName: string;
  isCreator: boolean;
  canIssue: boolean;
}) {
  if (invoice.status === "Changes Requested" && invoice.change_request_note) {
    return (
      <div className="flex gap-3 rounded-2xl border border-foreground/20 bg-mist/60 p-4 text-sm">
        <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Changes requested by {invoice.change_requested_by ?? "the client"}</p>
          <p className="mt-1 whitespace-pre-line text-secondary">{invoice.change_request_note}</p>
          <p className="mt-2 text-xs text-ink-40">Edit the proforma, then send it to the client again.</p>
        </div>
      </div>
    );
  }

  const text = (() => {
    switch (invoice.status) {
      case "Draft":
        return "Proforma draft. Nothing is owed to GST yet. Edit freely, then send it to the client.";
      case "Awaiting Client":
        return `Waiting for ${clientName} to approve. Editing now withdraws the link and the client must approve again.`;
      case "Client Approved": {
        const how =
          invoice.client_approval_method === "manual"
            ? `recorded by the team: "${invoice.client_approval_note}"`
            : `approved by ${invoice.client_approver_name} through the secure link`;
        const date = invoice.client_approved_at ? ` on ${formatDate(invoice.client_approved_at)}` : "";
        const next = canIssue
          ? "Review it, then issue the tax invoice or return it."
          : isCreator
            ? "You created this invoice, so a different manager must approve it."
            : "Waiting for a Finance Manager, CFO or CEO to approve it.";
        return `Client approval ${how}${date}. ${next}`;
      }
      default:
        return invoice.issued_at
          ? `Tax invoice ${invoice.invoice_number} issued on ${formatDate(invoice.issued_at)}. It is locked; corrections need a credit note.`
          : `Tax invoice ${invoice.display_number}.`;
    }
  })();

  return <p className="text-sm text-secondary">{text}</p>;
}

function SharedLink({ url, emailed }: { url: string; emailed: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white/60 p-4 text-sm">
      <p className="text-secondary">
        {emailed ? "Emailed to the client. You can also share this link:" : "Email is not configured, so share this link with the client yourself:"}
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-mist px-3 py-2 text-xs">{url}</code>
        <Button size="sm" variant="secondary" magnetic={false} onClick={copy} aria-label="Copy client link">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
