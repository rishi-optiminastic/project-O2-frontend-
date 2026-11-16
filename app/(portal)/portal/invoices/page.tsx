"use client";

import { useState, useSyncExternalStore } from "react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading } from "@/components/portal/ui";
import { useAuth } from "@/lib/auth";
import { OverviewTab } from "@/components/portal/invoices/OverviewTab";
import { PaymentReceivedTab } from "@/components/portal/invoices/PaymentReceivedTab";
import { VendorInvoicesTab, VendorPaymentsTab } from "@/components/portal/invoices/VendorInvoicesTab";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { Tabs, type TabItem } from "@/components/portal/Tabs";

/** The three kinds of invoice. Proforma (PI) and tax (TI) invoices are client invoices. */
type InvoiceType = "pi" | "ti" | "vendor";
type ViewKey = "overview" | "receipts";

const TYPES: TabItem<InvoiceType>[] = [
  { key: "pi", label: "Proforma Invoice" },
  { key: "ti", label: "Tax Invoice" },
  { key: "vendor", label: "Vendor Invoice" },
];

const DESCRIPTIONS: Record<InvoiceType, string> = {
  pi: "Client proformas: raised against a project, approved by a coordinator, then confirmed by the client.",
  ti: "Client tax invoices issued from approved proformas. They lock once a receipt is recorded.",
  vendor: "Bills from vendors, with the GST and TDS on each, and the payments made against them.",
};

// The chosen type lives in the URL (?type=ti), so a refresh or a shared link keeps it.
const listeners = new Set<() => void>();
function readType(): InvoiceType {
  const t = new URLSearchParams(window.location.search).get("type");
  return t === "ti" || t === "vendor" ? t : "pi";
}
function writeType(next: InvoiceType) {
  const url = new URL(window.location.href);
  if (next === "pi") url.searchParams.delete("type");
  else url.searchParams.set("type", next);
  window.history.replaceState(window.history.state, "", url);
  listeners.forEach((notify) => notify());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

export default function InvoicesPage() {
  const { hasRole } = useAuth();
  // Receipts and payouts are NON_EXEC-only, mirroring the server guards on
  // /taxation/* and /approvals.
  const canFinance = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const type = useSyncExternalStore(subscribe, readType, () => "pi" as const);
  const [view, setView] = useState<ViewKey>("overview");

  const views: TabItem<ViewKey>[] = [
    { key: "overview", label: "Overview" },
    ...(canFinance ? [{ key: "receipts" as const, label: "Receipts" }] : []),
  ];
  const active: ViewKey = views.some((v) => v.key === view) ? view : "overview";

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading title="Invoices" description={DESCRIPTIONS[type]} action={<MonthFilter />} />

        {/* Invoice type on the left, Overview / Receipts on the right, on one line from tablet width up. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs tabs={TYPES} active={type} onChange={writeType} layoutId="invoice-type" label="Invoice type" />
          {views.length > 1 && <Tabs tabs={views} active={active} onChange={setView} layoutId="invoice-view" label="Invoice views" />}
        </div>

        {type === "pi" && (active === "overview" ? <OverviewTab key="pi" kind="proforma" /> : <PaymentReceivedTab kind="proforma" />)}
        {type === "ti" && (active === "overview" ? <OverviewTab key="ti" kind="tax" /> : <PaymentReceivedTab kind="tax" />)}
        {type === "vendor" && (active === "overview" ? <VendorInvoicesTab /> : <VendorPaymentsTab />)}
      </div>
    </PortalShell>
  );
}
