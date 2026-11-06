"use client";

import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Table, Row, Cell, Empty, Field, inputClass, StatusPill } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Attachments, DOC_CATEGORIES } from "@/components/portal/Attachments";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError } from "@/lib/api";
import type { GstFiling } from "@/lib/finance";
import { formatDate, formatINR } from "@/lib/utils";
import { pastDateRule } from "@/lib/validation";

/** Monthly GST returns: start tracking a period, record GSTR-1 / GSTR-3B, the tax paid and reconciliation. */
export function GstFilingTab({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, refetch } = useApi<GstFiling[]>("/taxation/filings");
  const [open, setOpen] = useState<GstFiling | null>(null);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setErr(null);
    try {
      const f = await api.post<GstFiling>("/taxation/filings", { period });
      refetch();
      onChanged();
      setOpen(f);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not start tracking that month");
    }
  }

  function changed() {
    refetch();
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Return period">
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={inputClass} />
        </Field>
        <Button size="sm" magnetic={false} onClick={start}><Plus className="h-4 w-4" /> Track this return</Button>
        {err && <p role="alert" className="text-sm text-danger">⚠ {err}</p>}
      </div>
      {error && <Empty message={`Could not load returns: ${error}`} />}
      {data && data.length ? (
        <Table head={["Period", "GSTR-1", "GSTR-3B", "Liability", "Paid", "Outstanding", "Reconciliation"]}>
          {data.map((f) => (
            <Row key={f.id} onClick={() => setOpen(f)}>
              <Cell className="font-medium">{f.period}</Cell>
              <Cell><StatusPill status={f.gstr1_status === "Filed" ? "Filed" : "Pending"} /> <span className="text-xs text-ink-40">due {formatDate(f.gstr1_due_date)}</span></Cell>
              <Cell><StatusPill status={f.gstr3b_status === "Filed" ? "Filed" : "Pending"} /> <span className="text-xs text-ink-40">due {formatDate(f.gstr3b_due_date)}</span></Cell>
              <Cell className="tabular-nums">{formatINR(f.tax_liability)}</Cell>
              <Cell className="tabular-nums">{formatINR(f.tax_paid)}</Cell>
              <Cell className={"tabular-nums " + (f.outstanding > 0 ? "text-danger" : "")}>{formatINR(f.outstanding)}</Cell>
              <Cell><StatusPill status={f.reconciliation_status} /></Cell>
            </Row>
          ))}
        </Table>
      ) : (
        !error && <Empty message={loading ? "Loading…" : "No GST returns tracked yet. Start with last month."} />
      )}
      {open && <FilingDialog filingId={open.id} onClose={() => setOpen(null)} onChanged={changed} />}
    </div>
  );
}

type FilingDetail = GstFiling & { history: { field: string; from: string | null; to: string; note: string | null; by: string | null; at: string }[] };

function FilingDialog({ filingId, onClose, onChanged }: { filingId: number; onClose: () => void; onChanged: () => void }) {
  const { data: f, refetch } = useApi<FilingDetail>(`/taxation/filings/${filingId}`);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/taxation/filings/${filingId}`, body);
      refetch();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function recompute() {
    setError(null);
    try {
      await api.post(`/taxation/filings/${filingId}/refresh-liability`);
      refetch();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not recompute");
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const val = (k: string) => (fd.get(k) ? String(fd.get(k)) : null);
    save({
      gstr1_status: val("gstr1_status"), gstr1_filed_on: val("gstr1_filed_on"), gstr1_arn: val("gstr1_arn"),
      gstr3b_status: val("gstr3b_status"), gstr3b_filed_on: val("gstr3b_filed_on"), gstr3b_arn: val("gstr3b_arn"),
      tax_paid: Number(fd.get("tax_paid") || 0), payment_reference: val("payment_reference"), payment_date: val("payment_date"),
      reconciliation_status: val("reconciliation_status"), notes: val("notes"), note: val("note"),
    });
  }

  if (!f) return <Modal open onOpenChange={(o) => !o && onClose()} title="GST return"><p className="text-sm text-ink-40">Loading…</p></Modal>;
  const closed = f.reconciliation_status === "Reconciled";

  return (
    <Modal open size="wide" onOpenChange={(o) => !o && onClose()} title={`GST return · ${f.period}`}
      description={`Liability ${formatINR(f.tax_liability)} · paid ${formatINR(f.tax_paid)} · outstanding ${formatINR(f.outstanding)}`}>
      <div className="flex flex-col gap-5">
        {!closed && (
          <button onClick={recompute} className="inline-flex w-fit items-center gap-1.5 text-xs text-secondary underline">
            <RefreshCw className="h-3.5 w-3.5" /> Recompute liability from the registers
          </button>
        )}
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={`GSTR-1 (due ${formatDate(f.gstr1_due_date)})`}>
            <Select name="gstr1_status" defaultValue={f.gstr1_status} options={[{ value: "Not Filed", label: "Not filed" }, { value: "Filed", label: "Filed" }]} />
          </Field>
          <Field label="GSTR-1 filed on"><input name="gstr1_filed_on" {...pastDateRule()} defaultValue={f.gstr1_filed_on ?? ""} className={inputClass} /></Field>
          <Field label="GSTR-1 ARN"><input name="gstr1_arn" defaultValue={f.gstr1_arn ?? ""} maxLength={40} className={inputClass} /></Field>
          <Field label={`GSTR-3B (due ${formatDate(f.gstr3b_due_date)})`}>
            <Select name="gstr3b_status" defaultValue={f.gstr3b_status} options={[{ value: "Not Filed", label: "Not filed" }, { value: "Filed", label: "Filed" }]} />
          </Field>
          <Field label="GSTR-3B filed on"><input name="gstr3b_filed_on" {...pastDateRule()} defaultValue={f.gstr3b_filed_on ?? ""} className={inputClass} /></Field>
          <Field label="GSTR-3B ARN"><input name="gstr3b_arn" defaultValue={f.gstr3b_arn ?? ""} maxLength={40} className={inputClass} /></Field>
          <Field label="Tax paid (₹)"><input name="tax_paid" type="number" min={0} step="0.01" defaultValue={f.tax_paid} className={inputClass} /></Field>
          <Field label="Challan / CPIN reference"><input name="payment_reference" defaultValue={f.payment_reference ?? ""} maxLength={60} className={inputClass} /></Field>
          <Field label="Paid on"><input name="payment_date" {...pastDateRule()} defaultValue={f.payment_date ?? ""} className={inputClass} /></Field>
          <Field label="Reconciliation">
            <Select name="reconciliation_status" defaultValue={f.reconciliation_status}
              options={["Not Reconciled", "Reconciled", "Mismatch"].map((s) => ({ value: s, label: s }))} />
          </Field>
          <div className="sm:col-span-2"><Field label="Why (kept in the history)"><input name="note" maxLength={500} className={inputClass} /></Field></div>
          <div className="sm:col-span-3"><Field label="Notes"><input name="notes" defaultValue={f.notes ?? ""} className={inputClass} /></Field></div>
          {error && <p role="alert" className="sm:col-span-3 text-sm text-danger">⚠ {error}</p>}
          <ModalFooter>
            <Button type="button" variant="secondary" magnetic={false} onClick={onClose}>Close</Button>
            <Button type="submit" magnetic={false} disabled={saving || closed}>{saving ? "Saving…" : "Save"}</Button>
          </ModalFooter>
        </form>

        <Attachments entityType="gst_filing" entityId={f.id} categories={DOC_CATEGORIES.gst_filing} title="Tax evidence" />

        {f.history.length > 0 && (
          <ol className="flex flex-col gap-1 text-xs text-ink-40">
            {f.history.map((h, i) => <li key={i}>{formatDate(h.at)} · {h.by}: {h.field} {h.from} → <span className="text-foreground">{h.to}</span>{h.note && <> · {h.note}</>}</li>)}
          </ol>
        )}
      </div>
    </Modal>
  );
}
