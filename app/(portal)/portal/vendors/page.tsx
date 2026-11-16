"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, BadgeCheck, Building2, FileUp, FolderPlus, X } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Table, Row, Cell, Empty, StatusPill, Field, inputClass } from "@/components/portal/ui";
import { Select } from "@/components/portal/Select";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { VendorFields, vendorPayload } from "@/components/portal/vendors/VendorFields";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { api, ApiError, type Project, type ProjectDetail, type Service, type Vendor, type VendorInvoice } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { FIELD_RULES, GST_RATE_OPTIONS, NUMBER_RULES, indiaToday, pastDateRule } from "@/lib/validation";

export default function VendorsPage() {
  const { data, loading, refetch } = useApi<Vendor[]>("/vendors");
  const { hasRole } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canManage = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");

  async function verify(id: number) {
    setBusy(id);
    setErr(null);
    try {
      await api.post(`/vendors/${id}/verify`);
      refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not verify");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Vendors"
          description="Onboarding is complete only when tax and bank details are verified."
          action={
            <Button size="sm" magnetic={false} onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New vendor
            </Button>
          }
        />

        {err && <p className="text-sm text-danger">⚠ {err}</p>}

        {data && data.length > 0 ? (
          <Table head={["Vendor", "GST / PAN", "Bank", "Status", ""]}>
            {data.map((v) => (
              <Row key={v.id} onClick={() => router.push(`/portal/vendors/${v.id}`)}>
                <Cell className="font-medium">
                  {v.business_name}
                  {v.is_group_company && (
                    <span className="ml-2 rounded-full bg-mist px-2 py-0.5 text-[11px] font-normal text-secondary">Group Co</span>
                  )}
                  <span className="block text-xs text-ink-40">{v.email}</span>
                </Cell>
                <Cell className="text-ink-40">
                  {v.gst_number ?? "—"}
                  <span className="block">{v.pan ?? ""}</span>
                </Cell>
                <Cell className="text-ink-40">
                  {v.bank_accounts[0]?.bank_name ?? "-"}
                  {v.bank_accounts.length > 1 && <span className="block text-xs">+{v.bank_accounts.length - 1} more</span>}
                </Cell>
                <Cell>
                  <StatusPill status={v.is_verified ? "Verified" : v.approval_status} />
                </Cell>
                <Cell>
                  {!v.is_verified && canManage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        verify(v.id);
                      }}
                      disabled={busy === v.id}
                      className="inline-flex items-center gap-1.5 text-xs text-secondary transition-colors hover:text-foreground"
                    >
                      <BadgeCheck className="h-4 w-4" /> Verify
                    </button>
                  )}
                </Cell>
              </Row>
            ))}
          </Table>
        ) : (
          <Empty
            message={loading ? "Loading vendors…" : "No vendors onboarded yet. Add your first to start tracking payouts."}
            icon={<Building2 className="h-5 w-5" strokeWidth={1.6} />}
            action={
              loading ? undefined : (
                <Button size="sm" magnetic={false} onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4" /> New vendor
                </Button>
              )
            }
          />
        )}
      </div>

      <VendorForm open={open} onOpenChange={setOpen} onSaved={refetch} />
    </PortalShell>
  );
}

/** A project assignment added while onboarding: one service on one project, at an agreed cost. */
type AssignRow = { key: number; projectId: string; serviceId: string; cost: string };

/** The vendor's first bill, uploaded while onboarding and mapped to the assignments above. */
type BillDraft = {
  number: string;
  date: string;
  projectId: string;
  gstRate: string;
  /** Percentage (rate) of Optiminastic's commission on this bill; empty = the vendor's rate. */
  rate: string;
  file: File | null;
  /** Amount billed per assignment row (by row key). */
  amounts: Record<number, string>;
};

type Done = {
  vendor: Vendor;
  codes: { code: string; service: string; project: string; cost: number }[];
  bill: { number: string; amount: number; commission: number; payable: number; file: boolean } | null;
  failed: string[];
};

let rowKey = 0;

function VendorForm({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { hasRole } = useAuth();
  const canAssign = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const { data: catalogue } = useApi<Service[]>(open ? "/services" : null);
  const { data: projects } = useApi<Project[]>(open && canAssign ? "/projects" : null);
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [rows, setRows] = useState<AssignRow[]>([]);
  const [bill, setBill] = useState<BillDraft | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const project = (id: string) => projects?.find((p) => String(p.id) === id);
  const serviceName = (id: string) => catalogue?.find((s) => String(s.id) === id)?.title ?? "Service";
  const filled = rows.filter((r) => r.projectId && r.serviceId);
  const repeated = filled.find((r, i) => filled.findIndex((x) => x.projectId === r.projectId && x.serviceId === r.serviceId) !== i);
  // A bill covers one project: the projects that have assignments in this form.
  const billProjects = [...new Set(filled.map((r) => r.projectId))];
  const billProject = bill ? bill.projectId || (billProjects.length === 1 ? billProjects[0] : "") : "";
  const billRows = filled.filter((r) => r.projectId === billProject);
  const billTotal = billRows.reduce((s, r) => s + Number(bill?.amounts[r.key] || 0), 0);

  function reset() {
    setServiceIds([]);
    setRows([]);
    setBill(null);
    setDone(null);
    setError(null);
  }
  function close(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }
  function toggleService(id: number) {
    setServiceIds((all) => (all.includes(id) ? all.filter((x) => x !== id) : [...all, id]));
  }
  function updateRow(key: number, change: Partial<AssignRow>) {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }
  function updateBill(change: Partial<BillDraft>) {
    setBill((b) => (b ? { ...b, ...change } : b));
  }

  function problem(): string | null {
    if (repeated) return "The same service on the same project is listed twice. Keep one.";
    if (bill) {
      if (!bill.number.trim()) return "Enter the invoice number of the uploaded invoice.";
      if (!billProject) return "Choose which project the uploaded invoice is for.";
      if (billTotal <= 0) return "Map the invoice: enter an amount against at least one UPS code.";
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = problem();
    if (found) {
      setError(found);
      return;
    }
    setSaving(true);
    setError(null);
    // A service the vendor is assigned is one it provides.
    const provided = [...new Set([...serviceIds, ...filled.map((r) => Number(r.serviceId))])];
    let vendor: Vendor;
    try {
      vendor = await api.post<Vendor>("/vendors", { ...vendorPayload(e.currentTarget), service_ids: provided });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
      setSaving(false);
      return;
    }
    onSaved();
    if (filled.length === 0) {
      setSaving(false);
      close(false);
      return;
    }

    // One call per project, with every service the vendor delivers there.
    const result: Done = { vendor, codes: [], bill: null, failed: [] };
    const assignmentId = new Map<number, number>(); // form row key -> UPS code id
    for (const projectId of [...new Set(filled.map((r) => r.projectId))]) {
      const mine = filled.filter((r) => r.projectId === projectId);
      try {
        const saved = await api.put<ProjectDetail>(`/projects/${projectId}/vendors/${vendor.id}`, {
          services: mine.map((r) => ({ service_id: Number(r.serviceId), agreed_cost: Number(r.cost || 0) })),
        });
        const pv = saved.vendors.find((v) => v.vendor_id === vendor.id);
        for (const s of pv?.services ?? []) {
          result.codes.push({ code: s.code, service: s.service_title, project: `${saved.code} ${saved.title}`, cost: s.agreed_cost });
          const row = mine.find((r) => Number(r.serviceId) === s.service_id);
          if (row) assignmentId.set(row.key, s.id);
        }
      } catch (err) {
        result.failed.push(`${project(projectId)?.code ?? "Project"}: ${err instanceof ApiError ? err.message : "not assigned"}`);
      }
    }

    // The uploaded invoice, charged against the UPS codes just generated.
    if (bill) {
      const lines = billRows
        .filter((r) => Number(bill.amounts[r.key] || 0) > 0 && assignmentId.has(r.key))
        .map((r) => ({ assignment_id: assignmentId.get(r.key), amount: Number(bill.amounts[r.key]) }));
      if (lines.length === 0) {
        result.failed.push(`Invoice ${bill.number}: its project assignment was not made, so it was not recorded.`);
      } else {
        try {
          const created = await api.post<VendorInvoice>("/vendors/invoices", {
            vendor_id: vendor.id,
            invoice_number: bill.number.trim(),
            invoice_date: bill.date,
            lines,
            gst_rate: Number(bill.gstRate),
            ...(bill.rate.trim() !== "" ? { commission_rate: Number(bill.rate) } : {}),
          });
          let file = false;
          if (bill.file) {
            try {
              await api.upload(`/vendors/invoices/${created.id}/document`, bill.file);
              file = true;
            } catch (err) {
              result.failed.push(`Invoice ${bill.number} is saved, but its file was not uploaded: ${err instanceof ApiError ? err.message : "upload failed"}`);
            }
          }
          result.bill = { number: created.invoice_number, amount: created.invoice_amount, commission: created.commission_amount, payable: created.amount_payable, file };
        } catch (err) {
          result.failed.push(`Invoice ${bill.number}: ${err instanceof ApiError ? err.message : "not recorded"}`);
        }
      }
    }
    setSaving(false);
    setDone(result);
  }

  if (done) {
    return (
      <Modal
        open={open}
        onOpenChange={close}
        size="wide"
        title={`${done.vendor.business_name} onboarded`}
        description="The vendor is saved and assigned. Each assignment has its UPS code, printed on the work order and quoted on the vendor's bills."
      >
        {done.codes.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-eyebrow text-ink-40">
                  <th className="px-4 py-3 font-medium">UPS code</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 text-right font-medium">Agreed cost</th>
                </tr>
              </thead>
              <tbody>
                {done.codes.map((c) => (
                  <tr key={c.code} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">{c.code}</td>
                    <td className="px-4 py-2.5">{c.project}</td>
                    <td className="px-4 py-2.5 text-secondary">{c.service}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(c.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {done.bill && (
          <p className="mt-4 rounded-2xl border border-line bg-mist/50 p-4 text-sm text-secondary">
            Invoice <span className="font-medium text-foreground">{done.bill.number}</span> recorded: {formatINR(done.bill.amount)} before GST,
            commission {formatINR(done.bill.commission)}, paid to vendor{" "}
            <span className="font-medium text-foreground">{formatINR(done.bill.payable)}</span>
            {done.bill.file ? " · file attached." : "."}
          </p>
        )}
        {done.failed.length > 0 && (
          <div role="alert" className="mt-4 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
            <p className="font-medium">The vendor is saved, but not everything went through:</p>
            <ul className="mt-1 list-disc pl-5">
              {done.failed.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="mt-1">Finish it from the vendor&apos;s page (Jobs, Upload invoice).</p>
          </div>
        )}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => close(false)}>
            Close
          </Button>
          <Link href={`/portal/vendors/${done.vendor.id}`} className="inline-flex">
            <Button type="button" magnetic={false}>
              Open vendor
            </Button>
          </Link>
        </ModalFooter>
      </Modal>
    );
  }

  const servicesAndProjects = (
    <>
      {/* The services the vendor provides: projects can assign it only for these. */}
      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-2 text-xs tracking-eyebrow text-secondary">Services provided</legend>
        {catalogue && catalogue.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {catalogue.map((s) => {
              const on = serviceIds.includes(s.id) || filled.some((r) => Number(r.serviceId) === s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleService(s.id)}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs transition-colors " +
                    (on ? "border-foreground bg-foreground text-background" : "border-line text-secondary hover:text-foreground")
                  }
                >
                  {s.title}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-ink-40">{catalogue ? "No services in the catalogue yet." : "Loading services…"}</p>
        )}
      </fieldset>

      {/* Assign the vendor to projects now, service by service; each becomes a UPS code. */}
      {canAssign && (
        <fieldset className="flex flex-col gap-3 sm:col-span-2">
          <legend className="mb-2 text-xs tracking-eyebrow text-secondary">Project assignments</legend>
          {rows.map((r) => {
            const p = project(r.projectId);
            return (
              <div key={r.key} className="grid grid-cols-1 items-start gap-2 rounded-2xl border border-line p-3 sm:grid-cols-2">
                <Select
                  value={r.projectId}
                  onValueChange={(v) => updateRow(r.key, { projectId: v, serviceId: "" })}
                  placeholder="Project"
                  options={(projects ?? []).map((x) => ({ value: String(x.id), label: `${x.code} ${x.title}` }))}
                />
                <Select
                  key={`${r.key}-${r.projectId}`}
                  value={r.serviceId}
                  onValueChange={(v) => updateRow(r.key, { serviceId: v })}
                  placeholder={p ? "Service" : "Choose a project first"}
                  options={(p?.services ?? []).map((s) => ({ value: String(s.id), label: s.title }))}
                />
                <div className="flex gap-2 sm:col-span-2">
                  <input
                    {...NUMBER_RULES.money}
                    required={!!(r.projectId && r.serviceId)}
                    value={r.cost}
                    onChange={(e) => updateRow(r.key, { cost: e.target.value })}
                    placeholder="Agreed cost ₹"
                    aria-label="Agreed cost in rupees"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}
                    aria-label="Remove this assignment"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-40 transition-colors hover:bg-mist hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              magnetic={false}
              onClick={() => setRows((all) => [...all, { key: ++rowKey, projectId: "", serviceId: "", cost: "" }])}
              disabled={projects?.length === 0}
            >
              <FolderPlus className="h-4 w-4" /> Assign to project
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              magnetic={false}
              disabled={filled.length === 0 || bill !== null}
              title={filled.length === 0 ? "Assign the vendor to a project first, so the invoice can be mapped to its UPS codes" : undefined}
              onClick={() => setBill({ number: "", date: indiaToday(), projectId: "", gstRate: "18", rate: "", file: null, amounts: {} })}
            >
              <FileUp className="h-4 w-4" /> Upload invoice
            </Button>
            {projects?.length === 0 && <span className="text-xs text-ink-40">No projects yet.</span>}
          </div>
          {filled.length > 0 && !bill && (
            <p className="text-xs text-ink-40">Each assignment gets a UPS code when you save. Upload the vendor&apos;s invoice to map it to these codes.</p>
          )}
        </fieldset>
      )}

      {/* The vendor's invoice, mapped to the UPS codes of the assignments above. */}
      {bill && (
        <fieldset className="flex flex-col gap-3 rounded-2xl border border-line p-4 sm:col-span-2">
          <legend className="px-1 text-xs tracking-eyebrow text-secondary">Upload invoice</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Invoice number">
              <input value={bill.number} onChange={(e) => updateBill({ number: e.target.value })} {...FIELD_RULES.invoiceNumber} className={inputClass} />
            </Field>
            <Field label="Invoice date">
              <input value={bill.date} onChange={(e) => updateBill({ date: e.target.value })} {...pastDateRule()} className={inputClass} />
            </Field>
            <Field label="GST rate">
              <Select value={bill.gstRate} onValueChange={(v) => updateBill({ gstRate: v })} options={GST_RATE_OPTIONS} />
            </Field>
            <Field label="Percentage (rate) %">
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={bill.rate}
                onChange={(e) => updateBill({ rate: e.target.value })}
                placeholder="Vendor's rate"
                title="Optiminastic's commission on this bill. Left empty, the percentage (rate) set above."
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {billProjects.length > 1 && (
              <Field label="Project on this invoice">
                <Select
                  value={billProject}
                  onValueChange={(v) => updateBill({ projectId: v, amounts: {} })}
                  placeholder="Choose the project"
                  options={billProjects.map((id) => ({ value: id, label: `${project(id)?.code ?? ""} ${project(id)?.title ?? ""}` }))}
                />
              </Field>
            )}
            <Field label="Invoice file (PDF or image)">
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={(e) => updateBill({ file: e.target.files?.[0] ?? null })}
                className="block w-full text-sm text-secondary file:mr-3 file:rounded-full file:border file:border-line file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-mist"
              />
            </Field>
          </div>
          {billRows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[440px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs tracking-eyebrow text-ink-40">
                    <th className="px-3 py-2 font-medium">Map (UPS code)</th>
                    <th className="px-3 py-2 font-medium">Agreed</th>
                    <th className="w-44 px-3 py-2 font-medium">Billed (₹, before GST)</th>
                  </tr>
                </thead>
                <tbody>
                  {billRows.map((r) => (
                    <tr key={r.key} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-medium">{serviceName(r.serviceId)}</span>
                        <span className="block text-xs text-ink-40">{project(r.projectId)?.code}-V··-S·· · UPS code generated on save</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-secondary">{formatINR(Number(r.cost || 0))}</td>
                      <td className="px-3 py-2">
                        <input
                          {...NUMBER_RULES.money}
                          value={bill.amounts[r.key] ?? ""}
                          onChange={(e) => updateBill({ amounts: { ...bill.amounts, [r.key]: e.target.value } })}
                          aria-label={`Amount billed for ${serviceName(r.serviceId)}`}
                          className={inputClass}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 text-xs text-ink-40">
            <span>
              Invoice amount {formatINR(billTotal)} before GST. TDS follows the vendor&apos;s TDS section; the commission is kept back from the payout.
            </span>
            <button type="button" onClick={() => setBill(null)} className="shrink-0 underline hover:text-foreground">
              Remove invoice
            </button>
          </div>
        </fieldset>
      )}
    </>
  );

  return (
    <Modal
      open={open}
      onOpenChange={close}
      // Standard width: the form reads top to bottom rather than spreading sideways.
      title="Onboard a vendor"
      description="Enter the GSTIN to fill the name and address. Everything is required except the COI and MSME number."
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <VendorFields beforeBankAccounts={servicesAndProjects} />

        {error && <p className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving || !!repeated}>
            {saving ? "Saving…" : bill ? "Save, assign and record invoice" : filled.length ? "Save and assign" : "Save vendor"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
