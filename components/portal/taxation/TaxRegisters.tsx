"use client";

import { useState } from "react";
import { Table, Row, Cell, Empty, Field, inputClass, Badge } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { withMonth } from "@/lib/month";
import { formatDate, formatINR } from "@/lib/utils";
import { FIELD_RULES, pastDateRule } from "@/lib/validation";
import { api, ApiError, type ClientTdsRow, type PurchaseGstRow, type SalesGstRow, type VendorTdsRow } from "@/lib/api";

const money = (v: number | null) => (v === null ? "-" : formatINR(v));

/** Amount columns of the sales register, totalled in its last row. */
const SALES_AMOUNTS = ["taxable_value", "gst_amount", "paid_principal", "paid_gst", "pending_principal", "pending_gst", "total_amount"] as const;

/** The intra-state CGST + SGST split, or IGST for another state. */
function gstSplit(r: SalesGstRow): string {
  return r.igst ? `${r.gst_rate}% IGST` : `${r.gst_rate}% · CGST ${formatINR(r.cgst)} + SGST ${formatINR(r.sgst)}`;
}

/** Paid figures show green once something is paid; pending ones amber while anything is due. */
const paidClass = (v: number) => (v > 0 ? "tabular-nums text-success" : "tabular-nums text-ink-40");
const pendingClass = (v: number) => (v > 0 ? "tabular-nums font-medium text-warning" : "tabular-nums text-ink-40");

export function SalesGstTab({ month }: { month: string }) {
  const { data, loading } = useApi<SalesGstRow[]>(withMonth("/taxation/gst/sales", month));
  if (!data?.length) {
    return <Empty message={loading ? "Loading…" : "No tax invoices issued in this month."} />;
  }
  const totals = Object.fromEntries(
    SALES_AMOUNTS.map((key) => [key, data.reduce((sum, r) => sum + r[key], 0)]),
  ) as Record<(typeof SALES_AMOUNTS)[number], number>;

  return (
    <Table head={["Invoice", "Client", "Principal amount", "Principal GST", "Paid amount", "Paid GST", "Pending amount", "Pending GST", "Total"]}>
      {data.map((r) => (
        <Row key={r.invoice_id}>
          <Cell className="font-medium">
            {r.invoice_number}
            <span className="block text-xs font-light text-ink-40">{formatDate(r.invoice_date)}</span>
          </Cell>
          <Cell>
            {r.client_name}
            <span className="block font-mono text-xs text-ink-40">{r.client_gstin ?? "No GSTIN"}</span>
          </Cell>
          <Cell className="tabular-nums">{formatINR(r.taxable_value)}</Cell>
          <Cell className="tabular-nums font-medium">
            {formatINR(r.gst_amount)}
            <span className="block whitespace-nowrap text-xs font-light text-ink-40">{gstSplit(r)}</span>
          </Cell>
          <Cell className={paidClass(r.paid_principal)}>{formatINR(r.paid_principal)}</Cell>
          <Cell className={paidClass(r.paid_gst)}>{formatINR(r.paid_gst)}</Cell>
          <Cell className={pendingClass(r.pending_principal)}>{formatINR(r.pending_principal)}</Cell>
          <Cell className={pendingClass(r.pending_gst)}>{formatINR(r.pending_gst)}</Cell>
          <Cell className="tabular-nums">{formatINR(r.total_amount)}</Cell>
        </Row>
      ))}
      <Row>
        <Cell className="font-medium">Total</Cell>
        <Cell className="text-ink-40">{data.length} invoices</Cell>
        <Cell className="tabular-nums font-medium">{formatINR(totals.taxable_value)}</Cell>
        <Cell className="tabular-nums font-medium">{formatINR(totals.gst_amount)}</Cell>
        <Cell className={`${paidClass(totals.paid_principal)} font-medium`}>{formatINR(totals.paid_principal)}</Cell>
        <Cell className={`${paidClass(totals.paid_gst)} font-medium`}>{formatINR(totals.paid_gst)}</Cell>
        <Cell className={pendingClass(totals.pending_principal)}>{formatINR(totals.pending_principal)}</Cell>
        <Cell className={pendingClass(totals.pending_gst)}>{formatINR(totals.pending_gst)}</Cell>
        <Cell className="tabular-nums font-medium">{formatINR(totals.total_amount)}</Cell>
      </Row>
    </Table>
  );
}

export function PurchaseGstTab({ month }: { month: string }) {
  const { data, loading } = useApi<PurchaseGstRow[]>(withMonth("/taxation/gst/purchases", month));
  if (!data?.length) {
    return <Empty message={loading ? "Loading…" : "No vendor bills recorded in this month."} />;
  }
  return (
    <Table head={["Bill", "Vendor", "Taxable", "CGST", "SGST", "IGST", "GST", "Input credit"]}>
      {data.map((r) => (
        <Row key={r.vendor_invoice_id}>
          <Cell className="font-medium">
            {r.invoice_number}
            <span className="block text-xs font-light text-ink-40">{formatDate(r.invoice_date)}</span>
          </Cell>
          <Cell>
            {r.vendor_name}
            <span className="block font-mono text-xs text-ink-40">{r.vendor_gstin ?? "No GSTIN"}</span>
          </Cell>
          <Cell className="tabular-nums">{formatINR(r.taxable_value)}</Cell>
          <Cell className="tabular-nums text-ink-40">{money(r.cgst)}</Cell>
          <Cell className="tabular-nums text-ink-40">{money(r.sgst)}</Cell>
          <Cell className="tabular-nums text-ink-40">{money(r.igst)}</Cell>
          <Cell className="tabular-nums font-medium">
            {formatINR(r.gst_amount)}
            <span className="block text-xs font-light text-ink-40">{r.gst_rate === null ? "Split not recorded" : `${r.gst_rate}%`}</span>
          </Cell>
          <Cell className="text-xs">
            {r.itc_eligible ? (
              <Badge tone="success">Claimable</Badge>
            ) : r.vendor_gstin ? (
              <span className="text-ink-40">No GST charged</span>
            ) : (
              <Badge tone="warning">Not claimable: no GSTIN</Badge>
            )}
          </Cell>
        </Row>
      ))}
    </Table>
  );
}

export function ClientTdsTab({ month, onChanged }: { month: string; onChanged: () => void }) {
  const { data, loading, refetch } = useApi<ClientTdsRow[]>(withMonth("/taxation/tds/clients", month));
  const [editing, setEditing] = useState<ClientTdsRow | null>(null);
  if (!data?.length) {
    return <Empty message={loading ? "Loading…" : "No client deducted TDS from a receipt in this month."} />;
  }
  return (
    <>
      <Table head={["Received on", "Invoice", "Client", "TDS deducted", "Form 16A", ""]}>
        {data.map((r) => (
          <Row key={r.payment_id}>
            <Cell className="text-ink-40">{formatDate(r.payment_date)}</Cell>
            <Cell className="font-medium">{r.invoice_number}</Cell>
            <Cell>{r.client_name}</Cell>
            <Cell className="tabular-nums font-medium">{formatINR(r.tds_deducted)}</Cell>
            <Cell className="text-xs">
              {r.certificate_number ? (
                <>
                  <Badge tone="success">Received</Badge>
                  <span className="mt-1 block font-mono">{r.certificate_number}</span>
                  <span className="block text-ink-40">{r.certificate_date ? formatDate(r.certificate_date) : ""}</span>
                </>
              ) : (
                <Badge tone="warning">Not received yet</Badge>
              )}
            </Cell>
            <Cell>
              <Button size="sm" variant="secondary" magnetic={false} onClick={() => setEditing(r)}>
                {r.certificate_number ? "Edit" : "Mark received"}
              </Button>
            </Cell>
          </Row>
        ))}
      </Table>
      {editing && (
        <RecordModal
          title="Form 16A received"
          description={`${editing.client_name} deducted ${formatINR(editing.tds_deducted)} on ${editing.invoice_number}. Their TDS certificate lets us claim this credit.`}
          numberLabel="Certificate number"
          dateLabel="Certificate date"
          minDate={editing.payment_date}
          initialNumber={editing.certificate_number}
          initialDate={editing.certificate_date}
          onClose={() => setEditing(null)}
          onSave={(number, date) =>
            api.patch(`/taxation/client-tds/${editing.payment_id}/certificate`, { certificate_number: number, certificate_date: date })
          }
          onSaved={() => {
            refetch();
            onChanged();
          }}
        />
      )}
    </>
  );
}

export function VendorTdsTab({ month, onChanged }: { month: string; onChanged: () => void }) {
  const { data, loading, refetch } = useApi<VendorTdsRow[]>(withMonth("/taxation/tds/vendors", month));
  const [editing, setEditing] = useState<VendorTdsRow | null>(null);
  if (!data?.length) {
    return <Empty message={loading ? "Loading…" : "No TDS deducted from vendor bills in this month."} />;
  }
  return (
    <>
      <Table head={["Bill", "Vendor", "Section", "TDS", "Due by", "Deposited", ""]}>
        {data.map((r) => (
          <Row key={r.vendor_invoice_id}>
            <Cell className="font-medium">
              {r.invoice_number}
              <span className="block text-xs font-light text-ink-40">{formatDate(r.invoice_date)}</span>
            </Cell>
            <Cell>
              {r.vendor_name}
              <span className="block font-mono text-xs text-ink-40">{r.vendor_pan ?? "No PAN"}</span>
            </Cell>
            <Cell className="text-ink-40">
              {r.section_label}
              <span className="block text-xs">{r.tds_rate}%</span>
            </Cell>
            <Cell className="tabular-nums font-medium">{formatINR(r.tds_amount)}</Cell>
            <Cell className={r.overdue ? "font-medium text-danger" : "text-ink-40"}>
              {formatDate(r.due_date)}
              {r.overdue && <Badge tone="danger" className="mt-1 flex w-fit">Overdue</Badge>}
            </Cell>
            <Cell className="text-xs">
              {r.challan_number ? (
                <>
                  <Badge tone="success">Deposited</Badge>
                  <span className="mt-1 block font-mono">{r.challan_number}</span>
                  <span className="block text-ink-40">{r.deposited_on ? formatDate(r.deposited_on) : ""}</span>
                </>
              ) : (
                <Badge tone={r.overdue ? "danger" : "warning"}>Not yet</Badge>
              )}
            </Cell>
            <Cell>
              <Button size="sm" variant="secondary" magnetic={false} onClick={() => setEditing(r)}>
                {r.challan_number ? "Edit" : "Mark deposited"}
              </Button>
            </Cell>
          </Row>
        ))}
      </Table>
      {editing && (
        <RecordModal
          title="TDS deposited"
          description={`${formatINR(editing.tds_amount)} deducted from ${editing.vendor_name}'s bill ${editing.invoice_number}, due by ${formatDate(editing.due_date)}.`}
          numberLabel="Challan number"
          dateLabel="Deposited on"
          minDate={editing.invoice_date}
          initialNumber={editing.challan_number}
          initialDate={editing.deposited_on}
          onClose={() => setEditing(null)}
          onSave={(number, date) =>
            api.patch(`/taxation/vendor-tds/${editing.vendor_invoice_id}/deposit`, { challan_number: number, deposited_on: date })
          }
          onSaved={() => {
            refetch();
            onChanged();
          }}
        />
      )}
    </>
  );
}

/** Record a reference number with its date, or clear both. */
function RecordModal({
  title,
  description,
  numberLabel,
  dateLabel,
  minDate,
  initialNumber,
  initialDate,
  onClose,
  onSave,
  onSaved,
}: {
  title: string;
  description: string;
  numberLabel: string;
  dateLabel: string;
  /** The date cannot be before this one: the payment or the bill it belongs to. */
  minDate: string;
  initialNumber: string | null;
  initialDate: string | null;
  onClose: () => void;
  onSave: (number: string | null, date: string | null) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(number: string | null, date: string | null) {
    setSaving(true);
    setError(null);
    try {
      await onSave(number, date);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    save(String(fd.get("number")).trim(), String(fd.get("date")));
  }

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={title} description={description}>
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={numberLabel}>
          <input name="number" required {...FIELD_RULES.taxDocument} defaultValue={initialNumber ?? ""} className={`${inputClass} font-mono`} />
        </Field>
        <Field label={dateLabel}>
          <input name="date" {...pastDateRule()} min={minDate} required defaultValue={initialDate ?? ""} className={inputClass} />
        </Field>
        {error && <p role="alert" className="col-span-full text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          {initialNumber && (
            <Button type="button" variant="ghost" magnetic={false} disabled={saving} onClick={() => save(null, null)} className="mr-auto">
              Clear
            </Button>
          )}
          <Button type="button" variant="secondary" magnetic={false} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
