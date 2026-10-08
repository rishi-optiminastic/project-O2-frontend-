"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Field, inputClass } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { formatINR } from "@/lib/utils";
import { api, ApiError, PROJECT_STATUSES, type Client, type ProjectDetail, type Vendor } from "@/lib/api";

const FULL_WORK = 100;

type VendorShare = { vendor_id: number; work_percent: string; agreed_cost: string };

type FormState = {
  code: string;
  title: string;
  brand: string;
  description: string;
  client_id: string;
  budget: string;
  start_date: string;
  end_date: string;
  expected_report_date: string;
  status: string;
  vendors: VendorShare[];
};

/** Last day of the month that ``isoDate`` (YYYY-MM-DD) falls in. */
function monthEndOf(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${isoDate.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

function initialState(project?: ProjectDetail): FormState {
  return {
    code: project?.code ?? "",
    title: project?.title ?? "",
    brand: project?.brand ?? "",
    description: project?.description ?? "",
    client_id: project?.client_id ? String(project.client_id) : "",
    budget: project ? String(project.budget) : "",
    start_date: project?.start_date ?? "",
    end_date: project?.end_date ?? "",
    expected_report_date: project?.expected_report_date ?? "",
    status: project?.status ?? "Not Started",
    vendors: (project?.vendors ?? []).map((v) => ({
      vendor_id: v.vendor_id,
      work_percent: String(v.work_percent),
      agreed_cost: String(v.agreed_cost),
    })),
  };
}

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

/**
 * Create or edit a project: details four across on wide screens, a full-width
 * description, and one row per vendor with their share of the work and cost.
 */
export function ProjectForm({
  open,
  onOpenChange,
  project,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: ProjectDetail;
  onSaved: (saved: ProjectDetail) => void;
}) {
  const { data: clients } = useApi<Client[]>(open ? "/clients" : null);
  const { data: vendors } = useApi<Vendor[]>(open ? "/vendors" : null);
  const [form, setForm] = useState<FormState>(() => initialState(project));
  // The report date follows the end date until someone picks it themselves.
  const [reportDateTouched, setReportDateTouched] = useState(Boolean(project));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setEndDate(value: string) {
    setForm((f) => ({
      ...f,
      end_date: value,
      expected_report_date: reportDateTouched || !value ? f.expected_report_date : monthEndOf(value),
    }));
  }

  function setShare(index: number, key: "work_percent" | "agreed_cost", value: string) {
    setForm((f) => ({ ...f, vendors: f.vendors.map((v, i) => (i === index ? { ...v, [key]: value } : v)) }));
  }

  const assigned = form.vendors.reduce((sum, v) => sum + num(v.work_percent), 0);
  const committed = form.vendors.reduce((sum, v) => sum + num(v.agreed_cost), 0);
  const budget = num(form.budget);
  const vendorName = new Map((vendors ?? []).map((v) => [v.id, v.business_name]));
  const available = (vendors ?? []).filter((v) => !form.vendors.some((s) => s.vendor_id === v.id));

  function addVendor(id: string) {
    const remaining = Math.max(FULL_WORK - assigned, 0);
    set("vendors", [...form.vendors, { vendor_id: Number(id), work_percent: remaining ? String(remaining) : "", agreed_cost: "" }]);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.client_id) {
      setError("Choose the client this project is for.");
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      code: form.code,
      title: form.title,
      brand: form.brand,
      description: form.description,
      client_id: Number(form.client_id),
      budget,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      expected_report_date: form.expected_report_date || null,
      status: form.status,
      vendors: form.vendors.map((v) => ({
        vendor_id: v.vendor_id,
        work_percent: num(v.work_percent),
        agreed_cost: num(v.agreed_cost),
      })),
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
      title={project ? "Edit project" : "New project"}
      description="The client work, its budget, and the vendors who will deliver it."
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Field label="Project title">
            <input value={form.title} onChange={(e) => set("title", e.target.value)} required maxLength={200} className={inputClass} />
          </Field>
        </div>
        <Field label="HOC code">
          <input
            value={form.code}
            onChange={(e) => set("code", e.target.value.toUpperCase())}
            required
            maxLength={40}
            pattern="[A-Za-z0-9][A-Za-z0-9\/_.\-]*"
            title="Letters, numbers and - / _ . only, e.g. AXIS-Q4-01"
            placeholder="AXIS-Q4-01"
            spellCheck={false}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Brand">
          <input value={form.brand} onChange={(e) => set("brand", e.target.value)} maxLength={160} className={inputClass} />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Client">
            <Select
              value={form.client_id}
              onValueChange={(v) => set("client_id", v)}
              required
              placeholder="Choose a client"
              options={(clients ?? []).map((c) => ({ value: String(c.id), label: c.business_name }))}
            />
          </Field>
        </div>
        <Field label="Budget (₹)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.budget}
            onChange={(e) => set("budget", e.target.value)}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Status">
          <Select value={form.status} onValueChange={(v) => set("status", v)} options={PROJECT_STATUSES.map((s) => ({ value: s, label: s }))} />
        </Field>

        <Field label="Start date">
          <input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={inputClass} />
        </Field>
        <Field label="End date">
          <input type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Report due (month end)">
          <input
            type="date"
            value={form.expected_report_date}
            onChange={(e) => {
              setReportDateTouched(true);
              set("expected_report_date", e.target.value);
            }}
            className={inputClass}
          />
        </Field>
        <div className="hidden lg:block" aria-hidden />

        <div className="col-span-full">
          <Field label="Description (scope of work)">
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={5}
              placeholder="What will be delivered, where, and how it will be reported. This goes on each vendor's work order."
              className={`${inputClass} h-auto py-2.5`}
            />
          </Field>
        </div>

        <fieldset className="col-span-full flex flex-col gap-3">
          <legend className="mb-3 text-xs tracking-eyebrow text-secondary">Vendors</legend>
          {form.vendors.length > 0 && (
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
                  {form.vendors.map((v, i) => {
                    const name = vendorName.get(v.vendor_id) ?? project?.vendors.find((p) => p.vendor_id === v.vendor_id)?.vendor_name ?? "Vendor";
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
                            value={v.work_percent}
                            onChange={(e) => setShare(i, "work_percent", e.target.value)}
                            className={inputClass}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            required
                            aria-label={`${name} agreed cost in rupees`}
                            value={v.agreed_cost}
                            onChange={(e) => setShare(i, "agreed_cost", e.target.value)}
                            className={inputClass}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => set("vendors", form.vendors.filter((_, j) => j !== i))}
                            aria-label={`Remove ${name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-40 transition-colors hover:bg-mist hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
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
              key={form.vendors.length}
              value=""
              onValueChange={addVendor}
              placeholder={available.length ? "+ Add a vendor" : "All vendors added"}
              options={available.map((v) => ({ value: String(v.id), label: v.business_name }))}
            />
          </div>
          <Totals assigned={assigned} committed={committed} budget={budget} hasVendors={form.vendors.length > 0} />
        </fieldset>

        {error && (
          <p role="alert" className="col-span-full text-sm text-foreground/80">
            ⚠ {error}
          </p>
        )}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving || assigned > FULL_WORK}>
            {saving ? "Saving…" : project ? "Save changes" : "Create project"}
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
        <span className="font-medium tabular-nums">{share}%</span> <span className={share === FULL_WORK ? "text-secondary" : ""}>({shareNote})</span>
      </p>
      <p>
        <span className="text-secondary">Vendor cost: </span>
        <span className="font-medium tabular-nums">{formatINR(committed)}</span>
        <span className="text-secondary"> of {formatINR(budget)} budget</span>
        {over && <span> (⚠ over by {formatINR(committed - budget)})</span>}
      </p>
    </div>
  );
}
