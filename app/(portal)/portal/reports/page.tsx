"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Table, Row, Cell, Empty, StatusPill } from "@/components/portal/ui";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import type { VendorReport } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { useMonth, withMonth } from "@/lib/month";
import { NewReportModal, ReportDetailModal } from "@/components/portal/reports/ReportDetail";

const STATUSES = ["Pending Submission", "Submitted", "Under Review", "Approved", "Rejected", "Resubmitted", "Sent to Client"];

/** Vendor reports on projects: expected, submitted with files, reviewed, resubmitted, emailed to the client. */
export default function ReportsPage() {
  const [month] = useMonth();
  const [status, setStatus] = useState<string>("all");
  const path = withMonth(`/reports${status === "all" ? "" : `?status=${encodeURIComponent(status)}`}`, month);
  const { data, loading, error, refetch } = useApi<VendorReport[]>(path);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Vendor reports"
          description="Reports vendors owe on projects. Submit their files, review, approve or reject, and send approved reports to the client."
          action={
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-48">
                <Select value={status} onValueChange={setStatus}
                  options={[{ value: "all", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: s }))]} />
              </div>
              <MonthFilter />
              <Button size="sm" magnetic={false} onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> Expect a report
              </Button>
            </div>
          }
        />

        {error ? (
          <Empty message={`Could not load reports: ${error}`} />
        ) : data && data.length > 0 ? (
          <Table head={["Project", "Type", "Period", "Version", "Due", "Submitted", "Status"]}>
            {data.map((r) => (
              <Row key={r.id} onClick={() => setOpenId(r.id)}>
                <Cell className="font-medium">{r.project_name}</Cell>
                <Cell className="text-ink-40">{r.report_type ?? "-"}</Cell>
                <Cell className="text-ink-40">{r.reporting_period ?? "-"}</Cell>
                <Cell className="tabular-nums">{r.version ?? 0}</Cell>
                <Cell className="text-ink-40">{r.due_date ? formatDate(r.due_date) : "-"}</Cell>
                <Cell className="text-ink-40">{r.submission_date ? formatDate(r.submission_date) : "-"}</Cell>
                <Cell><StatusPill status={r.review_status} /></Cell>
              </Row>
            ))}
          </Table>
        ) : (
          <Empty message={loading ? "Loading reports…" : "No vendor reports yet. Record one that a vendor owes on a project."} />
        )}
      </div>

      {creating && <NewReportModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); refetch(); setOpenId(id); }} />}
      {openId !== null && <ReportDetailModal reportId={openId} onClose={() => setOpenId(null)} onChanged={refetch} />}
    </PortalShell>
  );
}

