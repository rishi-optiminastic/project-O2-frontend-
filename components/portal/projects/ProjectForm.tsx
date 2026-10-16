"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Field, inputClass } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { formatDate } from "@/lib/utils";
import { api, ApiError, type Client, type ProjectDetail, type ProjectService, type Service } from "@/lib/api";
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

/**
 * Create or edit a project: who it is for, the services it bills, the agreed fee and
 * the start month. Vendors and their work orders are set from the project page.
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleService(id: number) {
    setForm((f) => ({
      ...f,
      service_ids: f.service_ids.includes(id) ? f.service_ids.filter((s) => s !== id) : [...f.service_ids, id],
    }));
  }

  const choices = serviceChoices(services, project);
  const chosen = choices.filter((s) => form.service_ids.includes(s.id));

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
    setSaving(true);
    setError(null);
    const body = {
      title: form.title,
      client_id: Number(form.client_id),
      service_ids: form.service_ids,
      contract_value: num(form.contract_value),
      start_date: form.start_month ? `${form.start_month}-01` : null,
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
