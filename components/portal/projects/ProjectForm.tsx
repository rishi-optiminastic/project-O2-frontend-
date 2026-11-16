"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Field, inputClass } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { formatDate } from "@/lib/utils";
import { api, ApiError, type Client, type ProjectDetail, type ProjectService, type Service, type Vendor } from "@/lib/api";
import { indiaToday, NUMBER_RULES } from "@/lib/validation";

/** Reports are due on this day of the month after the project starts. */
const REPORT_DUE_DAY = 25;

type FormState = {
  title: string;
  client_id: string;
  service_ids: number[];
  contract_value: string;
  /** YYYY-MM */
  start_month: string;
};

function initialState(project?: ProjectDetail): FormState {
  return {
    title: project?.title ?? "",
    client_id: project?.client_id ? String(project.client_id) : "",
    service_ids: project?.services.map((s) => s.id) ?? [],
    contract_value: project ? String(project.contract_value) : "",
    start_month: (project?.start_date ?? indiaToday()).slice(0, 7),
  };
}

/** The 25th of the month after ``month`` (YYYY-MM), as YYYY-MM-DD. */
function reportDueDate(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return `${next.y}-${String(next.m).padStart(2, "0")}-${REPORT_DUE_DAY}`;
}

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

/** A vendor assigned while creating the project: one service, one vendor, the agreed cost. */
type VendorRow = { key: number; serviceId: string; vendorId: string; cost: string };
let vendorRowKey = 0;

/**
 * Create or edit a project: who it is for, the services it bills, the agreed fee and
 * the start month. A new project can also be given its vendors, service by service
 * (each mapping gets a UPS code on save); afterwards vendors are managed from the project page.
 */
export function ProjectForm({
  open,
  onOpenChange,
  project,
  onSaved,
  stacked = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: ProjectDetail;
  onSaved: (saved: ProjectDetail) => void;
  /** Opened from inside another dialog, such as the invoice form. */
  stacked?: boolean;
}) {
  const { data: clients } = useApi<Client[]>(open ? "/clients" : null);
  const { data: services } = useApi<Service[]>(open ? "/services" : null);
  const [form, setForm] = useState<FormState>(() => initialState(project));
  const isNew = !project;
  const { data: vendors } = useApi<Vendor[]>(open && isNew ? "/vendors" : null);
  const [vendorRows, setVendorRows] = useState<VendorRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleService(id: number) {
    const removing = form.service_ids.includes(id);
    setForm((f) => ({
      ...f,
      service_ids: removing ? f.service_ids.filter((s) => s !== id) : [...f.service_ids, id],
    }));
    // A vendor row for a service no longer on the project goes with it.
    if (removing) setVendorRows((rows) => rows.filter((r) => r.serviceId !== String(id)));
  }

  function updateVendorRow(key: number, change: Partial<VendorRow>) {
    setVendorRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  const choices = serviceChoices(services, project);
  const chosen = choices.filter((s) => form.service_ids.includes(s.id));
  const providers = (serviceId: string) => (vendors ?? []).filter((v) => v.services.some((s) => String(s.id) === serviceId));
  const mappedRows = vendorRows.filter((r) => r.serviceId && r.vendorId);
  const repeatedRow = mappedRows.find(
    (r, i) => mappedRows.findIndex((x) => x.serviceId === r.serviceId && x.vendorId === r.vendorId) !== i,
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.client_id) {
      setError("Choose the client this project is for.");
      return;
    }
    if (form.service_ids.length === 0) {
      setError("Choose at least one service this project bills.");
      return;
    }
    if (repeatedRow) {
      setError("The same vendor is chosen twice for one service. Keep one row.");
      return;
    }
    setSaving(true);
    setError(null);
    // One entry per vendor with every service it delivers on the project.
    const byVendor = new Map<string, { service_id: number; agreed_cost: number }[]>();
    for (const r of mappedRows) {
      byVendor.set(r.vendorId, [...(byVendor.get(r.vendorId) ?? []), { service_id: Number(r.serviceId), agreed_cost: num(r.cost) }]);
    }
    const body = {
      title: form.title,
      client_id: Number(form.client_id),
      service_ids: form.service_ids,
      contract_value: num(form.contract_value),
      start_date: form.start_month ? `${form.start_month}-01` : null,
      ...(isNew && byVendor.size > 0
        ? { vendors: [...byVendor].map(([vendor_id, services]) => ({ vendor_id: Number(vendor_id), services })) }
        : {}),
    };
    try {
      const saved = project
        ? await api.patch<ProjectDetail>(`/projects/${project.id}`, body)
        : await api.post<ProjectDetail>("/projects", body);
      onOpenChange(false);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      stacked={stacked}
      title={project ? "Edit project" : "New project"}
      description="Who the work is for, the services it bills and the fee agreed."
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Project name">
          <input value={form.title} onChange={(e) => set("title", e.target.value)} required maxLength={200} className={inputClass} />
        </Field>
        <Field label="Client">
          <Select
            value={form.client_id}
            onValueChange={(v) => set("client_id", v)}
            required
            placeholder="Choose a client"
            options={(clients ?? []).map((c) => ({ value: String(c.id), label: c.business_name }))}
          />
        </Field>

        <fieldset className="col-span-full flex flex-col gap-2">
          <legend className="mb-2 text-xs tracking-eyebrow text-secondary">Services (choose one or more)</legend>
          {services === null ? (
            <p className="text-sm text-ink-40">Loading services…</p>
          ) : choices.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-sm text-secondary">
              No services yet. Add them on the Services page first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {choices.map((s) => {
                const on = form.service_ids.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-foreground/20 ${
                      on ? "border-foreground bg-foreground text-white" : "border-line bg-background hover:border-foreground/40"
                    }`}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleService(s.id)} className="sr-only" />
                    {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                    {s.title}
                    {!s.is_active && <span className="text-xs opacity-70">(deactivated)</span>}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <Field label="SAC code (from the services)">
          <p className="flex min-h-11 items-center rounded-xl border border-line bg-mist/50 px-3.5 font-mono text-sm text-secondary">
            {chosen.length ? chosen.map((s) => s.sac_code ?? "-").join(", ") : "Choose a service"}
          </p>
        </Field>
        <Field label="Contract value (₹, before GST)">
          <input
            {...NUMBER_RULES.money}
            value={form.contract_value}
            onChange={(e) => set("contract_value", e.target.value)}
            placeholder="Fee agreed with the client"
            className={inputClass}
          />
        </Field>
        <Field label="Start month">
          <input type="month" required value={form.start_month} onChange={(e) => set("start_month", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Report due (25th of next month)">
          <p className="flex min-h-11 items-center rounded-xl border border-line bg-mist/50 px-3.5 text-sm text-secondary">
            {form.start_month ? formatDate(reportDueDate(form.start_month)) : "-"}
          </p>
        </Field>

        {isNew && (
          <fieldset className="col-span-full flex flex-col gap-3">
            <legend className="mb-2 text-xs tracking-eyebrow text-secondary">Assign vendors</legend>
            {vendorRows.map((r) => {
              const options = r.serviceId ? providers(r.serviceId) : [];
              return (
                <div key={r.key} className="grid grid-cols-1 items-start gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1.2fr_1.2fr_0.8fr_auto]">
                  <Select
                    value={r.serviceId}
                    onValueChange={(v) => updateVendorRow(r.key, { serviceId: v, vendorId: "" })}
                    placeholder="Service"
                    options={chosen.map((s) => ({ value: String(s.id), label: s.title }))}
                  />
                  <Select
                    key={`${r.key}-${r.serviceId}`}
                    value={r.vendorId}
                    onValueChange={(v) => updateVendorRow(r.key, { vendorId: v })}
                    placeholder={!r.serviceId ? "Choose a service first" : options.length ? "Vendor" : "No vendor provides this"}
                    options={options.map((v) => ({ value: String(v.id), label: v.business_name }))}
                  />
                  <input
                    {...NUMBER_RULES.money}
                    required={!!(r.serviceId && r.vendorId)}
                    value={r.cost}
                    onChange={(e) => updateVendorRow(r.key, { cost: e.target.value })}
                    placeholder="Agreed cost ₹"
                    aria-label="Agreed cost in rupees"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setVendorRows((rows) => rows.filter((x) => x.key !== r.key))}
                    aria-label="Remove this vendor"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink-40 transition-colors hover:bg-mist hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                magnetic={false}
                disabled={chosen.length === 0}
                onClick={() =>
                  setVendorRows((rows) => [
                    ...rows,
                    // Start on the first chosen service that has no vendor yet.
                    {
                      key: ++vendorRowKey,
                      serviceId: String((chosen.find((s) => !rows.some((r) => r.serviceId === String(s.id))) ?? chosen[0])?.id ?? ""),
                      vendorId: "",
                      cost: "",
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Assign vendor
              </Button>
              <span className="text-xs text-ink-40">
                {chosen.length === 0
                  ? "Choose the services first."
                  : mappedRows.length
                    ? `${mappedRows.length} vendor mapping${mappedRows.length === 1 ? "" : "s"}; each gets a UPS code when the project is created.`
                    : "Pick a vendor for each service, or do it later from the project."}
              </span>
            </div>
          </fieldset>
        )}

        {error && (
          <p role="alert" className="col-span-full text-sm text-danger">
            ⚠ {error}
          </p>
        )}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Saving…" : project ? "Save changes" : "Create project"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** Active services, plus any the project already bills that have since been deactivated. */
function serviceChoices(services: Service[] | null, project?: ProjectDetail): ProjectService[] {
  const active: ProjectService[] = (services ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    sac_code: s.sac_code,
    gst_rate: s.gst_rate,
    is_active: s.is_active,
  }));
  const kept = (project?.services ?? []).filter((s) => !active.some((a) => a.id === s.id));
  return [...active, ...kept];
}
