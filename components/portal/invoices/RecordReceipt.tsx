"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, inputClass } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { formatINR, formatDate } from "@/lib/utils";
import { emitPortalEvent, PORTAL_EVENTS } from "@/lib/events";
import { api, ApiError, type Client, type CompanyBank, type Invoice } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FIELD_RULES, NUMBER_RULES, indiaToday, pastDateRule } from "@/lib/validation";
import { RECEIPT_TOLERANCE, cashToClear, oldestFirst, splitGst, splitOldestFirst, tdsStillExpected } from "@/lib/receipts";

const CLOSED_STATUSES = ["Cancelled", "Fully Paid"];

/** A receipt can only be recorded against an issued tax invoice that still has money due. */
export function canRecordReceipt(invoice: Pick<Invoice, "is_issued" | "status">): boolean {
  return invoice.is_issued && !CLOSED_STATUSES.includes(invoice.status);
}

/**
 * Record money received from a client. With `invoiceId` the form is for that
 * invoice; without it, the user picks the client and one or more of their invoices,
 * and one bank receipt is split across them.
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
      description="Money received from a client, against one or more of their invoices. The client's TDS is counted automatically, and recording a receipt locks the invoices' amounts."
    >
      {invoiceId === undefined ? (
        <PickedReceipt onDone={() => onOpenChange(false)} />
      ) : (
        <SingleInvoiceReceipt invoiceId={invoiceId} onDone={() => onOpenChange(false)} />
      )}
    </Modal>
  );
}

function SingleInvoiceReceipt({ invoiceId, onDone }: { invoiceId: number; onDone: () => void }) {
  const { data: invoice } = useApi<Invoice>(`/invoices/${invoiceId}`);
  if (!invoice) return <p className="text-sm text-ink-40">Loading invoice…</p>;
  if (!canRecordReceipt(invoice)) return <p className="text-sm text-secondary">This invoice has nothing left to receive.</p>;
  return <ReceiptForm invoices={[invoice]} onDone={onDone} />;
}

/** Client first, then tick that client's issued invoices the money pays. */
function PickedReceipt({ onDone }: { onDone: () => void }) {
  const { data: invoices } = useApi<Invoice[]>("/invoices");
  const { data: clients } = useApi<Client[]>("/clients");
  const [clientId, setClientId] = useState<number>();
  const [ticked, setTicked] = useState<number[]>([]);

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
  const theirs = oldestFirst(open.filter((i) => i.client_id === clientId));
  const selected = theirs.filter((i) => ticked.includes(i.id));

  function pickClient(value: string) {
    const id = Number(value);
    setClientId(id);
    // Most clients have one open invoice: tick it straight away.
    const forClient = open.filter((i) => i.client_id === id);
    setTicked(forClient.length === 1 ? [forClient[0].id] : []);
  }

  function toggle(id: number) {
    setTicked((all) => (all.includes(id) ? all.filter((t) => t !== id) : [...all, id]));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="sm:w-1/2 sm:pr-2">
        <Field label="Client">
          <Select options={clientOptions} value={clientId ? String(clientId) : undefined} onValueChange={pickClient} placeholder="Who paid?" />
        </Field>
      </div>
      {clientId !== undefined && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs tracking-eyebrow text-secondary">Invoices this money pays (tick one or more)</legend>
          <div className="flex flex-col divide-y divide-line/60 rounded-2xl border border-line">
            {theirs.map((inv) => (
              <label key={inv.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-mist/50">
                <input
                  type="checkbox"
                  checked={ticked.includes(inv.id)}
                  onChange={() => toggle(inv.id)}
                  className="h-4 w-4 accent-foreground"
                />
                <span className="flex-1 font-medium">{inv.display_number}</span>
                <span className="hidden text-xs text-ink-40 sm:inline">{inv.invoice_date ? formatDate(inv.invoice_date) : ""}</span>
                <span className="tabular-nums text-secondary">{formatINR(inv.amount_pending)} due</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {selected.length > 0 ? (
        // Remount when the selection changes, so the split starts again from the invoices chosen.
        <ReceiptForm key={selected.map((i) => i.id).join("-")} invoices={selected} onDone={onDone} />
      ) : (
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onDone}>
            Cancel
          </Button>
        </ModalFooter>
      )}
    </div>
  );
}

const amountText = (n: number) => (n > 0 ? String(n) : "");
const toNumber = (v: string | undefined) => Number(v || 0);
const paise = (n: number) => Math.round(n * 100) / 100;

function ReceiptForm({ invoices, onDone }: { invoices: Invoice[]; onDone: () => void }) {
  const several = invoices.length > 1;
  const fullCash = paise(invoices.reduce((sum, inv) => sum + cashToClear(inv), 0));
  const [total, setTotal] = useState(amountText(fullCash));
  const [shares, setShares] = useState<Record<number, string>>(() => sharesFor(fullCash, invoices));
  const [gstInput, setGstInput] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: banks } = useApi<CompanyBank[]>("/banks");
  const { hasRole } = useAuth();
  // Most firms have one account; it is chosen straight away.
  const [bankId, setBankId] = useState<string>();
  const chosenBank = bankId ?? (banks?.length === 1 ? String(banks[0].id) : undefined);

  const totalAmount = toNumber(total);
  const allocated = paise(invoices.reduce((sum, inv) => sum + toNumber(shares[inv.id]), 0));
  const unallocated = paise(totalAmount - allocated);
  // The receipt cannot be older than the newest invoice it pays.
  const earliestDate = invoices.map((i) => i.invoice_date ?? "").sort().at(-1) || undefined;

  function changeTotal(value: string) {
    setTotal(value);
    setShares(sharesFor(toNumber(value), invoices));
  }

  function changeShare(id: number, value: string) {
    const next = { ...shares, [id]: value };
    setShares(next);
    setTotal(amountText(paise(invoices.reduce((sum, inv) => sum + toNumber(next[inv.id]), 0))));
  }

  function problem(): string | null {
    if (!chosenBank) return "Choose the bank the money was received into.";
    if (Math.abs(unallocated) > RECEIPT_TOLERANCE) {
      return `${formatINR(Math.abs(unallocated))} of the receipt is not given to an invoice. Raise an invoice's share or lower the amount received.`;
    }
    const over = invoices.find((inv) => toNumber(shares[inv.id]) > inv.amount_pending + RECEIPT_TOLERANCE);
    if (over) return `${over.display_number}: ${formatINR(toNumber(shares[over.id]))} is more than the ${formatINR(over.amount_pending)} due.`;
    if (allocated <= 0) return "Enter the amount received.";
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = problem();
    if (found) {
      setError(found);
      return;
    }
    const fd = new FormData(e.currentTarget);
    const paying = invoices.filter((inv) => toNumber(shares[inv.id]) > 0);
    const amounts = paying.map((inv) => toNumber(shares[inv.id]));
    const gstShares = splitGst(toNumber(gstInput), amounts);
    setSaving(true);
    setError(null);
    try {
      await api.post("/invoices/receipts", {
        payment_date: fd.get("payment_date"),
        bank_account_id: Number(chosenBank),
        bank_reference: fd.get("bank_reference"),
        // TDS is left to the server: counted per invoice once the cash clears the rest.
        allocations: paying.map((inv, i) => ({ invoice_id: inv.id, amount: amounts[i], gst_component: gstShares[i] })),
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
      <Field label="Date">
        <input name="payment_date" {...pastDateRule()} min={earliestDate} required defaultValue={indiaToday()} className={inputClass} />
      </Field>
      <Field label={several ? "Total amount received (₹)" : "Amount received (₹)"}>
        <input
          {...NUMBER_RULES.positiveMoney}
          aria-label="Amount received in rupees"
          required
          value={total}
          onChange={(e) => changeTotal(e.target.value)}
          className={`${inputClass} tabular-nums`}
        />
      </Field>
      {several && <SharesTable invoices={invoices} shares={shares} onChange={changeShare} unallocated={unallocated} />}
      <Field label="Bank name (received into)">
        {banks && banks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-sm text-secondary">
            No bank added yet.{" "}
            {hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER") ? (
              <Link href="/portal/banks" className="underline underline-offset-2">
                Add one on the Banks page.
              </Link>
            ) : (
              "Ask a Finance Manager to add it on the Banks page."
            )}
          </p>
        ) : (
          <Select
            options={(banks ?? []).map((b) => ({ value: String(b.id), label: b.label }))}
            value={chosenBank}
            onValueChange={setBankId}
            placeholder={banks ? "Which account?" : "Loading banks…"}
          />
        )}
      </Field>
      <Field label="Bank UTR">
        <input name="bank_reference" {...FIELD_RULES.bankReference} placeholder="UTR or cheque number" className={inputClass} />
      </Field>
      <Field label="GST component (₹)">
        <input {...NUMBER_RULES.money} value={gstInput} onChange={(e) => setGstInput(e.target.value)} className={inputClass} />
      </Field>
      <ReceiptHint invoices={invoices} />
      {error && (
        <p role="alert" className="col-span-full text-sm text-danger">
          ⚠ {error}
        </p>
      )}
      <ModalFooter>
        <Button type="button" variant="secondary" magnetic={false} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" magnetic={false} disabled={saving}>
          {saving ? "Recording…" : "Record receipt"}
        </Button>
      </ModalFooter>
    </form>
  );
}

/** The receipt split oldest invoice first, as text for the share inputs. */
function sharesFor(total: number, invoices: Invoice[]): Record<number, string> {
  const split = splitOldestFirst(total, invoices);
  return Object.fromEntries(invoices.map((inv) => [inv.id, amountText(split[inv.id] ?? 0)]));
}

/** How much of the receipt goes to each invoice; filled oldest first and editable. */
function SharesTable({
  invoices,
  shares,
  onChange,
  unallocated,
}: {
  invoices: Invoice[];
  shares: Record<number, string>;
  onChange: (id: number, value: string) => void;
  unallocated: number;
}) {
  return (
    <fieldset className="col-span-full flex flex-col gap-2">
      <legend className="mb-2 text-xs tracking-eyebrow text-secondary">Split across the invoices (oldest first; edit any share)</legend>
      <div className="flex flex-col divide-y divide-line/60 rounded-2xl border border-line">
        {invoices.map((inv) => (
          <div key={inv.id} className="grid grid-cols-1 items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <p className="text-sm">
              <span className="font-medium">{inv.display_number}</span>
              <span className="ml-2 text-xs text-ink-40">
                {formatINR(inv.amount_pending)} due
                {tdsStillExpected(inv) > 0 && `, ${formatINR(cashToClear(inv))} clears it net of TDS`}
              </span>
            </p>
            <input
              {...NUMBER_RULES.money}
              aria-label={`Amount for ${inv.display_number} in rupees`}
              value={shares[inv.id] ?? ""}
              onChange={(e) => onChange(inv.id, e.target.value)}
              placeholder="₹ 0"
              className={`${inputClass} tabular-nums`}
            />
          </div>
        ))}
      </div>
      {Math.abs(unallocated) > RECEIPT_TOLERANCE && (
        <p className="text-xs text-warning" aria-live="polite">
          ⚠ {formatINR(Math.abs(unallocated))} {unallocated > 0 ? "more than the selected invoices need" : "short of the shares entered"}.
        </p>
      )}
    </fieldset>
  );
}

function ReceiptHint({ invoices }: { invoices: Invoice[] }) {
  const due = invoices.reduce((sum, inv) => sum + inv.amount_pending, 0);
  const tds = invoices.reduce((sum, inv) => sum + tdsStillExpected(inv), 0);
  const rates = [...new Set(invoices.map((i) => i.tds_rate))];
  const rate = rates.length === 1 ? ` (${rates[0]}%)` : "";
  return (
    <p className="col-span-full text-xs text-ink-40">
      {formatINR(due)} still due.
      {tds > 0 && ` TDS of ${formatINR(tds)}${rate} counts as deducted by the client on each invoice once the amount received clears the rest.`}
      {invoices.length > 1 && " The GST component is shared across the invoices in proportion to their amounts."}
    </p>
  );
}
