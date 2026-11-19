"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, X, CheckCircle2 } from "lucide-react";
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

const TITLE = "Assign vendors";
const DESCRIPTION =
  "Pick the vendor for each service and their cost before GST. Each mapping gets its own UPS code; vendor bills and payments are mapped to it.";

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
 * Map vendors to the project's services. Every service the project bills is a card with a
 * vendor dropdown (only vendors that provide that service) and the cost agreed with them.
 * A service can have more than one vendor. The scope of work and vendor budget are set here
 * too. Saving generates a permanent UPS code (unique project service code, e.g.
 * PRJ-0042-V01-S02) for every new mapping; existing ones keep theirs.
 *
 * The contents of the Assign vendors dialog, and step 2 of the New project form.
 */
export function AssignVendorsPanel({
  project,
  onSaved,
  onClose,
  cancelLabel = "Cancel",
  submitLabel = "Save vendors",
}: {
  project: ProjectDetail;
  onSaved: (saved: ProjectDetail) => void;
  /** Leaves the panel: Cancel / Skip before saving, Done after. */
  onClose: () => void;
  cancelLabel?: string;
  submitLabel?: string;
}) {
  const { hasRole } = useAuth();
  const canEditGroup = hasRole(...GROUP_COMPANY_ROLES);
  const { data: vendors } = useApi<Vendor[]>("/vendors");
  const [rows, setRows] = useState<MapRow[]>(() => rowsFrom(project, canEditGroup));
  const [description, setDescription] = useState(project.description ?? "");
  const [budget, setBudget] = useState(project.budget ? String(project.budget) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // After saving: the project as saved, to show the UPS codes it now has.
  const [done, setDone] = useState<ProjectDetail | null>(null);

  const vendorName = (id: string) =>
    vendors?.find((v) => String(v.id) === id)?.business_name ?? project.vendors.find((v) => String(v.vendor_id) === id)?.vendor_name ?? "Vendor";
  const providers = (serviceId: number) => (vendors ?? []).filter((v) => v.services.some((s) => s.id === serviceId));

  const mapped = rows.filter((r) => r.vendor_id);
  const committed = mapped.reduce((s, r) => s + num(r.cost), 0);
  const servicesMapped = project.services.filter((s) => mapped.some((r) => r.service_id === s.id)).length;
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
        description,
        budget: num(budget),
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

  if (done) return <SavedCodes before={project} after={done} onClose={onClose} />;

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <fieldset className="col-span-full flex flex-col gap-3">
        <legend className="mb-3 text-xs tracking-eyebrow text-secondary">Services</legend>
        <div className="flex flex-col gap-3">
          {project.services.map((service) => {
            const serviceRows = rows.filter((r) => r.service_id === service.id);
            const options = providers(service.id);
            const canAdd = options.length > 0 && !serviceRows.some((r) => r.locked);
            return (
              <div key={service.id} className="flex flex-col gap-3 rounded-2xl border border-line p-4">
                {serviceRows.map((r, i) => (
                  <MappingRow
                    key={r.key}
                    row={r}
                    title={i === 0 ? service.title : undefined}
                    sac={i === 0 ? service.sac_code : undefined}
                    options={options}
                    currentLabel={r.vendor_id ? vendorName(r.vendor_id) : ""}
                    onChange={(change) => update(r.key, change)}
                    onRemove={() => removeRow(r.key)}
                  />
                ))}
                {canAdd && (
                  <button
                    type="button"
                    onClick={() => addRow(service.id)}
                    className="flex w-fit items-center gap-1 text-xs text-secondary hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" /> Another vendor for this service
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <Totals mapped={servicesMapped} total={project.services.length} committed={committed} budget={num(budget)} />
      </fieldset>

      <div className="sm:col-span-3">
        <Field label="Scope of work">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={TEXT_MAX}
            placeholder="What will be delivered, where, and how it will be reported. This goes on each vendor's work order."
            className={`${inputClass} h-auto py-2.5`}
          />
        </Field>
      </div>
      <Field label="Vendor budget (₹)">
        <input {...NUMBER_RULES.money} value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass} />
      </Field>

      {duplicate && (
        <p className="col-span-full text-sm text-danger">
          {vendorName(duplicate.vendor_id)} is chosen twice for {project.services.find((s) => s.id === duplicate.service_id)?.title}. Keep one row.
        </p>
      )}
      {error && (
        <p role="alert" className="col-span-full text-sm text-danger">
          ⚠ {error}
        </p>
      )}
      <ModalFooter>
        <Button type="button" variant="secondary" magnetic={false} onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button type="submit" magnetic={false} disabled={saving || !!duplicate}>
          {saving ? "Saving…" : submitLabel}
        </Button>
      </ModalFooter>
    </form>
  );
}

/** One vendor on one service: its UPS code (or where it will come from), the vendor and the cost. */
function MappingRow({
  row,
  title,
  sac,
  options,
  currentLabel,
  onChange,
  onRemove,
}: {
  row: MapRow;
  /** The service's name and SAC, shown on its first row only. */
  title?: string;
  sac?: string | null;
  options: Vendor[];
  currentLabel: string;
  onChange: (change: Partial<MapRow>) => void;
  onRemove: () => void;
}) {
  const billed = (row.invoiced ?? 0) > 0;
  const code = row.code ?? (row.vendor_id ? "UPS code given on save" : "No vendor yet");
  const label = title ?? "Service";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_2rem] sm:items-end">
      <div className="min-w-0">
        <p className="font-mono text-xs text-ink-40">{code}</p>
        {title && (
          <p className="mt-1 text-sm font-medium leading-snug">
            {title}
            {sac && <span className="ml-2 inline-block whitespace-nowrap rounded-md border border-line bg-mist/60 px-1.5 py-0.5 font-mono text-[11px] font-normal text-secondary">SAC {sac}</span>}
          </p>
        )}
      </div>
      <Field label="Vendor">
        {row.locked ? (
          <p className={`${inputClass} flex items-center text-ink-40`}>{row.lockedName}</p>
        ) : options.length === 0 && !row.vendor_id ? (
          <p className="flex h-11 items-center text-xs text-ink-40">
            No vendor provides this yet.&nbsp;
            <Link href="/portal/vendors" className="underline hover:text-foreground">
              Add it to a vendor
            </Link>
          </p>
        ) : (
          <Select
            value={row.vendor_id || NONE}
            onValueChange={(v) => onChange(v === NONE ? { vendor_id: "", cost: "" } : { vendor_id: v })}
            options={[
              { value: NONE, label: "No vendor yet" },
              ...options.map((v) => ({ value: String(v.id), label: v.business_name })),
              // Keep the current vendor selectable even if the list has not loaded yet.
              ...(row.vendor_id && !options.some((v) => String(v.id) === row.vendor_id) ? [{ value: row.vendor_id, label: currentLabel }] : []),
            ]}
          />
        )}
      </Field>
      <Field label="Cost (₹, before GST)">
        <input
          {...NUMBER_RULES.money}
          required={!!row.vendor_id}
          disabled={!row.vendor_id || row.locked}
          value={row.cost}
          onChange={(e) => onChange({ cost: e.target.value })}
          aria-label={`${label} agreed cost in rupees`}
          className={inputClass}
        />
      </Field>
      <div className="flex h-11 items-center justify-end">
        {row.vendor_id && !row.locked && !billed && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove this vendor"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-40 transition-colors hover:bg-mist hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {billed && <p className="text-xs text-ink-40 sm:col-start-2 sm:col-end-5">Billed {formatINR(row.invoiced ?? 0)}: cannot be removed</p>}
    </div>
  );
}

function Totals({ mapped, total, committed, budget }: { mapped: number; total: number; committed: number; budget: number }) {
  const over = budget > 0 && committed > budget;
  return (
    <div className="grid grid-cols-1 gap-2 rounded-2xl border border-line bg-mist/50 p-4 text-sm sm:grid-cols-2" aria-live="polite">
      <p>
        <span className="text-secondary">Services with a vendor: </span>
        <span className="font-medium tabular-nums">
          {mapped} of {total}
        </span>
        {mapped < total && <span className="text-warning"> (⚠ {total - mapped} still open)</span>}
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

/** After saving: every mapping with its UPS code, new ones marked. */
function SavedCodes({ before, after, onClose }: { before: ProjectDetail; after: ProjectDetail; onClose: () => void }) {
  const existing = new Set(before.vendors.flatMap((v) => v.services.map((s) => s.code)));
  const codes = after.vendors.flatMap((v) => v.services.map((s) => ({ ...s, vendor: v.vendor_name })));
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
                    {!existing.has(c.code) && <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 font-sans text-[10px] text-success">New</span>}
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
