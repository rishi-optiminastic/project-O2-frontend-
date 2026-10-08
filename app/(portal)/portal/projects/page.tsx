"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Plus } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Table, Row, Cell, Empty, StatusPill } from "@/components/portal/ui";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { ProjectForm } from "@/components/portal/projects/ProjectForm";
import { BudgetBar } from "@/components/portal/projects/BudgetBar";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useMonth, withMonth } from "@/lib/month";
import { formatDate } from "@/lib/utils";
import type { Project } from "@/lib/api";

export default function ProjectsPage() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const [month] = useMonth();
  const { data, loading } = useApi<Project[]>(withMonth("/projects", month));
  const [formOpen, setFormOpen] = useState(false);
  const canManage = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");

  const newButton = canManage && (
    <Button size="sm" magnetic={false} onClick={() => setFormOpen(true)}>
      <Plus className="h-4 w-4" /> New project
    </Button>
  );

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Projects"
          description="Client work, its budget, and the vendors delivering it. Shows projects running in the chosen month."
          action={
            <div className="flex flex-wrap items-center gap-3">
              <MonthFilter />
              {newButton}
            </div>
          }
        />

        {data && data.length > 0 ? (
          <Table head={["Project", "Client", "Vendors", "Budget used", "Dates", "Status"]}>
            {data.map((p) => (
              <Row key={p.id} onClick={() => router.push(`/portal/projects/${p.id}`)}>
                <Cell className="font-medium">
                  {p.title}
                  <span className="block font-mono text-xs text-ink-40">
                    {p.code}
                    {p.brand && <span className="font-sans"> · {p.brand}</span>}
                  </span>
                </Cell>
                <Cell className="text-ink-40">{p.client_name ?? "-"}</Cell>
                <Cell className="text-ink-40">
                  {p.vendors.length ? p.vendors.map((v) => v.vendor_name).join(", ") : "-"}
                </Cell>
                <Cell className="min-w-[180px]">
                  <BudgetBar committed={p.committed_cost} budget={p.budget} />
                </Cell>
                <Cell className="text-ink-40">
                  {p.start_date ? formatDate(p.start_date) : "-"} to {p.end_date ? formatDate(p.end_date) : "-"}
                  <span className="block text-xs">Report due {p.expected_report_date ? formatDate(p.expected_report_date) : "-"}</span>
                </Cell>
                <Cell>
                  <StatusPill status={p.status} />
                </Cell>
              </Row>
            ))}
          </Table>
        ) : (
          <Empty
            message={loading ? "Loading projects…" : "No projects running in this month."}
            icon={<FolderKanban className="h-5 w-5" strokeWidth={1.6} />}
            action={loading ? undefined : newButton || undefined}
          />
        )}
      </div>

      {formOpen && (
        <ProjectForm open={formOpen} onOpenChange={setFormOpen} onSaved={(p) => router.push(`/portal/projects/${p.id}`)} />
      )}
    </PortalShell>
  );
}
