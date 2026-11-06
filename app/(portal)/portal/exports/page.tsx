"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Panel, Field, inputClass, Table, Row, Cell, Empty } from "@/components/portal/ui";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { api, ApiError, type Client, type Project, type Vendor } from "@/lib/api";
import { GST_STATUSES, VENDOR_BILL_STATUSES, type ExportLogRow, type ExportReportDef } from "@/lib/finance";
import { formatDate } from "@/lib/utils";

const ANY = "any";
const INVOICE_STATUSES = ["Draft", "Sent", "Pending", "Partially Paid", "Fully Paid", "Overdue", "Cancelled", "Disputed", "Reconciled"];
const APPROVAL_STATUSES = ["Draft", "Submitted for CFO Approval", "CFO Rejected", "Submitted for CEO Approval", "CEO Rejected",
  "Payment Ready", "Payment Released", "Payment Verified"];
const PAYMENT_STATUSES = ["Unreconciled", "Matched", "Reconciled"];

/** Centralised reports: pick one, set filters, download CSV, Excel or PDF. Every download is logged. */
export default function ExportsPage() {
  const { hasRole } = useAuth();
  const { data: catalogue } = useApi<ExportReportDef[]>("/exports");
  const { data: clients } = useApi<Client[]>("/clients");
  const { data: vendors } = useApi<Vendor[]>("/vendors");
  const { data: projects } = useApi<Project[]>("/projects");
  const canSeeLog = hasRole("ADMIN_CEO", "CFO");
  const { data: logs, refetch: refetchLogs } = useApi<ExportLogRow[]>(canSeeLog ? "/exports/logs?limit=50" : null);
  const [key, setKey] = useState<string>();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const report = catalogue?.find((r) => r.key === (key ?? catalogue[0]?.key));
  const groups = Array.from(new Set((catalogue ?? []).map((r) => r.group)));

  function set(name: string, value: string) {
    setFilters((f) => ({ ...f, [name]: value }));
  }

  async function download(format: "csv" | "xlsx" | "pdf") {
    if (!report) return;
    const q = new URLSearchParams({ format });
    for (const name of report.filters) {
      const v = filters[name];
      if (v && v !== ANY) q.set(name, v);
    }
    setBusy(format);
    setError(null);
    try {
      await api.download(`/exports/${report.key}?${q}`, `${report.key}.${format}`);
      refetchLogs();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  const choose = (name: string, label: string, options: { value: string; label: string }[]) => (
    <Field key={name} label={label}>
      <Select value={filters[name] ?? ANY} onValueChange={(v) => set(name, v)} options={[{ value: ANY, label: "Any" }, ...options]} />
    </Field>
  );
  const filterInputs: Record<string, React.ReactNode> = {
    date_from: <Field key="date_from" label="From"><input type="date" value={filters.date_from ?? ""} onChange={(e) => set("date_from", e.target.value)} className={inputClass} /></Field>,
    date_to: <Field key="date_to" label="To"><input type="date" value={filters.date_to ?? ""} onChange={(e) => set("date_to", e.target.value)} className={inputClass} /></Field>,
    client_id: choose("client_id", "Client", (clients ?? []).map((c) => ({ value: String(c.id), label: c.business_name }))),
    vendor_id: choose("vendor_id", "Vendor", (vendors ?? []).map((v) => ({ value: String(v.id), label: v.business_name }))),
    project_id: choose("project_id", "Project", (projects ?? []).map((p) => ({ value: String(p.id), label: `${p.code} · ${p.title}` }))),
    invoice_status: choose("invoice_status", "Invoice status",
      (report?.group === "Vendor invoices" ? [...VENDOR_BILL_STATUSES] : INVOICE_STATUSES).map((s) => ({ value: s, label: s }))),
    payment_status: choose("payment_status", "Payment status", PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))),
    approval_status: choose("approval_status", "Approval status", APPROVAL_STATUSES.map((s) => ({ value: s, label: s }))),
    gst_status: choose("gst_status", "GST status", GST_STATUSES.map((s) => ({ value: s, label: s }))),
  };

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading title="Reports and exports" description="Financial registers and reports as CSV, Excel or PDF. What you can download depends on your role, and every download is logged." />

        {catalogue && catalogue.length === 0 && <Empty message="Your role has no reports to download." />}
        {report && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Panel className="flex flex-col gap-4">
              {groups.map((g) => (
                <div key={g}>
                  <p className="mb-2 text-xs tracking-eyebrow text-secondary">{g}</p>
                  <div className="flex flex-col gap-1">
                    {catalogue!.filter((r) => r.group === g).map((r) => (
                      <button key={r.key} onClick={() => { setKey(r.key); setFilters({}); }}
                        className={"rounded-xl px-3 py-2 text-left text-sm transition-colors " + (r.key === report.key ? "bg-foreground text-white" : "hover:bg-mist")}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </Panel>
            <Panel className="flex flex-col gap-5 lg:col-span-2">
              <div>
                <h2 className="text-lg font-medium">{report.label}</h2>
                <p className="mt-1 text-xs text-ink-40">Columns: {report.columns.join(", ")}</p>
              </div>
              {report.filters.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{report.filters.map((f) => filterInputs[f])}</div>
              ) : (
                <p className="text-sm text-secondary">This report has no filters.</p>
              )}
              {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
              <div className="flex flex-wrap gap-2">
                {(["csv", "xlsx", "pdf"] as const).map((f) => (
                  <Button key={f} size="sm" variant={f === "xlsx" ? "primary" : "secondary"} magnetic={false} disabled={busy !== null} onClick={() => download(f)}>
                    <Download className="h-4 w-4" /> {busy === f ? "Preparing…" : f === "xlsx" ? "Excel" : f.toUpperCase()}
                  </Button>
                ))}
              </div>
            </Panel>
          </div>
        )}

        {canSeeLog && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Export log</h2>
            {logs && logs.length ? (
              <Table head={["When", "Who", "Report", "Format", "Rows", "Filters"]}>
                {logs.map((l) => (
                  <Row key={l.id}>
                    <Cell className="text-ink-40">{formatDate(l.created_at)}</Cell>
                    <Cell>{l.user_name}</Cell>
                    <Cell>{catalogue?.find((r) => r.key === l.report)?.label ?? l.report}</Cell>
                    <Cell className="uppercase">{l.format}</Cell>
                    <Cell className="tabular-nums">{l.row_count}</Cell>
                    <Cell className="max-w-xs truncate font-mono text-[11px] text-ink-40">{l.filters}</Cell>
                  </Row>
                ))}
              </Table>
            ) : (
              <Empty message="No exports yet." />
            )}
          </section>
        )}
      </div>
    </PortalShell>
  );
}
