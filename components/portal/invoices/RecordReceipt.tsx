"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { formatINR } from "@/lib/utils";
import { emitPortalEvent, PORTAL_EVENTS } from "@/lib/events";
import { api, ApiError, type Client, type Invoice } from "@/lib/api";
import { FIELD_RULES, NUMBER_RULES, indiaToday, pastDateRule } from "@/lib/validation";

/** Rounding slack, matching the backend's settlement tolerance. */
const TOLERANCE = 0.01;

const CLOSED_STATUSES = ["Cancelled", "Fully Paid"];

/** A receipt can only be recorded against an issued tax invoice that still has money due. */
export function canRecordReceipt(invoice: Pick<Invoice, "is_issued" | "status">): boolean {
  return invoice.is_issued && !CLOSED_STATUSES.includes(invoice.status);
}

/** TDS the client has yet to deduct; it settles part of what is due without cash. */
function tdsStillExpected(invoice: Invoice): number {
  const tdsSoFar = (invoice.payments ?? []).reduce((sum, p) => sum + p.tds_deducted, 0);
  return Math.min(Math.max(+(invoice.expected_tds - tdsSoFar).toFixed(2), 0), invoice.amount_pending);
}

/**
 * Record money received from a client. With `invoiceId` the form is for that
 * invoice; without it, the user first picks the client and the invoice.
 */
export function RecordReceiptModal({
  open,
  onOpenChange,
  invoiceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId?: number;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Record a receipt"
      description="Money received from a client. Cash plus the TDS the client deducted settles the invoice, and recording it locks the invoice's amounts."
    >
      <ReceiptBody invoiceId={invoiceId} onDone={() => onOpenChange(false)} />
    </Modal>
  );
}

function ReceiptBody({ invoiceId, onDone }: { invoiceId?: number; onDone: () => void }) {
  const [selectedId, setSelectedId] = useState<number | undefined>(invoiceId);
  const { data: invoice, loading } = useApi<Invoice>(selectedId ? `/invoices/${selectedId}` : null);
  const picking = invoiceId === undefined;
  const ready = invoice && invoice.id === selectedId;

  return (
    <div className="flex flex-col gap-5">
      {picking && <InvoicePicker selectedId={selectedId} onSelect={setSelectedId} />}
      {selectedId && !ready && loading && <p className="text-sm text-ink-40">Loading invoice…</p>}
      {ready &&
        (canRecordReceipt(invoice) ? (
          <ReceiptForm key={invoice.id} invoice={invoice} onDone={onDone} />
        ) : (
          <p className="text-sm text-secondary">This invoice has nothing left to receive.</p>
        ))}
      {picking && !selectedId && (
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onDone}>
            Cancel
          </Button>
        </ModalFooter>
      )}
    </div>
  );
}

/** Client first, then that client's issued invoices that still have money due. */
function InvoicePicker({ selectedId, onSelect }: { selectedId?: number; onSelect: (id: number) => void }) {
  const { data: invoices } = useApi<Invoice[]>("/invoices");
  const { data: clients } = useApi<Client[]>("/clients");
  const [clientId, setClientId] = useState<number>();

  if (!invoices || !clients) return <p className="text-sm text-ink-40">Loading open invoices…</p>;

  const open = invoices.filter(canRecordReceipt);
  if (!open.length) {
    return <p className="text-sm text-secondary">No issued invoice is waiting for money. Issue a tax invoice first.</p>;
  }

  const clientIds = new Set(open.map((i) => i.client_id));
  const clientOptions = clients
    .filter((c) => clientIds.has(c.id))
    .map((c) => ({ value: String(c.id), label: c.business_name }));
  const invoiceOptions = open
    .filter((i) => i.client_id === clientId)
    .map((i) => ({ value: String(i.id), label: `${i.display_number} · ${formatINR(i.amount_pending)} due` }));

  function pickClient(value: string) {
    const id = Number(value);
    setClientId(id);
    // Most clients have one open invoice: choose it straight away.
    const theirs = open.filter((i) => i.client_id === id);
    if (theirs.length === 1) onSelect(theirs[0].id);
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Client">
        <Select options={clientOptions} value={clientId ? String(clientId) : undefined} onValueChange={pickClient} placeholder="Who paid?" />
      </Field>
      <Field label="Invoice">
        <Select
          // Remount per client so the previous client's invoice is not kept.
          key={clientId ?? "none"}
          options={invoiceOptions}
          value={selectedId && invoiceOptions.some((o) => o.value === String(selectedId)) ? String(selectedId) : undefined}
          onValueChange={(v) => onSelect(Number(v))}
          placeholder={clientId ? "Which invoice?" : "Choose the client first"}
        />
      </Field>
    </div>
  );
}

function ReceiptForm({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const tdsExpected = tdsStillExpected(invoice);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    if (amount > invoice.amount_pending + TOLERANCE) {
      setError(`Receipt of ${formatINR(amount)} exceeds the pending amount of ${formatINR(invoice.amount_pending)}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/invoices/${invoice.id}/payments`, {
        amount,
        payment_date: fd.get("payment_date"),
        bank_reference: fd.get("bank_reference"),
        bank_name: fd.get("bank_name"),
        tds_deducted: Number(fd.get("tds_deducted") || 0),
        gst_component: Number(fd.get("gst_component") || 0),
        remarks: fd.get("remarks"),
        attachment: fd.get("attachment") || null,
      });
      emitPortalEvent(PORTAL_EVENTS.receiptRecorded);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record the receipt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label={`Cash received (₹) · ${formatINR(invoice.amount_pending)} still due`}>
        <input
          name="amount"
          {...NUMBER_RULES.positiveMoney}
          max={invoice.amount_pending}
          required
          defaultValue={Math.max(invoice.amount_pending - tdsExpected, 0)}
          className={inputClass}
        />
      </Field>
      <Field label="Date">
        <input
          name="payment_date"
          {...pastDateRule()}
          // A receipt cannot be older than the invoice it pays.
          min={invoice.invoice_date ?? undefined}
          required
          defaultValue={indiaToday()}
          className={inputClass}
        />
      </Field>
      <Field label="Bank reference / UTR">
        <input name="bank_reference" {...FIELD_RULES.bankReference} placeholder="UTR or cheque number" className={inputClass} />
      </Field>
      <Field label="Bank name (received into)">
        <input name="bank_name" required maxLength={160} placeholder="HDFC Bank" className={inputClass} />
      </Field>
      <Field label={`TDS deducted by client (₹) · ${formatINR(tdsExpected)} expected`}>
        <input name="tds_deducted" {...NUMBER_RULES.money} max={tdsExpected} defaultValue={tdsExpected} className={inputClass} />
      </Field>
      <Field label="GST component (₹)">
        <input name="gst_component" {...NUMBER_RULES.money} defaultValue={0} className={inputClass} />
      </Field>
      <Field label="Remarks">
        <input name="remarks" className={inputClass} />
      </Field>
      <Field label="Attachment (reference / link)">
        <input name="attachment" className={inputClass} />
      </Field>
      {error && <p role="alert" className="col-span-full text-sm text-danger">⚠ {error}</p>}
      <ModalFooter>
        <Button type="button" variant="secondary" magnetic={false} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" magnetic={false} disabled={saving}>
          {saving ? "Recording…" : "Record receipt (locks invoice)"}
        </Button>
      </ModalFooter>
    </form>
  );
}
