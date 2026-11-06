"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Mail, Pencil, Trash2, FolderKanban, Plus } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { Panel, MetricCard, Table, Row, Cell, Empty, StatusPill, DataField, Field, inputClass } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { ProjectForm } from "@/components/portal/projects/ProjectForm";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { formatDate, formatINR } from "@/lib/utils";
import { api, ApiError, type ProjectDetail, type ProjectVendor, type WorkOrderSent } from "@/lib/api";
import { Attachments, DOC_CATEGORIES } from "@/components/portal/Attachments";
import { NewReportModal, ReportDetailModal } from "@/components/portal/reports/ReportDetail";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasRole } = useAuth();
  const { data: project, loading, refetch, setData } = useApi<ProjectDetail>(id ? `/projects/${id}` : null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [amendOpen, setAmendOpen] = useState(false);
  const [newReport, setNewReport] = useState(false);
  const [reportId, setReportId] = useState<number | null>(null);
  const canManage = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const canAmend = hasRole("ADMIN_CEO", "CFO");

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key);
    setNotice(null);
    try {
      setNotice(await action());
      refetch();
    } catch (e) {
      setNotice(`⚠ ${e instanceof ApiError ? e.message : "Something went wrong"}`);
    } finally {
      setBusy(null);
    }
  }

  function download(v: ProjectVendor) {
    run(`download-${v.vendor_id}`, async () => {
      await api.download(`/projects/${id}/vendors/${v.vendor_id}/work-order.pdf`, `work-order-${project?.code ?? id}-${v.vendor_name}.pdf`);
      return `Work order for ${v.vendor_name} downloaded.`;
    });
  }

  function email(v: ProjectVendor) {
    run(`email-${v.vendor_id}`, async () => {
      const r = await api.post<WorkOrderSent>(`/projects/${id}/vendors/${v.vendor_id}/work-order/send`);
      return r.emailed
        ? `Work order ${r.work_order_number} emailed to ${r.to_email}.`
        : `Email isn't set up, so nothing was sent. Download work order ${r.work_order_number} and send it to ${r.to_email} yourself.`;
    });
  }

  async function remove() {
    try {
      await api.del(`/projects/${id}`);
      router.push("/portal/projects");
    } catch (e) {
      setDeleteOpen(false);
      setNotice(`⚠ ${e instanceof ApiError ? e.message : "Could not delete the project"}`);
    }
  }

  if (!loading && !project) {
    return (
      <PortalShell>
        <Empty message="Project not found." />
      </PortalShell>
    );
  }

  const usedPercent = project && project.budget > 0 ? Math.round((project.committed_cost / project.budget) * 100) : 0;

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <button
          onClick={() => router.push("/portal/projects")}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-secondary transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All projects
        </button>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="metallic flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl">
              <FolderKanban className="h-6 w-6 text-foreground/70" />
            </span>
            <div className="min-w-0">
              <h1 className="font-sans text-3xl font-bold leading-[0.95] tracking-[-0.04em] sm:text-4xl">{project?.title ?? "…"}</h1>
              <p className="mt-2 text-sm text-secondary">
                <span className="font-mono">{project?.code}</span>
                {project?.brand && <> · {project.brand}</>}
                {project?.client_name && <> · for {project.client_name}</>}
              </p>
            </div>
          </div>
          {project && (
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={project.status} />
              {canManage && (
                <>
                  <Button size="sm" variant="secondary" magnetic={false} onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button size="sm" variant="secondary" magnetic={false} onClick={() => setDeleteOpen(true)} aria-label="Delete project">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {notice && (
          <p role="status" className={notice.startsWith("⚠") ? "text-sm text-danger" : "text-sm text-success"}>
            {notice}
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Budget" value={formatINR(project?.budget ?? 0)} sub="Planned vendor spend" />
          <MetricCard
            label="Committed to vendors"
            value={formatINR(project?.committed_cost ?? 0)}
            sub={project?.over_budget ? `⚠ ${usedPercent}% of budget: over` : `${usedPercent}% of budget`}
          />
          <MetricCard label="Invoiced by vendors" value={formatINR(project?.invoiced_cost ?? 0)} sub="Before GST" />
          <MetricCard
            label="Budget left"
            value={formatINR(project?.remaining_budget ?? 0)}
            sub={`${project?.work_percent_assigned ?? 0}% of the work assigned`}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Contract value"
            value={project?.effective_contract_value != null ? formatINR(project.effective_contract_value) : "No cap"}
            sub={
              project?.contract_value != null
                ? project.amendments_total
                  ? `${formatINR(project.contract_value)} ${project.amendments_total > 0 ? "+" : "−"} ${formatINR(Math.abs(project.amendments_total))} amended`
                  : "What the client pays, before GST"
                : "Set it with Edit to cap client invoicing"
            }
          />
          <MetricCard label="Invoiced to client" value={formatINR(project?.invoiced_value ?? 0)} sub="Issued tax invoices, before GST" />
          <MetricCard
            label="Contract left to invoice"
            value={project?.remaining_contract_value != null ? formatINR(project.remaining_contract_value) : "-"}
            tone={project?.remaining_contract_value != null && project.remaining_contract_value < 0 ? "danger" : undefined}
            sub={project?.remaining_contract_value != null && project.remaining_contract_value < 0 ? "⚠ over contract (approved exceptions)" : "Proformas count once issued"}
          />
          <MetricCard label="Agent credited" value={project?.agent_name ?? "-"} sub="Defaults to the client's agent" />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Expected profit"
            value={project?.expected_profit != null ? formatINR(project.expected_profit) : "-"}
            sub={project?.expected_margin_pct != null ? `${project.expected_margin_pct}% of the contract` : "Needs a contract value"}
          />
          <MetricCard
            label="Actual profit so far"
            value={formatINR(project?.actual_profit ?? 0)}
            tone={project && project.actual_profit < 0 ? "danger" : undefined}
            sub={project?.actual_margin_pct != null ? `${project.actual_margin_pct}% gross margin` : "No issued invoices yet"}
          />
          <MetricCard label="Actual cost" value={formatINR(project?.actual_cost ?? 0)} sub={`Vendor bills + ${formatINR(project?.other_expenses ?? 0)} other`} />
          <MetricCard
            label="Budget vs actual"
            value={formatINR(project?.budget_variance ?? 0)}
            tone={project && project.budget_variance < 0 ? "danger" : undefined}
            sub={project && project.budget_variance < 0 ? "⚠ over budget" : "left in the budget"}
          />
        </div>

        <Panel>
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            <DataField label="Client" value={project?.client_name} />
            <DataField label="Internal project owner" value={project?.owner_name} />
            <DataField label="Start date" value={project?.start_date ? formatDate(project.start_date) : null} />
            <DataField label="End date" value={project?.end_date ? formatDate(project.end_date) : null} />
            <DataField label="Report due" value={project?.expected_report_date ? formatDate(project.expected_report_date) : null} />
            <DataField
              label="Description"
              value={project?.description ? <span className="whitespace-pre-wrap">{project.description}</span> : null}
              className="col-span-full"
            />
          </div>
        </Panel>

        <section className="flex flex-col gap-4" aria-label="Vendors">
          <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Vendors and work orders</h2>
          {project && project.vendors.length > 0 ? (
            <Table head={["Vendor", "% of work", "Agreed cost", "Expected margin", "Invoiced", "Work order", ...(canManage ? [""] : [])]}>
              {project.vendors.map((v) => (
                <Row key={v.id}>
                  <Cell className="max-w-xs whitespace-normal font-medium">
                    {v.vendor_name}
                    <span className="block text-xs font-light text-ink-40">{v.vendor_email}</span>
                    {v.scope_of_work && <span className="mt-1 block text-xs font-light text-secondary">{v.scope_of_work}</span>}
                  </Cell>
                  <Cell className="tabular-nums">{v.work_percent}%</Cell>
                  <Cell className="tabular-nums">{formatINR(v.agreed_cost)}</Cell>
                  <Cell className="tabular-nums">
                    {v.expected_margin != null ? formatINR(v.expected_margin) : "-"}
                    <span className="block text-xs text-ink-40">
                      {v.expected_margin_pct != null ? `${v.expected_margin_pct}%` : ""}
                      {v.vendor_margin != null ? ` · planned ${v.vendor_margin}%` : ""}
                    </span>
                  </Cell>
                  <Cell className="tabular-nums">
                    {formatINR(v.invoiced)}
                    {v.over_invoiced && <span className="block text-xs font-medium text-danger">⚠ above agreed cost</span>}
                  </Cell>
                  <Cell>
                    <WorkOrderState vendor={v} />
                  </Cell>
                  {canManage && (
                    <Cell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" magnetic={false} onClick={() => download(v)} disabled={busy !== null}>
                          <Download className="h-4 w-4" /> PDF
                        </Button>
                        <Button size="sm" magnetic={false} onClick={() => email(v)} disabled={busy !== null}>
                          <Mail className="h-4 w-4" /> {busy === `email-${v.vendor_id}` ? "Sending…" : v.work_order_sent_at ? "Re-send" : "Email"}
                        </Button>
                      </div>
                    </Cell>
                  )}
                </Row>
              ))}
            </Table>
          ) : (
            <Empty message={loading ? "Loading…" : "No vendors on this project yet. Add them with Edit."} />
          )}
        </section>

        <section className="flex flex-col gap-4" aria-label="Client invoices">
          <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Client invoices on this project</h2>
          {project && project.client_invoices.length > 0 ? (
            <Table head={["Invoice", "Date", "Taxable", "Total", "Status"]}>
              {project.client_invoices.map((i) => (
                <Row key={i.id} onClick={() => router.push(`/portal/invoices/${i.id}`)}>
                  <Cell className="font-medium">
                    {i.display_number}
                    {!i.is_issued && <span className="block text-xs font-light text-ink-40">Proforma · not counted yet</span>}
                  </Cell>
                  <Cell className="text-ink-40">{formatDate(i.invoice_date ?? i.proforma_date ?? "")}</Cell>
                  <Cell className="tabular-nums">{formatINR(i.taxable_value)}</Cell>
                  <Cell className="tabular-nums">{formatINR(i.total_amount)}</Cell>
                  <Cell>
                    <StatusPill status={i.status} />
                  </Cell>
                </Row>
              ))}
            </Table>
          ) : (
            <Empty message="No client invoices yet. Pick this project when creating a proforma." />
          )}
        </section>

        <section className="flex flex-col gap-4" aria-label="Vendor reports">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Vendor reports</h2>
            <Button size="sm" variant="secondary" magnetic={false} onClick={() => setNewReport(true)}>
              <Plus className="h-4 w-4" /> Expect a report
            </Button>
          </div>
          {project && project.reports.length > 0 ? (
            <Table head={["Vendor", "Type", "Period", "Version", "Due", "Status"]}>
              {project.reports.map((r) => (
                <Row key={r.id} onClick={() => setReportId(r.id)}>
                  <Cell className="font-medium">{r.vendor_name ?? "-"}</Cell>
                  <Cell className="text-ink-40">{r.report_type ?? "-"}</Cell>
                  <Cell className="text-ink-40">{r.reporting_period ?? "-"}</Cell>
                  <Cell className="tabular-nums">{r.version}</Cell>
                  <Cell className="text-ink-40">{r.due_date ? formatDate(r.due_date) : "-"}</Cell>
                  <Cell><StatusPill status={r.review_status} /></Cell>
                </Row>
              ))}
            </Table>
          ) : (
            <Empty message="No reports expected from vendors on this project yet." />
          )}
        </section>

        <section className="flex flex-col gap-4" aria-label="Other direct expenses">
          <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Other direct expenses</h2>
          {project && project.expenses.length > 0 && (
            <Table head={["Date", "Description", "Category", "Amount", "Paid", ...(canManage ? [""] : [])]}>
              {project.expenses.map((e) => (
                <Row key={e.id}>
                  <Cell className="text-ink-40">{formatDate(e.expense_date)}</Cell>
                  <Cell className="font-medium">{e.description}</Cell>
                  <Cell className="text-ink-40">{e.category ?? "-"}</Cell>
                  <Cell className="tabular-nums">{formatINR(e.amount)}</Cell>
                  <Cell>{e.is_paid ? "Paid" : "Unpaid"}</Cell>
                  {canManage && (
                    <Cell>
                      {!e.is_paid && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="secondary" magnetic={false}
                            onClick={() => run(`paid-${e.id}`, async () => { setData(await api.post<ProjectDetail>(`/projects/${id}/expenses/${e.id}/paid`)); return "Expense marked paid."; })}>
                            Mark paid
                          </Button>
                          <Button size="sm" variant="ghost" magnetic={false} aria-label="Delete expense"
                            onClick={() => run(`del-${e.id}`, async () => { setData(await api.del<ProjectDetail>(`/projects/${id}/expenses/${e.id}`)); return "Expense deleted."; })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </Cell>
                  )}
                </Row>
              ))}
            </Table>
          )}
          {canManage && project && <ExpenseForm projectId={project.id} onSaved={(p) => { setData(p); setNotice("Expense recorded."); }} />}
        </section>

        {project && (
          <Attachments entityType="project" entityId={project.id} categories={DOC_CATEGORIES.project}
            title="Project documents" canUpload={canManage} canRemove={canManage} />
        )}

        <section className="flex flex-col gap-4" aria-label="Contract amendments">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Contract amendments</h2>
            {canAmend && project?.contract_value != null && (
              <Button size="sm" variant="secondary" magnetic={false} onClick={() => setAmendOpen(true)}>
                <Plus className="h-4 w-4" /> Record amendment
              </Button>
            )}
          </div>
          {project && project.contract_amendments.length > 0 ? (
            <Table head={["Date", "Change", "Reason", "Approved by"]}>
              {project.contract_amendments.map((a) => (
                <Row key={a.id}>
                  <Cell className="text-ink-40">{formatDate(a.created_at)}</Cell>
                  <Cell className={`tabular-nums ${a.amount < 0 ? "text-danger" : "text-success"}`}>
                    {a.amount > 0 ? "+" : "−"}
                    {formatINR(Math.abs(a.amount))}
                  </Cell>
                  <Cell className="max-w-md whitespace-normal">{a.reason}</Cell>
                  <Cell className="text-ink-40">{a.approved_by_name ?? "-"}</Cell>
                </Row>
              ))}
            </Table>
          ) : (
            <Empty
              message={
                project?.contract_value == null
                  ? "Set a contract value first. Amendments then raise or lower it, signed off by the CFO or CEO."
                  : "No amendments. The CFO or CEO records any agreed change to the contract value here."
              }
            />
          )}
        </section>

        <section className="flex flex-col gap-4" aria-label="Vendor invoices">
          <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Vendor invoices for this project</h2>
          {project && project.vendor_invoices.length > 0 ? (
            <Table head={["Invoice", "Vendor", "Date", "Amount", "Net payable", "Status"]}>
              {project.vendor_invoices.map((i) => (
                <Row key={i.id} onClick={() => router.push(`/portal/vendors/invoices/${i.id}`)}>
                  <Cell className="font-medium">{i.invoice_number}</Cell>
                  <Cell className="text-ink-40">{i.vendor_name}</Cell>
                  <Cell className="text-ink-40">{formatDate(i.invoice_date)}</Cell>
                  <Cell className="tabular-nums">{formatINR(i.invoice_amount)}</Cell>
                  <Cell className="tabular-nums">{formatINR(i.net_payable)}</Cell>
                  <Cell>
                    <StatusPill status={i.status} />
                  </Cell>
                </Row>
              ))}
            </Table>
          ) : (
            <Empty message="No vendor invoices yet. Record them from the vendor's page and pick this project." />
          )}
        </section>
      </div>

      {editOpen && project && (
        <ProjectForm open={editOpen} onOpenChange={setEditOpen} project={project} onSaved={setData} />
      )}
      {newReport && project && (
        <NewReportModal projectId={project.id} onClose={() => setNewReport(false)}
          onCreated={(rid) => { setNewReport(false); refetch(); setReportId(rid); }} />
      )}
      {reportId !== null && <ReportDetailModal reportId={reportId} onClose={() => setReportId(null)} onChanged={refetch} />}
      {amendOpen && project && (
        <AmendmentForm
          projectId={project.id}
          onClose={() => setAmendOpen(false)}
          onSaved={(saved) => {
            setAmendOpen(false);
            setData(saved);
            setNotice("Contract amendment recorded.");
          }}
        />
      )}
      <Modal open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete this project?" description="Its vendor shares and work order records are removed. This cannot be undone.">
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => setDeleteOpen(false)}>
            Keep it
          </Button>
          <Button type="button" magnetic={false} onClick={remove}>
            Delete project
          </Button>
        </ModalFooter>
      </Modal>
    </PortalShell>
  );
}

/** A direct cost that is not a vendor invoice. */
function ExpenseForm({ projectId, onSaved }: { projectId: number; onSaved: (p: ProjectDetail) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.post<ProjectDetail>(`/projects/${projectId}/expenses`, {
        description: fd.get("description"), category: fd.get("category") || null, amount: Number(fd.get("amount")),
        expense_date: fd.get("expense_date"), is_paid: fd.get("is_paid") === "on",
      }));
      form.reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record the expense");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 items-end gap-3 rounded-2xl border border-dashed border-line p-4 sm:grid-cols-6">
      <div className="sm:col-span-2"><Field label="Description"><input name="description" required maxLength={160} className={inputClass} /></Field></div>
      <Field label="Category"><input name="category" maxLength={80} placeholder="Travel" className={inputClass} /></Field>
      <Field label="Amount (₹)"><input name="amount" type="number" min={0.01} step="0.01" required className={inputClass} /></Field>
      <Field label="Date"><input name="expense_date" type="date" required className={inputClass} /></Field>
      <label className="flex items-center gap-2 pb-2 text-sm text-secondary"><input name="is_paid" type="checkbox" className="accent-foreground" /> Paid</label>
      {error && <p role="alert" className="sm:col-span-6 text-sm text-danger">⚠ {error}</p>}
      <div className="sm:col-span-6 flex justify-end">
        <Button type="submit" size="sm" magnetic={false} disabled={saving}>{saving ? "Saving…" : "Add expense"}</Button>
      </div>
    </form>
  );
}

/** CFO/CEO sign-off of a change to the contract value. Negative amounts lower it. */
function AmendmentForm({
  projectId,
  onClose,
  onSaved,
}: {
  projectId: number;
  onClose: () => void;
  onSaved: (project: ProjectDetail) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await api.post<ProjectDetail>(`/projects/${projectId}/contract-amendments`, {
          amount: Number(fd.get("amount")),
          reason: fd.get("reason"),
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record the amendment");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Record a contract amendment"
      description="An agreed change to what the client pays. Use a negative amount to lower the contract value."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Change (₹, before GST)">
          <input name="amount" type="number" step="0.01" required placeholder="50000 or -25000" className={inputClass} />
        </Field>
        <Field label="Reason">
          <textarea name="reason" required rows={3} placeholder="Change order #4 signed by the client on 2 Nov" className={`${inputClass} h-auto py-2.5`} />
        </Field>
        {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Saving…" : "Approve amendment"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function WorkOrderState({ vendor }: { vendor: ProjectVendor }) {
  if (!vendor.work_order_number) {
    return <span className="text-xs text-ink-40">Not issued yet</span>;
  }
  return (
    <span className="text-xs">
      <span className="font-mono">{vendor.work_order_number}</span>
      <span className="block text-ink-40">
        {vendor.work_order_sent_at ? `Emailed ${formatDate(vendor.work_order_sent_at)}` : "Issued, not emailed"}
      </span>
      {vendor.work_order_outdated && <span className="block font-medium text-warning">⚠ Terms changed: send again</span>}
    </span>
  );
}
