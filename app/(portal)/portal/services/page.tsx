"use client";

import { useState } from "react";
import { Plus, Layers } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Table, Row, Cell, Empty, Field, inputClass, StatusPill } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type Service } from "@/lib/api";
import { Select } from "@/components/portal/Select";
import { FIELD_RULES, GST_RATE_OPTIONS } from "@/lib/validation";

const DEFAULT_GST_RATE = 18;

/** Service catalogue: what the firm bills for. Invoices pick from this list. */
export default function ServicesPage() {
  const { data, loading, refetch } = useApi<Service[]>("/services?include_inactive=true");
  const [editing, setEditing] = useState<Service | "new" | null>(null);

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Services"
          description="What you bill for. Picking a service on an invoice fills in its description, SAC code and GST rate."
          action={
            <Button size="sm" magnetic={false} onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> New service
            </Button>
          }
        />

        {loading && !data ? (
          <Empty message="Loading services…" />
        ) : data && data.length > 0 ? (
          <Table head={["Service", "SAC code", "GST", "Status"]}>
            {data.map((s) => (
              <Row key={s.id} onClick={() => setEditing(s)}>
                <Cell className="max-w-md whitespace-normal font-medium">
                  {s.title}
                  {s.description && <span className="block text-xs font-light text-ink-40">{s.description}</span>}
                </Cell>
                <Cell className="text-secondary">{s.sac_code ?? "-"}</Cell>
                <Cell className="tabular-nums">{s.gst_rate}%</Cell>
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

function ServiceForm({ service, onClose, onSaved }: { service: Service | null; onClose: () => void; onSaved: () => void }) {
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
    const body = {
      title: fd.get("title"),
      description: fd.get("description") || null,
      sac_code: fd.get("sac_code") || null,
      gst_rate: Number(fd.get("gst_rate")),
    };
    run(() => (service ? api.patch(`/services/${service.id}`, body) : api.post("/services", body)));
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={service ? "Edit service" : "New service"}
      description="Changes apply to new invoices only. Invoices already raised keep their details."
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title">
            <input name="title" required maxLength={200} defaultValue={service?.title} placeholder="Statutory audit" className={inputClass} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description (printed on the invoice)">
            <textarea
              name="description"
              rows={3}
              defaultValue={service?.description ?? ""}
              placeholder="Annual statutory audit under the Companies Act, 2013"
              className={inputClass + " h-auto py-2.5"}
            />
          </Field>
        </div>
        <Field label="SAC code (GST service code)">
          <input name="sac_code" {...FIELD_RULES.sac} defaultValue={service?.sac_code ?? ""} placeholder="998221" className={inputClass} />
        </Field>
        <Field label="GST rate (%)">
          <Select name="gst_rate" required options={GST_RATE_OPTIONS} defaultValue={String(service?.gst_rate ?? DEFAULT_GST_RATE)} />
        </Field>

        {error && <p role="alert" className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
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
