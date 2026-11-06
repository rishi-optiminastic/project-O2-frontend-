"use client";

import { useState } from "react";
import { Check, Mail, Send, X, Eye, Download } from "lucide-react";
import { Field, inputClass, StatusPill } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { fileSize, type VendorReportDetail } from "@/lib/finance";
import { DOC_CATEGORIES } from "@/components/portal/Attachments";
import { formatDate } from "@/lib/utils";

const SUBMITTABLE = ["Pending Submission", "Rejected"];
const AWAITING = ["Submitted", "Resubmitted", "Under Review"];

/** One vendor report: submit files as a new version, review, approve or reject, resubmit, email. */
export function ReportDetailModal({ reportId, onClose, onChanged }: { reportId: number; onClose: () => void; onChanged: () => void }) {
  const { hasRole } = useAuth();
  const canReview = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const { data: report, refetch } = useApi<VendorReportDetail>(`/reports/${reportId}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, message?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setComment("");
      if (message) setNotice(message);
      refetch();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function email() {
    await run(async () => {
      const log = await api.post<{ delivery_status: string; to_email: string }>(`/reports/${reportId}/email`, {});
      setNotice(`${log.delivery_status} · ${log.to_email}`);
    });
  }

  if (!report) {
    return (
      <Modal open onOpenChange={(o) => !o && onClose()} title="Report">
        <p className="text-sm text-ink-40">Loading…</p>
      </Modal>
    );
  }
  const s = report.review_status;

  return (
    <Modal
      open
      size="wide"
      onOpenChange={(o) => !o && onClose()}
      title={`${report.report_type ?? "Report"} · ${report.project_name}`}
      description={[report.reporting_period, report.due_date ? `due ${formatDate(report.due_date)}` : null, `version ${report.version}`].filter(Boolean).join(" · ")}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status={s} />
          {report.internal_reviewer && <span className="text-xs text-ink-40">Reviewer: {report.internal_reviewer}</span>}
          {report.decided_at && <span className="text-xs text-ink-40">Decided {formatDate(report.decided_at)}</span>}
        </div>
        {s === "Rejected" && report.decision_comment && (
          <p className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">Rejected: {report.decision_comment}</p>
        )}

        {SUBMITTABLE.includes(s) && <SubmitForm reportId={reportId} resubmit={s === "Rejected"} busy={busy} onSubmit={(fields) => run(() => api.form(`/reports/${reportId}/submissions`, fields), "Submitted for review.")} />}

        {canReview && (s === "Submitted" || s === "Resubmitted") && (
          <Button size="sm" variant="secondary" magnetic={false} disabled={busy} onClick={() => run(() => api.post(`/reports/${reportId}/review`))}>
            <Eye className="h-4 w-4" /> Start review
          </Button>
        )}
        {canReview && AWAITING.includes(s) && (
          <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
            <p className="text-sm font-medium">Decision on version {report.version}</p>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Comment (required to reject)"
              className={`${inputClass} h-auto py-2.5`} />
            <div className="flex gap-3">
              <Button size="sm" magnetic={false} disabled={busy} onClick={() => run(() => api.post(`/reports/${reportId}/decision`, { approve: true, comment: comment || null }))}>
                <Check className="h-4 w-4" /> Approve
              </Button>
              <Button size="sm" variant="secondary" magnetic={false} disabled={busy || !comment.trim()}
                onClick={() => run(() => api.post(`/reports/${reportId}/decision`, { approve: false, comment }))}>
                <X className="h-4 w-4" /> Reject
              </Button>
            </div>
          </div>
        )}
        {canReview && (s === "Approved" || s === "Sent to Client") && (
          <Button size="sm" magnetic={false} disabled={busy} onClick={email}>
            <Mail className="h-4 w-4" /> Email the approved report to the client
          </Button>
        )}
        {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
        {notice && <p role="status" className="text-sm text-success">{notice}</p>}

        <section className="flex flex-col gap-3">
          <h3 className="text-xs tracking-eyebrow text-secondary">Submissions</h3>
          {report.submissions.length ? report.submissions.map((sub) => (
            <div key={sub.id} className="rounded-2xl border border-line bg-white/50 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">Version {sub.version}</span>
                <span className="text-xs text-ink-40">{sub.submitted_by_name} · {formatDate(sub.created_at)}</span>
              </div>
              {sub.note && <p className="mt-1 text-xs text-secondary">{sub.note}</p>}
              <ul className="mt-2 flex flex-col gap-1">
                {sub.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>{d.file_name} · {d.category} · {fileSize(d.size_bytes)}</span>
                    <button onClick={() => api.download(`/documents/${d.id}/content`, d.file_name)} className="inline-flex items-center gap-1 text-secondary hover:text-foreground">
                      <Download className="h-3.5 w-3.5" /> Download
                    </button>
                  </li>
                ))}
              </ul>
              {sub.decision && (
                <p className="mt-2 text-xs">
                  <StatusPill status={sub.decision} /> {sub.decided_by_name} · {sub.decided_at ? formatDate(sub.decided_at) : ""}
                  {sub.decision_comment && <> · {sub.decision_comment}</>}
                </p>
              )}
            </div>
          )) : <p className="text-sm text-ink-40">Nothing submitted yet.</p>}
        </section>

        {report.history.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs tracking-eyebrow text-secondary">History</h3>
            <ol className="flex flex-col gap-1 text-xs text-ink-40">
              {report.history.map((h, i) => (
                <li key={i}>{formatDate(h.at)} · {h.by}: {h.from ?? "—"} → <span className="text-foreground">{h.to}</span>{h.note && <> · {h.note}</>}</li>
              ))}
            </ol>
          </section>
        )}
        {report.email_logs.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs tracking-eyebrow text-secondary">Emails</h3>
            <ol className="flex flex-col gap-1 text-xs text-ink-40">
              {report.email_logs.map((e) => <li key={e.id}>{formatDate(e.created_at)} · {e.to_email} · {e.delivery_status} · {e.sent_by}</li>)}
            </ol>
          </section>
        )}
      </div>
    </Modal>
  );
}

type Pick = { file: File; category: string };

function SubmitForm({ resubmit, busy, onSubmit }: {
  reportId: number; resubmit: boolean; busy: boolean; onSubmit: (fields: Record<string, string | Blob | (string | Blob)[] | null>) => void;
}) {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
      <p className="text-sm font-medium">{resubmit ? "Resubmit with corrected files" : "Submit the report"}</p>
      <p className="text-xs text-secondary">Reports, progress or completion reports, photographs, deliverables and other evidence. PDF, JPG, PNG, XLS, XLSX · up to 10 MB each.</p>
      <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx"
        onChange={(e) => setPicks(Array.from(e.target.files ?? []).map((file) => ({ file, category: file.type.startsWith("image/") ? "photo" : "report" })))}
        className={`${inputClass} h-auto py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-mist file:px-3 file:py-1.5 file:text-sm`} />
      {picks.map((p, i) => (
        <div key={i} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2">
          <span className="truncate text-xs">{p.file.name}</span>
          <Select value={p.category} onValueChange={(v) => setPicks((all) => all.map((x, j) => (j === i ? { ...x, category: v } : x)))}
            options={DOC_CATEGORIES.vendor_report_submission} />
        </div>
      ))}
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </Field>
      <div className="flex justify-end">
        <Button size="sm" magnetic={false} disabled={busy || picks.length === 0}
          onClick={() => onSubmit({ files: picks.map((p) => p.file), categories: picks.map((p) => p.category), note: note || null })}>
          <Send className="h-4 w-4" /> {resubmit ? "Resubmit" : "Submit"} {picks.length ? `${picks.length} file(s)` : ""}
        </Button>
      </div>
    </div>
  );
}

export function NewReportModal({ onClose, onCreated, projectId }: { onClose: () => void; onCreated: (id: number) => void; projectId?: number }) {
  const { data: projects } = useApi<{ id: number; code: string; title: string; vendors: { vendor_id: number; vendor_name: string }[] }[]>("/projects");
  const [project, setProject] = useState<string | undefined>(projectId ? String(projectId) : undefined);
  const [vendor, setVendor] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const chosen = projects?.find((p) => String(p.id) === project);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<{ id: number }>("/reports", {
        project_id: Number(project), vendor_id: Number(vendor),
        report_type: fd.get("report_type") || null, reporting_period: fd.get("reporting_period") || null,
        due_date: fd.get("due_date") || null, remarks: fd.get("remarks") || null,
      });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the report");
      setSaving(false);
    }
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Expect a vendor report"
      description="Record a report a vendor owes on a project. Its files are added when it is submitted.">
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Project">
          <Select value={project} onValueChange={(v) => { setProject(v); setVendor(undefined); }} placeholder="Choose a project"
            options={(projects ?? []).map((p) => ({ value: String(p.id), label: `${p.code} · ${p.title}` }))} />
        </Field>
        <Field label="Vendor">
          <Select key={project} value={vendor} onValueChange={setVendor} placeholder={chosen ? "Choose the vendor" : "Choose the project first"}
            options={(chosen?.vendors ?? []).map((v) => ({ value: String(v.vendor_id), label: v.vendor_name }))} />
        </Field>
        <Field label="Report type"><input name="report_type" maxLength={80} placeholder="Completion / Progress / Research" className={inputClass} /></Field>
        <Field label="Reporting period"><input name="reporting_period" maxLength={80} placeholder="Q3 2026" className={inputClass} /></Field>
        <Field label="Due date (default: the project's report date)"><input name="due_date" type="date" className={inputClass} /></Field>
        <Field label="Remarks"><input name="remarks" className={inputClass} /></Field>
        {error && <p role="alert" className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onClose}>Cancel</Button>
          <Button type="submit" magnetic={false} disabled={saving || !project || !vendor}>{saving ? "Saving…" : "Create"}</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
