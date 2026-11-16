"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, X, CheckCircle2 } from "lucide-react";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { inputClass } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { GROUP_COMPANY_ROLES } from "@/components/portal/vendors/VendorFields";
import { formatINR } from "@/lib/utils";
import { api, ApiError, type ProjectDetail, type Vendor } from "@/lib/api";
import { NUMBER_RULES } from "@/lib/validation";

/** One row of the dialog: a project service and the vendor mapped to deliver it. */
type MapRow = {
  key: string;
  service_id: number;
  vendor_id: string; // "" until a vendor is chosen
  cost: string;
  /** Set once saved: the row's permanent UPS code. */
  code?: string;
  invoiced?: number;
  /** A group company the user may not see or change: kept exactly as it is. */
  locked?: boolean;
  lockedName?: string;
};

const NONE = "none";
const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
let seq = 0;
const newKey = () => `row-${++seq}`;

function rowsFrom(project: ProjectDetail, canEditGroup: boolean): MapRow[] {
  const rows: MapRow[] = project.vendors.flatMap((v) =>
    v.services.map((s) => ({
      key: newKey(),
      service_id: s.service_id,
      vendor_id: String(v.vendor_id),
      cost: String(s.agreed_cost),
      code: s.code,
      invoiced: s.invoiced,
      locked: v.is_group_company && !canEditGroup,
      lockedName: v.vendor_name,
    })),
  );
  // Every project service gets a row, mapped or not.
  for (const s of project.services) {
    if (!rows.some((r) => r.service_id === s.id)) rows.push({ key: newKey(), service_id: s.id, vendor_id: "", cost: "" });
  }
  const order = new Map(project.services.map((s, i) => [s.id, i]));
  return rows.sort((a, b) => (order.get(a.service_id) ?? 0) - (order.get(b.service_id) ?? 0));
}

const TITLE = "Assign vendors to services";
const DESCRIPTION =
  "For each service on this project, choose the vendor who delivers it and the cost agreed with them. Each mapping gets its own UPS code (unique project service code).";

/** The Assign vendors dialog on a project's page. */
export function AssignVendorForm({
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
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="wide" title={TITLE} description={DESCRIPTION}>
      {open && <AssignVendorsPanel project={project} onSaved={onSaved} onClose={() => onOpenChange(false)} />}
    </Modal>
  );
}

/**
 * Map vendors to the project's services. Every service the project bills is listed with a
 * vendor dropdown (only vendors that provide that service) and the cost agreed with them.
 * A service can have more than one vendor. Saving generates a permanent UPS code (unique
 * project service code, e.g. PRJ-0042-V01-S02) for every new mapping; existing ones keep theirs.
 *
 * The contents of the Assign vendors dialog, and step 2 of the New project form.
 */
export function AssignVendorsPanel({
  project,
  onSaved,
  onClose,
  cancelLabel = "Cancel",
}: {
  project: ProjectDetail;
  onSaved: (saved: ProjectDetail) => void;
  /** Leaves the panel: Cancel / Skip before saving, Done after. */
  onClose: () => void;
  cancelLabel?: string;
}) {
  const { hasRole } = useAuth();
  const canEditGroup = hasRole(...GROUP_COMPANY_ROLES);
  const { data: vendors } = useApi<Vendor[]>("/vendors");
  const [rows, setRows] = useState<MapRow[]>(() => rowsFrom(project, canEditGroup));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // After saving: the project as saved, to show the UPS codes it now has.
  const [done, setDone] = useState<ProjectDetail | null>(null);

  const serviceTitle = new Map(project.services.map((s) => [s.id, s]));
  const vendorName = (id: string) =>
    vendors?.find((v) => String(v.id) === id)?.business_name ?? project.vendors.find((v) => String(v.vendor_id) === id)?.vendor_name ?? "Vendor";
  const providers = (serviceId: number) => (vendors ?? []).filter((v) => v.services.some((s) => s.id === serviceId));

  const mapped = rows.filter((r) => r.vendor_id);
  const total = mapped.reduce((s, r) => s + num(r.cost), 0);
  const overBudget = project.budget > 0 && total > project.budget;
  const duplicate = mapped.find((r, i) => mapped.findIndex((x) => x.vendor_id === r.vendor_id && x.service_id === r.service_id) !== i);

  function update(key: string, change: Partial<MapRow>) {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }
  function addRow(serviceId: number) {
    setRows((all) => {
      const at = all.map((r) => r.service_id).lastIndexOf(serviceId);
      const next = [...all];
      next.splice(at + 1, 0, { key: newKey(), service_id: serviceId, vendor_id: "", cost: "" });
      return next;
    });
  }
  function removeRow(key: string) {
    setRows((all) => {
      const row = all.find((r) => r.key === key);
      const others = all.filter((r) => r.key !== key);
      // Keep at least one (empty) row per service.
      return row && !others.some((r) => r.service_id === row.service_id)
        ? all.map((r) => (r.key === key ? { ...r, vendor_id: "", cost: "", code: undefined, invoiced: undefined } : r))
        : others;
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (duplicate) return;
    setSaving(true);
    setError(null);
    // One entry per vendor with all the services it delivers; vendors left out are removed.
    const byVendor = new Map<string, { service_id: number; agreed_cost: number }[]>();
    for (const r of mapped) byVendor.set(r.vendor_id, [...(byVendor.get(r.vendor_id) ?? []), { service_id: r.service_id, agreed_cost: num(r.cost) }]);
    try {
      const saved = await api.patch<ProjectDetail>(`/projects/${project.id}`, {
        vendors: [...byVendor].map(([vendor_id, services]) => ({ vendor_id: Number(vendor_id), services })),
      });
      onSaved(saved);
      setDone(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    const before = new Set(project.vendors.flatMap((v) => v.services.map((s) => s.code)));
    const codes = done.vendors.flatMap((v) => v.services.map((s) => ({ ...s, vendor: v.vendor_name })));
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4" /> Vendors mapped
          </p>
          <p className="mt-1 text-sm text-secondary">
            {codes.length > 0
              ? "Each mapping has its UPS code. It is printed on the vendor's work order and quoted on their bills."
              : "No vendor is mapped yet. Assign vendors any time from the project page."}
          </p>
        </div>
        {codes.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs tracking-eyebrow text-ink-40">
                <th className="px-4 py-3 font-medium">UPS code</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 text-right font-medium">Agreed cost</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs font-medium">
                    {c.code}
                    {!before.has(c.code) && <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 font-sans text-[10px] text-success">New</span>}
                  </td>
                  <td className="px-4 py-2.5">{c.service_title}</td>
                  <td className="px-4 py-2.5 text-secondary">{c.vendor}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(c.agreed_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        <ModalFooter>
          <Button type="button" magnetic={false} onClick={onClose}>
            <CheckCircle2 className="h-4 w-4" /> Done
          </Button>
        </ModalFooter>
      </div>
    );
  }

  return (
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs tracking-eyebrow text-ink-40">
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="w-64 px-4 py-3 font-medium">Vendor</th>
                <th className="w-48 px-4 py-3 font-medium">Agreed cost (₹, before GST)</th>
                <th className="w-48 px-4 py-3 font-medium">UPS code</th>
                <th className="w-10 px-2 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const service = serviceTitle.get(r.service_id);
                const firstOfService = rows.findIndex((x) => x.service_id === r.service_id) === i;
                const lastOfService = rows.map((x) => x.service_id).lastIndexOf(r.service_id) === i;
                const options = providers(r.service_id);
                const billed = (r.invoiced ?? 0) > 0;
                return (
                  <tr key={r.key} className={(lastOfService ? "border-b border-line/60 " : "") + "align-top last:border-0"}>
                    <td className="px-4 py-2.5">
                      {firstOfService && (
                        <>
                          <span className="font-medium">{service?.title ?? "Service"}</span>
                          <span className="ml-1.5 font-mono text-xs text-ink-40">SAC {service?.sac_code ?? "-"}</span>
                        </>
                      )}
                      {lastOfService && !r.locked && options.length > 0 && (
                        <button
                          type="button"
                          onClick={() => addRow(r.service_id)}
                          className="mt-1 flex items-center gap-1 text-xs text-secondary hover:text-foreground"
                        >
                          <Plus className="h-3 w-3" /> Another vendor for this service
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {r.locked ? (
                        <span className="flex h-11 items-center text-secondary">{r.lockedName}</span>
                      ) : options.length === 0 && !r.vendor_id ? (
                        <span className="flex h-11 items-center text-xs text-ink-40">
                          No vendor provides this yet.&nbsp;
                          <Link href="/portal/vendors" className="underline hover:text-foreground">Add it to a vendor</Link>
                        </span>
                      ) : (
                        <Select
                          value={r.vendor_id || NONE}
                          onValueChange={(v) => update(r.key, { vendor_id: v === NONE ? "" : v })}
                          options={[
                            { value: NONE, label: "— Not assigned —" },
                            ...options.map((v) => ({ value: String(v.id), label: v.business_name })),
                            // Keep the current vendor selectable even if the list has not loaded yet.
                            ...(r.vendor_id && !options.some((v) => String(v.id) === r.vendor_id) ? [{ value: r.vendor_id, label: vendorName(r.vendor_id) }] : []),
                          ]}
                        />
                      )}
                      {billed && <span className="mt-1 block text-xs text-ink-40">Billed {formatINR(r.invoiced ?? 0)}: cannot be removed</span>}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        {...NUMBER_RULES.money}
                        required={!!r.vendor_id}
                        disabled={!r.vendor_id || r.locked}
                        value={r.cost}
                        onChange={(e) => update(r.key, { cost: e.target.value })}
                        aria-label={`${service?.title ?? "Service"} agreed cost`}
                        className={inputClass}
                      />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      <span className="flex h-11 items-center">
                        {r.code ? r.code : r.vendor_id ? <span className="font-sans text-ink-40">Generated on save</span> : <span className="text-ink-40">-</span>}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      {r.vendor_id && !r.locked && !billed && (
                        <button
                          type="button"
                          onClick={() => removeRow(r.key)}
                          aria-label="Remove this mapping"
                          className="mt-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-40 transition-colors hover:bg-mist hover:text-foreground"
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

        <p className={"text-sm " + (overBudget ? "text-danger" : "text-secondary")}>
          {mapped.length} mapping{mapped.length === 1 ? "" : "s"} · {new Set(mapped.map((r) => r.vendor_id)).size} vendor
          {new Set(mapped.map((r) => r.vendor_id)).size === 1 ? "" : "s"} · {formatINR(total)} committed
          {project.budget > 0 && <> of the {formatINR(project.budget)} vendor budget{overBudget && " (over budget)"}</>}
        </p>
        {duplicate && (
          <p className="text-sm text-danger">
            {vendorName(duplicate.vendor_id)} is chosen twice for {serviceTitle.get(duplicate.service_id)?.title}. Keep one row.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            ⚠ {error}
          </p>
        )}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button type="submit" magnetic={false} disabled={saving || !!duplicate}>
            {saving ? "Saving…" : "Save and generate UPS codes"}
          </Button>
        </ModalFooter>
      </form>
  );
}
