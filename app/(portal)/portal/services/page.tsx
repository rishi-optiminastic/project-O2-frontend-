"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Layers, FileSpreadsheet } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Table, Row, Cell, Empty, Field, inputClass, StatusPill } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type Service } from "@/lib/api";
import { FIELD_RULES } from "@/lib/validation";

/** Service catalogue: what the firm bills for. Projects pick from this list; GST is 18% on every service. */
export default function ServicesPage() {
  const { data, loading, refetch } = useApi<Service[]>("/services?include_inactive=true");
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const router = useRouter();
  const services = data ?? [];

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Services"
          description="What you bill for. Projects pick their services from this list, and each one goes on the invoice with its SAC code."
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" magnetic={false} onClick={() => router.push("/portal/services/bulk")}>
                <FileSpreadsheet className="h-4 w-4" /> Bulk upload
              </Button>
              <Button size="sm" magnetic={false} onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" /> New service
              </Button>
            </div>
          }
        />

        {loading && !data ? (
          <Empty message="Loading services…" />
        ) : data && data.length > 0 ? (
          <Table head={["Service", "SAC code", "Status"]}>
            {data.map((s) => (
              <Row key={s.id} onClick={() => setEditing(s)}>
                <Cell className="max-w-md whitespace-normal font-medium">{s.title}</Cell>
                <Cell className="font-mono text-secondary">
                  {s.sac_code ?? "-"}
                  {sharedWith(services, s.sac_code, s.id).length > 0 && (
                    <span className="block font-sans text-xs text-ink-40">Shared with another service</span>
                  )}
                </Cell>
                <Cell>
                  <StatusPill status={s.is_active ? "Active" : "Inactive"} />
                </Cell>
              </Row>
            ))}
          </Table>
        ) : (
          <Empty
            icon={<Layers className="h-5 w-5" />}
            message="No services yet. Add what you bill for, e.g. Statutory audit or Monthly bookkeeping."
            action={
              <Button size="sm" magnetic={false} onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" /> New service
              </Button>
            }
          />
        )}
      </div>

      {editing && (
        <ServiceForm
          service={editing === "new" ? null : editing}
          services={services}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
          }}
        />
      )}
    </PortalShell>
  );
}

/** Titles of the other services that carry this SAC code. GST allows sharing; the form only points it out. */
function sharedWith(services: Service[], sac: string | null, excludeId?: number): string[] {
  if (!sac) return [];
  return services.filter((s) => s.sac_code === sac && s.id !== excludeId).map((s) => s.title);
}

function ServiceForm({
  service,
  services,
  onClose,
  onSaved,
}: {
  service: Service | null;
  services: Service[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sac = String(fd.get("sac_code") ?? "").replace(/\s/g, "");
    const body = { title: fd.get("title"), sac_code: sac || null };
    const others = sharedWith(services, sac || null, service?.id);
    if (others.length > 0 && !confirm(`SAC ${sac} is already used by ${others.join(", ")}. Save anyway?`)) return;
    run(() => (service ? api.patch(`/services/${service.id}`, body) : api.post("/services", body)));
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={service ? "Edit service" : "New service"}
      description="Changes apply to new invoices only. Invoices already raised keep their details."
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field label="Title">
            <input name="title" required maxLength={200} defaultValue={service?.title} placeholder="Media buying" className={inputClass} />
          </Field>
        </div>
        <Field label="SAC code">
          <input name="sac_code" {...FIELD_RULES.sac} defaultValue={service?.sac_code ?? ""} placeholder="998366" className={inputClass} />
        </Field>

        {error && <p role="alert" className="sm:col-span-3 text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          {service && (
            <>
              <Button
                type="button"
                variant="secondary"
                magnetic={false}
                disabled={saving}
                onClick={() => run(() => api.patch(`/services/${service.id}`, { is_active: !service.is_active }))}
              >
                {service.is_active ? "Deactivate" : "Reactivate"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                magnetic={false}
                disabled={saving}
                onClick={() => confirm(`Delete "${service.title}"? This cannot be undone.`) && run(() => api.del(`/services/${service.id}`))}
              >
                Delete
              </Button>
            </>
          )}
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Saving…" : service ? "Save changes" : "Add service"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
