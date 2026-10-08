"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Lock, Copy, Search, X, FileText, Upload } from "lucide-react";
import { Table, Row, Cell, Empty, Field, inputClass, StatusPill } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError, PROFORMA_STAGES, type Invoice, type Client, type AgentOption, type Service } from "@/lib/api";
import { ServiceSelect } from "@/components/portal/ServiceSelect";
import { AgentSelect } from "@/components/portal/AgentSelect";
import { formatINR } from "@/lib/utils";
import { monthEndISO } from "@/lib/invoice";
import { useMonth, withMonth } from "@/lib/month";

/** Filter options, in lifecycle order: proforma stages first, then the issued tax invoice. */
/** Clients deduct TDS on professional fees at 10% (section 194J); editable per invoice. */
const DEFAULT_TDS_RATE = 10;

const STATUSES = [
  ...PROFORMA_STAGES,
  "Sent", "Pending", "Partially Paid", "Fully Paid", "Overdue", "Cancelled", "Disputed", "Reconciled",
];

/** The "Overview" tab — the full client-invoice list with search, filters and creation. */
export function OverviewTab() {
  const { data: clients } = useApi<Client[]>("/clients");
  const { data: agents } = useApi<AgentOption[]>("/agents/options");
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

  const { data, loading, refetch } = useApi<Invoice[]>(path);

  const clientName = (id: number) => clients?.find((c) => c.id === id)?.business_name ?? `Client #${id}`;

  async function duplicate(id: number) {
    await api.post(`/invoices/${id}/duplicate`);
    refetch();
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
              placeholder="Search by invoice number, amount or description…"
              className={inputClass + " pl-10"}
            />
          </div>
          <div className="flex gap-2 sm:shrink-0">
            <Button size="sm" variant="secondary" magnetic={false} onClick={() => router.push("/portal/invoices/bulk")} className="flex-1 sm:flex-none">
              <Upload className="h-4 w-4" /> Bulk upload
            </Button>
            <Button size="sm" magnetic={false} onClick={() => setCreateOpen(true)} className="flex-1 sm:flex-none">
              <Plus className="h-4 w-4" /> New invoice
            </Button>
          </div>
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
            options={[{ value: "all", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
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
              {data.length} invoice{data.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <Empty message="Loading invoices…" />
      ) : data && data.length > 0 ? (
        <Table head={["Invoice", "Client", "Total", "Pending", "Status", "GST", ""]}>
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
              <Cell className={i.is_issued ? undefined : "text-ink-40"}>{i.is_issued ? formatINR(i.amount_pending) : "Not due"}</Cell>
              <Cell>
                <StatusPill status={i.status} />
              </Cell>
              <Cell className="text-secondary">{i.is_issued ? i.gst_status : "Not due (proforma)"}</Cell>
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
        <InvoicesEmpty hasFilters={hasFilters} onCreate={() => setCreateOpen(true)} onClear={clearFilters} />
      )}

      <CreateInvoice
        open={createOpen}
        onOpenChange={setCreateOpen}
        clients={clients ?? []}
        agents={agents}
        onCreated={(inv) => router.push(`/portal/invoices/${inv.id}`)}
      />
    </div>
  );
}

/** Friendlier empty state: guides a first invoice, or offers to clear filters. */
function InvoicesEmpty({
  hasFilters,
  onCreate,
  onClear,
}: {
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
      ) : (
        <>
          <div>
            <p className="text-sm font-medium">No invoices yet</p>
            <p className="mt-1 max-w-xs text-sm font-light text-secondary">
              Create your first client invoice — GST is calculated automatically.
            </p>
          </div>
          <Button size="sm" magnetic={false} onClick={onCreate}>
            <Plus className="h-4 w-4" /> New invoice
          </Button>
        </>
      )}
    </div>
  );
}

function CreateInvoice({
  open,
  onOpenChange,
  clients,
  agents,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: Client[];
  agents: AgentOption[] | null;
  onCreated: (invoice: Invoice) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [taxable, setTaxable] = useState(100000);
  const [rate, setRate] = useState(18);
  const { data: services } = useApi<Service[]>("/services");
  const [service, setService] = useState<Service>();

  // A service fills in its description, SAC code and GST rate; all stay editable.
  function chooseService(next: Service) {
    setService(next);
    setRate(next.gst_rate);
  }
  const [interstate, setInterstate] = useState(false);
  // Only explicit picks live in state; defaults follow the (async) client list.
  const [pickedClientId, setPickedClientId] = useState<number>();
  const [pickedAgentId, setPickedAgentId] = useState<number>();
  const clientId = pickedClientId ?? clients[0]?.id;
  // The client's own agent is credited unless someone else is chosen.
  const agentId = pickedAgentId ?? clients.find((c) => c.id === clientId)?.agent_id;
  const chosenAgent = agents?.find((a) => a.id === agentId);

  function chooseClient(id: number) {
    setPickedClientId(id);
    setPickedAgentId(undefined);
  }

  const gst = +(taxable * rate / 100).toFixed(2);
  const total = +(taxable + gst).toFixed(2);
  const half = +(gst / 2).toFixed(2);

  // Reference: a referral agent's existing invoices (not shown for the in-house agent).
  const showAgentInvoices = chosenAgent !== undefined && !chosenAgent.is_house;
  const { data: agentInvoices } = useApi<Invoice[]>(showAgentInvoices ? `/invoices?agent_id=${agentId}` : null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const created = await api.post<Invoice>("/invoices", {
        client_id: Number(fd.get("client_id")),
        agent_id: Number(fd.get("agent_id")),
        service_id: Number(fd.get("service_id")),
        due_date: fd.get("due_date") || null,
        service_description: fd.get("service_description"),
        sac_code: fd.get("sac_code") || null,
        taxable_value: Number(fd.get("taxable_value")),
        gst_rate: Number(fd.get("gst_rate")),
        is_interstate: interstate,
        tds_rate: Number(fd.get("tds_rate") || 0),
        supporting_document: fd.get("supporting_document") || null,
        internal_remarks: fd.get("internal_remarks") || null,
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
      title="New proforma invoice"
      description="Starts as an editable proforma. The tax invoice number and date are assigned when a manager issues it."
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Client">
          <Select
            name="client_id"
            required
            placeholder="Select client"
            value={clientId !== undefined ? String(clientId) : undefined}
            onValueChange={(v) => chooseClient(Number(v))}
            options={clients.map((c) => ({ value: String(c.id), label: c.business_name }))}
          />
        </Field>
        <Field label="Agent credited">
          <AgentSelect options={agents} value={agentId} onValueChange={setPickedAgentId} />
        </Field>

        {/* Reference: the chosen agent's existing invoices */}
        {showAgentInvoices && (
          <div className="sm:col-span-2 rounded-2xl border border-line bg-mist/40 p-4">
            <p className="mb-2 text-xs tracking-eyebrow text-secondary">
              This agent&apos;s invoices ({agentInvoices?.length ?? 0})
            </p>
            {agentInvoices && agentInvoices.length > 0 ? (
              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                {agentInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2 text-xs">
                    <span className="font-medium">{inv.display_number}</span>
                    <span className="tabular-nums text-ink-40">{formatINR(inv.total_amount)}</span>
                    <span className="text-ink-40">{inv.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-40">No invoices for this agent yet.</p>
            )}
          </div>
        )}
        <div className="sm:col-span-2">
          <Field label="Service">
            <ServiceSelect services={services} value={service?.id} onChange={chooseService} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description (printed on the invoice)">
            {/* key: remount so a newly chosen service's description fills in */}
            <textarea
              key={`desc-${service?.id}`}
              name="service_description"
              rows={2}
              defaultValue={service?.description ?? ""}
              className={inputClass + " h-auto py-2.5"}
            />
          </Field>
        </div>
        <Field label="SAC code (GST service code)">
          <input key={`sac-${service?.id}`} name="sac_code" defaultValue={service?.sac_code ?? ""} className={inputClass} />
        </Field>
        <Field label="Due date (default: end of month)">
          <input name="due_date" type="date" defaultValue={monthEndISO()} className={inputClass} />
        </Field>
        <Field label="Taxable value (₹)">
          <input
            name="taxable_value"
            type="number"
            step="0.01"
            value={taxable}
            onChange={(e) => setTaxable(Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label="GST rate (%)">
          <input name="gst_rate" type="number" step="0.01" value={rate} onChange={(e) => setRate(Number(e.target.value))} className={inputClass} />
        </Field>
        <Field label="TDS the client deducts (%) · 10% for professional fees">
          <input name="tds_rate" type="number" step="0.01" min={0} defaultValue={DEFAULT_TDS_RATE} className={inputClass} />
        </Field>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm font-light text-secondary">
            <input type="checkbox" checked={interstate} onChange={(e) => setInterstate(e.target.checked)} className="accent-foreground" /> Inter-state (IGST)
          </label>
        </div>
        <div className="sm:col-span-2">
          <Field label="Supporting document (reference / link)">
            <input name="supporting_document" className={inputClass} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Internal remarks">
            <input name="internal_remarks" className={inputClass} />
          </Field>
        </div>

        {/* Live GST preview with CGST/SGST/IGST split */}
        <div className="sm:col-span-2 grid grid-cols-2 gap-3 rounded-2xl border border-line bg-mist/50 p-4 text-center text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-ink-40">Taxable</p>
            <p className="mt-1 font-medium tabular-nums">{formatINR(taxable)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-40">{interstate ? "IGST" : "CGST + SGST"}</p>
            <p className="mt-1 font-medium tabular-nums">{interstate ? formatINR(gst) : `${formatINR(half)} × 2`}</p>
          </div>
          <div>
            <p className="text-xs text-ink-40">GST total</p>
            <p className="mt-1 font-medium tabular-nums">{formatINR(gst)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-40">Invoice total</p>
            <p className="mt-1 font-medium tabular-nums">{formatINR(total)}</p>
          </div>
        </div>

        {error && <p className="sm:col-span-2 text-sm text-foreground/80">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Saving…" : "Create proforma"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
