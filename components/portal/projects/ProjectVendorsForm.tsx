"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Field, inputClass } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { GROUP_COMPANY_ROLES } from "@/components/portal/vendors/VendorFields";
import { formatINR } from "@/lib/utils";
import { api, ApiError, type ProjectDetail, type Vendor } from "@/lib/api";
import { NUMBER_RULES, TEXT_MAX } from "@/lib/validation";

const FULL_WORK = 100;

type VendorShare = { vendor_id: number; work_percent: string; agreed_cost: string };

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

/**
 * Who delivers a project: the scope of work printed on work orders, the vendor
 * budget, and one row per vendor with their share of the work and cost.
 */
export function ProjectVendorsForm({
  open,
  onOpenChange,
  project,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: ProjectDetail;
  onSaved: (saved: ProjectDetail) => void;
}) {
  const { data: vendors } = useApi<Vendor[]>(open ? "/vendors" : null);
  const [description, setDescription] = useState(project.description ?? "");
  const [budgetInput, setBudgetInput] = useState(String(project.budget));
  const [shares, setShares] = useState<VendorShare[]>(() =>
    project.vendors.map((v) => ({ vendor_id: v.vendor_id, work_percent: String(v.work_percent), agreed_cost: String(v.agreed_cost) })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { hasRole } = useAuth();
  // A group company's row is kept as it is unless the CFO or CEO edits it.
  const canEditGroup = hasRole(...GROUP_COMPANY_ROLES);
  const lockedIds = new Set(project.vendors.filter((v) => v.is_group_company && !canEditGroup).map((v) => v.vendor_id));

  const assigned = shares.reduce((sum, v) => sum + num(v.work_percent), 0);
  const committed = shares.reduce((sum, v) => sum + num(v.agreed_cost), 0);
  const budget = num(budgetInput);
  const vendorName = new Map((vendors ?? []).map((v) => [v.id, v.business_name]));
  const available = (vendors ?? []).filter((v) => !shares.some((s) => s.vendor_id === v.id));

  function setShare(index: number, key: "work_percent" | "agreed_cost", value: string) {
    setShares((all) => all.map((v, i) => (i === index ? { ...v, [key]: value } : v)));
  }

  function addVendor(id: string) {
    const remaining = Math.max(FULL_WORK - assigned, 0);
    setShares((all) => [...all, { vendor_id: Number(id), work_percent: remaining ? String(remaining) : "", agreed_cost: "" }]);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await api.patch<ProjectDetail>(`/projects/${project.id}`, {
        description,
        budget,
        vendors: shares.map((v) => ({ vendor_id: v.vendor_id, work_percent: num(v.work_percent), agreed_cost: num(v.agreed_cost) })),
      });
      onOpenChange(false);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the vendors");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      title="Vendors and work orders"
      description="The scope of work printed on each work order, the vendor budget, and each vendor's share and cost."
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-3">
          <Field label="Scope of work">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={TEXT_MAX}
              placeholder="What will be delivered, where, and how it will be reported. This goes on each vendor's work order."
              className={`${inputClass} h-auto py-2.5`}
            />
          </Field>
        </div>
        <Field label="Vendor budget (₹)">
          <input {...NUMBER_RULES.money} value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} className={inputClass} />
        </Field>

        <fieldset className="col-span-full flex flex-col gap-3">
          <legend className="mb-3 text-xs tracking-eyebrow text-secondary">Vendors</legend>
          {shares.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs tracking-eyebrow text-ink-40">
                    <th className="px-4 py-3 font-medium">Vendor</th>
                    <th className="w-36 px-4 py-3 font-medium">% of work</th>
                    <th className="w-48 px-4 py-3 font-medium">Agreed cost (₹, before GST)</th>
                    <th className="w-12 px-2 py-3" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {shares.map((v, i) => {
                    const name = vendorName.get(v.vendor_id) ?? project.vendors.find((p) => p.vendor_id === v.vendor_id)?.vendor_name ?? "Vendor";
                    const locked = lockedIds.has(v.vendor_id);
                    return (
                      <tr key={v.vendor_id} className="border-b border-line/60 last:border-0">
                        <td className="px-4 py-2 font-medium">{name}</td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={0.01}
                            max={100}
                            step="0.01"
                            required
                            aria-label={`${name} share of the work, percent`}
                            disabled={locked}
                            value={v.work_percent}
                            onChange={(e) => setShare(i, "work_percent", e.target.value)}
                            className={inputClass}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            {...NUMBER_RULES.money}
                            required
                            aria-label={`${name} agreed cost in rupees`}
                            disabled={locked}
                            value={v.agreed_cost}
                            onChange={(e) => setShare(i, "agreed_cost", e.target.value)}
                            className={inputClass}
                          />
                        </td>
                        <td className="px-2 py-2">
                          {!locked && (
                            <button
                              type="button"
                              onClick={() => setShares((all) => all.filter((_, j) => j !== i))}
                              aria-label={`Remove ${name}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-40 transition-colors hover:bg-mist hover:text-foreground"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="sm:w-80">
            <Select
              key={shares.length}
              value=""
              onValueChange={addVendor}
              placeholder={available.length ? "+ Add a vendor" : "All vendors added"}
              options={available.map((v) => ({ value: String(v.id), label: v.business_name }))}
            />
          </div>
          <Totals assigned={assigned} committed={committed} budget={budget} hasVendors={shares.length > 0} />
        </fieldset>

        {error && (
          <p role="alert" className="col-span-full text-sm text-danger">
            ⚠ {error}
          </p>
        )}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving || assigned > FULL_WORK}>
            {saving ? "Saving…" : "Save vendors"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function Totals({ assigned, committed, budget, hasVendors }: { assigned: number; committed: number; budget: number; hasVendors: boolean }) {
  if (!hasVendors) {
    return <p className="text-xs text-ink-40">Add the vendors who will do the work, with each one&apos;s share and cost.</p>;
  }
  const share = Math.round(assigned * 100) / 100;
  const shareNote =
    share > FULL_WORK ? "⚠ more than 100%: reduce a share" : share < FULL_WORK ? `⚠ ${Math.round((FULL_WORK - share) * 100) / 100}% not yet given to a vendor` : "all work assigned";
  const over = committed > budget;
  return (
    <div className="grid grid-cols-1 gap-2 rounded-2xl border border-line bg-mist/50 p-4 text-sm sm:grid-cols-2" aria-live="polite">
      <p>
        <span className="text-secondary">Work assigned: </span>
        <span className="font-medium tabular-nums">{share}%</span>{" "}
        <span className={share === FULL_WORK ? "text-success" : share > FULL_WORK ? "text-danger" : "text-warning"}>({shareNote})</span>
      </p>
      <p>
        <span className="text-secondary">Vendor cost: </span>
        <span className="font-medium tabular-nums">{formatINR(committed)}</span>
        <span className="text-secondary"> of {formatINR(budget)} budget</span>
        {over && <span className="text-danger"> (⚠ over by {formatINR(committed - budget)})</span>}
      </p>
    </div>
  );
}
