import type { Invoice, Project } from "@/lib/api";

/** Our GST state when COMPANY_GSTIN is not set: 27, Maharashtra. */
export const DEFAULT_HOME_STATE_CODE = "27";

/**
 * Whether a client is billed IGST: their GSTIN state code differs from ours.
 * Null when the client has no GSTIN, so the user decides.
 */
export function isInterstate(clientGstin: string | null | undefined, homeStateCode: string | null | undefined): boolean | null {
  const code = clientGstin?.trim().slice(0, 2);
  if (!code || !/^\d{2}$/.test(code)) return null;
  return code !== (homeStateCode ?? DEFAULT_HOME_STATE_CODE);
}

/** Select value meaning "not billed against a project". */
export const NO_PROJECT = "none";

export function projectOptions(projects: Pick<Project, "id" | "code" | "title">[]) {
  return [
    { value: NO_PROJECT, label: projects.length ? "No project" : "No project (this client has none)" },
    ...projects.map((p) => ({ value: String(p.id), label: `${p.code} · ${p.title}` })),
  ];
}

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
  { key: "client", label: "Client approval" },
  { key: "manager", label: "Manager approval" },
  { key: "issued", label: "Tax invoice sent" },
] as const;

/** Index of the current step in WORKFLOW_STEPS. */
export function workflowStep(inv: Pick<Invoice, "status" | "is_issued">): number {
  if (inv.is_issued) return 3;
  switch (inv.status) {
    case "Client Approved":
      return 2;
    case "Awaiting Client":
      return 1;
    default:
      return 0; // Draft, Changes Requested
  }
}

/** Last day of the current month as YYYY-MM-DD in the user's local calendar: the default due date. */
export function monthEndISO(today: Date = new Date()): string {
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
}
