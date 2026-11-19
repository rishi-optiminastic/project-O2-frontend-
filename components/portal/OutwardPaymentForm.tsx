"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/portal/ui";
import { Modal } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type Vendor, type VendorPayable } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { NAME_MAX, NUMBER_RULES, TEXT_MAX } from "@/lib/validation";
import { emitPortalEvent, PORTAL_EVENTS } from "@/lib/events";

/** The "Paid to" choice for money out that is not a vendor bill, such as rent. */
const OTHER_PAYEE = "other";
/** Pay every bill the vendor still owes on. */
const ALL_BILLS = "all";

/**
 * Record an outward payment for CEO sign-off.
 *
 * To a vendor: pick the vendor and the bill being paid, or all their bills still due. The
 * amount cannot be more than those bills still owe (after Optiminastic's commission) and is
 * split equally across every UPS code on them, as the hint shows. "Someone else" is for
 * money out that is not a vendor bill.
 */
export function OutwardPaymentForm({
  open,
  onOpenChange,
  vendorId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Start with this vendor chosen (on a vendor's page). */
  vendorId?: number;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Outward payment"
      description="Money going out. It goes to the CEO for approval and is released once the bank reference (UTR) is entered. A vendor is never paid more than their bills still owe."
    >
      {open && <PaymentFields initialVendorId={vendorId} onDone={() => onOpenChange(false)} />}
    </Modal>
  );
}

/** The same equal split the server makes: in paise, smallest debts settled first. */
function splitEqually(amount: number, dues: { key: string; due: number }[]): Map<string, number> {
  let remaining = Math.round(amount * 100);
  const open = dues.map((d) => ({ key: d.key, owed: Math.round(d.due * 100) })).filter((d) => d.owed > 0).sort((a, b) => a.owed - b.owed);
  const given = new Map<string, number>();
  open.forEach((d, i) => {
    const take = Math.min(d.owed, Math.floor(remaining / (open.length - i)));
    given.set(d.key, take);
    remaining -= take;
  });
  for (const d of open) {
    if (remaining <= 0) break;
    if ((given.get(d.key) ?? 0) < d.owed) {
      given.set(d.key, (given.get(d.key) ?? 0) + 1);
      remaining -= 1;
    }
  }
  return new Map([...given].map(([k, p]) => [k, p / 100]));
}

function PaymentFields({ initialVendorId, onDone }: { initialVendorId?: number; onDone: () => void }) {
  const { data: vendors } = useApi<Vendor[]>("/vendors");
  const [payee, setPayee] = useState<string | undefined>(initialVendorId ? String(initialVendorId) : undefined);
  const isVendor = payee !== undefined && payee !== OTHER_PAYEE;
  const { data: payables, loading } = useApi<VendorPayable[]>(isVendor ? `/vendors/${payee}/payables` : null);
  const [bill, setBill] = useState<string>(ALL_BILLS);
  const [bank, setBank] = useState<string | undefined>(undefined);
  const [amountInput, setAmountInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const vendor = isVendor ? vendors?.find((v) => String(v.id) === payee) : undefined;
  const due = (payables ?? []).filter((p) => p.due > 0);
  const selected = bill === ALL_BILLS ? due : due.filter((p) => String(p.invoice_id) === bill);
  const totalDue = +selected.reduce((s, p) => s + p.due, 0).toFixed(2);
  // Until an amount is typed, pay everything still due on the chosen bills.
  const amount = amountInput.trim() === "" ? totalDue : Number(amountInput);
  const over = isVendor && amount > totalDue + 0.001;
  const split = useMemo(
    () =>
      !isVendor || over || amount <= 0
        ? new Map<string, number>()
        : splitEqually(amount, selected.flatMap((p) => p.lines.map((l) => ({ key: `${p.invoice_id}:${l.line_id}`, due: l.due })))),
    [amount, isVendor, over, selected],
  );
  const codeOf = new Map(selected.flatMap((p) => p.lines.map((l) => [`${p.invoice_id}:${l.line_id}`, l.code ?? p.invoice_number])));
  const accounts = (vendor?.bank_accounts ?? []).map((a) => ({
    value: `${a.bank_name} · A/C ${a.account_number} · ${a.ifsc_code}`,
    label: `${a.bank_name} ··${a.account_number.slice(-4)}`,
  }));
  const vendorReady = isVendor && selected.length > 0 && !over && amount > 0;

  function choosePayee(value: string) {
    setPayee(value);
    setBill(ALL_BILLS);
    setBank(undefined);
    setAmountInput("");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isVendor && !vendorReady) return;
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      if (isVendor) {
        await api.post("/approvals/vendor-payout", {
          vendor_id: Number(payee),
          vendor_invoice_ids: selected.map((p) => p.invoice_id),
          amount,
          purpose: fd.get("purpose") || null,
          bank_details: bank ?? null,
        });
      } else {
        const tax = Number(fd.get("tax_deductions") || 0);
        await api.post("/approvals", {
          payee_name: fd.get("payee_name"),
          amount,
          purpose: fd.get("purpose"),
          tax_deductions: tax,
          net_payable: amount - tax,
          bank_details: fd.get("bank_details"),
        });
      }
      emitPortalEvent(PORTAL_EVENTS.paymentRequested);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Paid to">
        <Select
          required
          value={payee}
          onValueChange={choosePayee}
          placeholder="Who is paid?"
          options={[
            ...(vendors ?? []).map((v) => ({ value: String(v.id), label: v.business_name })),
            { value: OTHER_PAYEE, label: "Someone else (not a vendor)" },
          ]}
        />
      </Field>
      {isVendor ? (
        <Field label="Bill (UPS codes)">
          <Select
            value={bill}
            onValueChange={(v) => {
              setBill(v);
              setAmountInput("");
            }}
            options={[
              { value: ALL_BILLS, label: due.length ? `All bills still due (${due.length})` : "No bills due" },
              ...due.map((p) => ({ value: String(p.invoice_id), label: `${p.invoice_number} · ${formatINR(p.due)} due` })),
            ]}
          />
        </Field>
      ) : payee === OTHER_PAYEE ? (
        <Field label="Payee name">
          <input name="payee_name" required maxLength={NAME_MAX} className={inputClass} />
        </Field>
      ) : (
        <div className="hidden sm:block" aria-hidden />
      )}

      {isVendor && (loading && !payables ? (
        <p className="text-sm text-ink-40 sm:col-span-2">Loading the vendor&apos;s bills…</p>
      ) : due.length === 0 ? (
        <p className="text-xs text-warning sm:col-span-2">
          ⚠ Nothing is due to {vendor?.business_name ?? "this vendor"}: every bill is paid or already in a payout.
        </p>
      ) : (
        <PaymentLimit totalDue={totalDue} split={split} codeOf={codeOf} />
      ))}

      {(!isVendor || due.length > 0) && (
        <>
          <Field label="Amount (₹)">
            <input
              {...NUMBER_RULES.positiveMoney}
              name="amount"
              required={!isVendor}
              value={amountInput}
              placeholder={isVendor ? String(totalDue) : undefined}
              onChange={(e) => setAmountInput(e.target.value)}
              className={inputClass + (over ? " border-danger" : "")}
            />
            {over && <span className="mt-1 block text-xs text-danger">Cannot be more than the {formatINR(totalDue)} still due.</span>}
          </Field>
          {!isVendor && (
            <Field label="Tax deductions (₹)">
              <input name="tax_deductions" {...NUMBER_RULES.money} defaultValue={0} className={inputClass} />
            </Field>
          )}
          <Field label={isVendor ? "Purpose (optional)" : "Purpose"}>
            <input
              name="purpose"
              maxLength={TEXT_MAX}
              placeholder={isVendor && selected.length ? `Vendor payout · ${selected.map((p) => p.invoice_number).join(", ")}` : undefined}
              className={inputClass}
            />
          </Field>
          {isVendor ? (
            <Field label="Pay into">
              <Select
                value={bank}
                onValueChange={setBank}
                placeholder={accounts.length ? "Their bank account" : "No bank account on file"}
                options={accounts}
              />
            </Field>
          ) : (
            <Field label="Bank details">
              <input name="bank_details" maxLength={TEXT_MAX} placeholder="Bank · A/C · IFSC" className={inputClass} />
            </Field>
          )}
        </>
      )}

      {error && <p className="text-sm text-danger sm:col-span-2">⚠ {error}</p>}
      <div className="flex justify-end gap-3 pt-1 sm:col-span-2">
        <Button type="button" variant="secondary" magnetic={false} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" magnetic={false} disabled={saving || payee === undefined || (isVendor && !vendorReady)}>
          {saving ? "Saving…" : isVendor ? `Request ${formatINR(vendorReady ? amount : 0)}` : "Create request"}
        </Button>
      </div>
    </form>
  );
}

/** How much can still be paid on the chosen bills, and how the amount splits across their UPS codes. */
function PaymentLimit({ totalDue, split, codeOf }: { totalDue: number; split: Map<string, number>; codeOf: Map<string, string> }) {
  return (
    <div className="rounded-xl bg-mist/60 px-3 py-2 text-xs text-secondary sm:col-span-2">
      <p>At most {formatINR(totalDue)} left to pay on these bills (after commission).</p>
      {split.size > 0 && (
        <p className="mt-1">
          Split equally across {split.size} UPS code{split.size === 1 ? "" : "s"}:{" "}
          {[...split].map(([key, value], i) => (
            <span key={key}>
              {i > 0 && ", "}
              <span className="font-mono">{codeOf.get(key)}</span> {formatINR(value)}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
