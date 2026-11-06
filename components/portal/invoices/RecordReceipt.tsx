"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { formatINR } from "@/lib/utils";
import { emitPortalEvent, PORTAL_EVENTS } from "@/lib/events";
import { api, ApiError, type Client, type Invoice, type SplitReceiptResult } from "@/lib/api";
import { FIELD_RULES, NUMBER_RULES, indiaToday, pastDateRule } from "@/lib/validation";

/** Rounding slack, matching the backend's settlement tolerance. */
const TOLERANCE = 0.01;
const PROOF_FIELD = "proof_files";

/** Upload the proof files chosen in the form onto a recorded receipt. Returns the ones that failed. */
async function attachProof(paymentId: number, fd: FormData): Promise<string[]> {
  const files = fd.getAll(PROOF_FIELD).filter((f): f is File => f instanceof File && f.size > 0);
  const failed: string[] = [];
  for (const file of files) {
    try {
      await api.form("/documents", { entity_type: "payment", entity_id: String(paymentId), category: "receipt_proof", file });
    } catch (err) {
      failed.push(`${file.name}: ${err instanceof ApiError ? err.message : "upload failed"}`);
    }
  }
  return failed;
}

function ProofInput() {
  return (
    <Field label="Payment proof (PDF, JPG, PNG · optional)">
      <input
        name={PROOF_FIELD}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png"
        className={`${inputClass} h-auto py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-mist file:px-3 file:py-1.5 file:text-sm`}
      />
    </Field>
  );
}

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
  const { data: invoice, loading } = useApi<Invoice>(invoiceId ? `/invoices/${invoiceId}` : null);

  // Without a fixed invoice, one bank receipt can settle several of the client's invoices.
  if (invoiceId === undefined) return <MultiInvoiceReceipt onDone={onDone} />;

  return (
    <div className="flex flex-col gap-5">
      {!invoice && loading && <p className="text-sm text-ink-40">Loading invoice…</p>}
      {invoice &&
        (canRecordReceipt(invoice) ? (
          <ReceiptForm key={invoice.id} invoice={invoice} onDone={onDone} />
        ) : (
          <p className="text-sm text-secondary">This invoice has nothing left to receive.</p>
        ))}
    </div>
  );
}

type Split = { amount: string; tds: string };

/**
 * TDS a listed invoice still expects. The list carries no payments, so this is
 * exact for an invoice with nothing received yet and 0 otherwise (editable).
 */
function listTdsExpected(invoice: Invoice): number {
  const untouched = invoice.amount_received <= 0 && Math.abs(invoice.amount_pending - invoice.total_amount) < TOLERANCE;
  return untouched ? Math.min(invoice.expected_tds, invoice.amount_pending) : 0;
}

function defaultSplit(invoice: Invoice): Split {
  const tds = listTdsExpected(invoice);
  return { amount: String(+Math.max(invoice.amount_pending - tds, 0).toFixed(2)), tds: String(tds) };
}

/** One bank receipt from a client, split across several of their open invoices. */
function MultiInvoiceReceipt({ onDone }: { onDone: () => void }) {
  const { data: invoices } = useApi<Invoice[]>("/invoices");
  const { data: clients } = useApi<Client[]>("/clients");
  const [clientId, setClientId] = useState<number>();
  const [splits, setSplits] = useState<Record<number, Split>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!invoices || !clients) return <p className="text-sm text-ink-40">Loading open invoices…</p>;

  const open = invoices.filter(canRecordReceipt);
  if (!open.length) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-secondary">No issued invoice is waiting for money. Issue a tax invoice first.</p>
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onDone}>
            Close
          </Button>
        </ModalFooter>
      </div>
    );
  }

  const clientIds = new Set(open.map((i) => i.client_id));
  const clientOptions = clients
    .filter((c) => clientIds.has(c.id))
    .map((c) => ({ value: String(c.id), label: c.business_name }));
  const theirs = open.filter((i) => i.client_id === clientId);
  const selected = theirs.filter((i) => splits[i.id]);
  const totalCash = selected.reduce((s, i) => s + Number(splits[i.id].amount || 0), 0);
  const totalTds = selected.reduce((s, i) => s + Number(splits[i.id].tds || 0), 0);

  function pickClient(value: string) {
    const id = Number(value);
    setClientId(id);
    setError(null);
    // A client with one open invoice: tick it straight away.
    const only = open.filter((i) => i.client_id === id);
    setSplits(only.length === 1 ? { [only[0].id]: defaultSplit(only[0]) } : {});
  }

  function toggle(invoice: Invoice, on: boolean) {
    setSplits((prev) => {
      const next = { ...prev };
      if (on) next[invoice.id] = defaultSplit(invoice);
      else delete next[invoice.id];
      return next;
    });
  }

  function edit(id: number, key: keyof Split, value: string) {
    setSplits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!clientId || !selected.length) {
      setError("Tick at least one invoice this money settles.");
      return;
    }
    for (const inv of selected) {
      const settling = Number(splits[inv.id].amount || 0) + Number(splits[inv.id].tds || 0);
      if (settling > inv.amount_pending + TOLERANCE) {
        setError(`${inv.display_number}: ${formatINR(settling)} is more than the ${formatINR(inv.amount_pending)} still due.`);
        return;
      }
    }
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const result = await api.post<SplitReceiptResult>("/invoices/receipts", {
        client_id: clientId,
        payment_date: fd.get("payment_date"),
        bank_name: fd.get("bank_name"),
        bank_reference: fd.get("bank_reference") || null,
        remarks: fd.get("remarks") || null,
        allocations: selected.map((inv) => ({
          invoice_id: inv.id,
          amount: Number(splits[inv.id].amount),
          tds_deducted: Number(splits[inv.id].tds || 0),
        })),
      });
      // One proof for the whole receipt: every part shares it.
      const part = result.invoices[0]?.payments?.find((p) => p.receipt_ref === result.receipt_ref);
      const failed = part ? await attachProof(part.id, fd) : [];
      emitPortalEvent(PORTAL_EVENTS.receiptRecorded);
      if (failed.length) {
        setError(`Receipt ${result.receipt_ref} was recorded, but the proof was not attached: ${failed.join("; ")}`);
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record the receipt");
    } finally {
      setSaving(false);
    }
  }

  // Receipt date cannot be before the newest selected invoice.
  const minDate = selected.map((i) => i.invoice_date).filter(Boolean).sort().at(-1) ?? undefined;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label="Client">
        <Select options={clientOptions} value={clientId ? String(clientId) : undefined} onValueChange={pickClient} placeholder="Who paid?" />
      </Field>

      {clientId && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs tracking-eyebrow text-secondary">Invoices this money settles</legend>
          {theirs.map((inv) => {
            const split = splits[inv.id];
            return (
              <div key={inv.id} className="rounded-2xl border border-line bg-white/50 p-3">
                <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={!!split} onChange={(e) => toggle(inv, e.target.checked)} className="accent-foreground" />
                    <span className="font-medium">{inv.display_number}</span>
                  </span>
                  <span className="tabular-nums text-ink-40">{formatINR(inv.amount_pending)} due</span>
                </label>
                {split && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Cash (₹)">
                      <input
                        {...NUMBER_RULES.positiveMoney}
                        max={inv.amount_pending}
                        required
                        value={split.amount}
                        onChange={(e) => edit(inv.id, "amount", e.target.value)}
                        aria-label={`Cash received for ${inv.display_number}`}
                        className={inputClass}
                      />
                    </Field>
                    <Field label={`TDS deducted (₹) · ${formatINR(inv.expected_tds)} at ${inv.tds_rate}%`}>
                      <input
                        {...NUMBER_RULES.money}
                        max={inv.expected_tds}
                        value={split.tds}
                        onChange={(e) => edit(inv.id, "tds", e.target.value)}
                        aria-label={`TDS deducted on ${inv.display_number}`}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>
      )}

      {selected.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date">
            <input name="payment_date" {...pastDateRule()} min={minDate} required defaultValue={indiaToday()} className={inputClass} />
          </Field>
          <Field label="Bank name (received into)">
            <input name="bank_name" required maxLength={160} placeholder="HDFC Bank" className={inputClass} />
          </Field>
          <Field label="Bank reference / UTR">
            <input name="bank_reference" {...FIELD_RULES.bankReference} placeholder="UTR or cheque number" className={inputClass} />
          </Field>
          <Field label="Remarks">
            <input name="remarks" className={inputClass} />
          </Field>
          <div className="col-span-full">
            <ProofInput />
          </div>
          <p className="col-span-full rounded-2xl border border-line bg-mist/50 p-3 text-sm" aria-live="polite">
            One receipt of <span className="font-medium tabular-nums">{formatINR(totalCash)}</span> across {selected.length} invoice
            {selected.length === 1 ? "" : "s"}
            {totalTds > 0 && <>, plus {formatINR(totalTds)} TDS deducted</>}. All of it is recorded or none of it.
          </p>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
      <ModalFooter>
        <Button type="button" variant="secondary" magnetic={false} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" magnetic={false} disabled={saving || !selected.length}>
          {saving ? "Recording…" : selected.length > 1 ? `Record receipt for ${selected.length} invoices` : "Record receipt (locks invoice)"}
        </Button>
      </ModalFooter>
    </form>
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
      const updated = await api.post<Invoice>(`/invoices/${invoice.id}/payments`, {
        amount,
        payment_date: fd.get("payment_date"),
        bank_reference: fd.get("bank_reference"),
        bank_name: fd.get("bank_name"),
        tds_deducted: Number(fd.get("tds_deducted") || 0),
        gst_component: Number(fd.get("gst_component") || 0),
        remarks: fd.get("remarks"),
      });
      const newest = [...(updated.payments ?? [])].sort((a, b) => b.id - a.id)[0];
      const failed = newest ? await attachProof(newest.id, fd) : [];
      emitPortalEvent(PORTAL_EVENTS.receiptRecorded);
      if (failed.length) {
        setError(`The receipt was recorded, but the proof was not attached: ${failed.join("; ")}`);
        return;
      }
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
      <ProofInput />
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
