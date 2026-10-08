"use client";

import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Table, Row, Cell, Empty } from "@/components/portal/ui";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import type { AuditEntry } from "@/lib/api";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { useMonth, withMonth } from "@/lib/month";

export default function AuditPage() {
  const { hasRole } = useAuth();
  const allowed = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const [month] = useMonth();
  const { data, loading, error } = useApi<AuditEntry[]>(allowed ? withMonth("/audit?limit=500", month) : null);

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Audit Trail"
          description="Append-only record of every action, for leadership oversight."
          action={<MonthFilter />}
        />

        {!allowed ? (
          <Empty message="Audit trail is restricted to leadership roles." />
        ) : data && data.length > 0 ? (
          <Table head={["When", "Actor", "Action", "Entity", "Detail"]}>
            {data.map((a) => (
              <Row key={a.id}>
                <Cell className="text-ink-40">
                  {new Date(a.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </Cell>
                <Cell className="font-medium">
                  {a.actor_name ?? "System"}
                  {a.actor_role && <span className="block text-xs text-ink-40">{a.actor_role}</span>}
                </Cell>
                <Cell>{a.action}</Cell>
                <Cell className="text-ink-40">
                  {a.entity_type}
                  {a.entity_id ? ` #${a.entity_id}` : ""}
                </Cell>
                <Cell className="max-w-xs truncate text-ink-40">{a.detail ?? "—"}</Cell>
              </Row>
            ))}
          </Table>
        ) : (
          <Empty message={loading ? "Loading…" : error ?? "No audit entries yet."} />
        )}
      </div>
    </PortalShell>
  );
}
