/** Typed client for the Project O2 FastAPI backend. */

import { describeValidationErrors } from "@/lib/validation";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8009/api";

/** Only emails on this domain may sign up or be invited (mirrors backend WORKSPACE_EMAIL_DOMAIN). */
export const WORKSPACE_EMAIL_DOMAIN =
  process.env.NEXT_PUBLIC_WORKSPACE_EMAIL_DOMAIN ?? "optiminastic.com";

/** True if the email belongs to the workspace domain. */
export function isWorkspaceEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith("@" + WORKSPACE_EMAIL_DOMAIN.toLowerCase());
}

const TOKEN_KEY = "o2_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  // Skip ngrok's browser-warning interstitial when the app is served through a tunnel.
  headers.set("ngrok-skip-browser-warning", "true");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  if (!res.ok) {
    // A proxy or crash page is not JSON; fall back to the status line.
    const detail = (() => {
      try {
        return errorMessage(JSON.parse(text).detail);
      } catch {
        return "";
      }
    })();
    throw new ApiError(res.status, detail || res.statusText || "Request failed");
  }
  return (text ? JSON.parse(text) : null) as T;
}

function errorMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return describeValidationErrors(detail);
  return detail ? JSON.stringify(detail) : "";
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  /** Download a file the API generates (e.g. a PDF) and save it under `filename`. */
  async download(path: string, filename: string) {
    const token = getToken();
    const res = await fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new ApiError(res.status, errorMessage(d.detail) || "Download failed");
    }
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },

  async login(email: string, password: string) {
    const form = new URLSearchParams({ username: email, password });
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      const fallback = res.status >= 500 ? "The server is not responding. Try again in a minute." : "Login failed";
      throw new ApiError(res.status, errorMessage(d.detail) || fallback);
    }
    return (await res.json()) as { access_token: string; token_type: string };
  },

  /** Verify a GSTIN and (when a provider key is configured) fetch its details. */
  lookupGst(gstin: string) {
    return request<GstLookupResult>(`/gst/${encodeURIComponent(gstin.trim().toUpperCase())}`);
  },

  /** Send a single file as multipart form data under the field name "file". */
  upload<T>(path: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    return request<T>(path, { method: "POST", body: fd });
  },

  uploadStatement(file: File, bankName: string, accountNumber: string) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("bank_name", bankName);
    fd.append("account_number", accountNumber);
    return request<BankStatementDetail>("/verification/statements", { method: "POST", body: fd });
  },
};

/* ----------------------------- Types ----------------------------- */

export type Role = "ADMIN_CEO" | "CFO" | "FINANCE_MANAGER" | "FINANCE_EXECUTIVE";

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
}

export interface SignupAvailability {
  available: boolean;
}

export interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at?: string | null;
}

export type InvitationStatus = "Pending" | "Accepted" | "Revoked";

export interface Invitation {
  id: number;
  name: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  expires_at: string;
  accepted_at?: string | null;
  created_at: string;
  accept_url?: string | null;
  email_sent?: boolean | null;
}

export interface InvitePreview {
  name: string;
  email: string;
  role: Role;
  valid: boolean;
}

export interface DashboardSummary {
  total_clients: number;
  total_vendors: number;
  total_invoices: number;
  net_receivable: number;
  net_payable: number;
  pending_approvals: number;
  /** Output GST less input credit for the period, never negative. */
  gst_payable: number;
  reconciliation_rate: number;
  recent_invoices: RecentInvoice[];
  approvals_queue: ApprovalQueueItem[];
  cashflow: { label: string; value: number }[];
}

export interface CashflowPoint {
  label: string;
  value: number;
}

export interface GstLookupResult {
  gstin: string;
  valid: boolean;
  pan?: string | null;
  state?: string | null;
  state_code?: string | null;
  legal_name?: string | null;
  trade_name?: string | null;
  address?: string | null;
  status?: string | null;
  source: "offline" | "appyflow";
  message?: string | null;
}

export interface RecentInvoice {
  id: number;
  invoice_number: string;
  client_id: number;
  total_amount: number;
  amount_pending: number;
  status: string;
  is_locked: boolean;
}

export interface ApprovalQueueItem {
  id: number;
  payee_name: string;
  amount: number;
  net_payable: number;
  status: string;
}

export interface Agent {
  id: number;
  business_name: string;
  legal_name?: string | null;
  contact_person?: string | null;
  email: string;
  phone?: string | null;
  address?: string | null;
  gst_number?: string | null;
  pan?: string | null;
  bank_account_holder?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
  commission_rate: number;
  is_active: boolean;
  /** The in-house agent "Opti": default for direct clients, never earns commission. */
  is_house: boolean;
  notes?: string | null;
  created_at: string;
}

/** A billable service. Choosing it on an invoice pre-fills description, SAC code and GST rate. */
export interface Service {
  id: number;
  title: string;
  description: string | null;
  sac_code: string | null;
  gst_rate: number;
  is_active: boolean;
  created_at: string;
}

/** Names-only agent entry for pickers; available to every finance role. */
export interface AgentOption {
  id: number;
  business_name: string;
  is_house: boolean;
}

export interface Client {
  id: number;
  business_name: string;
  legal_name?: string | null;
  email: string;
  phone?: string | null;
  billing_address?: string | null;
  gst_number?: string | null;
  coi?: string | null;
  category?: string | null;
  notes?: string | null;
  agent_id: number;
  created_at: string;
}

export interface Payment {
  id: number;
  invoice_id: number;
  amount: number;
  payment_date: string;
  bank_reference?: string | null;
  /** Always "Bank" for new payments; older ones may show NEFT, UPI, etc. */
  payment_mode: string;
  /** Bank account the money was received into; null on older payments. */
  bank_name: string | null;
  tds_deducted: number;
  gst_component: number;
  remarks?: string | null;
  attachment?: string | null;
}

export interface PaymentReceipt {
  id: number;
  invoice_id: number;
  invoice_number: string;
  client_id: number;
  amount: number;
  payment_date: string;
  payment_mode: string;
  bank_name: string | null;
  bank_reference?: string | null;
  tds_deducted: number;
  gst_component: number;
  remarks?: string | null;
}

/** Proforma stages come first; "Sent" onward is an issued GST tax invoice. */
export const PROFORMA_STAGES = ["Draft", "Awaiting Client", "Changes Requested", "Client Approved"] as const;

export interface Invoice {
  id: number;
  /** Tax invoice number; null until a manager issues the invoice. */
  invoice_number: string | null;
  proforma_number: string | null;
  /** Tax invoice number once issued, otherwise the proforma number. */
  display_number: string;
  is_issued: boolean;
  client_id: number;
  agent_id: number;
  invoice_date: string | null;
  proforma_date: string | null;
  due_date?: string | null;
  /** Null only on invoices raised before the service catalogue existed. */
  service_id: number | null;
  service_title: string | null;
  service_description?: string | null;
  sac_code?: string | null;
  taxable_value: number;
  gst_rate: number;
  gst_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  is_interstate: boolean;
  tds_applicable: boolean;
  tds_rate: number;
  expected_tds: number;
  total_amount: number;
  amount_received: number;
  amount_pending: number;
  status: string;
  gst_status: string;
  is_locked: boolean;
  locked_at?: string | null;
  supporting_document?: string | null;
  internal_remarks?: string | null;
  created_by_id: number | null;
  client_approved_at: string | null;
  client_approval_method: "link" | "manual" | null;
  client_approver_name: string | null;
  client_approval_note: string | null;
  change_request_note: string | null;
  change_requested_by: string | null;
  issued_by_id: number | null;
  issued_at: string | null;
  created_at: string;
  payments?: Payment[];
}

/** Result of a workflow step that may share a client link. */
export interface InvoiceWorkflowResult {
  invoice: Invoice;
  /** Shown so the team can share the link by hand when email is not configured. */
  link_url: string | null;
  emailed: boolean;
}

export interface InvoiceTimelineEntry {
  id: number;
  action: string;
  actor_name: string | null;
  actor_role: string | null;
  detail: string | null;
  created_at: string;
}

/** What a client sees at /i/<token>. */
export interface PublicInvoiceView {
  purpose: "approve" | "view";
  can_act: boolean;
  invoice: {
    display_number: string;
    is_issued: boolean;
    proforma_number: string | null;
    invoice_number: string | null;
    proforma_date: string | null;
    invoice_date: string | null;
    due_date: string | null;
    service_title: string | null;
    service_description: string | null;
    sac_code: string | null;
    taxable_value: number;
    gst_rate: number;
    gst_amount: number;
    cgst: number;
    sgst: number;
    igst: number;
    is_interstate: boolean;
    total_amount: number;
    status: string;
    client_approved_at: string | null;
    client_approver_name: string | null;
  };
  client: {
    business_name: string;
    legal_name: string | null;
    billing_address: string | null;
    gst_number: string | null;
  };
  company: {
    legal_name: string;
    address: string;
    gstin: string;
    state: string;
    pan: string;
    email: string;
    bank_name: string;
    bank_account: string;
    bank_ifsc: string;
  };
}

/** A bank account a vendor can be paid into. A vendor may have several. */
export interface VendorBankAccount {
  id?: number;
  account_holder: string;
  bank_name: string;
  account_number: string;
  ifsc_code: string;
}

export interface Vendor {
  id: number;
  business_name: string;
  legal_name?: string | null;
  contact_person?: string | null;
  email: string;
  phone?: string | null;
  address?: string | null;
  gst_number?: string | null;
  /** Udyam registration number; set only for MSME-registered vendors. */
  msme_number?: string | null;
  /** Certificate of Incorporation. */
  coi?: string | null;
  pan?: string | null;
  bank_accounts: VendorBankAccount[];
  tax_applicable?: boolean;
  compliance_documents?: string | null;
  annual_service_contract?: string | null;
  approval_status: string;
  is_verified: boolean;
  created_at: string;
}

export const PROJECT_STATUSES = ["Not Started", "In Progress", "Report Due", "Completed", "On Hold"] as const;

/** A vendor's share of a project, and the work order sent to them for it. */
export interface ProjectVendor {
  id: number;
  vendor_id: number;
  vendor_name: string;
  vendor_email: string;
  work_percent: number;
  /** Before GST. */
  agreed_cost: number;
  /** Vendor invoices recorded against this project, before GST. */
  invoiced: number;
  over_invoiced: boolean;
  work_order_number: string | null;
  work_order_date: string | null;
  work_order_sent_at: string | null;
  /** Share or cost changed after the work order was issued: send it again. */
  work_order_outdated: boolean;
}

export interface Project {
  id: number;
  /** The internal "HOC code". */
  code: string;
  title: string;
  brand: string | null;
  description: string | null;
  client_id: number | null;
  client_name: string | null;
  budget: number;
  start_date: string | null;
  end_date: string | null;
  expected_report_date: string | null;
  status: string;
  vendors: ProjectVendor[];
  work_percent_assigned: number;
  committed_cost: number;
  invoiced_cost: number;
  remaining_budget: number;
  over_budget: boolean;
  created_at: string;
}

export interface ProjectDetail extends Project {
  vendor_invoices: {
    id: number;
    vendor_id: number;
    vendor_name: string;
    invoice_number: string;
    invoice_date: string;
    invoice_amount: number;
    net_payable: number;
    status: string;
  }[];
}

export interface WorkOrderSent {
  work_order_number: string;
  to_email: string;
  emailed: boolean;
}

export interface VendorInvoice {
  id: number;
  vendor_id: number;
  project_id: number | null;
  invoice_number: string;
  invoice_date: string;
  invoice_amount: number;
  gst_amount: number;
  gst_rate: number | null;
  is_interstate: boolean;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  vendor_gstin: string | null;
  tds_section: string | null;
  tds_rate: number;
  tds_amount: number;
  net_payable: number;
  status: string;
}

/** TDS we deduct from vendor bills, by section. Mirrors TDS_SECTIONS in the backend. */
export const TDS_SECTIONS = [
  { key: "194C_FIRM", label: "194C contractor (company / firm)", rate: 2 },
  { key: "194C_INDIVIDUAL", label: "194C contractor (individual / HUF)", rate: 1 },
  { key: "194J_PROFESSIONAL", label: "194J professional fees", rate: 10 },
  { key: "194J_TECHNICAL", label: "194J technical services", rate: 2 },
  { key: "194H", label: "194H commission", rate: 2 },
  { key: "NONE", label: "No TDS", rate: 0 },
] as const;

export interface ApprovalAction {
  id: number;
  approver_name: string;
  approver_role: string;
  decision: string;
  comments?: string | null;
  created_at: string;
}

export interface Approval {
  id: number;
  payee_name: string;
  amount: number;
  purpose?: string | null;
  tax_deductions: number;
  net_payable: number;
  bank_details?: string | null;
  status: string;
  cfo_comment?: string | null;
  ceo_comment?: string | null;
  payment_reference?: string | null;
  released_at?: string | null;
  created_at: string;
  actions?: ApprovalAction[];
}

export interface BankTransaction {
  id: number;
  statement_id: number;
  txn_date?: string | null;
  amount: number;
  utr_reference?: string | null;
  narration?: string | null;
  counterparty?: string | null;
  verification_status: string;
  match_note?: string | null;
}

export interface BankStatement {
  id: number;
  file_name: string;
  bank_name?: string | null;
  account_number?: string | null;
  uploaded_by?: string | null;
  transaction_count: number;
  matched_count: number;
  created_at: string;
}

export interface BankStatementDetail extends BankStatement {
  transactions: BankTransaction[];
}

export interface GstTotals {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/** The month's tax position: GST to pay after input credit, and TDS on both sides. */
export interface TaxationSummary {
  output_gst: GstTotals;
  input_gst: GstTotals;
  input_gst_ineligible: number;
  net_gst_payable: number;
  gst_credit_carried: number;
  sales_count: number;
  purchase_count: number;
  client_tds_deducted: number;
  client_tds_certificates_pending: number;
  vendor_tds_deducted: number;
  vendor_tds_deposited: number;
  vendor_tds_to_deposit: number;
  vendor_tds_overdue_count: number;
}

export interface SalesGstRow {
  invoice_id: number;
  invoice_number: string;
  invoice_date: string;
  client_name: string;
  client_gstin: string | null;
  taxable_value: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  gst_amount: number;
  total_amount: number;
  /** Settled (cash plus client TDS) and still due, split into principal and GST pro rata. */
  paid_principal: number;
  paid_gst: number;
  pending_principal: number;
  pending_gst: number;
}

export interface PurchaseGstRow {
  vendor_invoice_id: number;
  vendor_id: number;
  invoice_number: string;
  invoice_date: string;
  vendor_name: string;
  vendor_gstin: string | null;
  taxable_value: number;
  /** Null on bills recorded before GST was split per bill. */
  gst_rate: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  gst_amount: number;
  itc_eligible: boolean;
}

export interface ClientTdsRow {
  payment_id: number;
  payment_date: string;
  invoice_id: number;
  invoice_number: string;
  client_name: string;
  tds_deducted: number;
  certificate_number: string | null;
  certificate_date: string | null;
}

export interface VendorTdsRow {
  vendor_invoice_id: number;
  vendor_id: number;
  invoice_number: string;
  invoice_date: string;
  vendor_name: string;
  vendor_pan: string | null;
  section_label: string;
  tds_rate: number;
  tds_amount: number;
  due_date: string;
  deposited_on: string | null;
  challan_number: string | null;
  overdue: boolean;
}

export interface AuditEntry {
  id: number;
  actor_name?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type: string;
  entity_id?: number | null;
  detail?: string | null;
  created_at: string;
}

export interface VendorReport {
  id: number;
  project_name: string;
  reporting_period?: string | null;
  report_type?: string | null;
  review_status: string;
  client_id?: number | null;
  vendor_id?: number | null;
  created_at: string;
}

/** One spreadsheet row of a bulk invoice upload, checked but not yet created. */
export interface BulkRow {
  row: number;
  client_input: string;
  client_name: string | null;
  service_input: string;
  service_title: string | null;
  amount: number | null;
  gst_rate: number | null;
  gst_amount: number | null;
  total_amount: number | null;
  description: string | null;
  due_date: string | null;
  tds_rate: number;
  is_interstate: boolean;
  errors: string[];
  warnings: string[];
}

export interface BulkPreview {
  rows: BulkRow[];
  /** True only when no row has an error; the upload is all or nothing. */
  ready: boolean;
  invoice_count: number;
  error_count: number;
  client_count: number;
  taxable_total: number;
  gst_total: number;
  grand_total: number;
}

export interface BulkCreated {
  created: number;
  invoices: { id: number; proforma_number: string; client_id: number; total_amount: number }[];
}
