"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Trash2, Wallet } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, MetricCard, Table, Row, Cell, Empty, Field, inputClass } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Tabs, type TabItem } from "@/components/portal/Tabs";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useMonth, withMonth } from "@/lib/month";
import { formatDate, formatINR } from "@/lib/utils";
import { taxSplit } from "@/lib/invoice";
import { NUMBER_RULES, TEXT_MAX, indiaToday } from "@/lib/validation";
import { api, ApiError, type CashEntry, type CashMonth, type UpsCode } from "@/lib/api";

type View = "overview" | "IN" | "OUT";

const VIEWS: TabItem<View>[] = [
  { key: "overview", label: "Overview" },
  { key: "IN", label: "Cash receipt" },
  { key: "OUT", label: "Cash outward" },
];

const DESCRIPTIONS: Record<View, string> = {
  overview: "Month by month: the total invoice value raised, and the cash received and paid out.",
  IN: "Cash received, recorded against UPS codes. The amount is divided equally over the codes chosen.",
  OUT: "Cash paid out to agents, recorded against UPS codes. The amount is divided equally over the codes chosen.",
};

export default function CashPage() {
  const [view, setView] = useState<View>("overview");
  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading title="Cash" description={DESCRIPTIONS[view]} action={view === "overview" ? undefined : <MonthFilter />} />
        <Tabs tabs={VIEWS} active={view} onChange={setView} layoutId="cash-view" label="Cash views" />
        {view === "overview" ? <CashOverview /> : <CashEntries key={view} direction={view} />}
      </div>
    </PortalShell>
  );
}

const monthLabel = (m: string) =>
  new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

/** Overview: total invoice value (taxable + GST) and cash received / paid, month by month. */
function CashOverview() {
  const { data, loading } = useApi<CashMonth[]>("/cash/overview?months=12");
  const rows = data ?? [];
  const now = rows[rows.length - 1];
  const sum = (key: keyof Omit<CashMonth, "month">) => rows.reduce((s, r) => s + r[key], 0);
  const dash = (v: number) => (loading && !data ? "—" : formatINR(v));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Total invoice value"
          tone="info"
          value={dash(now?.invoice_total ?? 0)}
          sub={`${now ? monthLabel(now.month) : "This month"} · ${taxSplit(now?.invoice_taxable ?? 0, now?.invoice_gst ?? 0)}`}
        />
        <MetricCard label="Cash received" tone="success" value={dash(now?.cash_received ?? 0)} sub={`This month · ${formatINR(sum("cash_received"))} in 12 months`} />
        <MetricCard label="Cash paid out" tone="warning" value={dash(now?.cash_paid ?? 0)} sub={`To agents this month · ${formatINR(sum("cash_paid"))} in 12 months`} />
      </div>

      {loading && !data ? (
        <Empty message="Loading the overview…" />
      ) : (
        <Table head={["Month", "Invoices", "Total invoice value", "Taxable", "GST", "Cash received", "Cash paid out", "Net cash"]}>
          {[...rows].reverse().map((r) => (
            <Row key={r.month}>
              <Cell className="font-medium">{monthLabel(r.month)}</Cell>
              <Cell className="tabular-nums text-secondary">{r.invoice_count}</Cell>
              <Cell className="tabular-nums font-medium">{formatINR(r.invoice_total)}</Cell>
              <Cell className="tabular-nums text-ink-40">{formatINR(r.invoice_taxable)}</Cell>
              <Cell className="tabular-nums text-ink-40">{formatINR(r.invoice_gst)}</Cell>
              <Cell className="tabular-nums">{formatINR(r.cash_received)}</Cell>
              <Cell className="tabular-nums">{formatINR(r.cash_paid)}</Cell>
              <Cell className={`tabular-nums font-medium ${r.cash_received - r.cash_paid < 0 ? "text-danger" : ""}`}>
                {formatINR(r.cash_received - r.cash_paid)}
              </Cell>
            </Row>
          ))}
          <Row>
            <Cell className="font-medium">Last 12 months</Cell>
            <Cell className="tabular-nums text-secondary">{sum("invoice_count")}</Cell>
            <Cell className="tabular-nums font-medium">{formatINR(sum("invoice_total"))}</Cell>
            <Cell className="tabular-nums text-ink-40">{formatINR(sum("invoice_taxable"))}</Cell>
            <Cell className="tabular-nums text-ink-40">{formatINR(sum("invoice_gst"))}</Cell>
            <Cell className="tabular-nums font-medium">{formatINR(sum("cash_received"))}</Cell>
            <Cell className="tabular-nums font-medium">{formatINR(sum("cash_paid"))}</Cell>
            <Cell className="tabular-nums font-medium">{formatINR(sum("cash_received") - sum("cash_paid"))}</Cell>
          </Row>
        </Table>
      )}
    </div>
  );
}

/** Cash receipt or Cash outward: the month's entries and a form to record one. */
function CashEntries({ direction }: { direction: "IN" | "OUT" }) {
  const { hasRole } = useAuth();
  const canRecord = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER", "FINANCE_EXECUTIVE");
  const canDelete = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const [month] = useMonth();
  const { data, loading, refetch } = useApi<CashEntry[]>(withMonth(`/cash?direction=${direction}`, month));
  const [open, setOpen] = useState(false);
  const isIn = direction === "IN";
  const rows = data ?? [];
  const total = rows.reduce((s, e) => s + e.amount, 0);

  async function remove(entry: CashEntry) {
    if (!window.confirm(`Delete this cash entry of ${formatINR(entry.amount)}?`)) return;
    try {
      await api.del(`/cash/${entry.id}`);
      refetch();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Could not delete the entry");
    }
  }

  const recordButton = canRecord && (
    <Button size="sm" magnetic={false} onClick={() => setOpen(true)}>
      <Plus className="h-4 w-4" /> {isIn ? "Record cash receipt" : "Record cash outward"}
    </Button>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-4 sm:max-w-xl sm:grid-cols-2">
          <MetricCard
            label={isIn ? "Cash received" : "Cash paid out"}
            tone={isIn ? "success" : "warning"}
            value={loading && !data ? "—" : formatINR(total)}
            sub={`${rows.length} entr${rows.length === 1 ? "y" : "ies"}`}
          />
          <MetricCard
            label="UPS codes"
            value={loading && !data ? "—" : String(new Set(rows.flatMap((e) => e.lines.map((l) => l.code))).size)}
            sub={isIn ? "Cash received against" : "Cash paid out against"}
          />
        </div>
        {recordButton}
      </div>

      {loading && !data ? (
        <Empty message="Loading cash entries…" />
      ) : rows.length > 0 ? (
        <Table head={["Date", ...(isIn ? [] : ["Agent"]), "UPS codes", "Amount", "Note", ...(canDelete ? [""] : [])]}>
          {rows.map((e) => (
            <Row key={e.id}>
              <Cell className="text-ink-40">{formatDate(e.entry_date)}</Cell>
              {!isIn && <Cell className="font-medium">{e.agent_name ?? "-"}</Cell>}
              <Cell>
                <div className="flex flex-col gap-0.5">
                  {e.lines.map((l) => (
                    <span key={l.assignment_id} className="text-xs">
                      <span className="font-mono">{l.code}</span> <span className="text-ink-40">{formatINR(l.amount)}</span>
                    </span>
                  ))}
                </div>
              </Cell>
              <Cell className="tabular-nums font-medium">{formatINR(e.amount)}</Cell>
              <Cell className="max-w-[220px] truncate text-secondary">{e.note || "-"}</Cell>
              {canDelete && (
                <Cell>
                  <button
                    type="button"
                    onClick={() => remove(e)}
                    aria-label="Delete entry"
                    className="rounded-md p-1.5 text-ink-40 transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Cell>
              )}
            </Row>
          ))}
        </Table>
      ) : (
        <Empty
          icon={<Wallet className="h-5 w-5" />}
          message={isIn ? "No cash received this month." : "No cash paid out this month."}
          action={recordButton || undefined}
        />
      )}

      <CashForm direction={direction} open={open} onOpenChange={setOpen} onSaved={refetch} />
    </div>
  );
}

/** Record cash received, or cash paid out to an agent, against one or more UPS codes. */
function CashForm({
  direction,
  open,
  onOpenChange,
  onSaved,
}: {
  direction: "IN" | "OUT";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const isIn = direction === "IN";
  const { data: codes } = useApi<UpsCode[]>(open ? "/cash/codes" : null);
  const { data: agents } = useApi<{ id: number; business_name: string }[]>(open && !isIn ? "/cash/agents" : null);
  const [date, setDate] = useState(indiaToday());
  const [amount, setAmount] = useState("");
  const [agentId, setAgentId] = useState("");
  const [chosen, setChosen] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const value = Number(amount) || 0;
  const share = chosen.length ? value / chosen.length : 0;
  const ready = value > 0 && chosen.length > 0 && (isIn || agentId !== "") && !saving;

  function reset() {
    setDate(indiaToday());
    setAmount("");
    setAgentId("");
    setChosen([]);
    setNote("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/cash", {
        direction,
        entry_date: date,
        amount: value,
        assignment_ids: chosen,
        agent_id: isIn ? null : Number(agentId),
        note: note.trim() || null,
      });
      onSaved();
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record the cash");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
      title={isIn ? "Record cash receipt" : "Record cash outward"}
      description={isIn ? "Cash received, against one or more UPS codes." : "Cash paid to an agent, against one or more UPS codes."}
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!isIn && (
          <div className="sm:col-span-2">
            <Field label="Agent">
              <Select
                value={agentId}
                onValueChange={setAgentId}
                placeholder={agents ? "Choose the agent" : "Loading agents…"}
                options={(agents ?? []).map((a) => ({ value: String(a.id), label: a.business_name }))}
              />
            </Field>
          </div>
        )}
        <Field label="Amount (₹)">
          <input {...NUMBER_RULES.money} required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Date">
          <input type="date" required max={indiaToday()} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>

        <div className="sm:col-span-2">
          <UpsPicker codes={codes} chosen={chosen} onChange={setChosen} />
          {chosen.length > 0 && value > 0 && (
            <p className="mt-2 text-xs text-secondary">
              Divided equally: {formatINR(share)} on each of {chosen.length} UPS code{chosen.length === 1 ? "" : "s"}.
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <Field label="Note (optional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={TEXT_MAX} placeholder="Who handed it over, receipt number…" className={inputClass} />
          </Field>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            ⚠ {error}
          </p>
        )}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={!ready}>
            {saving ? "Saving…" : "Record"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** Choose several UPS codes from a searchable list. */
function UpsPicker({ codes, chosen, onChange }: { codes: UpsCode[] | null; chosen: number[]; onChange: (ids: number[]) => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (codes ?? []).filter(
      (c) => !term || [c.code, c.project_code, c.project_title, c.service_title, c.vendor_name].some((v) => v.toLowerCase().includes(term)),
    );
  }, [codes, q]);
  const toggle = (id: number) => onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs tracking-eyebrow text-secondary">UPS codes</span>
        {chosen.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-xs text-secondary hover:text-foreground">
            Clear ({chosen.length} chosen)
          </button>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="relative border-b border-line">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by UPS code, project, service or vendor…"
            className="h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-ink-40"
          />
        </div>
        <div className="max-h-56 overflow-y-auto" data-lenis-prevent>
          {codes == null ? (
            <p className="px-3 py-3 text-sm text-ink-40">Loading UPS codes…</p>
          ) : shown.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ink-40">{codes.length ? "No UPS code matches." : "No UPS codes yet. Assign vendors to a project first."}</p>
          ) : (
            shown.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-start gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-ink-06">
                <input type="checkbox" checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} className="mt-0.5 h-4 w-4 accent-foreground" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-mono text-xs">{c.code}</span>
                  <span className="truncate text-xs text-ink-40">
                    {c.project_title} · {c.service_title} · {c.vendor_name}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
