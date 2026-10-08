"use client";

import { useState } from "react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, MetricCard } from "@/components/portal/ui";
import { AnimatedNumber } from "@/components/portal/AnimatedNumber";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { Tabs, type TabItem } from "@/components/portal/Tabs";
import { ClientTdsTab, PurchaseGstTab, SalesGstTab, VendorTdsTab } from "@/components/portal/taxation/TaxRegisters";
import { useApi } from "@/lib/useApi";
import { useMonth, withMonth } from "@/lib/month";
import { formatINR } from "@/lib/utils";
import type { TaxationSummary } from "@/lib/api";

type TabKey = "sales" | "purchases" | "client-tds" | "vendor-tds";

export default function TaxationPage() {
  const [month] = useMonth();
  const { data, loading, refetch } = useApi<TaxationSummary>(withMonth("/taxation/summary", month));
  const [tab, setTab] = useState<TabKey>("sales");

  const amount = (value: number | undefined) => (loading ? "—" : <AnimatedNumber value={value ?? 0} format={formatINR} />);

  const tabs: TabItem<TabKey>[] = [
    { key: "sales", label: "GST on sales" },
    { key: "purchases", label: "GST on purchases" },
    { key: "client-tds", label: "TDS by clients", badge: data?.client_tds_certificates_pending },
    { key: "vendor-tds", label: "TDS on vendors", badge: data?.vendor_tds_overdue_count },
  ];

  const gstSub = data
    ? data.gst_credit_carried > 0
      ? `Input credit exceeds sales GST: ${formatINR(data.gst_credit_carried)} carried forward`
      : `${formatINR(data.output_gst.total)} on sales less ${formatINR(data.input_gst.total)} input credit`
    : "Sales GST less input credit";
  const tdsSub = data
    ? data.vendor_tds_overdue_count > 0
      ? `⚠ ${data.vendor_tds_overdue_count} overdue. Due by the 7th of the next month`
      : "Due by the 7th of the next month (30 April for March)"
    : "";

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Taxation"
          description="GST on what you sell and buy, and TDS deducted on both sides, for the chosen month."
          action={<MonthFilter />}
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="GST to pay" value={amount(data?.net_gst_payable)} sub={gstSub} />
          <MetricCard label="GST on sales" value={amount(data?.output_gst.total)} sub={`${data?.sales_count ?? 0} tax invoices`} />
          <MetricCard
            label="Input GST credit"
            value={amount(data?.input_gst.total)}
            sub={data?.input_gst_ineligible ? `${formatINR(data.input_gst_ineligible)} not claimable (no vendor GSTIN)` : `${data?.purchase_count ?? 0} vendor bills`}
          />
          <MetricCard label="Vendor TDS to deposit" value={amount(data?.vendor_tds_to_deposit)} sub={tdsSub} />
        </div>

        <div className="flex flex-col gap-5">
          <Tabs tabs={tabs} active={tab} onChange={setTab} layoutId="taxation-tab" label="Tax registers" />
          <TabIntro tab={tab} summary={data} />
          {tab === "sales" && <SalesGstTab month={month} />}
          {tab === "purchases" && <PurchaseGstTab month={month} />}
          {tab === "client-tds" && <ClientTdsTab month={month} onChanged={refetch} />}
          {tab === "vendor-tds" && <VendorTdsTab month={month} onChanged={refetch} />}
        </div>
      </div>
    </PortalShell>
  );
}

/** One line on what the register is and the figure that matters in it. */
function TabIntro({ tab, summary }: { tab: TabKey; summary: TaxationSummary | null }) {
  const s = summary;
  const text: Record<TabKey, string> = {
    sales: `GST charged on tax invoices issued this month (output GST).${s ? ` CGST ${formatINR(s.output_gst.cgst)}, SGST ${formatINR(s.output_gst.sgst)}, IGST ${formatINR(s.output_gst.igst)}.` : ""}`,
    purchases: "GST on vendor bills. It reduces the GST you pay only when the vendor has a GSTIN.",
    "client-tds": `TDS clients deducted from their payments to us${s ? ` (${formatINR(s.client_tds_deducted)})` : ""}. Collect each client's Form 16A so the credit can be claimed in our return.`,
    "vendor-tds": `TDS we deducted from vendor bills${s ? ` (${formatINR(s.vendor_tds_deducted)}, ${formatINR(s.vendor_tds_deposited)} deposited)` : ""}. Deposit it with the government by the due date and record the challan.`,
  };
  return <p className="text-sm font-light text-secondary">{text[tab]}</p>;
}
