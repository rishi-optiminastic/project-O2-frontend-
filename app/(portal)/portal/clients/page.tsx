"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Building2 } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Table, Row, Cell, Empty, Field, inputClass } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { GstField } from "@/components/portal/GstField";
import { AgentSelect } from "@/components/portal/AgentSelect";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type Client, type AgentOption } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FIELD_RULES, NAME_MAX, TEXT_MAX } from "@/lib/validation";

export default function ClientsPage() {
  const { data, loading, refetch } = useApi<Client[]>("/clients");
  const { data: agents } = useApi<AgentOption[]>("/agents/options");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Clients"
          description="Onboarded businesses available for invoicing, taxation and reporting."
          action={
            <Button size="sm" magnetic={false} onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New client
            </Button>
          }
        />

        {data && data.length > 0 ? (
          <Table head={["Business", "Email", "GST", "Category", "Onboarded"]}>
            {data.map((c) => (
              <Row key={c.id} onClick={() => router.push(`/portal/clients/${c.id}`)}>
                <Cell className="font-medium">
                  {c.business_name}
                  {c.legal_name && <span className="block text-xs text-ink-40">{c.legal_name}</span>}
                </Cell>
                <Cell>{c.email}</Cell>
                <Cell className="text-ink-40">{c.gst_number ?? "—"}</Cell>
                <Cell>{c.category ?? "—"}</Cell>
                <Cell className="text-ink-40">{formatDate(c.created_at)}</Cell>
              </Row>
            ))}
          </Table>
        ) : (
          <Empty
            message={loading ? "Loading clients…" : "No clients yet. Onboard your first to start invoicing."}
            icon={<Building2 className="h-5 w-5" strokeWidth={1.6} />}
            action={
              loading ? undefined : (
                <Button size="sm" magnetic={false} onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4" /> New client
                </Button>
              )
            }
          />
        )}
      </div>

      <ClientForm open={open} onOpenChange={setOpen} onSaved={refetch} agents={agents} />
    </PortalShell>
  );
}

function ClientForm({
  open,
  onOpenChange,
  onSaved,
  agents,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  agents: AgentOption[] | null;
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
      await api.post("/clients", { ...body, agent_id: Number(fd.get("agent_id")) });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Onboard a client" description="Capture the client intake details.">
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Business name">
          <input name="business_name" maxLength={NAME_MAX} required className={inputClass} />
        </Field>
        <Field label="Registered legal name">
          <input name="legal_name" maxLength={NAME_MAX} className={inputClass} />
        </Field>
        <Field label="Official email">
          <input name="email" type="email" required className={inputClass} />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" {...FIELD_RULES.phone} className={inputClass} />
        </Field>
        <GstField />
        <Field label="COI">
          <input name="coi" {...FIELD_RULES.cin} className={inputClass} />
        </Field>
        <Field label="Category">
          <input name="category" maxLength={NAME_MAX} placeholder="Enterprise / Mid-market / Startup" className={inputClass} />
        </Field>
        <Field label="Referral agent">
          <AgentSelect options={agents} />
        </Field>
        <Field label="Billing address">
          <input name="billing_address" maxLength={TEXT_MAX} className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes / special instructions">
            <textarea name="notes" maxLength={TEXT_MAX} rows={2} className={inputClass + " h-auto py-2.5"} />
          </Field>
        </div>
        {error && <p className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Saving…" : "Save client"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
