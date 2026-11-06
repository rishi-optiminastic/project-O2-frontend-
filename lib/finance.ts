/** Types for documents, vendor bills, approvals, reports, reconciliation, GST filing, profitability and exports. */

import type { Approval, ApprovalAction, BankStatement, BankTransaction, Role, VendorReport } from "@/lib/api";

/** A file attached to a record. Its bytes are fetched from /documents/{id}/content by a logged-in user. */
export interface DocumentFile {
  id: number;
  entity_type: string;
  entity_id: number;
  category: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  version: number;
  version_group: string;
  is_current: boolean;
  note: string | null;
  uploaded_by_id: number | null;
  uploaded_by_name: string | null;
  created_at: string;
  removed_at: string | null;
  removed_reason: string | null;
}

export interface TeamOption {
  id: number;
  name: string;
  role: Role;
}

export interface ProjectExpense {
  id: number;
  description: string;
  category: string | null;
  amount: number;
  expense_date: string;
  is_paid: boolean;
  created_at: string;
}

export interface ProjectReportSummary {
  id: number;
  vendor_id: number | null;
  vendor_name: string | null;
  report_type: string | null;
  reporting_period: string | null;
  review_status: string;
  version: number;
  due_date: string | null;
  submission_date: string | null;
  decided_at: string | null;
}

export const VENDOR_BILL_STATUSES = ["Invoice Created", "Submitted", "Under Review", "Approved", "Rejected", "Cancelled"] as const;

/** A vendor invoice with its review stage and payment position. */
export interface VendorBill {
  id: number;
  vendor_id: number;
  vendor_name: string;
  project_id: number | null;
  project_code: string | null;
  invoice_number: string;
  invoice_date: string;
  invoice_amount: number;
  gst_amount: number;
  gst_rate: number | null;
  is_interstate: boolean;
  tds_section: string | null;
  tds_rate: number;
  tds_amount: number;
  net_payable: number;
  gross_amount: number;
  report_submitted: boolean;
  bill_status: (typeof VENDOR_BILL_STATUSES)[number];
  /** Review stage, or the payment stage once approved (CFO Approval ... Released, Reconciled). */
  stage: string;
  revision: number;
  created_by_id: number | null;
  submitted_at: string | null;
  reviewed_by_id: number | null;
  reviewed_at: string | null;
  review_comment: string | null;
  cancel_reason: string | null;
  approval_id: number | null;
  approval_status: string | null;
  payment_reference: string | null;
  released_at: string | null;
  bank_verification: string;
  created_at: string;
}

export interface StatusChange {
  id: number;
  field: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  user_name: string | null;
  created_at: string;
}

export interface VendorBillDetail extends VendorBill {
  history: StatusChange[];
  revisions: { id: number; revision: number; reason: string; before: string; after: string; user_name: string | null; created_at: string }[];
  approvals: (Approval & { actions: ApprovalAction[] })[];
  bank_matches: { transaction_id: number; amount: number; status: string; txn_date: string | null; utr: string | null; confirmed_at: string | null }[];
}

export interface ApprovalDeskData {
  stage: "cfo" | "ceo";
  pending: Approval[];
  approved: Approval[];
  rejected: Approval[];
}

export interface ReportSubmission {
  id: number;
  version: number;
  note: string | null;
  submitted_by_name: string | null;
  created_at: string;
  decision: string | null;
  decision_comment: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  documents: DocumentFile[];
}

export interface VendorReportDetail extends VendorReport {
  submissions: ReportSubmission[];
  history: { from: string | null; to: string; note: string | null; by: string | null; at: string }[];
  email_logs: { id: number; to_email: string; subject: string; delivery_status: string; sent_by: string | null; created_at: string }[];
}

export interface ImportPreviewRow {
  line: number;
  txn_date: string | null;
  value_date: string | null;
  narration: string | null;
  reference: string | null;
  utr: string | null;
  direction: "CREDIT" | "DEBIT" | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  errors: string[];
  duplicate: boolean;
}

export interface ImportPreviewData {
  statement: BankStatement;
  columns: string[];
  mapping: Record<string, string | null>;
  roles: Record<string, string>;
  templates: Record<string, string>;
  template: string;
  problems: string[];
  rows: ImportPreviewRow[];
  importable: number;
  error_rows: number;
  duplicate_rows: number;
  credits_total: number;
  debits_total: number;
  duplicate_statement_of: number | null;
}

export interface MatchLinkView {
  id: number;
  status: string;
  amount: number;
  confidence: number;
  reasons: string[];
  target: string | null;
  record: { kind: "payment" | "invoice" | "approval"; id: number; invoice_id?: number; vendor_invoice_id?: number | null } | null;
  invoice_id: number | null;
  is_manual: boolean;
  override_reason: string | null;
  confirmed_at: string | null;
  reversal_reason: string | null;
}

export interface WorkspaceTxn extends BankTransaction {
  statement_file: string | null;
  bank_name: string | null;
  open_amount: number;
  links: MatchLinkView[];
  suggestions: MatchLinkView[];
  history: MatchLinkView[];
  comments: { id: number; user_name: string | null; body: string; created_at: string }[];
  evidence: { id: number; file_name: string; category: string }[];
}

export interface WorkspaceData {
  matched: WorkspaceTxn[];
  unmatched: WorkspaceTxn[];
  mismatched: WorkspaceTxn[];
  counts: { matched: number; unmatched: number; mismatched: number };
}

export interface GstFiling {
  id: number;
  period: string;
  gstr1_status: "Not Filed" | "Filed";
  gstr1_due_date: string;
  gstr1_filed_on: string | null;
  gstr1_arn: string | null;
  gstr3b_status: "Not Filed" | "Filed";
  gstr3b_due_date: string;
  gstr3b_filed_on: string | null;
  gstr3b_arn: string | null;
  tax_liability: number;
  tax_paid: number;
  outstanding: number;
  payment_reference: string | null;
  payment_date: string | null;
  reconciliation_status: "Not Reconciled" | "Reconciled" | "Mismatch";
  notes: string | null;
}

export interface FilingAlerts {
  alerts: { period: string; form: string; due_date: string; days_left: number; level: "overdue" | "due_soon"; filing_id: number | null }[];
  outstanding_tax: number;
  unreconciled_periods: string[];
}

export const GST_STATUSES = [
  "GST Pending Collection",
  "GST Collected",
  "GST Payment Pending",
  "GST Paid",
  "GST Reconciled",
  "GST On Hold",
] as const;

export interface ProfitFigures {
  agreed_revenue: number;
  invoiced_revenue: number;
  collected_revenue: number;
  outstanding_receivables: number;
  vendor_invoiced: number;
  vendor_approved: number;
  vendor_paid: number;
  other_expenses: number;
  other_expenses_paid: number;
  outstanding_payables: number;
  committed_vendor_cost: number;
  budget: number;
  cash_in: number;
  cash_out: number;
  direct_costs: number;
  estimated_profit: number;
  estimated_margin_pct: number | null;
  actual_profit: number;
  gross_margin_pct: number | null;
  budget_vs_actual: number;
  net_cash_flow: number;
}

export interface ProfitabilityData {
  company: ProfitFigures;
  projects: (ProfitFigures & { project_id: number; code: string; title: string; client_name: string | null; status: string })[];
  clients: (ProfitFigures & { client_id: number; client_name: string | null })[];
  vendors: (ProfitFigures & { vendor_id: number; vendor_name: string | null })[];
}

export interface ExportReportDef {
  key: string;
  group: string;
  label: string;
  filters: string[];
  columns: string[];
}

export interface ExportLogRow {
  id: number;
  user_name: string | null;
  report: string;
  format: string;
  filters: string | null;
  row_count: number;
  created_at: string;
}

/** Human file size: 2.4 MB. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
