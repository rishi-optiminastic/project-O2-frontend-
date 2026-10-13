"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Mail, Phone, Package, BadgeCheck, Plus, Pencil } from "lucide-react";
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
  Field,
  inputClass,
} from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { VendorFields, vendorPayload } from "@/components/portal/vendors/VendorFields";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { fadeUp, stagger } from "@/lib/motion";
import { formatINR, formatDate } from "@/lib/utils";
import { api, ApiError, type Vendor, type VendorInvoice, type Project, TDS_SECTIONS } from "@/lib/api";
import { FIELD_RULES, GST_RATE_OPTIONS, NUMBER_RULES, indiaToday, pastDateRule } from "@/lib/validation";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { useMonth, withMonth } from "@/lib/month";

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasRole } = useAuth();
  const vid = Number(id);

  const { data: vendor, loading, refetch } = useApi<Vendor>(id ? `/vendors/${id}` : null);
  const [month] = useMonth();
  const { data: allInvoices, refetch: refetchInvoices } = useApi<VendorInvoice[]>(withMonth("/vendors/invoices/all", month));
  const { data: allProjects } = useApi<Project[]>("/projects");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [invOpen, setInvOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const canManage = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const canAddInvoice = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER", "FINANCE_EXECUTIVE");
  const invoices = (allInvoices ?? []).filter((i) => i.vendor_id === vid);
  // This vendor's share of each project it works on.
  const projects = (allProjects ?? []).flatMap((p) =>
    p.vendors.filter((v) => v.vendor_id === vid).map((share) => ({ project: p, share })),
  );

  const payable = invoices.reduce((s, i) => s + i.net_payable, 0);
  const tds = invoices.reduce((s, i) => s + i.tds_amount, 0);
  const contracted = projects.reduce((s, { share }) => s + share.agreed_cost, 0);

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
          <div className="flex items-center gap-3">
            <StatusPill status={vendor?.is_verified ? "Verified" : vendor?.approval_status ?? "Pending"} />
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

        {/* KPIs */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Net payable" value={formatINR(payable)} sub={`${invoices.length} invoices`} spark={invoices.map((i) => i.net_payable).slice(-9)} />
          <MetricCard label="TDS deducted" value={formatINR(tds)} sub="Withheld at source" spark={invoices.map((i) => i.tds_amount).slice(-9)} />
          <MetricCard label="Contracted" value={formatINR(contracted)} sub={`${projects.length} project${projects.length === 1 ? "" : "s"}`} spark={projects.map(({ share }) => share.agreed_cost).slice(-9)} />
          <MetricCard label="Onboarding" value={vendor?.is_verified ? "Verified" : "Pending"} sub={vendor ? formatDate(vendor.created_at) : ""} spark={[3, 5, 4, 6, 5, 7, 6, 8, vendor?.is_verified ? 10 : 5]} />
        </motion.div>

        {/* Tax + bank + compliance */}
        <motion.div variants={fadeUp}>
          <Panel>
            <h2 className="mb-5 text-sm font-medium tracking-eyebrow text-secondary">Tax &amp; registration</h2>
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
              <DataField label="GST number" value={vendor?.gst_number} mono />
              <DataField label="PAN" value={vendor?.pan} mono />
              <DataField label="MSME (Udyam)" value={vendor?.msme_number ?? (vendor ? "Not registered" : null)} mono={!!vendor?.msme_number} />
              <DataField label="COI" value={vendor?.coi} mono />
            </div>
          </Panel>
        </motion.div>

        {/* Bank accounts */}
        <motion.div variants={fadeUp} className="flex flex-col gap-4">
          <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Bank accounts</h2>
          {vendor && vendor.bank_accounts.length > 0 ? (
            <Table head={["Bank", "Account holder", "Account number", "IFSC"]}>
              {vendor.bank_accounts.map((a) => (
                <Row key={a.id}>
                  <Cell className="font-medium">{a.bank_name}</Cell>
                  <Cell className="text-ink-40">{a.account_holder}</Cell>
                  <Cell className="font-mono tabular-nums">{a.account_number}</Cell>
                  <Cell className="font-mono text-ink-40">{a.ifsc_code}</Cell>
                </Row>
              ))}
            </Table>
          ) : (
            <Empty message="No bank account yet. Add one with Edit before verifying this vendor." />
          )}
        </motion.div>

        {/* Projects */}
        <motion.div variants={fadeUp} className="flex flex-col gap-4">
          <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Projects</h2>
          {projects.length > 0 ? (
            <Table head={["Project", "% of work", "Agreed cost", "Work order", "Status"]}>
              {projects.map(({ project, share }) => (
                <Row key={project.id} onClick={() => router.push(`/portal/projects/${project.id}`)}>
                  <Cell className="font-medium">
                    {project.title}
                    <span className="block font-mono text-xs text-ink-40">{project.code}</span>
                  </Cell>
                  <Cell className="tabular-nums">{share.work_percent}%</Cell>
                  <Cell className="tabular-nums">{formatINR(share.agreed_cost)}</Cell>
                  <Cell className="font-mono text-xs text-ink-40">{share.work_order_number ?? "Not issued"}</Cell>
                  <Cell>
                    <StatusPill status={project.status} />
                  </Cell>
                </Row>
              ))}
            </Table>
          ) : (
            <Empty message="Not on any project yet. Add this vendor from the Projects page." />
          )}
        </motion.div>

        {/* Vendor invoices */}
        <motion.div variants={fadeUp} className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Vendor invoices</h2>
              <MonthFilter />
            </div>
            {canAddInvoice && (
              <Button size="sm" variant="secondary" magnetic={false} onClick={() => setInvOpen(true)}>
                <Plus className="h-4 w-4" /> New invoice
              </Button>
            )}
          </div>
          {invoices.length > 0 ? (
            <Table head={["Invoice", "Date", "Amount", "TDS", "Net payable", "Status"]}>
              {invoices.map((inv) => (
                <Row key={inv.id}>
                  <Cell className="font-medium">{inv.invoice_number}</Cell>
                  <Cell className="text-ink-40">{formatDate(inv.invoice_date)}</Cell>
                  <Cell className="tabular-nums">{formatINR(inv.invoice_amount)}</Cell>
                  <Cell className="tabular-nums text-ink-40">{formatINR(inv.tds_amount)}</Cell>
                  <Cell className="tabular-nums">{formatINR(inv.net_payable)}</Cell>
                  <Cell>
                    <StatusPill status={inv.status} />
                  </Cell>
                </Row>
              ))}
            </Table>
          ) : (
            <Empty message="No vendor invoices yet." />
          )}
        </motion.div>
      </motion.div>

      <VendorInvoiceForm
        open={invOpen}
        onOpenChange={setInvOpen}
        vendorId={vid}
        vendorGstin={vendor?.gst_number}
        projects={projects.map(({ project }) => project)}
        onSaved={refetchInvoices}
      />
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

function VendorInvoiceForm({
  open,
  onOpenChange,
  vendorId,
  vendorGstin,
  projects,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendorId: number;
  vendorGstin: string | null | undefined;
  projects: Project[];
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState(0);
  const [gstRate, setGstRate] = useState("18");
  const [interstate, setInterstate] = useState(false);
  const [section, setSection] = useState<string>(TDS_SECTIONS[0].key);

  // Same arithmetic as the server, so the preview matches what gets saved.
  const tdsRate = TDS_SECTIONS.find((t) => t.key === section)?.rate ?? 0;
  const gst = +((amount * Number(gstRate)) / 100).toFixed(2);
  const tds = +((amount * tdsRate) / 100).toFixed(2);
  const net = +(amount + gst - tds).toFixed(2);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/vendors/invoices", {
        vendor_id: vendorId,
        project_id: fd.get("project_id") && fd.get("project_id") !== "none" ? Number(fd.get("project_id")) : null,
        invoice_number: fd.get("invoice_number"),
        invoice_date: fd.get("invoice_date"),
        invoice_amount: amount,
        gst_rate: Number(gstRate),
        is_interstate: interstate,
        tds_section: section,
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Record vendor invoice" description="GST is worked out from the rate; TDS from the section. Net payable = amount + GST - TDS.">
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Invoice number">
          <input name="invoice_number" required {...FIELD_RULES.invoiceNumber} className={inputClass} />
        </Field>
        <Field label="Invoice date">
          <input name="invoice_date" {...pastDateRule()} required defaultValue={indiaToday()} className={inputClass} />
        </Field>
        <Field label="Project (optional)">
          <Select
            name="project_id"
            defaultValue="none"
            options={[{ value: "none", label: "— None —" }, ...projects.map((p) => ({ value: String(p.id), label: `${p.code} ${p.title}` }))]}
          />
        </Field>
        <Field label="Amount before GST (₹)">
          <input name="invoice_amount" {...NUMBER_RULES.positiveMoney} required value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={inputClass} />
        </Field>
        <Field label="GST rate">
          <Select value={gstRate} onValueChange={setGstRate} options={GST_RATE_OPTIONS} />
        </Field>
        <Field label="TDS section">
          <Select value={section} onValueChange={setSection} options={TDS_SECTIONS.map((t) => ({ value: t.key, label: `${t.label} (${t.rate}%)` }))} />
        </Field>
        <label className="flex items-center gap-2 text-sm font-light text-secondary sm:col-span-2">
          <input type="checkbox" checked={interstate} onChange={(e) => setInterstate(e.target.checked)} className="accent-foreground" />
          Vendor is in another state (IGST instead of CGST + SGST)
        </label>
        {!vendorGstin && gst > 0 && (
          <p className="text-xs text-warning sm:col-span-2">
            ⚠ This vendor has no GSTIN on record, so the GST on this bill cannot be claimed as input credit. Add their GSTIN on the vendor first if they have one.
          </p>
        )}

        <div className="sm:col-span-2 grid grid-cols-1 gap-3 rounded-2xl border border-line bg-mist/50 p-4 text-center text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-ink-40">TDS</p>
            <p className="mt-1 font-medium tabular-nums">{formatINR(tds)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-40">{interstate ? "IGST" : "CGST + SGST"}</p>
            <p className="mt-1 font-medium tabular-nums">{formatINR(gst)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-40">Net payable</p>
            <p className="mt-1 font-medium tabular-nums">{formatINR(net)}</p>
          </div>
        </div>

        {error && <p className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
        <div className="sm:col-span-2 flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" magnetic={false} disabled={saving}>{saving ? "Saving…" : "Save invoice"}</Button>
        </div>
      </form>
    </Modal>
  );
}
