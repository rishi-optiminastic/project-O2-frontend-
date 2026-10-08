"use client";

import { useState } from "react";
import { Plus, Mail, Check } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Table, Row, Cell, Empty, Field, inputClass, StatusPill } from "@/components/portal/ui";
import { Modal } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { api, ApiError, type VendorReport, type Client } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { useMonth, withMonth } from "@/lib/month";

export default function ReportsPage() {
  const [month] = useMonth();
  const { data, loading, refetch } = useApi<VendorReport[]>(withMonth("/reports", month));
  const { data: clients } = useApi<Client[]>("/clients");
  const { hasRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");

  async function action(id: number, kind: "review" | "email") {
    setBusy(id);
    setError(null);
    try {
      if (kind === "review") await api.post(`/reports/${id}/review?approve=true`);
      else await api.post(`/reports/${id}/email`, {});
      refetch();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Reports"
          description="Receive vendor reports, review internally, and deliver to clients."
          action={
            <div className="flex flex-wrap items-center gap-3">
              <MonthFilter />
              <Button size="sm" magnetic={false} onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Upload report
              </Button>
            </div>
          }
        />

        {error && <p className="text-sm text-foreground/80">⚠ {error}</p>}

        {data && data.length > 0 ? (
          <Table head={["Project", "Period", "Type", "Status", ""]}>
            {data.map((r) => (
              <Row key={r.id}>
                <Cell className="font-medium">{r.project_name}</Cell>
                <Cell className="text-ink-40">{r.reporting_period ?? "—"}</Cell>
                <Cell>{r.report_type ?? "—"}</Cell>
                <Cell>
                  <StatusPill status={r.review_status} />
                </Cell>
                <Cell>
                  {canManage && (
                    <div className="flex items-center gap-3">
                      {r.review_status === "Submitted" || r.review_status === "Under Review" ? (
                        <button onClick={() => action(r.id, "review")} disabled={busy === r.id} className="inline-flex items-center gap-1 text-xs text-secondary hover:text-foreground">
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                      ) : null}
                      {(r.review_status === "Approved" || r.review_status === "Sent to Client") && (
                        <button onClick={() => action(r.id, "email")} disabled={busy === r.id} className="inline-flex items-center gap-1 text-xs text-secondary hover:text-foreground">
                          <Mail className="h-3.5 w-3.5" /> Email client
                        </button>
                      )}
                    </div>
                  )}
                </Cell>
              </Row>
            ))}
          </Table>
        ) : (
          <Empty message={loading ? "Loading reports…" : "No reports yet."} />
        )}
      </div>

      <ReportForm open={open} onOpenChange={setOpen} clients={clients ?? []} onSaved={refetch} />
    </PortalShell>
  );
}

function ReportForm({ open, onOpenChange, clients, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; clients: Client[]; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/reports", {
        project_name: fd.get("project_name"),
        reporting_period: fd.get("reporting_period"),
        report_type: fd.get("report_type"),
        client_id:
          fd.get("client_id") && fd.get("client_id") !== "none" ? Number(fd.get("client_id")) : null,
        uploaded_file: fd.get("uploaded_file") || null,
        remarks: fd.get("remarks"),
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Upload vendor report" description="Record a report received from a vendor.">
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Project name">
          <input name="project_name" required className={inputClass} />
        </Field>
        <Field label="Reporting period">
          <input name="reporting_period" placeholder="Q3 2026" className={inputClass} />
        </Field>
        <Field label="Report type">
          <input name="report_type" placeholder="Research / Performance" className={inputClass} />
        </Field>
        <Field label="Client (for delivery)">
          <Select
            name="client_id"
            defaultValue="none"
            options={[
              { value: "none", label: "— None —" },
              ...clients.map((c) => ({ value: String(c.id), label: c.business_name })),
            ]}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="File reference / link">
            <input name="uploaded_file" className={inputClass} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Remarks">
            <input name="remarks" className={inputClass} />
          </Field>
        </div>
        {error && <p className="sm:col-span-2 text-sm text-foreground/80">⚠ {error}</p>}
        <div className="sm:col-span-2 flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" magnetic={false} disabled={saving}>{saving ? "Saving…" : "Save report"}</Button>
        </div>
      </form>
    </Modal>
  );
}
