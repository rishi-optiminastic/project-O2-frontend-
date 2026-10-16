"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Building2 } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Table, Row, Cell, Empty } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { ClientFields, clientBody } from "@/components/portal/clients/ClientFields";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type Client, type AgentOption } from "@/lib/api";
import { formatDate } from "@/lib/utils";

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
          <Table head={["Business", "Email", "GST", "MSME", "Onboarded"]}>
            {data.map((c) => (
              <Row key={c.id} onClick={() => router.push(`/portal/clients/${c.id}`)}>
                <Cell className="font-medium">
                  {c.business_name}
                  {c.legal_name && <span className="block text-xs text-ink-40">{c.legal_name}</span>}
                </Cell>
                <Cell>{c.email}</Cell>
                <Cell className="text-ink-40">{c.gst_number ?? "—"}</Cell>
                <Cell>{c.msme ? "Yes" : "No"}</Cell>
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
    try {
      await api.post("/clients", clientBody(new FormData(e.currentTarget)));
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
        {open && <ClientFields agents={agents} />}
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
