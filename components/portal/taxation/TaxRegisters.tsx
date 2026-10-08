"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Table, Row, Cell, Empty, Field, inputClass } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { withMonth } from "@/lib/month";
import { formatDate, formatINR } from "@/lib/utils";
import { api, ApiError, type ClientTdsRow, type PurchaseGstRow, type SalesGstRow, type VendorTdsRow } from "@/lib/api";

const money = (v: number | null) => (v === null ? "-" : formatINR(v));

export function SalesGstTab({ month }: { month: string }) {
  const { data, loading } = useApi<SalesGstRow[]>(withMonth("/taxation/gst/sales", month));
  if (!data?.length) {
    return <Empty message={loading ? "Loading…" : "No tax invoices issued in this month."} />;
  }
  return (
    <Table head={["Invoice", "Client", "Taxable", "CGST", "SGST", "IGST", "GST", "Total"]}>
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
          <Cell className="tabular-nums text-ink-40">{formatINR(r.cgst)}</Cell>
          <Cell className="tabular-nums text-ink-40">{formatINR(r.sgst)}</Cell>
          <Cell className="tabular-nums text-ink-40">{formatINR(r.igst)}</Cell>
          <Cell className="tabular-nums font-medium">
            {formatINR(r.gst_amount)}
            <span className="block text-xs font-light text-ink-40">{r.gst_rate}%</span>
          </Cell>
          <Cell className="tabular-nums">{formatINR(r.total_amount)}</Cell>
        </Row>
      ))}
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
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Claimable
              </span>
            ) : (
              <span className="text-ink-40">{r.vendor_gstin ? "No GST charged" : "Not claimable: vendor has no GSTIN"}</span>
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
    return <Empty message={loading ? "Loading…" : "No client deducted TDS from a payment in this month."} />;
  }
  return (
    <>
      <Table head={["Payment", "Invoice", "Client", "TDS deducted", "Form 16A", ""]}>
        {data.map((r) => (
          <Row key={r.payment_id}>
            <Cell className="text-ink-40">{formatDate(r.payment_date)}</Cell>
            <Cell className="font-medium">{r.invoice_number}</Cell>
            <Cell>{r.client_name}</Cell>
            <Cell className="tabular-nums font-medium">{formatINR(r.tds_deducted)}</Cell>
            <Cell className="text-xs">
              {r.certificate_number ? (
                <>
                  <span className="font-mono">{r.certificate_number}</span>
                  <span className="block text-ink-40">Received {r.certificate_date ? formatDate(r.certificate_date) : ""}</span>
                </>
              ) : (
                <span className="font-medium">⚠ Not received yet</span>
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
            <Cell className={r.overdue ? "font-medium" : "text-ink-40"}>
              {formatDate(r.due_date)}
              {r.overdue && <span className="block text-xs">⚠ Overdue</span>}
            </Cell>
            <Cell className="text-xs">
              {r.challan_number ? (
                <>
                  <span className="font-mono">{r.challan_number}</span>
                  <span className="block text-ink-40">{r.deposited_on ? formatDate(r.deposited_on) : ""}</span>
                </>
              ) : (
                <span className="text-ink-40">Not yet</span>
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
          <input name="number" required maxLength={60} defaultValue={initialNumber ?? ""} spellCheck={false} className={`${inputClass} font-mono`} />
        </Field>
        <Field label={dateLabel}>
          <input name="date" type="date" required defaultValue={initialDate ?? ""} className={inputClass} />
        </Field>
        {error && <p role="alert" className="col-span-full text-sm text-foreground/80">⚠ {error}</p>}
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
