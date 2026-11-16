"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Field, StatusPill, inputClass } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { formatINR } from "@/lib/utils";
import { api, ApiError, type Project, type ProjectDetail, type Vendor, type VendorAssignment } from "@/lib/api";
import { NUMBER_RULES } from "@/lib/validation";

/**
 * A vendor's jobs: every service it is assigned on a project, under its UPS code, with the
 * amount agreed and how far it is invoiced. A new job (project + service + amount) can be
 * added here for a vendor already onboarded; it gets the next UPS code on that project.
 */
export function VendorJobsDialog({
  open,
  onOpenChange,
  vendor,
  jobs,
  canManage,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendor: Vendor;
  jobs: VendorAssignment[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const { data: projects } = useApi<Project[]>(open && canManage ? "/projects" : null);
  const [projectId, setProjectId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  const project = projects?.find((p) => String(p.id) === projectId);
  const already = jobs.some((j) => String(j.project_id) === projectId && String(j.service_id) === serviceId);
  const totals = jobs.reduce((t, j) => ({ amount: t.amount + j.agreed_cost, invoiced: t.invoiced + j.invoiced }), { amount: 0, invoiced: 0 });

  async function addJob(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!projectId || !serviceId || already) return;
    setSaving(true);
    setError(null);
    setAdded(null);
    try {
      // The vendor must provide the service before it can be assigned it.
      if (!vendor.services.some((s) => String(s.id) === serviceId)) {
        await api.put(`/vendors/${vendor.id}/services`, { service_ids: [...vendor.services.map((s) => s.id), Number(serviceId)] });
      }
      // The vendor's jobs on this project are replaced as a set: keep the ones it has.
      const keep = jobs.filter((j) => String(j.project_id) === projectId).map((j) => ({ service_id: j.service_id, agreed_cost: j.agreed_cost }));
      const saved = await api.put<ProjectDetail>(`/projects/${projectId}/vendors/${vendor.id}`, {
        services: [...keep, { service_id: Number(serviceId), agreed_cost: Number(amount || 0) }],
      });
      const code = saved.vendors.find((v) => v.vendor_id === vendor.id)?.services.find((s) => String(s.service_id) === serviceId)?.code;
      setAdded(code ?? "the new job");
      setServiceId("");
      setAmount("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the job");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      title={`Jobs · ${vendor.business_name}`}
      description="Each job is one service on one project, under its own UPS code. Bills from this vendor are mapped to these codes."
    >
      <div className="flex flex-col gap-5">
        {jobs.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-eyebrow text-ink-40">
                  <th className="px-4 py-3 font-medium">UPS code</th>
                  <th className="px-4 py-3 font-medium">Project · service</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-right font-medium">Invoiced</th>
                  <th className="px-4 py-3 font-medium">Invoice status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className={"border-b border-line/60 last:border-0 " + (added === j.code ? "bg-success-soft/60" : "")}>
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">{j.code}</td>
                    <td className="px-4 py-2.5">
                      {j.project_title}
                      <span className="block text-xs text-ink-40">{j.service_title}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(j.agreed_cost)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-secondary">{formatINR(j.invoiced)}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={j.invoice_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line text-xs text-secondary">
                  <td className="px-4 py-2.5" colSpan={2}>
                    {jobs.length} job{jobs.length === 1 ? "" : "s"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatINR(totals.amount)}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatINR(totals.invoiced)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-secondary">No jobs yet.</p>
        )}

        {canManage && (
          <form onSubmit={addJob} className="flex flex-col gap-3 rounded-2xl border border-line p-4">
            <p className="text-xs tracking-eyebrow text-secondary">Add a job</p>
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1.2fr_1.2fr_0.8fr_auto]">
              <Field label="Project">
                <Select
                  value={projectId}
                  onValueChange={(v) => {
                    setProjectId(v);
                    setServiceId("");
                  }}
                  placeholder={projects ? "Choose a project" : "Loading…"}
                  options={(projects ?? []).map((p) => ({ value: String(p.id), label: `${p.code} ${p.title}` }))}
                />
              </Field>
              <Field label="Service">
                <Select
                  key={projectId}
                  value={serviceId}
                  onValueChange={setServiceId}
                  placeholder={project ? "Choose a service" : "Project first"}
                  options={(project?.services ?? []).map((s) => ({ value: String(s.id), label: s.title }))}
                />
              </Field>
              <Field label="Amount (₹)">
                <input {...NUMBER_RULES.money} required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
              </Field>
              <Button type="submit" magnetic={false} disabled={saving || !projectId || !serviceId || already}>
                <Plus className="h-4 w-4" /> {saving ? "Adding…" : "Add job"}
              </Button>
            </div>
            {already && <p className="text-xs text-warning">This vendor already has a job for that service on that project.</p>}
            {serviceId && !already && !vendor.services.some((s) => String(s.id) === serviceId) && (
              <p className="text-xs text-ink-40">The vendor does not list this service yet; it is added to its services.</p>
            )}
            {added && <p className="text-xs text-success">Job added under UPS code {added}.</p>}
            {error && <p role="alert" className="text-xs text-danger">⚠ {error}</p>}
          </form>
        )}

        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
