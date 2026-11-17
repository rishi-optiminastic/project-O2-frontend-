"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/portal/ui";
import { Modal } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type Vendor, type VendorPayable } from "@/lib/api";
import { formatDate, formatINR } from "@/lib/utils";
import { NAME_MAX, NUMBER_RULES, TEXT_MAX } from "@/lib/validation";
import { emitPortalEvent, PORTAL_EVENTS } from "@/lib/events";

type Mode = "vendor" | "other";

/**
 * Record an outward payment for CEO sign-off.
 *
 * To a vendor: pick the vendor and the bills being paid. The amount cannot be more
 * than those bills still owe (after Optiminastic's commission) and is split equally
 * across every UPS code on them, as the preview shows. "Other payee" is for money
 * out that is not a vendor bill, such as rent.
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
  const [mode, setMode] = useState<Mode>("vendor");

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      title="Outward payment"
      description="Money going out. It goes to the CEO for approval and is released once the bank reference (UTR) is entered."
    >
      <div role="radiogroup" aria-label="Paid to" className="mb-5 inline-flex rounded-full border border-line bg-white/50 p-1">
        {(["vendor", "other"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={
              "rounded-full px-4 py-1.5 text-xs font-medium transition-colors " +
              (mode === m ? "bg-foreground text-background" : "text-secondary hover:text-foreground")
            }
          >
            {m === "vendor" ? "Vendor bills" : "Other payee"}
          </button>
        ))}
      </div>
      {open && (mode === "vendor" ? (
        <VendorPayment initialVendorId={vendorId} onDone={() => onOpenChange(false)} />
      ) : (
        <OtherPayment onDone={() => onOpenChange(false)} />
      ))}
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

function VendorPayment({ initialVendorId, onDone }: { initialVendorId?: number; onDone: () => void }) {
  const { data: vendors } = useApi<Vendor[]>("/vendors");
  const [vendorId, setVendorId] = useState(initialVendorId ? String(initialVendorId) : "");
  const { data: payables, loading } = useApi<VendorPayable[]>(vendorId ? `/vendors/${vendorId}/payables` : null);
  const [picked, setPicked] = useState<number[]>([]);
  const [amountInput, setAmountInput] = useState("");
  const [mode, setMode] = useState<SplitMode>("services");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const vendor = vendors?.find((v) => String(v.id) === vendorId);
  const open = (payables ?? []).filter((p) => p.due > 0);
  const selected = open.filter((p) => picked.includes(p.invoice_id));
  const totalDue = +selected.reduce((s, p) => s + p.due, 0).toFixed(2);
  // Until an amount is typed, pay everything still due on the selected bills.
  const amount = amountInput.trim() === "" ? totalDue : Number(amountInput);
  const over = amount > totalDue + 0.001;
  const split = useMemo(
    () =>
      over || amount <= 0
        ? new Map<string, number>()
        : mode === "oldest"
          ? splitOldestFirst(amount, selected)
          : splitEqually(amount, selected.flatMap((p) => p.lines.map((l) => ({ key: `${p.invoice_id}:${l.line_id}`, due: l.due })))),
    [amount, over, selected, mode],
  );
  const bank = vendor?.bank_accounts[0];

  function toggle(id: number) {
    setPicked((all) => (all.includes(id) ? all.filter((x) => x !== id) : [...all, id]));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selected.length === 0 || over || amount <= 0) return;
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/approvals/vendor-payout", {
        vendor_id: Number(vendorId),
        vendor_invoice_ids: selected.map((p) => p.invoice_id),
        amount,
        split: mode,
        purpose: fd.get("purpose") || null,
        bank_details: fd.get("bank_details") || null,
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="sm:w-96">
        <Field label="Vendor">
          <Select
            value={vendorId}
            onValueChange={(v) => {
              setVendorId(v);
              setPicked([]);
              setAmountInput("");
            }}
            placeholder="Choose the vendor"
            options={(vendors ?? []).map((v) => ({ value: String(v.id), label: v.business_name }))}
          />
        </Field>
      </div>

      {vendorId && (loading && !payables ? (
        <p className="text-sm text-ink-40">Loading the vendor&apos;s bills…</p>
      ) : open.length === 0 ? (
        <p className="rounded-2xl border border-line bg-mist/50 p-4 text-sm text-secondary">
          Nothing is due to {vendor?.business_name ?? "this vendor"}: every bill is paid or already in a payout.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs tracking-eyebrow text-ink-40">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select every bill"
                    checked={selected.length === open.length}
                    onChange={(e) => setPicked(e.target.checked ? open.map((p) => p.invoice_id) : [])}
                    className="h-4 w-4 accent-foreground"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Bill</th>
                <th className="px-4 py-3 font-medium">UPS codes</th>
                <th className="px-4 py-3 text-right font-medium">Payable</th>
                <th className="px-4 py-3 text-right font-medium">Still due</th>
                <th className="px-4 py-3 text-right font-medium">This payment</th>
              </tr>
            </thead>
            <tbody>
              {open.map((p) => {
                const on = picked.includes(p.invoice_id);
                const share = p.lines.reduce((s, l) => s + (split.get(`${p.invoice_id}:${l.line_id}`) ?? 0), 0);
                return (
                  <tr key={p.invoice_id} className="border-b border-line/60 align-top last:border-0">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={on} onChange={() => toggle(p.invoice_id)} aria-label={`Pay ${p.invoice_number}`} className="h-4 w-4 accent-foreground" />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{p.invoice_number}</span>
                      <span className="block text-xs text-ink-40">{formatDate(p.invoice_date)} · {p.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <ul className="flex flex-col gap-0.5">
                        {p.lines.map((l) => (
                          <li key={String(l.line_id)} className="font-mono text-xs text-secondary">
                            {l.code ?? "Whole bill"}
                            {on && split.has(`${p.invoice_id}:${l.line_id}`) && (
                              <span className="ml-1.5 font-sans text-foreground">{formatINR(split.get(`${p.invoice_id}:${l.line_id}`) ?? 0)}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{formatINR(p.amount_payable)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatINR(p.due)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{on ? formatINR(share) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {selected.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs tracking-eyebrow text-secondary">How to split this payment</legend>
          <div role="radiogroup" aria-label="How to split this payment" className="flex flex-wrap gap-2">
            {SPLIT_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={mode === m.key}
                onClick={() => setMode(m.key)}
                className={
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                  (mode === m.key ? "border-foreground bg-foreground text-background" : "border-line text-secondary hover:text-foreground")
                }
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-40">
            {mode === "services"
              ? `Shared equally across the ${selected.reduce((n, p) => n + p.lines.length, 0)} UPS codes on the selected bills; a code never gets more than it still owes.`
              : "The oldest selected bill is paid in full first, then the next, until the amount runs out."}
            {" "}The table above shows each code&apos;s share.
          </p>
        </fieldset>
      )}

      {selected.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Amount (₹)">
            <input
              {...NUMBER_RULES.positiveMoney}
              value={amountInput}
              placeholder={String(totalDue)}
              onChange={(e) => setAmountInput(e.target.value)}
              className={inputClass + (over ? " border-danger" : "")}
            />
            <span className={"mt-1 block text-xs " + (over ? "text-danger" : "text-ink-40")}>
              {over
                ? `Cannot be more than the ${formatINR(totalDue)} still due on the selected bills.`
                : `Up to ${formatINR(totalDue)}. ${mode === "services" ? "Divided equally across" : "Paid oldest first over"} ${split.size} UPS code${split.size === 1 ? "" : "s"}.`}
            </span>
          </Field>
          <Field label="Purpose (optional)">
            <input name="purpose" maxLength={TEXT_MAX} placeholder={`Vendor payout · ${selected.map((p) => p.invoice_number).join(", ")}`} className={inputClass} />
          </Field>
          <Field label="Bank details">
            <input
              name="bank_details"
              maxLength={TEXT_MAX}
              defaultValue={bank ? `${bank.bank_name} · ${bank.account_number} · ${bank.ifsc_code}` : ""}
              key={vendorId}
              placeholder="Bank · A/C · IFSC"
              className={inputClass}
            />
          </Field>
        </div>
      )}

      {error && <p className="text-sm text-danger">⚠ {error}</p>}
      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" magnetic={false} onClick={onDone}>Cancel</Button>
        <Button type="submit" magnetic={false} disabled={saving || selected.length === 0 || over || amount <= 0}>
          {saving ? "Saving…" : `Request ${formatINR(selected.length ? amount : 0)}`}
        </Button>
      </div>
    </form>
  );
}

function OtherPayment({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    const tax = Number(fd.get("tax_deductions") || 0);
    try {
      await api.post("/approvals", {
        payee_name: fd.get("payee_name"),
        amount,
        purpose: fd.get("purpose"),
        tax_deductions: tax,
        net_payable: amount - tax,
        bank_details: fd.get("bank_details"),
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
      <Field label="Payee name">
        <input name="payee_name" required maxLength={NAME_MAX} className={inputClass} />
      </Field>
      <Field label="Amount (₹)">
        <input name="amount" {...NUMBER_RULES.positiveMoney} required className={inputClass} />
      </Field>
      <Field label="Tax deductions (₹)">
        <input name="tax_deductions" {...NUMBER_RULES.money} defaultValue={0} className={inputClass} />
      </Field>
      <Field label="Purpose">
        <input name="purpose" maxLength={TEXT_MAX} className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Bank details">
          <input name="bank_details" maxLength={TEXT_MAX} placeholder="Bank · A/C · IFSC" className={inputClass} />
        </Field>
      </div>
      {error && <p className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
      <div className="sm:col-span-2 flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" magnetic={false} onClick={onDone}>Cancel</Button>
        <Button type="submit" magnetic={false} disabled={saving}>{saving ? "Saving…" : "Create request"}</Button>
      </div>
    </form>
  );
}
