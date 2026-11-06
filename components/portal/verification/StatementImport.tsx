"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { Panel, Field, inputClass, Table, Row, Cell } from "@/components/portal/ui";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/api";
import type { ImportPreviewData } from "@/lib/finance";
import { formatDate, formatINR } from "@/lib/utils";
import { FIELD_RULES } from "@/lib/validation";

const NONE = "__none";

/** Upload a statement, check every row in a preview, fix the column mapping if needed, then import. */
export function StatementImport({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [template, setTemplate] = useState<string>();
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [allowDuplicateFile, setAllowDuplicateFile] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function show(p: ImportPreviewData) {
    setPreview(p);
    setMapping(p.mapping);
    setTemplate(p.template);
  }

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData(e.currentTarget);
    setBusy("upload");
    setError(null);
    setDone(null);
    try {
      show(await api.form<ImportPreviewData>("/verification/imports", {
        file, bank_name: String(fd.get("bank_name") || "") || null, account_number: String(fd.get("account_number") || "") || null,
      }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not read the statement");
    } finally {
      setBusy(null);
    }
  }

  async function repreview(next: { template?: string; mapping?: Record<string, string | null> }) {
    if (!preview) return;
    setBusy("preview");
    setError(null);
    try {
      show(await api.post<ImportPreviewData>(`/verification/imports/${preview.statement.id}/preview`, {
        template: next.template ?? template, mapping: next.mapping ?? mapping,
      }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not preview with that mapping");
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy("confirm");
    setError(null);
    try {
      const out = await api.post<{ transaction_count: number; matched_count: number; skipped_duplicates: number }>(
        `/verification/imports/${preview.statement.id}/confirm`,
        { template, mapping, include_duplicates: includeDuplicates, allow_duplicate_statement: allowDuplicateFile },
      );
      setDone(`Imported ${out.transaction_count} transactions · ${out.matched_count} auto-matched (UTR and amount) · ${out.skipped_duplicates} duplicates skipped.`);
      setPreview(null);
      setFile(null);
      onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (!preview) return;
    await api.post(`/verification/imports/${preview.statement.id}/discard`).catch(() => undefined);
    setPreview(null);
    setFile(null);
    onImported();
  }

  return (
    <Panel className="flex flex-col gap-5">
      {!preview ? (
        <form onSubmit={start} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Field label="Statement file (CSV, Excel, PDF or scanned PDF · up to 10 MB)">
              <input type="file" accept=".csv,.xls,.xlsx,.pdf" required onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className={`${inputClass} h-auto py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-mist file:px-3 file:py-1.5 file:text-sm`} />
            </Field>
          </div>
          <Field label="Bank"><input name="bank_name" maxLength={160} placeholder="HDFC Bank" className={inputClass} /></Field>
          <Field label="Account number"><input name="account_number" {...FIELD_RULES.accountNumber} className={inputClass} /></Field>
          <div className="sm:col-span-4 flex justify-end">
            <Button type="submit" size="sm" magnetic={false} disabled={!file || busy !== null}>
              <Upload className="h-4 w-4" /> {busy === "upload" ? "Reading…" : "Upload and preview"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{preview.statement.file_name}</p>
              <p className="text-xs text-ink-40">
                Read as {preview.statement.source_format?.toUpperCase()} · {preview.statement.account_number ? `A/c ${preview.statement.account_number} · ` : ""}
                {preview.statement.period_start ? `${formatDate(preview.statement.period_start)} – ${formatDate(preview.statement.period_end ?? "")}` : "no dates read"}
              </p>
            </div>
            {preview.template !== "text" && (
              <div className="w-64">
                <Select value={template} onValueChange={(v) => { setTemplate(v); repreview({ template: v, mapping: {} }); }}
                  options={Object.entries(preview.templates).map(([value, label]) => ({ value, label }))} />
              </div>
            )}
          </div>

          {preview.duplicate_statement_of && (
            <div className="rounded-2xl border border-warning/40 bg-warning/5 p-3 text-sm">
              <p>This exact file was already imported as statement #{preview.duplicate_statement_of}.</p>
              <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={allowDuplicateFile} onChange={(e) => setAllowDuplicateFile(e.target.checked)} /> Import it again anyway</label>
            </div>
          )}

          {preview.template !== "text" && (
            <details open={preview.problems.length > 0} className="rounded-2xl border border-line p-4">
              <summary className="cursor-pointer text-sm font-medium">Column mapping {preview.problems.length > 0 && <span className="text-danger">· needs fixing</span>}</summary>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {Object.entries(preview.roles).map(([role, label]) => (
                  <Field key={role} label={label}>
                    <Select value={mapping[role] ?? NONE} onValueChange={(v) => setMapping((m) => ({ ...m, [role]: v === NONE ? null : v }))}
                      options={[{ value: NONE, label: "— not in file —" }, ...preview.columns.map((c) => ({ value: c, label: c }))]} />
                  </Field>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" variant="secondary" magnetic={false} disabled={busy !== null} onClick={() => repreview({})}>
                  {busy === "preview" ? "Checking…" : "Apply mapping"}
                </Button>
              </div>
            </details>
          )}
          {preview.problems.map((p) => <p key={p} className="text-sm text-danger">⚠ {p}</p>)}

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {[
              ["Will import", String(preview.importable)],
              ["Rows with errors", String(preview.error_rows)],
              ["Duplicates", String(preview.duplicate_rows)],
              ["Money in", formatINR(preview.credits_total)],
              ["Money out", formatINR(preview.debits_total)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-line bg-white/50 p-3">
                <p className="text-xs text-ink-40">{k}</p>
                <p className="mt-1 font-medium tabular-nums">{v}</p>
              </div>
            ))}
          </div>

          <div className="max-h-[50vh] overflow-auto" data-lenis-prevent>
            <Table head={["Line", "Date", "Narration", "UTR / ref", "Debit", "Credit", "Balance", "Check"]}>
              {preview.rows.map((r) => (
                <Row key={r.line}>
                  <Cell className="tabular-nums text-ink-40">{r.line}</Cell>
                  <Cell className="text-ink-40">{r.txn_date ? formatDate(r.txn_date) : "-"}</Cell>
                  <Cell className="max-w-xs truncate">{r.narration ?? "-"}</Cell>
                  <Cell className="font-mono text-xs">{r.utr ?? r.reference ?? "-"}</Cell>
                  <Cell className="tabular-nums text-danger">{r.debit != null ? formatINR(r.debit) : ""}</Cell>
                  <Cell className="tabular-nums text-success">{r.credit != null ? formatINR(r.credit) : ""}</Cell>
                  <Cell className="tabular-nums text-ink-40">{r.balance != null ? formatINR(r.balance) : ""}</Cell>
                  <Cell className="max-w-xs whitespace-normal text-xs">
                    {r.errors.length ? <span className="text-danger">{r.errors.join(" ")}</span> : r.duplicate ? <span className="text-warning">Duplicate</span> : <span className="text-success">OK</span>}
                  </Cell>
                </Row>
              ))}
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-secondary">
              <input type="checkbox" checked={includeDuplicates} onChange={(e) => setIncludeDuplicates(e.target.checked)} /> Import duplicate lines too
            </label>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" magnetic={false} onClick={discard}>Discard</Button>
              <Button size="sm" magnetic={false} disabled={busy !== null || preview.problems.length > 0 || (preview.importable === 0 && !includeDuplicates)} onClick={confirm}>
                {busy === "confirm" ? "Importing…" : `Import ${preview.importable + (includeDuplicates ? preview.duplicate_rows : 0)} transactions`}
              </Button>
            </div>
          </div>
        </>
      )}
      {error && <p role="alert" className="flex items-center gap-2 text-sm text-danger"><AlertTriangle className="h-4 w-4" /> {error}</p>}
      {done && <p role="status" className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> {done}</p>}
    </Panel>
  );
}
