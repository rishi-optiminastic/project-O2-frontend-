"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/portal/ui";
import { Modal } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { formatINR } from "@/lib/utils";
import { api, ApiError, type Vendor, type VendorAssignment, TDS_SECTIONS } from "@/lib/api";
import { FIELD_RULES, GST_RATE_OPTIONS, NAME_MAX, NUMBER_RULES, TEXT_MAX, indiaToday, pastDateRule } from "@/lib/validation";
import { GstField } from "@/components/portal/GstField";

/**
 * Record a vendor's bill against the vendor's UPS codes (unique project service codes).
 * A bill covers one project; it charges one or more of the vendor's codes there, and its
 * amount is the sum of those lines. GST comes from the rate, TDS from the section, and
 * Optiminastic's commission is kept back from what the vendor is paid. The vendor's own
 * invoice file can be attached. The preview uses the same arithmetic as the server.
 *
 * On a vendor's own page pass `vendor`; on the Invoices page pass `vendors` and
 * the form asks which vendor the bill is from.
 */
export function VendorInvoiceForm({
  open,
  onOpenChange,
  vendor,
  vendors,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The vendor the bill is from, when it is already known. */
  vendor?: Vendor | null;
  /** Vendors to choose from, when `vendor` is not given. */
  vendors?: Vendor[];
  onSaved: () => void;
}) {
  const [pickedId, setPickedId] = useState<string>("");
  const chosen = vendor ?? vendors?.find((v) => String(v.id) === pickedId) ?? null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      title="Record vendor invoice"
      description="Map the bill to the vendor's UPS codes on one project. GST comes from the rate and TDS from the section; Optiminastic's commission is deducted from what the vendor is paid."
    >
      {!vendor && (
        <div className="mb-4 sm:w-96">
          <Field label="Vendor">
            <Select
              value={pickedId}
              onValueChange={setPickedId}
              placeholder="Choose the vendor"
              options={(vendors ?? []).map((v) => ({ value: String(v.id), label: v.business_name }))}
            />
          </Field>
          {vendors && vendors.length === 0 && <p className="mt-1.5 text-xs text-ink-40">No vendors yet. Onboard one on the Vendors page first.</p>}
        </div>
      )}
      {chosen && open ? (
        // Remounted per vendor so its usual TDS section and its codes load fresh.
        <InvoiceFields
          key={chosen.id}
          vendor={chosen}
          onCancel={() => onOpenChange(false)}
          onSaved={() => {
            onOpenChange(false);
            setPickedId("");
            onSaved();
          }}
        />
      ) : (
        <div className="flex justify-end pt-1">
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      )}
    </Modal>
  );
}

function InvoiceFields({ vendor, onCancel, onSaved }: { vendor: Vendor; onCancel: () => void; onSaved: () => void }) {
  const { data: assignments, loading } = useApi<VendorAssignment[]>(`/vendors/${vendor.id}/assignments`);
  const [projectId, setProjectId] = useState<string>("");
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [gstRate, setGstRate] = useState("18");
  const [interstate, setInterstate] = useState(false);
  const [section, setSection] = useState<string>(vendor.default_tds_section ?? TDS_SECTIONS[0].key);
  const [commissionRate, setCommissionRate] = useState(String(vendor.commission_rate ?? 0));
  const [file, setFile] = useState<File | null>(null);

  // One option per project the vendor has codes on.
  const projects = useMemo(() => {
    const seen = new Map<number, string>();
    for (const a of assignments ?? []) if (!seen.has(a.project_id)) seen.set(a.project_id, `${a.project_code} ${a.project_title}`);
    return [...seen].map(([id, label]) => ({ value: String(id), label }));
  }, [assignments]);
  // With one project there is nothing to choose.
  const activeProject = projectId || (projects.length === 1 ? projects[0].value : "");
  const codes = (assignments ?? []).filter((a) => String(a.project_id) === activeProject);
  const lines = codes
    .map((a) => ({ assignment: a, amount: Number(amounts[a.id] || 0) }))
    .filter((l) => l.amount > 0);
  const amount = +lines.reduce((s, l) => s + l.amount, 0).toFixed(2);
  // Codes this bill takes past their agreed cost: shown per row and summed above Save.
  const overruns = lines
    .filter((l) => l.amount > Math.max(l.assignment.remaining, 0))
    .map((l) => ({ code: l.assignment.code, over: +(l.amount - Math.max(l.assignment.remaining, 0)).toFixed(2) }));
  const overTotal = +overruns.reduce((s, o) => s + o.over, 0).toFixed(2);

  // Same arithmetic as the server, so the preview matches what gets saved.
  const tdsRate = TDS_SECTIONS.find((t) => t.key === section)?.rate ?? 0;
  const gst = +((amount * Number(gstRate)) / 100).toFixed(2);
  const tds = +((amount * tdsRate) / 100).toFixed(2);
  const net = +(amount + gst - tds).toFixed(2);
  const commission = +((amount * Number(commissionRate || 0)) / 100).toFixed(2);
  const afterCommission = +(net - commission).toFixed(2);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lines.length === 0) {
      setError("Enter an amount against at least one UPS code.");
      return;
    }
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const created = await api.post<{ id: number }>("/vendors/invoices", {
        vendor_id: vendor.id,
        invoice_number: fd.get("invoice_number"),
        invoice_date: fd.get("invoice_date"),
        lines: lines.map((l) => ({ assignment_id: l.assignment.id, amount: l.amount })),
        gst_rate: Number(gstRate),
        is_interstate: interstate,
        tds_section: section,
        commission_rate: Number(commissionRate || 0),
        // The supplier as printed on the bill; blank ones fall back to the vendor's details.
        supplier_gstin: String(fd.get("gst_number") ?? "").trim() || null,
        supplier_name: String(fd.get("business_name") ?? "").trim() || null,
        supplier_address: String(fd.get("address") ?? "").trim() || null,
        supplier_coi: String(fd.get("coi") ?? "").trim() || null,
      });
      if (file) {
        try {
          await api.upload(`/vendors/invoices/${created.id}/document`, file);
        } catch (err) {
          // The bill is saved; only the file failed. Say so rather than lose the bill.
          setError(`Invoice saved, but the file was not uploaded: ${err instanceof ApiError ? err.message : "upload failed"}`);
          setSaving(false);
          return;
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !assignments) return <p className="text-sm text-ink-40">Loading {vendor.business_name}&apos;s UPS codes…</p>;
  if (assignments && assignments.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-2xl border border-line bg-mist/50 p-4 text-sm text-secondary">
          {vendor.business_name} is not assigned to any project service yet, so there is no UPS code to bill against. Assign the
          vendor from a project with <span className="font-medium text-foreground">Assign vendor</span> first.
        </p>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" magnetic={false} onClick={onCancel}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {/* Supplier on the bill: the GSTIN is checked with the GST registry and refreshes the name and address. */}
      <GstField label="GSTIN number" defaultValue={vendor.gst_number} required overwrite />
      <Field label="Business name">
        <input name="business_name" required maxLength={NAME_MAX} defaultValue={vendor.business_name} className={inputClass} />
      </Field>
      <Field label="COI">
        <input name="coi" {...FIELD_RULES.cin} defaultValue={vendor.coi ?? ""} placeholder="CIN or LLPIN" className={`${inputClass} font-mono`} />
      </Field>
      <div className="sm:col-span-3">
        <Field label="Address">
          <textarea
            name="address"
            required
            rows={2}
            maxLength={TEXT_MAX}
            defaultValue={vendor.address ?? ""}
            placeholder="Filled from the GSTIN when verified"
            className={`${inputClass} h-auto py-2.5`}
          />
        </Field>
      </div>

      <Field label="Invoice number">
        <input name="invoice_number" required {...FIELD_RULES.invoiceNumber} className={inputClass} />
      </Field>
      <Field label="Invoice date">
        <input name="invoice_date" {...pastDateRule()} required defaultValue={indiaToday()} className={inputClass} />
      </Field>
      <Field label="Project">
        <Select
          value={activeProject}
          onValueChange={(v) => {
            setProjectId(v);
            setAmounts({});
          }}
          placeholder="Choose the project"
          options={projects}
        />
      </Field>

      {codes.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-line sm:col-span-3">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs tracking-eyebrow text-ink-40">
                <th className="px-4 py-3 font-medium">UPS code</th>
                <th className="px-4 py-3 font-medium">Agreed cost · left to bill</th>
                <th className="w-52 px-4 py-3 font-medium">Billed now (₹, before GST)</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((a) => {
                const now = Number(amounts[a.id] || 0);
                const over = now > 0 && now > a.remaining;
                const left = Math.max(a.remaining, 0);
                return (
                  <tr key={a.id} className="border-b border-line/60 align-top last:border-0">
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs font-medium">{a.code}</span>
                      <span className="block text-xs text-secondary">{a.service_title}</span>
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      <span className="block text-secondary">Agreed {formatINR(a.agreed_cost)}</span>
                      <span className={"block text-xs " + (a.remaining <= 0 ? "text-danger" : "text-ink-40")}>
                        {a.remaining < 0
                          ? `Already ${formatINR(-a.remaining)} over`
                          : `${formatINR(left)} left${a.invoiced > 0 ? ` (${formatINR(a.invoiced)} billed)` : ""}`}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        {...NUMBER_RULES.money}
                        value={amounts[a.id] ?? ""}
                        onChange={(e) => setAmounts((all) => ({ ...all, [a.id]: e.target.value }))}
                        aria-label={`Amount billed against ${a.code}`}
                        className={inputClass + (over ? " border-warning" : "")}
                      />
                      {over && (
                        <span className="mt-1 block text-xs leading-snug text-warning">
                          {formatINR(now - left)} over the agreed cost. Only {formatINR(left)} is left to bill on this code.
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Field label="GST rate">
        <Select value={gstRate} onValueChange={setGstRate} options={GST_RATE_OPTIONS} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="TDS section">
          <Select value={section} onValueChange={setSection} options={TDS_SECTIONS.map((t) => ({ value: t.key, label: `${t.label} (${t.rate}%)` }))} />
        </Field>
      </div>
      <Field label="Percentage (rate) · commission %">
        <input
          type="number"
          min={0}
          max={100}
          step="0.01"
          required
          value={commissionRate}
          onChange={(e) => setCommissionRate(e.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Upload invoice (PDF or image, optional)">
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-secondary file:mr-3 file:rounded-full file:border file:border-line file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-mist"
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-light text-secondary sm:col-span-3">
        <input type="checkbox" checked={interstate} onChange={(e) => setInterstate(e.target.checked)} className="accent-foreground" />
        Vendor is in another state (IGST instead of CGST + SGST)
      </label>
      {!vendor.gst_number && gst > 0 && (
        <p className="text-xs text-warning sm:col-span-3">
          ⚠ This vendor has no GSTIN on record, so the GST on this bill cannot be claimed as input credit. Add their GSTIN on the vendor first if they have one.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-mist/50 p-4 text-center text-sm sm:col-span-3 sm:grid-cols-6">
        <div>
          <p className="text-xs text-ink-40">Amount</p>
          <p className="mt-1 font-medium tabular-nums">{formatINR(amount)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-40">{interstate ? "IGST" : "CGST + SGST"}</p>
          <p className="mt-1 font-medium tabular-nums">{formatINR(gst)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-40">TDS</p>
          <p className="mt-1 font-medium tabular-nums">{formatINR(tds)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-40">Net payable</p>
          <p className="mt-1 font-medium tabular-nums">{formatINR(net)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-40">Commission</p>
          <p className="mt-1 font-medium tabular-nums">- {formatINR(commission)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-40">Paid to vendor</p>
          <p className={"mt-1 font-semibold tabular-nums " + (afterCommission < 0 ? "text-danger" : "")}>{formatINR(afterCommission)}</p>
        </div>
      </div>

      {overruns.length > 0 && (
        <div role="status" className="rounded-2xl border border-warning-line bg-warning-soft p-4 text-sm sm:col-span-3">
          <p className="font-medium text-warning">
            This invoice is {formatINR(overTotal)} over the agreed cost on {overruns.length} UPS code{overruns.length === 1 ? "" : "s"}
            {" "}({overruns.map((o) => o.code).join(", ")}).
          </p>
          <p className="mt-1 text-secondary">
            You can still save it. {overruns.length === 1 ? "That code" : "Those codes"} will show as <span className="font-medium">Over-invoiced</span> on the
            project and in the vendor&apos;s jobs. If the price with the vendor was raised, update the agreed cost first (Project → Assign vendors).
            Otherwise, check the amount with the vendor.
          </p>
        </div>
      )}
      {error && <p className="sm:col-span-3 text-sm text-danger">⚠ {error}</p>}
      <div className="sm:col-span-3 flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" magnetic={false} onClick={onCancel}>Cancel</Button>
        <Button type="submit" magnetic={false} disabled={saving || lines.length === 0}>
          {saving ? "Saving…" : overruns.length ? "Save anyway" : "Save invoice"}
        </Button>
      </div>
    </form>
  );
}
