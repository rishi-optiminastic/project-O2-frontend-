"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Printer } from "lucide-react";
import { InvoiceDocument } from "@/components/invoice/InvoiceDocument";
import { Field, inputClass } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { GridLoader } from "@/components/ui/GridLoader";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type PublicInvoiceView } from "@/lib/api";
import { formatDate, cn } from "@/lib/utils";

/** Client-facing invoice page. The token in the URL is the only credential. */
export default function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const path = `/public/invoices/${encodeURIComponent(token)}`;
  const { data: view, loading, error, refetch } = useApi<PublicInvoiceView>(token ? path : null);

  if (loading && !view) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <GridLoader />
      </div>
    );
  }

  if (!view) {
    return (
      <main className="mx-auto max-w-md pt-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Link unavailable</h1>
        <p className="mt-3 text-secondary">{error ?? "This link is invalid or has expired."}</p>
        <p className="mt-1 text-sm text-ink-40">Please contact the sender for a new link.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <p className="text-sm text-secondary">
          {view.invoice.is_issued ? "Your tax invoice" : "Proforma for your review"}
        </p>
        <Button size="sm" variant="secondary" magnetic={false} onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print or save PDF
        </Button>
      </div>

      {view.purpose === "approve" && (
        <div className="print:hidden">
          {view.can_act ? <ClientDecision path={path} onDone={refetch} /> : <DecisionRecorded view={view} />}
        </div>
      )}

      <InvoiceDocument view={view} />
    </main>
  );
}

function ClientDecision({ path, onDone }: { path: string; onDone: () => void }) {
  const [mode, setMode] = useState<"approve" | "changes">("approve");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      if (mode === "approve") await api.post(`${path}/approve`, { name: fd.get("name") });
      else await api.post(`${path}/request-changes`, { comment: fd.get("comment") });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-line bg-white/80 p-6" aria-labelledby="decision-title">
      <h2 id="decision-title" className="text-lg font-medium tracking-tight">Does this proforma look right?</h2>
      <div className="mt-4 inline-flex rounded-full border border-line p-1" role="tablist" aria-label="Your decision">
        {(["approve", "changes"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              mode === m ? "bg-foreground text-background" : "text-secondary hover:text-foreground",
            )}
          >
            {m === "approve" ? "Approve" : "Request changes"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        {mode === "approve" ? (
          <Field label="Your full name">
            <input name="name" required maxLength={160} autoComplete="name" className={inputClass} />
          </Field>
        ) : (
          <Field label="What should we change?">
            <textarea name="comment" required maxLength={2000} rows={4} className={cn(inputClass, "h-auto py-2.5")} />
          </Field>
        )}
        {error && <p role="alert" className="text-sm text-foreground/80">⚠ {error}</p>}
        <div>
          <Button type="submit" size="sm" magnetic={false} disabled={busy}>
            {busy ? "Sending…" : mode === "approve" ? "Approve proforma" : "Send request"}
          </Button>
        </div>
        {mode === "approve" && (
          <p className="text-xs text-ink-40">
            By approving, you confirm the amounts above. The final GST tax invoice will follow by email.
          </p>
        )}
      </form>
    </section>
  );
}

function DecisionRecorded({ view }: { view: PublicInvoiceView }) {
  const { status, client_approved_at, client_approver_name } = view.invoice;
  const message =
    status === "Client Approved" || view.invoice.is_issued
      ? `Approved${client_approver_name ? ` by ${client_approver_name}` : ""}${client_approved_at ? ` on ${formatDate(client_approved_at)}` : ""}. Thank you. Your tax invoice will follow by email.`
      : status === "Changes Requested"
        ? "Thank you. Your requested changes were sent. You will receive an updated proforma."
        : "This proforma is no longer open for approval.";
  return (
    <div role="status" className="flex items-start gap-3 rounded-[28px] border border-line bg-white/80 p-5 text-sm">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
