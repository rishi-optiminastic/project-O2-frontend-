"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Mail, Phone, Handshake, Pencil, FileDown } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import {
  Panel,
  MetricCard,
  Table,
  Row,
  Cell,
  Empty,
  StatusPill,
  DataField,
  Field,
  inputClass,
} from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { fadeUp, stagger } from "@/lib/motion";
import { formatINR, formatDate } from "@/lib/utils";
import { api, ApiError, type Agent, type Client, type Invoice } from "@/lib/api";
import { documentDate } from "@/lib/invoice";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { useMonth, withMonth } from "@/lib/month";
import { FIELD_RULES, NAME_MAX, NUMBER_RULES, TEXT_MAX } from "@/lib/validation";

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { hasRole } = useAuth();
  const canManage = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const [editOpen, setEditOpen] = useState(false);

  const { data: agent, loading, refetch } = useApi<Agent>(id ? `/agents/${id}` : null);
  const { data: allClients } = useApi<Client[]>("/clients");
  const [month] = useMonth();
  const { data: invoices } = useApi<Invoice[]>(id ? withMonth(`/invoices?agent_id=${id}`, month) : null);

  const clients = (allClients ?? []).filter((c) => c.agent_id === Number(id));
  const rows = invoices ?? [];
  const totalInvoiced = rows.reduce((s, i) => s + i.total_amount, 0);
  const taxableTotal = rows.reduce((s, i) => s + i.taxable_value, 0);
  const commission = +(taxableTotal * (agent?.commission_rate ?? 0) / 100).toFixed(2);

  const clientName = (cid: number) => clients.find((c) => c.id === cid)?.business_name ?? `Client #${cid}`;

  if (!loading && !agent) {
    return (
      <PortalShell>
        <Empty message="Agent not found." />
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <motion.div className="flex flex-col gap-8" initial="hidden" animate="show" variants={stagger(0.08, 0.04)}>
        <motion.button
          variants={fadeUp}
          onClick={() => router.push("/portal/agents")}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-secondary transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All agents
        </motion.button>

        {/* Identity header */}
        <motion.div variants={fadeUp} className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="metallic flex h-16 w-16 items-center justify-center rounded-2xl">
              <Handshake className="h-6 w-6 text-foreground/70" />
            </span>
            <div>
              <h1 className="font-sans text-4xl font-bold leading-[0.95] tracking-[-0.04em]">
                {agent?.business_name ?? "…"}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-secondary">
                {agent?.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> {agent.email}
                  </span>
                )}
                {agent?.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> {agent.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {agent?.is_house && <StatusPill status="In-house default" />}
            {agent && <StatusPill status={agent.is_active ? "Active" : "Inactive"} />}
            {agent && canManage && !agent.is_house && <MouDownload agent={agent} />}
            {agent && canManage && (
              <Button size="sm" variant="secondary" magnetic={false} onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
          </div>
        </motion.div>

        <motion.div variants={fadeUp}>
          <MonthFilter />
        </motion.div>

        {/* KPIs */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Clients introduced" value={clients.length} sub="Referred businesses" spark={clients.map((_, i) => i + 1).slice(-9)} />
          <MetricCard label="Invoices" value={rows.length} sub="Raised for their clients" spark={rows.map((i) => i.total_amount).slice(-9)} />
          <MetricCard label="Total invoiced" value={formatINR(totalInvoiced)} sub="Gross billed" spark={rows.map((i) => i.total_amount).slice(-9)} />
          <MetricCard label="Commission earned" value={formatINR(commission)} sub={`At ${agent?.commission_rate ?? 0}% of taxable`} spark={rows.map((i) => i.taxable_value).slice(-9)} />
        </motion.div>

        {/* Profile */}
        <motion.div variants={fadeUp}>
          <Panel>
            <h2 className="mb-5 text-sm font-medium tracking-eyebrow text-secondary">Agent details</h2>
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              <DataField label="Commission rate" value={agent ? `${agent.commission_rate}%` : null} />
              <DataField label="Address" value={agent?.address} className="sm:col-span-2" />
              <DataField label="Onboarded" value={agent ? formatDate(agent.created_at) : null} />
            </div>
          </Panel>
        </motion.div>

        {/* Referred clients */}
        <motion.div variants={fadeUp} className="flex flex-col gap-4">
          <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Referred clients</h2>
          {clients.length > 0 ? (
            <Table head={["Business", "Email", "GST", "Category"]}>
              {clients.map((c) => (
                <Row key={c.id} onClick={() => router.push(`/portal/clients/${c.id}`)}>
                  <Cell className="font-medium">{c.business_name}</Cell>
                  <Cell>{c.email}</Cell>
                  <Cell className="text-ink-40">{c.gst_number ?? "—"}</Cell>
                  <Cell>{c.category ?? "—"}</Cell>
                </Row>
              ))}
            </Table>
          ) : (
            <Empty message="No clients linked to this agent yet." />
          )}
        </motion.div>

        {/* Agent invoices */}
        <motion.div variants={fadeUp} className="flex flex-col gap-4">
          <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Invoices</h2>
          {rows.length > 0 ? (
            <Table head={["Invoice", "Client", "Date", "Total", "Status"]}>
              {rows.map((inv) => (
                <Row key={inv.id} onClick={() => router.push(`/portal/invoices/${inv.id}`)}>
                  <Cell className="font-medium">{inv.display_number}</Cell>
                  <Cell>{clientName(inv.client_id)}</Cell>
                  <Cell className="text-ink-40">{formatDate(documentDate(inv))}</Cell>
                  <Cell className="tabular-nums">{formatINR(inv.total_amount)}</Cell>
                  <Cell>
                    <StatusPill status={inv.status} />
                  </Cell>
                </Row>
              ))}
            </Table>
          ) : (
            <Empty message="No invoices credited to this agent yet." />
          )}
        </motion.div>
      </motion.div>

      {agent && (
        <AgentEditForm open={editOpen} onOpenChange={setEditOpen} agent={agent} onSaved={refetch} />
      )}
    </PortalShell>
  );
}

function AgentEditForm({
  open,
  onOpenChange,
  agent,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agent: Agent;
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
      await api.patch(`/agents/${agent.id}`, {
        ...body,
        commission_rate: Number(fd.get("commission_rate") || 0),
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit agent" description="Name, contact details and commission.">
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Agent name">
          <input name="business_name" maxLength={NAME_MAX} required defaultValue={agent.business_name} className={inputClass} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" required defaultValue={agent.email} className={inputClass} />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" {...FIELD_RULES.phone} defaultValue={agent.phone ?? ""} className={inputClass} />
        </Field>
        <Field label={agent.is_house ? "Commission rate (%) · fixed at 0 for the in-house agent" : "Commission rate (%)"}>
          <input
            name="commission_rate"
            {...NUMBER_RULES.percent}
            defaultValue={agent.commission_rate}
            readOnly={agent.is_house}
            aria-readonly={agent.is_house}
            className={inputClass + (agent.is_house ? " text-ink-40" : "")}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address">
            <input name="address" maxLength={TEXT_MAX} defaultValue={agent.address ?? ""} className={inputClass} />
          </Field>
        </div>
        {error && <p className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** Downloads the agent's MOU (commission terms) as a PDF. */
function MouDownload({ agent }: { agent: Agent }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      await api.download(`/agents/${agent.id}/mou.pdf`, `MOU-${agent.business_name}.pdf`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not download the MOU");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" magnetic={false} onClick={download} disabled={busy}>
        <FileDown className="h-4 w-4" /> {busy ? "Preparing…" : "Download MOU (PDF)"}
      </Button>
      {error && <p role="alert" className="max-w-xs text-right text-xs text-danger">⚠ {error}</p>}
    </div>
  );
}
