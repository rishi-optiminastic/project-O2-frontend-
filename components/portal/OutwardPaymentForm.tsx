"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/portal/ui";
import { Modal } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type Vendor, type VendorPayable } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { NUMBER_RULES, TEXT_MAX } from "@/lib/validation";
import { emitPortalEvent, PORTAL_EVENTS } from "@/lib/events";

/** Pay every bill the vendor still owes on. */
const ALL_BILLS = "all";

/**
 * Record an outward payment to a vendor, for CEO sign-off.
 *
 * Pick a verified vendor and the bill being paid, or all their bills still due. Only
 * verified vendors can be paid, and only against their bills. The amount cannot be more
 * than those bills still owe (after Optiminastic's commission). It is divided equally
 * across every UPS code on them, or paid oldest bill first, as the hint shows.
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
      description="Payment to a verified vendor against its bills. It goes to the CEO for approval and is released once the bank reference (UTR) is entered. A vendor is never paid more than their bills still owe."
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

/** The server's "oldest" split: the oldest bill first (by date, then id), each line in turn. */
function splitOldestFirst(amount: number, bills: VendorPayable[]): Map<string, number> {
  let remaining = Math.round(amount * 100);
  const given = new Map<string, number>();
  const ordered = [...bills].sort((a, b) => a.invoice_date.localeCompare(b.invoice_date) || a.invoice_id - b.invoice_id);
  for (const bill of ordered) {
    for (const line of bill.lines) {
      if (remaining <= 0) return given;
      const take = Math.min(remaining, Math.max(Math.round(line.due * 100), 0));
      if (take > 0) {
        given.set(`${bill.invoice_id}:${line.line_id}`, take / 100);
        remaining -= take;
      }
    }
  }
  return given;
}

type SplitMode = "services" | "oldest";
const SPLIT_MODES: { key: SplitMode; label: string }[] = [
  { key: "services", label: "Divide equally across all services" },
  { key: "oldest", label: "Oldest bill first" },
];

function PaymentFields({ initialVendorId, onDone }: { initialVendorId?: number; onDone: () => void }) {
  const { data: vendors } = useApi<Vendor[]>("/vendors");
  const [payee, setPayee] = useState<string | undefined>(initialVendorId ? String(initialVendorId) : undefined);
  const chosen = payee !== undefined ? vendors?.find((v) => String(v.id) === payee) : undefined;
  // Only a verified vendor (tax and bank details checked) can be paid; the server refuses others too.
  const isVendor = payee !== undefined && (chosen === undefined || chosen.is_verified);
  const verifiedVendors = (vendors ?? []).filter((v) => v.is_verified);
  const unverifiedCount = (vendors ?? []).length - verifiedVendors.length;
  const { data: payables, loading } = useApi<VendorPayable[]>(isVendor ? `/vendors/${payee}/payables` : null);
  const [bill, setBill] = useState<string>(ALL_BILLS);
  const [bank, setBank] = useState<string | undefined>(undefined);
  const [amountInput, setAmountInput] = useState("");
  const [mode, setMode] = useState<SplitMode>("services");
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
        : mode === "oldest"
          ? splitOldestFirst(amount, selected)
          : splitEqually(amount, selected.flatMap((p) => p.lines.map((l) => ({ key: `${p.invoice_id}:${l.line_id}`, due: l.due })))),
    [amount, isVendor, over, selected, mode],
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
    if (!vendorReady) return;
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/approvals/vendor-payout", {
        vendor_id: Number(payee),
        vendor_invoice_ids: selected.map((p) => p.invoice_id),
        amount,
        split: mode,
        purpose: fd.get("purpose") || null,
        bank_details: bank ?? null,
      });
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
          placeholder={vendors ? (verifiedVendors.length ? "Which vendor?" : "No verified vendor yet") : "Loading vendors…"}
          options={[
            ...verifiedVendors.map((v) => ({ value: String(v.id), label: v.business_name })),
            // Opened from an unverified vendor's page: keep it shown so the message below makes sense.
            ...(chosen && !chosen.is_verified ? [{ value: String(chosen.id), label: `${chosen.business_name} (not verified)` }] : []),
          ]}
        />
        {unverifiedCount > 0 && (
          <span className="mt-1 block text-xs text-ink-40">
            Only verified vendors can be paid; {unverifiedCount} {unverifiedCount === 1 ? "is" : "are"} not verified yet.
          </span>
        )}
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
      ) : (
        <div className="hidden sm:block" aria-hidden />
      )}

      {chosen && !chosen.is_verified && (
        <p role="alert" className="rounded-2xl border border-warning-line bg-warning-soft p-4 text-sm text-warning sm:col-span-2">
          {chosen.business_name} is not verified yet, so it cannot be paid. Verify the vendor (tax and bank details) on its page first.
        </p>
      )}

      {isVendor && (loading && !payables ? (
        <p className="text-sm text-ink-40 sm:col-span-2">Loading the vendor&apos;s bills…</p>
      ) : due.length === 0 ? (
        <p className="text-xs text-warning sm:col-span-2">
          ⚠ Nothing is due to {vendor?.business_name ?? "this vendor"}: every bill is paid or already in a payout.
        </p>
      ) : (
        <>
          <SplitChoice mode={mode} onChange={setMode} />
          <PaymentLimit totalDue={totalDue} split={split} codeOf={codeOf} mode={mode} />
        </>
      ))}

      {isVendor && due.length > 0 && (
        <>
          <Field label="Amount (₹)">
            <input
              {...NUMBER_RULES.positiveMoney}
              name="amount"
              value={amountInput}
              placeholder={String(totalDue)}
              onChange={(e) => setAmountInput(e.target.value)}
              className={inputClass + (over ? " border-danger" : "")}
            />
            {over && <span className="mt-1 block text-xs text-danger">Cannot be more than the {formatINR(totalDue)} still due.</span>}
          </Field>
          <Field label="Purpose (optional)">
            <input
              name="purpose"
              maxLength={TEXT_MAX}
              placeholder={selected.length ? `Vendor payout · ${selected.map((p) => p.invoice_number).join(", ")}` : undefined}
              className={inputClass}
            />
          </Field>
          <Field label="Pay into">
            <Select
              value={bank}
              onValueChange={setBank}
              placeholder={accounts.length ? "Their bank account" : "No bank account on file"}
              options={accounts}
            />
          </Field>
        </>
      )}

      {error && <p className="text-sm text-danger sm:col-span-2">⚠ {error}</p>}
      <div className="flex justify-end gap-3 pt-1 sm:col-span-2">
        <Button type="button" variant="secondary" magnetic={false} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" magnetic={false} disabled={saving || !vendorReady}>
          {saving ? "Saving…" : `Request ${formatINR(vendorReady ? amount : 0)}`}
        </Button>
      </div>
    </form>
  );
}

/** Divide the payment equally across the UPS codes, or settle the oldest bill first. */
function SplitChoice({ mode, onChange }: { mode: SplitMode; onChange: (mode: SplitMode) => void }) {
  return (
    <div role="radiogroup" aria-label="How to split this payment" className="flex flex-wrap gap-2 sm:col-span-2">
      {SPLIT_MODES.map((m) => (
        <button
          key={m.key}
          type="button"
          role="radio"
          aria-checked={mode === m.key}
          onClick={() => onChange(m.key)}
          className={
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
            (mode === m.key ? "border-foreground bg-foreground text-background" : "border-line text-secondary hover:text-foreground")
          }
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** How much can still be paid on the chosen bills, and how the amount splits across their UPS codes. */
function PaymentLimit({
  totalDue,
  split,
  codeOf,
  mode,
}: {
  totalDue: number;
  split: Map<string, number>;
  codeOf: Map<string, string>;
  mode: SplitMode;
}) {
  return (
    <div className="rounded-xl bg-mist/60 px-3 py-2 text-xs text-secondary sm:col-span-2">
      <p>At most {formatINR(totalDue)} left to pay on these bills (after commission).</p>
      {split.size > 0 && (
        <p className="mt-1">
          {mode === "services" ? "Divided equally across" : "Paid oldest bill first over"} {split.size} UPS code{split.size === 1 ? "" : "s"}:{" "}
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
