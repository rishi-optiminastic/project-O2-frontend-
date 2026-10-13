"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Table, Row, Cell, Empty, Field, inputClass, StatusPill } from "@/components/portal/ui";
import { Modal } from "@/components/portal/Modal";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type Agent } from "@/lib/api";
import { FIELD_RULES, NAME_MAX, NUMBER_RULES, TEXT_MAX } from "@/lib/validation";

export default function AgentsPage() {
  const { data, loading, refetch } = useApi<Agent[]>("/agents");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Agents"
          description="Referral partners who introduce clients and earn a commission on their invoicing."
          action={
            <Button size="sm" magnetic={false} onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New agent
            </Button>
          }
        />

        {data && data.length > 0 ? (
          <Table head={["Agent", "Phone", "Commission", "Status"]}>
            {data.map((a) => (
              <Row key={a.id} onClick={() => router.push(`/portal/agents/${a.id}`)}>
                <Cell className="font-medium">
                  {a.business_name}
                  <span className="block text-xs text-ink-40">{a.email}</span>
                </Cell>
                <Cell className="text-ink-40">{a.phone ?? "-"}</Cell>
                <Cell className="tabular-nums">{a.is_house ? "In-house · 0%" : `${a.commission_rate}%`}</Cell>
                <Cell>
                  <StatusPill status={a.is_active ? "Active" : "Inactive"} />
                </Cell>
              </Row>
            ))}
          </Table>
        ) : (
          <Empty message={loading ? "Loading agents…" : "No agents yet. Add your first."} />
        )}
      </div>

      <AgentForm open={open} onOpenChange={setOpen} onSaved={refetch} />
    </PortalShell>
  );
}

function AgentForm({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd);
    try {
      await api.post("/agents", {
        ...body,
        commission_rate: Number(fd.get("commission_rate") || 0),
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
    <Modal open={open} onOpenChange={onOpenChange} title="Onboard an agent" description="Name, contact details and commission.">
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Agent name">
          <input name="business_name" maxLength={NAME_MAX} required className={inputClass} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" required className={inputClass} />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" {...FIELD_RULES.phone} className={inputClass} />
        </Field>
        <Field label="Commission rate (%)">
          <input name="commission_rate" {...NUMBER_RULES.percent} defaultValue={5} className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address">
            <input name="address" maxLength={TEXT_MAX} className={inputClass} />
          </Field>
        </div>
        {error && <p className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
        <div className="sm:col-span-2 flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Saving…" : "Save agent"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
