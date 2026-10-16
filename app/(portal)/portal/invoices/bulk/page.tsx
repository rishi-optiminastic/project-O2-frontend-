"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { BulkUploadSteps, RowCheckNotes } from "@/components/portal/BulkUploadSteps";
import { PageHeading, Panel, Table, Row, Cell, MetricCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { api, ApiError, type BulkPreview, type BulkCreated, type BulkRow } from "@/lib/api";
import { formatDate, formatINR } from "@/lib/utils";

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
          description="Create many proforma invoices at once, for one project or many. Nothing is created until every row is correct."
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
            <BulkUploadSteps
              ref={inputRef}
              templateHelp="One row per invoice, named by project code. The template has a drop-down of your projects and a sheet explaining every column. The client comes from the project; name the service when a project bills several."
              onDownloadTemplate={downloadTemplate}
              status={stage.kind === "checking" ? `Checking ${stage.file.name}…` : file ? file.name : null}
              busy={stage.kind === "checking" || stage.kind === "creating"}
              onFile={check}
            />

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

      <Table head={["Row", "Project", "Service", "Amount", "GST", "Total", "Due", "Check"]}>
        {rows.map((r) => (
          <PreviewRow key={r.row} row={r} />
        ))}
      </Table>
    </section>
  );
}

function PreviewRow({ row }: { row: BulkRow }) {
  return (
    <Row>
      <Cell className="tabular-nums text-ink-40">{row.row}</Cell>
      <Cell className="font-medium">
        {row.project_code ?? <span className="text-ink-40">{row.project_input || "-"}</span>}
        {row.client_name && <span className="block text-xs font-normal text-ink-40">{row.client_name}</span>}
      </Cell>
      <Cell>
        {row.service_title ?? "-"}
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
        <RowCheckNotes errors={row.errors} warnings={row.warnings} />
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
