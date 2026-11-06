"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Table, Row, Cell, Empty, StatusPill } from "@/components/portal/ui";
import { Tabs } from "@/components/portal/Tabs";
import { StatementImport } from "@/components/portal/verification/StatementImport";
import { Workspace } from "@/components/portal/verification/Workspace";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { api, type BankStatement } from "@/lib/api";
import { formatDate } from "@/lib/utils";

/** Bank statements: import with a preview, the import history, and the reconciliation workspace. */
export default function VerificationPage() {
  const { hasRole } = useAuth();
  const canReconcile = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const { data: statements, refetch } = useApi<BankStatement[]>("/verification/statements?include_discarded=true");
  const [tab, setTab] = useState(canReconcile ? "workspace" : "import");
  const [stamp, setStamp] = useState(0);

  const tabs = [
    ...(canReconcile ? [{ key: "workspace", label: "Reconciliation" }] : []),
    { key: "import", label: "Import statement" },
    { key: "history", label: "Import history", badge: statements?.length },
  ];

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Bank verification"
          description="Import bank statements, check them before they are saved, and reconcile every line against receipts and payouts."
        />
        <Tabs tabs={tabs} active={tab} onChange={setTab} layoutId="verification-tabs" label="Bank verification sections" />

        {tab === "import" && <StatementImport onImported={() => { refetch(); setStamp((s) => s + 1); }} />}
        {tab === "workspace" && canReconcile && <Workspace key={stamp} />}
        {tab === "history" && (
          statements && statements.length ? (
            <Table head={["Uploaded", "File", "Bank", "Format", "Period", "Transactions", "Auto-matched", "Duplicates skipped", "Errors", "Status", ""]}>
              {statements.map((s) => {
                const errors = s.errors ? (JSON.parse(s.errors) as { line: number; message: string }[]) : [];
                return (
                  <Row key={s.id}>
                    <Cell className="text-ink-40">{formatDate(s.created_at)} · {s.uploaded_by ?? ""}</Cell>
                    <Cell className="max-w-xs truncate font-medium">{s.file_name}</Cell>
                    <Cell className="text-ink-40">{s.bank_name ?? "-"}</Cell>
                    <Cell className="text-xs uppercase text-ink-40">{s.source_format ?? "-"}</Cell>
                    <Cell className="text-ink-40">{s.period_start ? `${formatDate(s.period_start)} – ${formatDate(s.period_end ?? "")}` : "-"}</Cell>
                    <Cell className="tabular-nums">{s.transaction_count}</Cell>
                    <Cell className="tabular-nums">{s.matched_count}</Cell>
                    <Cell className="tabular-nums">{s.skipped_duplicates ?? 0}</Cell>
                    <Cell className="max-w-xs whitespace-normal text-xs text-danger">
                      {errors.length ? (
                        <details>
                          <summary className="cursor-pointer">{errors.length} row(s)</summary>
                          {errors.slice(0, 20).map((e) => <p key={e.line}>Line {e.line}: {e.message}</p>)}
                        </details>
                      ) : ""}
                    </Cell>
                    <Cell><StatusPill status={s.import_status ?? "Imported"} /></Cell>
                    <Cell>
                      <button aria-label="Download original" onClick={() => api.download(`/verification/statements/${s.id}/download`, s.file_name)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-40 hover:bg-mist hover:text-foreground">
                        <Download className="h-4 w-4" />
                      </button>
                    </Cell>
                  </Row>
                );
              })}
            </Table>
          ) : (
            <Empty message="No statements uploaded yet." />
          )
        )}
      </div>
    </PortalShell>
  );
}
