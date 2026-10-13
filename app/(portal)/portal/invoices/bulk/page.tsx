"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Panel, Table, Row, Cell, MetricCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { api, ApiError, type BulkPreview, type BulkCreated, type BulkRow } from "@/lib/api";
import { formatDate, formatINR } from "@/lib/utils";

const ACCEPT = ".xlsx,.csv";

type Stage =
  | { kind: "pick" }
  | { kind: "checking"; file: File }
  | { kind: "preview"; file: File; preview: BulkPreview }
  | { kind: "creating"; file: File; preview: BulkPreview }
  | { kind: "done"; result: BulkCreated };

export default function BulkInvoicesPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function check(file: File) {
    setError(null);
    setProblemsOnly(false);
    setStage({ kind: "checking", file });
    try {
      const preview = await api.upload<BulkPreview>("/invoices/bulk/preview", file);
      setStage({ kind: "preview", file, preview });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not read the file");
      setStage({ kind: "pick" });
    }
  }

  async function create() {
    if (stage.kind !== "preview" || !stage.preview.ready) return;
    setError(null);
    setStage({ ...stage, kind: "creating" });
    try {
      const result = await api.upload<BulkCreated>("/invoices/bulk", stage.file);
      setStage({ kind: "done", result });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the invoices");
      setStage({ ...stage, kind: "preview" });
    }
  }

  async function downloadTemplate() {
    setError(null);
    try {
      await api.download("/invoices/bulk/template", "bulk-invoice-template.xlsx");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not download the template");
    }
  }

  function startOver() {
    setStage({ kind: "pick" });
    setError(null);
  }

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) check(file);
  }

  const preview = stage.kind === "preview" || stage.kind === "creating" ? stage.preview : null;
  const file = stage.kind === "pick" || stage.kind === "done" ? null : stage.file;

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <button
          onClick={() => router.push("/portal/invoices")}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-secondary transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All invoices
        </button>

        <PageHeading
          title="Bulk upload invoices"
          description="Create many proforma invoices at once, for one client or many. Nothing is created until every row is correct."
        />

        {error && (
          <p role="alert" className="text-sm text-danger">
            ⚠ {error}
          </p>
        )}

        {stage.kind === "done" ? (
          <Done result={stage.result} onViewInvoices={() => router.push("/portal/invoices")} onAnother={startOver} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Panel>
                <p className="text-xs tracking-eyebrow text-secondary">Step 1</p>
                <h2 className="mt-2 text-lg font-medium">Fill in the template</h2>
                <p className="mt-2 text-sm font-light text-secondary">
                  One row per invoice. The template has drop-downs of your clients and services and a sheet explaining
                  every column. GST is added from each service&apos;s rate.
                </p>
                <Button size="sm" variant="secondary" magnetic={false} onClick={downloadTemplate} className="mt-5">
                  <Download className="h-4 w-4" /> Download template (.xlsx)
                </Button>
              </Panel>

              <Panel>
                <p className="text-xs tracking-eyebrow text-secondary">Step 2</p>
                <h2 className="mt-2 text-lg font-medium">Upload it to check</h2>
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    onFiles(e.dataTransfer.files);
                  }}
                  className={
                    "mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center transition-colors " +
                    (dragging ? "border-foreground/50 bg-mist" : "border-line hover:border-foreground/30")
                  }
                >
                  <FileSpreadsheet className="h-6 w-6 text-ink-40" strokeWidth={1.6} />
                  <span className="text-sm">
                    {stage.kind === "checking" ? `Checking ${stage.file.name}…` : file ? file.name : "Drop the file here or click to choose"}
                  </span>
                  <span className="text-xs text-ink-40">Excel (.xlsx) or CSV, up to 500 rows</span>
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT}
                    className="sr-only"
                    disabled={stage.kind === "checking" || stage.kind === "creating"}
                    onChange={(e) => {
                      onFiles(e.target.files);
                      // Cleared so choosing the same (now fixed) file again still triggers a check.
                      e.target.value = "";
                    }}
                  />
                </label>
              </Panel>
            </div>

            {preview && (
              <PreviewSection
                preview={preview}
                creating={stage.kind === "creating"}
                problemsOnly={problemsOnly}
                onProblemsOnly={setProblemsOnly}
                onCreate={create}
                onChooseAgain={() => inputRef.current?.click()}
              />
            )}
          </>
        )}
      </div>
    </PortalShell>
  );
}

function PreviewSection({
  preview,
  creating,
  problemsOnly,
  onProblemsOnly,
  onCreate,
  onChooseAgain,
}: {
  preview: BulkPreview;
  creating: boolean;
  problemsOnly: boolean;
  onProblemsOnly: (v: boolean) => void;
  onCreate: () => void;
  onChooseAgain: () => void;
}) {
  const rows = problemsOnly ? preview.rows.filter((r) => r.errors.length > 0) : preview.rows;
  const warningCount = preview.rows.filter((r) => r.warnings.length > 0).length;
  const invoiceWord = preview.invoice_count === 1 ? "invoice" : "invoices";

  return (
    <section className="flex flex-col gap-5" aria-label="Upload preview">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Invoices" value={String(preview.invoice_count)} sub={`${preview.client_count} client${preview.client_count === 1 ? "" : "s"}`} />
        <MetricCard label="Value before GST" value={formatINR(preview.taxable_total)} sub="Taxable value" />
        <MetricCard label="GST" value={formatINR(preview.gst_total)} sub="From each service's rate" />
        <MetricCard label="Total billed" value={formatINR(preview.grand_total)} sub="Including GST" />
      </div>

      {preview.ready ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-mist/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-start gap-2 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Every row is correct. They will become {preview.invoice_count} draft proforma {invoiceWord}, ready to send for
              client approval.
              {warningCount > 0 && ` Check the ${warningCount} flagged row${warningCount === 1 ? "" : "s"} first.`}
            </span>
          </p>
          <Button size="sm" magnetic={false} onClick={onCreate} disabled={creating} className="sm:shrink-0">
            {creating ? "Creating…" : `Create ${preview.invoice_count} proforma ${invoiceWord}`}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-foreground/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {preview.error_count} row{preview.error_count === 1 ? " needs" : "s need"} fixing. Nothing will be created
              until every row is correct: fix the file and upload it again.
            </span>
          </p>
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            <Button size="sm" variant="secondary" magnetic={false} onClick={() => onProblemsOnly(!problemsOnly)}>
              {problemsOnly ? "Show all rows" : "Show only problems"}
            </Button>
            <Button size="sm" magnetic={false} onClick={onChooseAgain}>
              <RotateCcw className="h-4 w-4" /> Upload fixed file
            </Button>
          </div>
        </div>
      )}

      <Table head={["Row", "Client", "Service", "Amount", "GST", "Total", "Due", "Check"]}>
        {rows.map((r) => (
          <PreviewRow key={r.row} row={r} />
        ))}
      </Table>
    </section>
  );
}

function PreviewRow({ row }: { row: BulkRow }) {
  const failed = row.errors.length > 0;
  return (
    <Row>
      <Cell className="tabular-nums text-ink-40">{row.row}</Cell>
      <Cell className="font-medium">
        {row.client_name ?? <span className="text-ink-40">{row.client_input || "-"}</span>}
      </Cell>
      <Cell>
        {row.service_title ?? <span className="text-ink-40">{row.service_input || "-"}</span>}
        {row.description && <span className="block text-xs text-ink-40">{row.description}</span>}
      </Cell>
      <Cell className="tabular-nums">{row.amount !== null ? formatINR(row.amount) : "-"}</Cell>
      <Cell className="tabular-nums text-ink-40">
        {row.gst_amount !== null ? formatINR(row.gst_amount) : "-"}
        {row.gst_rate !== null && (
          <span className="block text-xs">
            {row.gst_rate}% {row.is_interstate ? "IGST" : "CGST+SGST"}
          </span>
        )}
      </Cell>
      <Cell className="tabular-nums">{row.total_amount !== null ? formatINR(row.total_amount) : "-"}</Cell>
      <Cell className="text-ink-40">{row.due_date ? formatDate(row.due_date) : "Month end"}</Cell>
      <Cell className="min-w-[240px] max-w-[320px] whitespace-normal">
        {failed ? (
          <ul className="flex flex-col gap-1 text-xs text-danger">
            {row.errors.map((e) => (
              <li key={e}>⚠ {e}</li>
            ))}
          </ul>
        ) : row.warnings.length > 0 ? (
          <ul className="flex flex-col gap-1 text-xs text-secondary">
            {row.warnings.map((w) => (
              <li key={w}>Check: {w}</li>
            ))}
          </ul>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-secondary">
            <CheckCircle2 className="h-3.5 w-3.5" /> OK
          </span>
        )}
      </Cell>
    </Row>
  );
}

function Done({
  result,
  onViewInvoices,
  onAnother,
}: {
  result: BulkCreated;
  onViewInvoices: () => void;
  onAnother: () => void;
}) {
  const first = result.invoices[0]?.proforma_number;
  const last = result.invoices[result.invoices.length - 1]?.proforma_number;
  return (
    <Panel>
      <CheckCircle2 className="h-6 w-6" />
      <h2 className="mt-3 text-lg font-medium">
        Created {result.created} draft proforma {result.created === 1 ? "invoice" : "invoices"}
      </h2>
      <p className="mt-2 text-sm font-light text-secondary">
        {first === last ? first : `${first} to ${last}`}. Open each one to review it and send it to the client for approval.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="sm" magnetic={false} onClick={onViewInvoices}>
          View invoices
        </Button>
        <Button size="sm" variant="secondary" magnetic={false} onClick={onAnother}>
          Upload another file
        </Button>
      </div>
    </Panel>
  );
}
