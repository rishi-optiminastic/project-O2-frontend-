"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { MetricCard, Table, Row, Cell, Empty } from "@/components/portal/ui";
import { AnimatedNumber } from "@/components/portal/AnimatedNumber";
import { useApi } from "@/lib/useApi";
import { formatINR, formatDate } from "@/lib/utils";
import type { TaxationSummary, PaymentReceipt } from "@/lib/api";
import { useMonth, withMonth } from "@/lib/month";

/**
 * The "Payment Received" tab: money coming in from clients and the TDS they
 * deducted, with the receipts ledger. GST and TDS registers live on Taxation.
 */
export function PaymentReceivedTab() {
  const router = useRouter();
  const [month] = useMonth();
  const { data: summary, loading: summaryLoading } = useApi<TaxationSummary>(withMonth("/taxation/summary", month));
  const { data: receipts, loading: receiptsLoading } = useApi<PaymentReceipt[]>(withMonth("/taxation/receipts", month));

  const totalReceived = useMemo(() => (receipts ?? []).reduce((s, r) => s + r.amount, 0), [receipts]);
  const amount = (value: number | undefined, loading: boolean) =>
    loading ? "—" : <AnimatedNumber value={value ?? 0} format={formatINR} />;
  const pending = summary?.client_tds_certificates_pending ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Cash received" value={amount(totalReceived, receiptsLoading)} sub={`${receipts?.length ?? 0} payments`} />
        <MetricCard label="TDS deducted by clients" value={amount(summary?.client_tds_deducted, summaryLoading)} sub="Counts towards settling invoices" />
        <MetricCard
          label="Form 16A pending"
          value={summaryLoading ? "—" : String(pending)}
          sub={pending ? "Certificates to collect (see Taxation)" : "All certificates received"}
        />
        <MetricCard label="GST on sales" value={amount(summary?.output_gst.total, summaryLoading)} sub="Tax invoices issued this month" />
      </div>

      {/* Receipts ledger */}
      <div>
        <h2 className="mb-4 text-lg font-light tracking-tight">Payments received</h2>
        {receipts && receipts.length > 0 ? (
          <Table head={["Date", "Invoice", "Amount", "TDS deducted", "GST", "Bank", "Reference"]}>
            {receipts.map((r) => (
              <Row key={r.id} onClick={() => router.push(`/portal/invoices/${r.invoice_id}`)}>
                <Cell className="text-ink-40">{formatDate(r.payment_date)}</Cell>
                <Cell className="font-medium">{r.invoice_number}</Cell>
                <Cell className="tabular-nums">{formatINR(r.amount)}</Cell>
                <Cell className="tabular-nums">{formatINR(r.tds_deducted)}</Cell>
                <Cell className="tabular-nums">{formatINR(r.gst_component)}</Cell>
                <Cell className="text-ink-40">{r.bank_name ?? r.payment_mode}</Cell>
                <Cell className="text-ink-40">{r.bank_reference || "—"}</Cell>
              </Row>
            ))}
          </Table>
        ) : (
          <Empty message={receiptsLoading ? "Loading receipts…" : "No payments received yet."} />
        )}
      </div>
    </div>
  );
}
