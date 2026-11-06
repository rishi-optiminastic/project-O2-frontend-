"use client";

import { useRef, useState } from "react";
import { Plus, Layers, Upload, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Table, Row, Cell, Empty, Field, inputClass, StatusPill } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type Service, type ServiceBulkCreated, type ServiceBulkPreview } from "@/lib/api";
import { Select } from "@/components/portal/Select";
import { FIELD_RULES, GST_RATE_OPTIONS } from "@/lib/validation";

const DEFAULT_GST_RATE = 18;

/** Service catalogue: what the firm bills for. Invoices pick from this list. */
export default function ServicesPage() {
  const { data, loading, refetch } = useApi<Service[]>("/services?include_inactive=true");
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Services"
          description="What you bill for. Picking a service on an invoice fills in its description, SAC code and GST rate. Each SAC code belongs to one service."
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" magnetic={false} onClick={() => setBulkOpen(true)}>
                <Upload className="h-4 w-4" /> Bulk upload
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
      {bulkOpen && <BulkServices onClose={() => setBulkOpen(false)} onCreated={refetch} />}
    </PortalShell>
  );
}

const ACCEPT = ".xlsx,.csv";

/** Spreadsheet upload: check every row first, then create all of them or none. */
function BulkServices({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ServiceBulkPreview | null>(null);
  const [created, setCreated] = useState<number | null>(null);
  const [busy, setBusy] = useState<"check" | "create" | "template" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check(next: File) {
    setFile(next);
    setPreview(null);
    setError(null);
    setBusy("check");
    try {
      setPreview(await api.upload<ServiceBulkPreview>("/services/bulk/preview", next));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not read the file");
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!file || !preview?.ready) return;
    setError(null);
    setBusy("create");
    try {
      const result = await api.upload<ServiceBulkCreated>("/services/bulk", file);
      setCreated(result.created);
      onCreated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the services");
    } finally {
      setBusy(null);
    }
  }

  async function template() {
    setError(null);
    setBusy("template");
    try {
      await api.download("/services/bulk/template", "bulk-services-template.xlsx");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not download the template");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      size="wide"
      onOpenChange={(open) => !open && onClose()}
      title="Bulk upload services"
      description="Fill the template, upload it, check the rows, then create. Nothing is created unless every row is correct."
    >
      <div className="flex flex-col gap-5">
        {created !== null ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> {created} service{created === 1 ? "" : "s"} added to the catalogue.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="secondary" magnetic={false} onClick={template} disabled={busy !== null}>
                <Download className="h-4 w-4" /> {busy === "template" ? "Downloading…" : "Download template"}
              </Button>
              <Button size="sm" magnetic={false} onClick={() => inputRef.current?.click()} disabled={busy !== null}>
                <Upload className="h-4 w-4" /> {busy === "check" ? "Checking…" : file ? "Choose another file" : "Choose file"}
              </Button>
              {file && <span className="text-xs text-ink-40">{file.name}</span>}
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const next = e.target.files?.[0];
                  e.target.value = "";
                  if (next) check(next);
                }}
              />
            </div>

            {preview && (
              <>
                <p className={preview.ready ? "text-sm text-success" : "flex items-center gap-2 text-sm text-danger"}>
                  {preview.ready ? (
                    `All ${preview.service_count} rows are correct.`
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4" /> {preview.error_count} of {preview.service_count} rows need fixing. Correct the file and upload it again.
                    </>
                  )}
                </p>
                <Table head={["Row", "Title", "SAC code", "GST", "Check"]}>
                  {preview.rows.map((r) => (
                    <Row key={r.row}>
                      <Cell className="tabular-nums text-ink-40">{r.row}</Cell>
                      <Cell className="max-w-xs whitespace-normal font-medium">
                        {r.title || "-"}
                        {r.description && <span className="block text-xs font-light text-ink-40">{r.description}</span>}
                      </Cell>
                      <Cell className="font-mono text-secondary">{r.sac_code ?? "-"}</Cell>
                      <Cell className="tabular-nums">{r.gst_rate != null ? `${r.gst_rate}%` : "-"}</Cell>
                      <Cell className="max-w-sm whitespace-normal text-xs">
                        {r.errors.length ? (
                          <span className="text-danger">{r.errors.join(" ")}</span>
                        ) : (
                          <span className="text-success">OK</span>
                        )}
                      </Cell>
                    </Row>
                  ))}
                </Table>
              </>
            )}
          </>
        )}

        {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onClose}>
            {created !== null ? "Done" : "Cancel"}
          </Button>
          {created === null && (
            <Button type="button" magnetic={false} onClick={create} disabled={!preview?.ready || busy !== null}>
              {busy === "create" ? "Creating…" : preview ? `Create ${preview.service_count} services` : "Create services"}
            </Button>
          )}
        </ModalFooter>
      </div>
    </Modal>
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
