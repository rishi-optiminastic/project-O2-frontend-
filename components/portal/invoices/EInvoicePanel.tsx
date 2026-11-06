"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Panel, Field, inputClass, DataField, StatusPill } from "@/components/portal/ui";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { api, ApiError, EINVOICE_STATUSES, type EInvoiceStatus, type Invoice } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { pastDateRule } from "@/lib/validation";

const GENERATED: EInvoiceStatus = "E-invoice Generated";

/**
 * E-invoice (IRN) tracking for an issued tax invoice. The IRN is generated on
 * the GST portal; the team records it here. There is no live IRP integration.
 */
export function EInvoicePanel({ invoice, onSaved }: { invoice: Invoice; onSaved: () => void }) {
  const { hasRole } = useAuth();
  const canRecord = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<EInvoiceStatus>(invoice.einvoice_status ?? "E-invoice Pending");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Null only on invoices issued before e-invoice tracking began; they are not back-filled.
  const tracked = invoice.einvoice_status !== null;
  const current = invoice.einvoice_status ?? "Not tracked";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/invoices/${invoice.id}/einvoice`, {
        status,
        ...(status === GENERATED
          ? { irn: fd.get("irn"), ack_number: fd.get("ack_number"), ack_date: fd.get("ack_date") }
          : {}),
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the e-invoice details");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium tracking-eyebrow text-secondary">E-invoice (IRN)</h2>
        <div className="flex items-center gap-3">
          <StatusPill status={current} />
          {canRecord && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 text-xs text-secondary transition-colors hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" /> {current === GENERATED ? "Change" : "Record IRN"}
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Status">
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as EInvoiceStatus)}
                options={EINVOICE_STATUSES.map((s) => ({ value: s, label: s }))}
              />
            </Field>
          </div>
          {status === GENERATED && (
            <>
              <div className="sm:col-span-2">
                <Field label="IRN (from the GST portal)">
                  <input
                    name="irn"
                    required
                    minLength={10}
                    maxLength={64}
                    defaultValue={invoice.irn ?? ""}
                    spellCheck={false}
                    className={`${inputClass} font-mono`}
                  />
                </Field>
              </div>
              <Field label="Acknowledgement number">
                <input name="ack_number" required maxLength={40} defaultValue={invoice.einvoice_ack_number ?? ""} className={`${inputClass} font-mono`} />
              </Field>
              <Field label="Acknowledgement date">
                <input
                  name="ack_date"
                  {...pastDateRule()}
                  min={invoice.invoice_date ?? undefined}
                  required
                  defaultValue={invoice.einvoice_ack_date ?? invoice.invoice_date ?? ""}
                  className={inputClass}
                />
              </Field>
            </>
          )}
          {error && <p role="alert" className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
          <div className="sm:col-span-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" size="sm" magnetic={false} onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" magnetic={false} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      ) : current === GENERATED ? (
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
          <DataField label="IRN" value={invoice.irn} mono className="sm:col-span-3 break-all" />
          <DataField label="Acknowledgement number" value={invoice.einvoice_ack_number} mono />
          <DataField label="Acknowledgement date" value={invoice.einvoice_ack_date ? formatDate(invoice.einvoice_ack_date) : null} />
        </div>
      ) : (
        <p className="text-sm text-secondary">
          {!tracked
            ? "Issued before e-invoice tracking began. Record its IRN here if one was generated."
            : current === "E-invoice Pending"
              ? "Generate the e-invoice on the GST portal, then record its IRN and acknowledgement here."
              : "Marked as not needing an e-invoice."}
        </p>
      )}
    </Panel>
  );
}
