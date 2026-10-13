"use client";

import { useState } from "react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading } from "@/components/portal/ui";
import { useAuth } from "@/lib/auth";
import { OverviewTab } from "@/components/portal/invoices/OverviewTab";
import { PaymentReceivedTab } from "@/components/portal/invoices/PaymentReceivedTab";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { Tabs, type TabItem } from "@/components/portal/Tabs";

type TabKey = "overview" | "received";

export default function InvoicesPage() {
  const { hasRole } = useAuth();
  // Receipts (TDS/GST) is NON_EXEC-only, mirroring the server guard on
  // /taxation/*. Outgoing payouts live on the Approvals page.
  const canFinance = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const [tab, setTab] = useState<TabKey>("overview");

  const tabs: TabItem<TabKey>[] = [
    { key: "overview", label: "Overview" },
    ...(canFinance ? [{ key: "received" as const, label: "Receipts" }] : []),
  ];

  const active: TabKey = tabs.some((t) => t.key === tab) ? tab : "overview";

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Client Invoices"
          description="A single source of truth. Invoices lock automatically once a receipt is recorded."
          action={<MonthFilter />}
        />

        {tabs.length > 1 && <Tabs tabs={tabs} active={active} onChange={setTab} layoutId="invoice-tab" label="Invoice views" />}

        {active === "overview" && <OverviewTab />}
        {active === "received" && <PaymentReceivedTab />}
      </div>
    </PortalShell>
  );
}
