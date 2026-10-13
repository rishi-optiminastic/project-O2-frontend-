"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Mail, Phone, Building2, Lock, Pencil } from "lucide-react";
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
import { AgentSelect, agentLabel } from "@/components/portal/AgentSelect";
import { GstField } from "@/components/portal/GstField";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { fadeUp, stagger } from "@/lib/motion";
import { formatINR, formatDate } from "@/lib/utils";
import { api, ApiError, type Client, type Invoice, type Agent, type AgentOption } from "@/lib/api";
import { documentDate } from "@/lib/invoice";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { useMonth, withMonth } from "@/lib/month";
import { FIELD_RULES, NAME_MAX, TEXT_MAX } from "@/lib/validation";

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { hasRole } = useAuth();
  const canManage = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const [editOpen, setEditOpen] = useState(false);

  const { data: client, loading, refetch } = useApi<Client>(id ? `/clients/${id}` : null);
  const [month] = useMonth();
  const { data: invoices } = useApi<Invoice[]>(id ? withMonth(`/invoices?client_id=${id}`, month) : null);
  const { data: agents } = useApi<AgentOption[]>("/agents/options");
  const agent = agents?.find((a) => a.id === client?.agent_id);
  // Commission rates are visible to managers only.
  const { data: agentDetail } = useApi<Agent>(canManage && client ? `/agents/${client.agent_id}` : null);

  const rows = invoices ?? [];
  const totalBilled = rows.reduce((s, i) => s + i.total_amount, 0);
  const received = rows.reduce((s, i) => s + i.amount_received, 0);
  const pending = rows.reduce((s, i) => s + i.amount_pending, 0);
  const gst = rows.reduce((s, i) => s + i.gst_amount, 0);
  const tds = rows.reduce((s, i) => s + i.expected_tds, 0);

  if (!loading && !client) {
    return (
      <PortalShell>
        <Empty message="Client not found." />
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <motion.div
        className="flex flex-col gap-8"
        initial="hidden"
        animate="show"
        variants={stagger(0.08, 0.04)}
      >
        <motion.button
          variants={fadeUp}
          onClick={() => router.push("/portal/clients")}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-secondary transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All clients
        </motion.button>

        {/* Identity header */}
        <motion.div variants={fadeUp} className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="metallic flex h-16 w-16 items-center justify-center rounded-2xl">
              <Building2 className="h-6 w-6 text-foreground/70" />
            </span>
            <div>
              <h1 className="font-sans text-4xl font-bold leading-[0.95] tracking-[-0.04em]">
                {client?.business_name ?? "…"}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-secondary">
                {client?.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> {client.email}
                  </span>
                )}
                {client?.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> {client.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {client?.category && <StatusPill status={client.category} />}
            {client && canManage && (
              <Button size="sm" variant="secondary" magnetic={false} onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
          </div>
        </motion.div>

        <motion.div variants={fadeUp}>
          <MonthFilter />
        </motion.div>

        {/* Taxation + receivables KPIs */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total billed" value={formatINR(totalBilled)} sub={`${rows.length} invoices`} spark={rows.map((i) => i.total_amount).slice(-9)} />
          <MetricCard label="Received" value={formatINR(received)} sub="Settled to date" spark={rows.map((i) => i.amount_received).slice(-9)} />
          <MetricCard label="Outstanding" value={formatINR(pending)} sub="Pending collection" spark={rows.map((i) => i.amount_pending).slice(-9)} />
          <MetricCard label="GST charged" value={formatINR(gst)} sub={`TDS receivable ${formatINR(tds)}`} spark={rows.map((i) => i.gst_amount).slice(-9)} />
        </motion.div>

        {/* Profile details */}
        <motion.div variants={fadeUp}>
          <Panel>
            <h2 className="mb-5 text-sm font-medium tracking-eyebrow text-secondary">Onboarding details</h2>
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              <DataField label="Registered legal name" value={client?.legal_name} />
              <DataField label="GST number" value={client?.gst_number} mono />
              <DataField label="Certificate of incorporation" value={client?.coi} mono />
              <DataField label="Category" value={client?.category} />
              <DataField
                label="Referral agent"
                value={
                  agent
                    ? agent.is_house || !agentDetail
                      ? agentLabel(agent)
                      : `${agent.business_name} · ${agentDetail.commission_rate}%`
                    : null
                }
              />
              <DataField label="Onboarded" value={client ? formatDate(client.created_at) : null} />
              <DataField label="Billing address" value={client?.billing_address} className="sm:col-span-2 lg:col-span-1" />
              <DataField label="Notes" value={client?.notes} className="sm:col-span-2 lg:col-span-3" />
            </div>
          </Panel>
        </motion.div>

        {/* Invoices */}
        <motion.div variants={fadeUp} className="flex flex-col gap-4">
          <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Invoices</h2>
          {rows.length > 0 ? (
            <Table head={["Invoice", "Date", "Total", "Pending", "Status", ""]}>
              {rows.map((inv) => (
                <Row key={inv.id} onClick={() => router.push(`/portal/invoices/${inv.id}`)}>
                  <Cell className="font-medium">{inv.display_number}</Cell>
                  <Cell className="text-ink-40">{formatDate(documentDate(inv))}</Cell>
                  <Cell className="tabular-nums">{formatINR(inv.total_amount)}</Cell>
                  <Cell className="tabular-nums text-ink-40">{formatINR(inv.amount_pending)}</Cell>
                  <Cell>
                    <StatusPill status={inv.status} />
                  </Cell>
                  <Cell>
                    {inv.is_locked && (
                      <span className="inline-flex items-center gap-1 text-xs text-ink-40">
                        <Lock className="h-3 w-3" /> Locked
                      </span>
                    )}
                  </Cell>
                </Row>
              ))}
            </Table>
          ) : (
            <Empty message="No invoices for this client yet." />
          )}
        </motion.div>
      </motion.div>

      {client && (
        <ClientEditForm
          open={editOpen}
          onOpenChange={setEditOpen}
          client={client}
          agents={agents}
          onSaved={refetch}
        />
      )}
    </PortalShell>
  );
}

function ClientEditForm({
  open,
  onOpenChange,
  client,
  agents,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  client: Client;
  agents: AgentOption[] | null;
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
      await api.patch(`/clients/${client.id}`, { ...body, agent_id: Number(fd.get("agent_id")) });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit client" description="Update the client's onboarding details.">
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Business name">
          <input name="business_name" maxLength={NAME_MAX} required defaultValue={client.business_name} className={inputClass} />
        </Field>
        <Field label="Registered legal name">
          <input name="legal_name" maxLength={NAME_MAX} defaultValue={client.legal_name ?? ""} className={inputClass} />
        </Field>
        <Field label="Official email">
          <input name="email" type="email" required defaultValue={client.email} className={inputClass} />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" {...FIELD_RULES.phone} defaultValue={client.phone ?? ""} className={inputClass} />
        </Field>
        <GstField defaultValue={client.gst_number} />
        <Field label="COI">
          <input name="coi" {...FIELD_RULES.cin} defaultValue={client.coi ?? ""} className={inputClass} />
        </Field>
        <Field label="Category">
          <input name="category" maxLength={NAME_MAX} defaultValue={client.category ?? ""} placeholder="Enterprise / Mid-market / Startup" className={inputClass} />
        </Field>
        <Field label="Referral agent">
          <AgentSelect options={agents} defaultValue={client.agent_id} />
        </Field>
        <Field label="Billing address">
          <input name="billing_address" maxLength={TEXT_MAX} defaultValue={client.billing_address ?? ""} className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes / special instructions">
            <textarea name="notes" maxLength={TEXT_MAX} rows={2} defaultValue={client.notes ?? ""} className={inputClass + " h-auto py-2.5"} />
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
