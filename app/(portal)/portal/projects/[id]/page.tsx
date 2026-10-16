"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Mail, Pencil, Trash2, FolderKanban, Users } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { Panel, MetricCard, Table, Row, Cell, Empty, StatusPill, DataField } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { ProjectForm } from "@/components/portal/projects/ProjectForm";
import { ProjectVendorsForm } from "@/components/portal/projects/ProjectVendorsForm";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { formatDate, formatINR } from "@/lib/utils";
import { api, ApiError, type ProjectDetail, type ProjectVendor, type WorkOrderSent } from "@/lib/api";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasRole } = useAuth();
  const { data: project, loading, refetch, setData } = useApi<ProjectDetail>(id ? `/projects/${id}` : null);
  const [editOpen, setEditOpen] = useState(false);
  const [vendorsOpen, setVendorsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canManage = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");

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
                {project?.client_name && <> · for {project.client_name}</>}
              </p>
            </div>
          </div>
          {project && (
            <div className="flex flex-wrap items-center gap-3">
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
          <MetricCard
            label="Contract value"
            value={project?.contract_value ? formatINR(project.contract_value) : "Not set"}
            sub="Agreed with the client, before GST"
          />
          <MetricCard label="Billed" value={formatINR(project?.billed ?? 0)} sub="Invoices raised, before GST" />
          <MetricCard
            label="Left to bill"
            value={project?.left_to_bill != null ? formatINR(project.left_to_bill) : "-"}
            sub={
              project?.over_contract
                ? `⚠ billed ${formatINR((project.billed ?? 0) - project.contract_value)} over the contract`
                : project?.left_to_bill != null
                  ? "Still to invoice"
                  : "Set a contract value to track this"
            }
          />
          <MetricCard label="Margin" value={formatINR(project?.margin ?? 0)} sub="Billed minus vendor invoices" />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Vendor budget" value={formatINR(project?.budget ?? 0)} sub="Planned vendor spend" />
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

        <Panel>
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            <DataField label="Client" value={project?.client_name} />
            <DataField
              label={project && project.services.length > 1 ? "Services billed" : "Service billed"}
              value={
                project && project.services.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {project.services.map((s) => (
                      <li key={s.id}>
                        {s.title}
                        <span className="ml-1.5 font-mono text-xs text-ink-40">SAC {s.sac_code ?? "-"}</span>
                      </li>
                    ))}
                  </ul>
                ) : project ? (
                  <span className="text-warning">⚠ Not set: choose one with Edit before invoicing</span>
                ) : null
              }
            />
            <DataField label="Start month" value={project?.start_date ? monthLabel(project.start_date) : null} />
            <DataField label="Report due" value={project?.expected_report_date ? formatDate(project.expected_report_date) : null} />
            <DataField
              label="Scope of work"
              value={project?.description ? <span className="whitespace-pre-wrap">{project.description}</span> : null}
              className="col-span-full"
            />
          </div>
        </Panel>

        <section className="flex flex-col gap-4" aria-label="Client invoices">
          <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Client invoices for this project</h2>
          {project && project.client_invoices.length > 0 ? (
            <Table head={["Invoice", "Date", "Taxable value", "Total", "Status"]}>
              {project.client_invoices.map((i) => (
                <Row key={i.id} onClick={() => router.push(`/portal/invoices/${i.id}`)}>
                  <Cell className="font-medium">{i.display_number}</Cell>
                  <Cell className="text-ink-40">
                    {(i.invoice_date ?? i.proforma_date) ? formatDate((i.invoice_date ?? i.proforma_date) as string) : "-"}
                  </Cell>
                  <Cell className="tabular-nums">{formatINR(i.taxable_value)}</Cell>
                  <Cell className="tabular-nums">{formatINR(i.total_amount)}</Cell>
                  <Cell>
                    <StatusPill status={i.status} />
                  </Cell>
                </Row>
              ))}
            </Table>
          ) : (
            <Empty message={loading ? "Loading…" : "No client invoices yet. Raise one from Invoices and pick this project."} />
          )}
        </section>

        <section className="flex flex-col gap-4" aria-label="Vendors">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Vendors and work orders</h2>
            {canManage && project && (
              <Button size="sm" variant="secondary" magnetic={false} onClick={() => setVendorsOpen(true)}>
                <Users className="h-4 w-4" /> Edit vendors
              </Button>
            )}
          </div>
          {project && project.vendors.length > 0 ? (
            <Table head={["Vendor", "% of work", "Agreed cost", "Invoiced", "Work order", ...(canManage ? [""] : [])]}>
              {project.vendors.map((v) => (
                <Row key={v.id}>
                  <Cell className="font-medium">
                    {v.vendor_name}
                    <span className="block text-xs font-light text-ink-40">{v.vendor_email}</span>
                  </Cell>
                  <Cell className="tabular-nums">{v.work_percent}%</Cell>
                  <Cell className="tabular-nums">{formatINR(v.agreed_cost)}</Cell>
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
            <Empty message={loading ? "Loading…" : "No vendors on this project yet. Add them with Edit vendors."} />
          )}
        </section>

        <section className="flex flex-col gap-4" aria-label="Vendor invoices">
          <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Vendor invoices for this project</h2>
          {project && project.vendor_invoices.length > 0 ? (
            <Table head={["Invoice", "Vendor", "Date", "Amount", "Net payable", "Status"]}>
              {project.vendor_invoices.map((i) => (
                <Row key={i.id}>
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
      {vendorsOpen && project && (
        <ProjectVendorsForm open={vendorsOpen} onOpenChange={setVendorsOpen} project={project} onSaved={setData} />
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

/** "Oct 2026" for a YYYY-MM-DD date. */
function monthLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}
