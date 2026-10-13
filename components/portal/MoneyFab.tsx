"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import { RecordReceiptModal } from "@/components/portal/invoices/RecordReceipt";
import { CreateApproval } from "@/components/portal/PayoutPanel";
import { useAuth } from "@/lib/auth";

type Dialog = "receipt" | "payment" | null;

const fabClass =
  "fixed bottom-4 right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-white shadow-[0_18px_40px_-14px_rgba(17,17,17,0.6)] outline-none transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 md:bottom-8 md:right-8";

const itemClass =
  "flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none transition-colors data-[highlighted]:bg-foreground/[0.05]";

/**
 * Floating button, bottom right on every portal page, for the two money
 * entries the team makes most: a receipt from a client and a payment out.
 * Roles that cannot raise payments get the receipt straight away.
 */
export function MoneyFab() {
  const pathname = usePathname();
  const { hasRole } = useAuth();
  const [dialog, setDialog] = useState<Dialog>(null);
  const canRequestPayment = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  // On an invoice's own page the receipt is most likely for that invoice.
  const match = pathname.match(/^\/portal\/invoices\/(\d+)$/);
  const invoiceId = match ? Number(match[1]) : undefined;

  const close = (open: boolean) => !open && setDialog(null);

  return (
    <>
      {canRequestPayment ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" aria-label="Record a receipt or a payment" className={`${fabClass} group`}>
              <Plus className="h-5 w-5 transition-transform group-data-[state=open]:rotate-45" strokeWidth={1.8} />
              Record
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="top"
              align="end"
              sideOffset={10}
              className="popover-surface z-[110] w-72 rounded-2xl p-2 shadow-[0_30px_60px_-30px_rgba(17,17,17,0.35)]"
            >
              <DropdownMenu.Item onSelect={() => setDialog("receipt")} className={itemClass}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                  <ArrowDownLeft className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <span>
                  <span className="block font-medium">Record receipt</span>
                  <span className="block text-xs text-ink-40">Money in from a client, against an invoice</span>
                </span>
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => setDialog("payment")} className={itemClass}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                  <ArrowUpRight className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <span>
                  <span className="block font-medium">Record payment</span>
                  <span className="block text-xs text-ink-40">Money out to a vendor, after CFO and CEO approval</span>
                </span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : (
        <button type="button" onClick={() => setDialog("receipt")} aria-label="Record a receipt from a client" className={fabClass}>
          <ArrowDownLeft className="h-5 w-5" strokeWidth={1.6} />
          Record receipt
        </button>
      )}

      <RecordReceiptModal open={dialog === "receipt"} onOpenChange={close} invoiceId={invoiceId} />
      {canRequestPayment && <CreateApproval open={dialog === "payment"} onOpenChange={close} />}
    </>
  );
}
