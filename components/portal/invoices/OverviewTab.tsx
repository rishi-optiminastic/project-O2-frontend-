"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Lock, Copy, Search, X, FileText, Upload } from "lucide-react";
import { Table, Row, Cell, Empty, Field, inputClass, StatusPill } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { PORTAL_EVENTS, usePortalEvent } from "@/lib/events";
import { api, ApiError, PROFORMA_STAGES, type Invoice, type Client, type Project } from "@/lib/api";
import { ProjectPicker, ProjectSummary, overContractError } from "@/components/portal/invoices/ProjectPicker";
import {
  InterstateField,
  LinesEditor,
  LinesPreview,
  draftsFor,
  interstateFromGstin,
  lineInputs,
  type LineDrafts,
} from "@/components/portal/invoices/InvoiceLines";
import { formatINR } from "@/lib/utils";
import { monthEndISO, monthStartISO } from "@/lib/invoice";
import { NUMBER_RULES, futureDateRule, indiaToday } from "@/lib/validation";
import { useMonth, withMonth } from "@/lib/month";

/** Clients usually deduct 2% TDS (sections 194C / 194J technical); editable per invoice. */
const DEFAULT_TDS_RATE = 2;

/** Which client invoices a list shows: proformas (PI) or issued tax invoices (TI). */
export type ClientInvoiceKind = "proforma" | "tax";

/** Filter options per kind, in lifecycle order. */
const STATUSES: Record<ClientInvoiceKind, readonly string[]> = {
  proforma: PROFORMA_STAGES,
  tax: ["Sent", "Pending", "Partially Paid", "Fully Paid", "Overdue", "Cancelled", "Disputed", "Reconciled"],
};

/**
 * The "Overview" tab for client invoices, with search and filters. `kind="proforma"`
 * lists proformas and is where a new invoice is raised; `kind="tax"` lists the tax
 * invoices issued from them.
 */
export function OverviewTab({ kind }: { kind: ClientInvoiceKind }) {
  const isProforma = kind === "proforma";
  const { data: clients } = useApi<Client[]>("/clients");
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  // Spec: search invoices by client, number/description, status.
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [clientId, setClientId] = useState("all");

  const [month] = useMonth();
  const path = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set("search", search.trim());
    if (status !== "all") p.set("status", status);
    if (clientId !== "all") p.set("client_id", clientId);
    const qs = p.toString();
    return withMonth(`/invoices${qs ? `?${qs}` : ""}`, month);
  }, [search, status, clientId, month]);

  const { data: all, loading, refetch } = useApi<Invoice[]>(path);
  usePortalEvent(PORTAL_EVENTS.receiptRecorded, refetch);
  // A proforma becomes a tax invoice when it is issued, so it moves from one list to the other.
  const data = useMemo(() => all?.filter((i) => i.is_issued === !isProforma), [all, isProforma]);
  const noun = isProforma ? "proforma" : "tax invoice";

  const clientName = (id: number) => clients?.find((c) => c.id === id)?.business_name ?? `Client #${id}`;

  async function duplicate(id: number) {
    try {
      await api.post(`/invoices/${id}/duplicate`);
      refetch();
    } catch (err) {
      // e.g. the copy would take the project past its contract value.
      alert(err instanceof ApiError ? err.message : "Could not duplicate this invoice.");
    }
  }

  const hasFilters = search.trim() !== "" || status !== "all" || clientId !== "all";
  function clearFilters() {
    setSearch("");
    setStatus("all");
    setClientId("all");
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar: search + primary action on top, filters below */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search by ${noun} number, amount or description…`}
              className={inputClass + " pl-10"}
            />
          </div>
          {/* New invoices start as proformas; a tax invoice is only ever issued from one. */}
          {isProforma && <div className="flex gap-2 sm:shrink-0">
            <Button size="sm" variant="secondary" magnetic={false} onClick={() => router.push("/portal/invoices/bulk")} className="flex-1 sm:flex-none">
              <Upload className="h-4 w-4" /> Bulk upload
            </Button>
            <Button size="sm" magnetic={false} onClick={() => setCreateOpen(true)} className="flex-1 sm:flex-none">
              <Plus className="h-4 w-4" /> New proforma
            </Button>
          </div>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={clientId}
            onValueChange={setClientId}
            className="min-w-[150px] flex-1 sm:w-48 sm:flex-none"
            options={[{ value: "all", label: "All clients" }, ...(clients ?? []).map((c) => ({ value: String(c.id), label: c.business_name }))]}
          />
          <Select
            value={status}
            onValueChange={setStatus}
            className="min-w-[140px] flex-1 sm:w-44 sm:flex-none"
            options={[{ value: "all", label: "All statuses" }, ...STATUSES[kind].map((s) => ({ value: s, label: s }))]}
          />
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-secondary transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
          {data && data.length > 0 && (
            <span className="ml-auto shrink-0 text-xs text-ink-40">
              {data.length} {noun}{data.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <Empty message="Loading invoices…" />
      ) : data && data.length > 0 ? (
        <Table
          head={
            isProforma
              ? ["Proforma", "Client", "Total", "Status", ""]
              : ["Tax invoice", "Client", "Total", "Pending", "Status", "GST", "E-invoice", ""]
          }
        >
          {data.map((i) => (
            <Row key={i.id} onClick={() => router.push(`/portal/invoices/${i.id}`)}>
              <Cell className="font-medium">
                <span className="flex items-center gap-2">
                  {i.is_locked && <Lock className="h-3 w-3 text-ink-40" />}
                  {i.display_number}
                </span>
                {/* Tax invoice and proforma numbers are separate series; show which proforma it came from. */}
                {i.is_issued && i.proforma_number && (
                  <span className="block text-xs font-light text-ink-40">from {i.proforma_number}</span>
                )}
              </Cell>
              <Cell>{clientName(i.client_id)}</Cell>
              <Cell>{formatINR(i.total_amount)}</Cell>
              {!isProforma && <Cell>{formatINR(i.amount_pending)}</Cell>}
              <Cell>
                <StatusPill status={i.status} />
              </Cell>
              {!isProforma && <Cell className="text-secondary">{i.gst_status}</Cell>}
              {!isProforma && (
                <Cell>
                  <StatusPill status={`E-invoice ${i.e_invoice_status.toLowerCase()}`} />
                </Cell>
              )}
              <Cell>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicate(i.id);
                  }}
                  className="rounded-full p-1.5 text-ink-40 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                  title="Duplicate"
                  aria-label={`Duplicate ${i.display_number}`}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </Cell>
            </Row>
          ))}
        </Table>
      ) : (
        <InvoicesEmpty kind={kind} hasFilters={hasFilters} onCreate={() => setCreateOpen(true)} onClear={clearFilters} />
      )}

      <CreateInvoice
        open={createOpen}
        onOpenChange={setCreateOpen}
        clients={clients ?? []}
        onCreated={(inv) => router.push(`/portal/invoices/${inv.id}`)}
      />
    </div>
  );
}

/** Friendlier empty state: guides a first invoice, or offers to clear filters. */
function InvoicesEmpty({
  kind,
  hasFilters,
  onCreate,
  onClear,
}: {
  kind: ClientInvoiceKind;
  hasFilters: boolean;
  onCreate: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-line py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-mist">
        <FileText className="h-6 w-6 text-ink-40" />
      </span>
      {hasFilters ? (
        <>
          <div>
            <p className="text-sm font-medium">No invoices match these filters</p>
            <p className="mt-1 text-sm font-light text-secondary">Try a different search term or status.</p>
          </div>
          <Button size="sm" variant="secondary" magnetic={false} onClick={onClear}>
            <X className="h-4 w-4" /> Clear filters
          </Button>
        </>
      ) : kind === "proforma" ? (
        <>
          <div>
            <p className="text-sm font-medium">No proforma invoices yet</p>
            <p className="mt-1 max-w-xs text-sm font-light text-secondary">
              Raise a proforma for a client — GST is calculated automatically.
            </p>
          </div>
          <Button size="sm" magnetic={false} onClick={onCreate}>
            <Plus className="h-4 w-4" /> New proforma
          </Button>
        </>
      ) : (
        <div>
          <p className="text-sm font-medium">No tax invoices yet</p>
          <p className="mt-1 max-w-xs text-sm font-light text-secondary">
            A tax invoice is issued from a proforma once the client has approved it.
          </p>
        </div>
      )}
    </div>
  );
}

function CreateInvoice({
  open,
  onOpenChange,
  clients,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: Client[];
  onCreated: (invoice: Invoice) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: projects, refetch: refetchProjects } = useApi<Project[]>(open ? "/projects" : null);
  const [project, setProject] = useState<Project>();
  const [drafts, setDrafts] = useState<LineDrafts>({});
  const [interstate, setInterstate] = useState(false);
  const clientGstin = clients.find((c) => c.id === project?.client_id)?.gst_number;
  const isInterstate = interstateFromGstin(clientGstin) ?? interstate;
  const lines = lineInputs(project, drafts);
  const overContract = overContractError(project, lines.reduce((sum, l) => sum + l.taxable_value, 0));

  function chooseProject(next: Project) {
    setProject(next);
    setDrafts(draftsFor(next));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!project) {
      setError("Choose the project this invoice is for.");
      return;
    }
    if (lines.length === 0) {
      setError("Enter the amount for at least one service.");
      return;
    }
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const created = await api.post<Invoice>("/invoices", {
        project_id: project.id,
        proforma_date: fd.get("proforma_date") || null,
        due_date: fd.get("due_date") || null,
        lines,
        is_interstate: isInterstate,
        tds_rate: Number(fd.get("tds_rate") || 0),
      });
      onOpenChange(false);
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      title="New proforma invoice"
      description="Raised against a project, which sets the client and the services billed. A coordinator approves it to send it to the client."
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Invoice date (this month)">
          <input name="proforma_date" type="date" required min={monthStartISO()} max={indiaToday()} defaultValue={indiaToday()} className={inputClass} />
        </Field>
        <Field label="Due date (default: end of month)">
          <input name="due_date" {...futureDateRule()} defaultValue={monthEndISO()} className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Project">
            <ProjectPicker
              projects={projects}
              value={project?.id}
              onChange={chooseProject}
              onCreated={() => refetchProjects()}
            />
          </Field>
        </div>
        {project && (
          <>
            <div className="sm:col-span-2">
              <ProjectSummary project={project} />
            </div>
            <div className="sm:col-span-2">
              <LinesEditor project={project} drafts={drafts} onChange={setDrafts} />
            </div>
          </>
        )}

        <Field label="TDS the client deducts (%)">
          <input name="tds_rate" {...NUMBER_RULES.tdsRate} defaultValue={DEFAULT_TDS_RATE} className={inputClass} />
        </Field>
        {project && (
          <div className="flex items-end pb-3">
            <InterstateField clientGstin={clientGstin} checked={interstate} onChange={setInterstate} />
          </div>
        )}
        {overContract && <p role="alert" className="sm:col-span-2 text-sm text-danger">⚠ {overContract}</p>}

        {/* Live GST preview with CGST/SGST/IGST split, per line at its service's rate */}
        {project && (
          <div className="sm:col-span-2">
            <LinesPreview project={project} drafts={drafts} interstate={isInterstate} />
          </div>
        )}

        {error && <p className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving || !project || !!overContract}>
            {saving ? "Saving…" : "Create proforma"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
