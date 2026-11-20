"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Mail, Phone, Package, BadgeCheck, Plus, Pencil, Layers, FileText, Briefcase, Link2 } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import {
  Panel,
  MetricCard,
  Table,
  Row,
  Cell,
  Empty,
  StatusPill,
  DataField,
} from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { VendorFields, vendorPayload } from "@/components/portal/vendors/VendorFields";
import { VendorInvoiceForm } from "@/components/portal/vendors/VendorInvoiceForm";
import { VendorServicesForm } from "@/components/portal/vendors/VendorServicesForm";
import { VendorJobsDialog } from "@/components/portal/vendors/VendorJobsDialog";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { fadeUp, stagger } from "@/lib/motion";
import { formatINR, formatDate } from "@/lib/utils";
import { taxSplit } from "@/lib/invoice";
import { api, ApiError, type Vendor, type VendorAssignment, type VendorInvoice, type Project, TDS_SECTIONS } from "@/lib/api";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { Tabs } from "@/components/portal/Tabs";
import { PORTAL_EVENTS, usePortalEvent } from "@/lib/events";
import { useMonth, withMonth } from "@/lib/month";

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasRole } = useAuth();
  const vid = Number(id);

  const { data: vendor, loading, refetch, setData: setVendor } = useApi<Vendor>(id ? `/vendors/${id}` : null);
  const { data: assignmentData, refetch: refetchAssignments } = useApi<VendorAssignment[]>(id ? `/vendors/${id}/assignments` : null);
  const assignments = assignmentData ?? [];
  const [month] = useMonth();
  const { data: allInvoices, refetch: refetchInvoices } = useApi<VendorInvoice[]>(withMonth("/vendors/invoices/all", month));
  const { data: allProjects } = useApi<Project[]>("/projects");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [invOpen, setInvOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [view, setView] = useState<"jobs" | "invoices">("jobs");
  const [section, setSection] = useState<"overview" | "services" | "bank" | "work">("overview");
  // A bill recorded from the floating Record button updates the jobs and invoices here.
  usePortalEvent(PORTAL_EVENTS.vendorInvoiceRecorded, refetchInvoices);
  usePortalEvent(PORTAL_EVENTS.vendorInvoiceRecorded, refetchAssignments);

  const canManage = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const canAddInvoice = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER", "FINANCE_EXECUTIVE");
  const invoices = (allInvoices ?? []).filter((i) => i.vendor_id === vid);
  // The work order this vendor has on each project, by project id.
  const workOrders = new Map(
    (allProjects ?? []).flatMap((p) => p.vendors.filter((v) => v.vendor_id === vid).map((v) => [p.id, v.work_order_number] as const)),
  );
  const projectCount = new Set(assignments.map((a) => a.project_id)).size;

  const payable = invoices.reduce((s, i) => s + i.net_payable, 0);
  const tds = invoices.reduce((s, i) => s + i.tds_amount, 0);
  const contracted = assignments.reduce((s, a) => s + a.agreed_cost, 0);

  async function verify() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/vendors/${id}/verify`);
      refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not verify");
    } finally {
      setBusy(false);
    }
  }

  if (!loading && !vendor) {
    return (
      <PortalShell>
        <Empty message="Vendor not found." />
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <motion.div className="flex flex-col gap-8" initial="hidden" animate="show" variants={stagger(0.08, 0.04)}>
        <motion.button
          variants={fadeUp}
          onClick={() => router.push("/portal/vendors")}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-secondary transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All vendors
        </motion.button>

        {/* Identity header */}
        <motion.div variants={fadeUp} className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="metallic flex h-16 w-16 items-center justify-center rounded-2xl">
              <Package className="h-6 w-6 text-foreground/70" />
            </span>
            <div>
              <h1 className="font-sans text-4xl font-bold leading-[0.95] tracking-[-0.04em]">
                {vendor?.business_name ?? "…"}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-secondary">
                {vendor?.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> {vendor.email}
                  </span>
                )}
                {vendor?.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> {vendor.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={vendor?.is_verified ? "Verified" : vendor?.approval_status ?? "Pending"} />
            {vendor && canAddInvoice && (
              <Button size="sm" variant="secondary" magnetic={false} onClick={() => setInvOpen(true)}>
                <Plus className="h-4 w-4" /> Upload invoice
              </Button>
            )}
            {vendor && canManage && (
              <Button size="sm" variant="secondary" magnetic={false} onClick={() => setJobsOpen(true)} title="Map this vendor to a project service; each mapping gets a UPS code">
                <Link2 className="h-4 w-4" /> Map (UPS code)
              </Button>
            )}
            {vendor && (
              <Button size="sm" variant="secondary" magnetic={false} onClick={() => setJobsOpen(true)}>
                <Briefcase className="h-4 w-4" /> Jobs{assignments.length > 0 && ` (${assignments.length})`}
              </Button>
            )}
            {vendor && canManage && (
              <Button size="sm" variant="secondary" magnetic={false} onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
            {vendor && !vendor.is_verified && canManage && (
              <Button size="sm" magnetic={false} onClick={verify} disabled={busy}>
                <BadgeCheck className="h-4 w-4" /> {busy ? "Verifying…" : "Verify"}
              </Button>
            )}
          </div>
        </motion.div>

        {err && <p className="text-sm text-danger">⚠ {err}</p>}

        {/* Sections of the vendor */}
        <motion.div variants={fadeUp}>
          <Tabs
            tabs={[
              { key: "overview", label: "Overview" },
              { key: "services", label: "Services provided", badge: vendor?.services.length || undefined },
              { key: "bank", label: "Bank accounts", badge: vendor?.bank_accounts.length || undefined },
              { key: "work", label: "Jobs & invoices", badge: assignments.length || undefined },
            ]}
            active={section}
            onChange={setSection}
            layoutId="vendor-section"
            label="Vendor sections"
          />
        </motion.div>

        {section === "overview" && (
          <>
        {/* KPIs */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {/* The vendor's bills: amount plus GST, with the split underneath. */}
          <MetricCard
            label="Total invoice value"
            value={formatINR(invoices.reduce((s, i) => s + i.invoice_amount + i.gst_amount, 0))}
            sub={taxSplit(invoices.reduce((s, i) => s + i.invoice_amount, 0), invoices.reduce((s, i) => s + i.gst_amount, 0))}
            spark={invoices.map((i) => i.invoice_amount + i.gst_amount).slice(-9)}
          />
          <MetricCard label="Net payable" value={formatINR(payable)} sub={`${invoices.length} invoices`} spark={invoices.map((i) => i.net_payable).slice(-9)} />
          <MetricCard label="TDS deducted" value={formatINR(tds)} sub="Withheld at source" spark={invoices.map((i) => i.tds_amount).slice(-9)} />
          <MetricCard label="Contracted" value={formatINR(contracted)} sub={`${assignments.length} service${assignments.length === 1 ? "" : "s"} on ${projectCount} project${projectCount === 1 ? "" : "s"}`} spark={assignments.map((a) => a.agreed_cost).slice(-9)} />
          <MetricCard label="Onboarding" value={vendor?.is_verified ? "Verified" : "Pending"} sub={vendor ? formatDate(vendor.created_at) : ""} spark={[3, 5, 4, 6, 5, 7, 6, 8, vendor?.is_verified ? 10 : 5]} />
        </motion.div>

        {/* Who the vendor is and how to reach them */}
        <motion.div variants={fadeUp}>
          <Panel>
            <h2 className="mb-5 text-sm font-medium tracking-eyebrow text-secondary">General information</h2>
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
              <DataField label="Business name" value={vendor?.business_name} />
              <DataField label="Registered legal name" value={vendor?.legal_name || (vendor ? "Same as business name" : null)} />
              <DataField label="Contact person" value={vendor?.contact_person || (vendor ? "—" : null)} />
              <DataField label="Email" value={vendor?.email} />
              <DataField label="Phone" value={vendor?.phone || (vendor ? "—" : null)} />
              <DataField label="Vendor type" value={vendor ? (vendor.is_group_company ? "Group company" : "External vendor") : null} />
              <DataField
                label="Approval status"
                value={vendor ? <StatusPill status={vendor.is_verified ? "Verified" : vendor.approval_status} /> : null}
              />
              <DataField label="Onboarded" value={vendor ? formatDate(vendor.created_at) : null} />
              <DataField label="Address" value={vendor?.address || (vendor ? "—" : null)} className="sm:col-span-2" />
              <DataField
                label="Primary bank account"
                value={
                  vendor
                    ? vendor.bank_accounts[0]
                      ? `${vendor.bank_accounts[0].bank_name} · ${vendor.bank_accounts[0].account_number}${vendor.bank_accounts.length > 1 ? ` (+${vendor.bank_accounts.length - 1} more)` : ""}`
                      : "None yet"
                    : null
                }
              />
              <DataField
                label="Services provided"
                value={vendor ? (vendor.services.length ? `${vendor.services.length} service${vendor.services.length === 1 ? "" : "s"}` : "None yet") : null}
              />
            </div>
          </Panel>
        </motion.div>

        {/* Tax, registration and the terms on its bills */}
        <motion.div variants={fadeUp}>
          <Panel>
            <h2 className="mb-5 text-sm font-medium tracking-eyebrow text-secondary">Tax &amp; registration</h2>
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
              <DataField label="GST number" value={vendor?.gst_number} mono />
              <DataField label="PAN" value={vendor?.pan} mono />
              <DataField
                label="MSME"
                value={vendor ? (vendor.msme ? `Yes${vendor.msme_number ? ` · ${vendor.msme_number}` : ""}` : "No") : null}
                mono={!!vendor?.msme_number}
              />
              <DataField label="COI" value={vendor?.coi || (vendor ? "—" : null)} mono />
              <DataField
                label="TDS section on bills"
                value={vendor ? (TDS_SECTIONS.find((t) => t.key === vendor.default_tds_section) ?? TDS_SECTIONS[0]).label + ` (${(TDS_SECTIONS.find((t) => t.key === vendor.default_tds_section) ?? TDS_SECTIONS[0]).rate}%)` : null}
              />
              <DataField label="Percentage (rate) · commission" value={vendor ? `${vendor.commission_rate ?? 0}%` : null} />
            </div>
          </Panel>
        </motion.div>
          </>
        )}

        {section === "services" && (
          <motion.div variants={fadeUp}>
            <Panel>
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Services provided</h2>
                {vendor && canManage && (
                  <Button size="sm" variant="secondary" magnetic={false} onClick={() => setServicesOpen(true)}>
                    <Layers className="h-4 w-4" /> Edit services
                  </Button>
                )}
              </div>
              {vendor && vendor.services.length > 0 ? (
                <PanelTable head={["Service", "SAC code", "Jobs on projects", "Status"]}>
                  {vendor.services.map((s) => {
                    const jobs = assignments.filter((a) => a.service_id === s.id);
                    return (
                      <tr key={s.id} className="border-b border-line/60 last:border-0">
                        <td className="px-4 py-3 font-medium">{s.title}</td>
                        <td className="px-4 py-3 font-mono text-xs text-secondary">{s.sac_code ?? "—"}</td>
                        <td className="px-4 py-3 text-secondary">
                          {jobs.length > 0 ? (
                            <span title={jobs.map((j) => j.code).join(", ")}>
                              {jobs.length} job{jobs.length === 1 ? "" : "s"} · {formatINR(jobs.reduce((t, j) => t + j.agreed_cost, 0))}
                            </span>
                          ) : (
                            <span className="text-ink-40">None yet</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={s.is_active ? "Active" : "Inactive"} />
                        </td>
                      </tr>
                    );
                  })}
                </PanelTable>
              ) : (
                <p className="text-sm text-ink-40">
                  {vendor ? "No services yet. Add the services this vendor provides so projects can assign them." : "…"}
                </p>
              )}
            </Panel>
          </motion.div>
        )}

        {section === "bank" && (
          <motion.div variants={fadeUp}>
            <Panel>
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Bank accounts</h2>
                {vendor && canManage && (
                  <Button size="sm" variant="secondary" magnetic={false} onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4" /> Edit accounts
                  </Button>
                )}
              </div>
              {vendor && vendor.bank_accounts.length > 0 ? (
                <PanelTable head={["Bank", "Account holder", "Account number", "IFSC"]}>
                  {vendor.bank_accounts.map((a) => (
                    <tr key={a.id} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-3 font-medium">{a.bank_name}</td>
                      <td className="px-4 py-3 text-secondary">{a.account_holder}</td>
                      <td className="px-4 py-3 font-mono tabular-nums">{a.account_number}</td>
                      <td className="px-4 py-3 font-mono text-xs text-secondary">{a.ifsc_code}</td>
                    </tr>
                  ))}
                </PanelTable>
              ) : (
                <p className="text-sm text-ink-40">No bank account yet. Add one with Edit before verifying this vendor.</p>
              )}
            </Panel>
          </motion.div>
        )}

        {section === "work" && (
        <motion.div variants={fadeUp} className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              tabs={[
                { key: "jobs", label: "Jobs", badge: assignments.length || undefined },
                { key: "invoices", label: "Invoices", badge: invoices.length || undefined },
              ]}
              active={view}
              onChange={setView}
              layoutId="vendor-view"
              label="Vendor jobs and invoices"
            />
            {/* Upload invoice now sits in the page header, next to Verified. */}
            {view === "invoices" && <MonthFilter />}
          </div>

          {view === "jobs" ? (
            assignments.length > 0 ? (
              <Table head={["UPS code", "Project", "Service", "Amount", "Invoiced", "Invoice status", "Paid", "Work order"]}>
                {assignments.map((a) => (
                  <Row key={a.id} onClick={() => router.push(`/portal/projects/${a.project_id}`)}>
                    <Cell className="font-mono text-xs font-medium">{a.code}</Cell>
                    <Cell>
                      {a.project_title}
                      <span className="block font-mono text-xs text-ink-40">{a.project_code}</span>
                    </Cell>
                    <Cell className="text-secondary">{a.service_title}</Cell>
                    <Cell className="tabular-nums">{formatINR(a.agreed_cost)}</Cell>
                    <Cell className="tabular-nums text-secondary">
                      {formatINR(a.invoiced)}
                      {a.remaining > 0 && a.invoiced > 0 && <span className="block text-xs text-ink-40">{formatINR(a.remaining)} left</span>}
                    </Cell>
                    <Cell>
                      <StatusPill status={a.invoice_status} />
                    </Cell>
                    <Cell className="tabular-nums">{formatINR(a.paid)}</Cell>
                    <Cell className="font-mono text-xs text-ink-40">{workOrders.get(a.project_id) ?? "Not issued"}</Cell>
                  </Row>
                ))}
              </Table>
            ) : (
              <Empty message="No jobs yet. Assign this vendor from a project with Assign vendor; each service gets a UPS code." />
            )
          ) : invoices.length > 0 ? (
            <Table head={["Invoice", "UPS codes", "Date", "Amount", "TDS", "Net payable", "Commission", "Paid to vendor", "Status", "File"]}>
              {invoices.map((inv) => (
                <Row key={inv.id}>
                  <Cell className="font-medium">{inv.invoice_number}</Cell>
                  <Cell className="font-mono text-xs text-secondary">{inv.lines.map((l) => l.code).join(", ") || "-"}</Cell>
                  <Cell className="text-ink-40">{formatDate(inv.invoice_date)}</Cell>
                  <Cell className="tabular-nums">{formatINR(inv.invoice_amount)}</Cell>
                  <Cell className="tabular-nums text-ink-40">{formatINR(inv.tds_amount)}</Cell>
                  <Cell className="tabular-nums text-secondary">{formatINR(inv.net_payable)}</Cell>
                  <Cell className="tabular-nums text-ink-40">
                    {inv.commission_amount > 0 ? `- ${formatINR(inv.commission_amount)}` : "-"}
                    {inv.commission_rate > 0 && <span className="block text-xs">{inv.commission_rate}%</span>}
                  </Cell>
                  <Cell className="tabular-nums font-medium">{formatINR(inv.amount_payable)}</Cell>
                  <Cell>
                    <StatusPill status={inv.status} />
                  </Cell>
                  <Cell>
                    {inv.document_name ? (
                      <button
                        type="button"
                        onClick={() => api.download(`/vendors/invoices/${inv.id}/document`, inv.document_name ?? "invoice")}
                        className="inline-flex items-center gap-1 text-xs text-secondary underline hover:text-foreground"
                      >
                        <FileText className="h-3.5 w-3.5" /> View
                      </button>
                    ) : (
                      <span className="text-xs text-ink-40">-</span>
                    )}
                  </Cell>
                </Row>
              ))}
            </Table>
          ) : (
            <Empty message="No vendor invoices this month. Upload one and map it to the vendor's UPS codes." />
          )}
        </motion.div>
        )}
      </motion.div>

      {vendor && (
        <VendorInvoiceForm
          open={invOpen}
          onOpenChange={setInvOpen}
          vendor={vendor}
          onSaved={() => {
            refetchInvoices();
            refetchAssignments();
          }}
        />
      )}
      {vendor && servicesOpen && (
        <VendorServicesForm open onOpenChange={setServicesOpen} vendor={vendor} assignments={assignments} onSaved={setVendor} />
      )}
      {vendor && jobsOpen && (
        <VendorJobsDialog
          open
          onOpenChange={setJobsOpen}
          vendor={vendor}
          jobs={assignments}
          canManage={canManage}
          onChanged={() => {
            refetch();
            refetchAssignments();
          }}
        />
      )}
      {vendor && (
        <VendorEditForm open={editOpen} onOpenChange={setEditOpen} vendor={vendor} onSaved={refetch} />
      )}
    </PortalShell>
  );
}

function VendorEditForm({
  open,
  onOpenChange,
  vendor,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendor: Vendor;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/vendors/${vendor.id}`, vendorPayload(e.currentTarget));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit vendor" description="Update contact, tax and bank details.">
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <VendorFields vendor={vendor} />
        {error && <p className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** A plain table for inside a Panel: the panel is the card, so the table adds only its rows. */
function PanelTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-mist/40 text-xs tracking-eyebrow text-ink-40">
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
