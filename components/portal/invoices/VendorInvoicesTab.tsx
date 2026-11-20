"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X, Truck } from "lucide-react";
import { Table, Row, Cell, Empty, MetricCard, inputClass, StatusPill } from "@/components/portal/ui";
import { Select } from "@/components/portal/Select";
import { VendorInvoiceForm } from "@/components/portal/vendors/VendorInvoiceForm";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { formatINR, formatDate } from "@/lib/utils";
import { taxSplit } from "@/lib/invoice";
import type { Approval, Project, Vendor, VendorInvoice } from "@/lib/api";
import { useMonth, withMonth } from "@/lib/month";
import { PORTAL_EVENTS, usePortalEvent } from "@/lib/events";

/** Vendor Invoice > Overview: every vendor bill for the month, with search, filters and recording a new one. */
export function VendorInvoicesTab() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const canAdd = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER", "FINANCE_EXECUTIVE");
  const [month] = useMonth();
  const { data, loading, refetch } = useApi<VendorInvoice[]>(withMonth("/vendors/invoices/all", month));
  usePortalEvent(PORTAL_EVENTS.vendorInvoiceRecorded, refetch);
  const { data: vendors } = useApi<Vendor[]>("/vendors");
  const { data: projects } = useApi<Project[]>("/projects");
  const [createOpen, setCreateOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [vendorId, setVendorId] = useState("all");
  const [status, setStatus] = useState("all");

  const vendorName = (id: number) => vendors?.find((v) => v.id === id)?.business_name ?? `Vendor #${id}`;
  const projectLabel = (id: number | null) => {
    const p = id == null ? null : projects?.find((x) => x.id === id);
    return p ? `${p.code} ${p.title}` : "-";
  };
  const statuses = useMemo(() => [...new Set((data ?? []).map((i) => i.status))].sort(), [data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(
      (i) =>
        (vendorId === "all" || String(i.vendor_id) === vendorId) &&
        (status === "all" || i.status === status) &&
        (!q || i.invoice_number.toLowerCase().includes(q) || String(i.invoice_amount).includes(q) || vendorName(i.vendor_id).toLowerCase().includes(q) || i.lines.some((l) => l.code.toLowerCase().includes(q))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search, vendorId, status, vendors]);

  const hasFilters = search.trim() !== "" || vendorId !== "all" || status !== "all";
  const total = (key: "invoice_amount" | "gst_amount" | "tds_amount" | "amount_payable") => rows.reduce((s, i) => s + i[key], 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Bill amount plus GST, with the split underneath (the GST is input credit). */}
        <MetricCard
          label="Total invoice value"
          tone="info"
          value={loading ? "—" : formatINR(total("invoice_amount") + total("gst_amount"))}
          sub={`${taxSplit(total("invoice_amount"), total("gst_amount"))} · ${rows.length} bill${rows.length === 1 ? "" : "s"}`}
        />
        <MetricCard label="TDS to deduct" tone="warning" value={loading ? "—" : formatINR(total("tds_amount"))} sub="Deposited from Taxation" />
        <MetricCard label="Paid to vendors" tone="success" value={loading ? "—" : formatINR(total("amount_payable"))} sub="Net payable less Optiminastic commission" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by vendor, invoice number, UPS code or amount…"
              className={inputClass + " pl-10"}
            />
          </div>
          {canAdd && (
            <Button size="sm" magnetic={false} onClick={() => setCreateOpen(true)} className="sm:shrink-0">
              <Plus className="h-4 w-4" /> New vendor invoice
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={vendorId}
            onValueChange={setVendorId}
            className="min-w-[150px] flex-1 sm:w-48 sm:flex-none"
            options={[{ value: "all", label: "All vendors" }, ...(vendors ?? []).map((v) => ({ value: String(v.id), label: v.business_name }))]}
          />
          <Select
            value={status}
            onValueChange={setStatus}
            className="min-w-[140px] flex-1 sm:w-44 sm:flex-none"
            options={[{ value: "all", label: "All statuses" }, ...statuses.map((s) => ({ value: s, label: s }))]}
          />
          {hasFilters && (
            <button
              onClick={() => {
                setSearch("");
                setVendorId("all");
                setStatus("all");
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-secondary transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {loading && !data ? (
        <Empty message="Loading vendor invoices…" />
      ) : rows.length > 0 ? (
        <Table head={["Invoice", "Vendor", "Project", "UPS codes", "Date", "Amount", "GST", "TDS", "Commission", "Paid to vendor", "Status"]}>
          {rows.map((i) => (
            <Row key={i.id} onClick={() => router.push(`/portal/vendors/${i.vendor_id}`)}>
              <Cell className="font-medium">{i.invoice_number}</Cell>
              <Cell>{vendorName(i.vendor_id)}</Cell>
              <Cell className="text-secondary">{projectLabel(i.project_id)}</Cell>
              <Cell className="font-mono text-xs text-secondary">{i.lines.map((l) => l.code).join(", ") || "-"}</Cell>
              <Cell className="text-ink-40">{formatDate(i.invoice_date)}</Cell>
              <Cell className="tabular-nums">{formatINR(i.invoice_amount)}</Cell>
              <Cell className="tabular-nums text-ink-40">{formatINR(i.gst_amount)}</Cell>
              <Cell className="tabular-nums text-ink-40">{formatINR(i.tds_amount)}</Cell>
              <Cell className="tabular-nums text-ink-40">{i.commission_amount > 0 ? `- ${formatINR(i.commission_amount)}` : "-"}</Cell>
              <Cell className="tabular-nums font-medium">{formatINR(i.amount_payable)}</Cell>
              <Cell>
                <StatusPill status={i.status} />
              </Cell>
            </Row>
          ))}
        </Table>
      ) : (
        <Empty
          icon={<Truck className="h-5 w-5" />}
          message={hasFilters ? "No vendor invoices match these filters." : "No vendor invoices this month."}
          action={
            canAdd && !hasFilters ? (
              <Button size="sm" magnetic={false} onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> New vendor invoice
              </Button>
            ) : undefined
          }
        />
      )}

      <VendorInvoiceForm open={createOpen} onOpenChange={setCreateOpen} vendors={vendors ?? []} onSaved={refetch} />
    </div>
  );
}

/** Payout statuses (ApprovalStatus in the backend) once the money has gone out, or the request was turned down. */
const PAID = ["Payment Released", "Payment Verified"];
const REJECTED = ["CFO Rejected", "CEO Rejected"];

/** Vendor Invoice > Receipts: money paid out to vendors (payouts after CFO and CEO approval). */
export function VendorPaymentsTab() {
  const router = useRouter();
  const [month] = useMonth();
  const { data: payouts, loading } = useApi<Approval[]>(withMonth("/approvals", month));
  const { data: invoices } = useApi<VendorInvoice[]>("/vendors/invoices/all");

  const invoiceNumber = (id: number | null | undefined) => (id == null ? null : invoices?.find((i) => i.id === id)?.invoice_number ?? null);
  const list = payouts ?? [];
  const released = list.filter((p) => PAID.includes(p.status));
  const inProgress = list.filter((p) => !PAID.includes(p.status) && !REJECTED.includes(p.status));
  const sum = (ps: Approval[]) => ps.reduce((s, p) => s + p.net_payable, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Paid to vendors" tone="success" value={loading ? "—" : formatINR(sum(released))} sub={`${released.length} payment${released.length === 1 ? "" : "s"} released`} />
        <MetricCard label="Awaiting approval" tone={inProgress.length ? "warning" : "success"} value={loading ? "—" : formatINR(sum(inProgress))} sub={`${inProgress.length} in CFO / CEO approval`} />
        <MetricCard label="TDS withheld" tone="info" value={loading ? "—" : formatINR(released.reduce((s, p) => s + p.tax_deductions, 0))} sub="On released payments" />
        <MetricCard label="Payouts this month" tone="info" value={loading ? "—" : String(list.length)} sub="Every status" />
      </div>

      <div>
        <h2 className="mb-4 text-lg font-light tracking-tight">Payments to vendors</h2>
        {list.length > 0 ? (
          <Table head={["Requested", "Payee", "Vendor invoice", "Amount", "TDS", "Net paid", "Status", "Released", "Reference"]}>
            {list.map((p) => (
              <Row key={p.id} onClick={() => router.push("/portal/approvals")}>
                <Cell className="text-ink-40">{formatDate(p.created_at)}</Cell>
                <Cell className="font-medium">{p.payee_name}</Cell>
                <Cell className="text-secondary">{invoiceNumber(p.vendor_invoice_id) ?? "-"}</Cell>
                <Cell className="tabular-nums">{formatINR(p.amount)}</Cell>
                <Cell className="tabular-nums text-ink-40">{formatINR(p.tax_deductions)}</Cell>
                <Cell className="tabular-nums">{formatINR(p.net_payable)}</Cell>
                <Cell>
                  <StatusPill status={p.status} />
                </Cell>
                <Cell className="text-ink-40">{p.released_at ? formatDate(p.released_at) : "-"}</Cell>
                <Cell className="text-ink-40">{p.payment_reference || "-"}</Cell>
              </Row>
            ))}
          </Table>
        ) : (
          <Empty message={loading ? "Loading payments…" : "No payments to vendors this month. Use Record > Outward payment to raise one."} />
        )}
      </div>
    </div>
  );
}
