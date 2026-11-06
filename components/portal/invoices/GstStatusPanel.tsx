"use client";

import { useState } from "react";
import { Panel, Field, inputClass, StatusPill } from "@/components/portal/ui";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type Invoice } from "@/lib/api";
import { formatDate } from "@/lib/utils";

/** Where an invoice's GST may go next. Mirrors the backend; the server has the final say. */
const NEXT: Record<string, string[]> = {
  "GST Pending Collection": ["GST Collected", "GST On Hold"],
  "GST Collected": ["GST Payment Pending", "GST Paid", "GST Pending Collection", "GST On Hold"],
  "GST Payment Pending": ["GST Paid", "GST Collected", "GST On Hold"],
  "GST Paid": ["GST Reconciled", "GST On Hold"],
  "GST Reconciled": [],
};

type HistoryRow = { field: string; from: string | null; to: string; note: string | null; by: string | null; at: string };

/**
 * The tax on this one invoice, moved by hand with a reason. Separate from the
 * client's payment and from the month's GST return: paying an invoice never moves it.
 */
export function GstStatusPanel({ invoice, onSaved }: { invoice: Invoice; onSaved: () => void }) {
  const { hasRole } = useAuth();
  const canChange = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const { data: history, refetch } = useApi<HistoryRow[]>(canChange ? `/invoices/${invoice.id}/gst-status/history` : null);
  const options = invoice.gst_status === "GST On Hold"
    ? [lastBeforeHold(history) ?? "GST Pending Collection"]
    : NEXT[invoice.gst_status] ?? [];
  const [next, setNext] = useState<string>();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!next) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/invoices/${invoice.id}/gst-status`, { status: next, note: note || null });
      setNext(undefined);
      setNote("");
      refetch();
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not change the GST status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium tracking-eyebrow text-secondary">GST on this invoice</h2>
        <StatusPill status={invoice.gst_status} />
      </div>
      <p className="mb-4 text-xs text-ink-40">
        Moved by hand. A client payment does not change it, and filing the month&apos;s return is tracked under Taxation.
      </p>
      {canChange && options.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Move to">
              <Select
                value={next}
                onValueChange={setNext}
                placeholder="Choose the next status"
                options={options.map((o) => ({ value: o, label: o }))}
              />
            </Field>
            <Field label={next === "GST On Hold" ? "Reason (required)" : "Note"}>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={inputClass} />
            </Field>
          </div>
          {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
          <div className="flex justify-end">
            <Button size="sm" magnetic={false} onClick={save} disabled={!next || saving}>
              {saving ? "Saving…" : "Update GST status"}
            </Button>
          </div>
        </div>
      )}
      {history && history.length > 0 && (
        <ol className="mt-4 flex flex-col gap-1.5 border-t border-line/60 pt-3 text-xs text-ink-40">
          {history.map((h, i) => (
            <li key={i}>
              {formatDate(h.at)} · {h.by ?? "—"}: {h.from} → {h.to}
              {h.note && <> · {h.note}</>}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function lastBeforeHold(history: HistoryRow[] | null | undefined): string | null {
  const last = [...(history ?? [])].reverse().find((h) => h.to === "GST On Hold");
  return last?.from ?? null;
}
