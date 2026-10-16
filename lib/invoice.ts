import { indiaToday } from "@/lib/validation";
import type { Invoice } from "@/lib/api";

/** The date that identifies the document: tax invoice date once issued, else the proforma date. */
export function documentDate(inv: Pick<Invoice, "invoice_date" | "proforma_date" | "created_at">): string {
  return inv.invoice_date ?? inv.proforma_date ?? inv.created_at;
}

export function documentKind(inv: Pick<Invoice, "is_issued">): "Tax invoice" | "Proforma" {
  return inv.is_issued ? "Tax invoice" : "Proforma";
}

/** Steps shown in the invoice stage tracker, in order. */
export const WORKFLOW_STEPS = [
  { key: "draft", label: "Proforma" },
  { key: "manager", label: "Manager approval" },
  { key: "client", label: "Client confirmation" },
  { key: "issued", label: "Tax invoice sent" },
] as const;

/** Index of the step in progress in WORKFLOW_STEPS (the issued step is complete once issued). */
export function workflowStep(inv: Pick<Invoice, "status" | "is_issued">): number {
  if (inv.is_issued) return 3;
  switch (inv.status) {
    case "Client Approved":
      return 3;
    case "Awaiting Client":
      return 2;
    default:
      return 1; // Draft, Changes Requested: waiting for a manager to approve and send it
  }
}

/** A tax invoice is to be paid in full by this day of the month after its date. */
export const PAYMENT_DUE_DAY = 15;

/** The 15th of the month after ``isoDate`` (YYYY-MM-DD), as YYYY-MM-DD. */
export function paymentDueISO(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return `${next.y}-${String(next.m).padStart(2, "0")}-${PAYMENT_DUE_DAY}`;
}

/** The tax invoice date an issue today would give: the proforma date when it is in this month, else today. */
export function taxInvoiceDateISO(proformaDate: string | null): string {
  const today = indiaToday();
  return proformaDate && proformaDate <= today && proformaDate.slice(0, 7) === today.slice(0, 7) ? proformaDate : today;
}

/** Last day of the current month as YYYY-MM-DD in the user's local calendar: the default due date. */
export function monthEndISO(today: Date = new Date()): string {
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
}

/** The 1st of the current month in India as YYYY-MM-DD: the earliest a new proforma can be dated. */
export function monthStartISO(): string {
  return `${indiaToday().slice(0, 8)}01`;
}
