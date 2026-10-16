"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { BulkUploadSteps, RowCheckNotes } from "@/components/portal/BulkUploadSteps";
import { PageHeading, Panel, Table, Row, Cell } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { api, ApiError, type ServiceBulkPreview, type ServiceBulkCreated } from "@/lib/api";

type Stage =
  | { kind: "pick" }
  | { kind: "checking"; file: File }
  | { kind: "preview"; file: File; preview: ServiceBulkPreview }
  | { kind: "creating"; file: File; preview: ServiceBulkPreview }
  | { kind: "done"; result: ServiceBulkCreated };

const TEMPLATE_HELP =
  "One row per service: its title and, optionally, its SAC code. Titles must be new; a SAC already used by another service is allowed and pointed out.";

/** Add many catalogue services from one spreadsheet. Nothing is created until every row is correct. */
export default function BulkServicesPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);

  async function check(file: File) {
    setError(null);
    setStage({ kind: "checking", file });
    try {
      const preview = await api.upload<ServiceBulkPreview>("/services/bulk/preview", file);
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
      const result = await api.upload<ServiceBulkCreated>("/services/bulk", stage.file);
      setStage({ kind: "done", result });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the services");
      setStage({ ...stage, kind: "preview" });
    }
  }

  async function downloadTemplate() {
    setError(null);
    try {
      await api.download("/services/bulk/template", "bulk-services-template.xlsx");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not download the template");
    }
  }

  const preview = stage.kind === "preview" || stage.kind === "creating" ? stage.preview : null;
  const file = stage.kind === "pick" || stage.kind === "done" ? null : stage.file;

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <button
          onClick={() => router.push("/portal/services")}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-secondary transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All services
        </button>

        <PageHeading
          title="Bulk upload services"
          description="Add many services to the catalogue at once. Nothing is created until every row is correct."
        />

        {error && (
          <p role="alert" className="text-sm text-danger">
            ⚠ {error}
          </p>
        )}

        {stage.kind === "done" ? (
          <Panel>
            <CheckCircle2 className="h-6 w-6" />
            <h2 className="mt-3 text-lg font-medium">
              Added {stage.result.created} {stage.result.created === 1 ? "service" : "services"}
            </h2>
            <p className="mt-2 text-sm font-light text-secondary">They are active and can be picked on projects now.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" magnetic={false} onClick={() => router.push("/portal/services")}>
                View services
              </Button>
              <Button size="sm" variant="secondary" magnetic={false} onClick={() => setStage({ kind: "pick" })}>
                Upload another file
              </Button>
            </div>
          </Panel>
        ) : (
          <>
            <BulkUploadSteps
              ref={inputRef}
              templateHelp={TEMPLATE_HELP}
              onDownloadTemplate={downloadTemplate}
              status={stage.kind === "checking" ? `Checking ${stage.file.name}…` : file ? file.name : null}
              busy={stage.kind === "checking" || stage.kind === "creating"}
              onFile={check}
            />
            {preview && (
              <ServicePreview
                preview={preview}
                creating={stage.kind === "creating"}
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

function ServicePreview({
  preview,
  creating,
  onCreate,
  onChooseAgain,
}: {
  preview: ServiceBulkPreview;
  creating: boolean;
  onCreate: () => void;
  onChooseAgain: () => void;
}) {
  const noun = preview.service_count === 1 ? "service" : "services";
  const warningCount = preview.rows.filter((r) => r.warnings.length > 0).length;

  return (
    <section className="flex flex-col gap-5" aria-label="Upload preview">
      {preview.ready ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-mist/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-start gap-2 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Every row is correct: {preview.service_count} {noun} will be added.
              {warningCount > 0 && ` ${warningCount} share a SAC code with another service; check that is intended.`}
            </span>
          </p>
          <Button size="sm" magnetic={false} onClick={onCreate} disabled={creating} className="sm:shrink-0">
            {creating ? "Adding…" : `Add ${preview.service_count} ${noun}`}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-foreground/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {preview.error_count} row{preview.error_count === 1 ? " needs" : "s need"} fixing. Nothing will be added until
              every row is correct: fix the file and upload it again.
            </span>
          </p>
          <Button size="sm" magnetic={false} onClick={onChooseAgain} className="sm:shrink-0">
            <RotateCcw className="h-4 w-4" /> Upload fixed file
          </Button>
        </div>
      )}

      <Table head={["Row", "Service", "SAC code", "Check"]}>
        {preview.rows.map((r) => (
          <Row key={r.row}>
            <Cell className="tabular-nums text-ink-40">{r.row}</Cell>
            <Cell className="max-w-md whitespace-normal font-medium">{r.title || <span className="text-ink-40">-</span>}</Cell>
            <Cell className="font-mono text-secondary">{r.sac_code ?? "-"}</Cell>
            <Cell className="min-w-[240px] max-w-[360px] whitespace-normal">
              <RowCheckNotes errors={r.errors} warnings={r.warnings} />
            </Cell>
          </Row>
        ))}
      </Table>
    </section>
  );
}
