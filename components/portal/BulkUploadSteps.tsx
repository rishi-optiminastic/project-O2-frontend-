"use client";

import { forwardRef, useState, type ReactNode } from "react";
import { CheckCircle2, Download, FileSpreadsheet } from "lucide-react";
import { Panel } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";

const ACCEPT = ".xlsx,.csv";

/**
 * Steps 1 and 2 of a bulk upload: download the template, then drop the filled file.
 * The forwarded ref is the hidden file input, so a page can reopen the picker ("Upload fixed file").
 */
export const BulkUploadSteps = forwardRef<
  HTMLInputElement,
  {
    templateHelp: ReactNode;
    onDownloadTemplate: () => void;
    /** What the drop zone says: the chosen file, "Checking …", or null for the prompt. */
    status: string | null;
    busy: boolean;
    onFile: (file: File) => void;
  }
>(function BulkUploadSteps({ templateHelp, onDownloadTemplate, status, busy, onFile }, ref) {
  const [dragging, setDragging] = useState(false);

  function take(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel>
        <p className="text-xs tracking-eyebrow text-secondary">Step 1</p>
        <h2 className="mt-2 text-lg font-medium">Fill in the template</h2>
        <p className="mt-2 text-sm font-light text-secondary">{templateHelp}</p>
        <Button size="sm" variant="secondary" magnetic={false} onClick={onDownloadTemplate} className="mt-5">
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
            take(e.dataTransfer.files);
          }}
          className={
            "mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center transition-colors " +
            (dragging ? "border-foreground/50 bg-mist" : "border-line hover:border-foreground/30")
          }
        >
          <FileSpreadsheet className="h-6 w-6 text-ink-40" strokeWidth={1.6} />
          <span className="text-sm">{status ?? "Drop the file here or click to choose"}</span>
          <span className="text-xs text-ink-40">Excel (.xlsx) or CSV, up to 500 rows</span>
          <input
            ref={ref}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              take(e.target.files);
              // Cleared so choosing the same (now fixed) file again still triggers a check.
              e.target.value = "";
            }}
          />
        </label>
      </Panel>
    </div>
  );
});

/** The "Check" cell of a preview row: its errors, else its warnings, else OK. */
export function RowCheckNotes({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (errors.length > 0) {
    return (
      <ul className="flex flex-col gap-1 text-xs text-danger">
        {errors.map((e) => (
          <li key={e}>⚠ {e}</li>
        ))}
      </ul>
    );
  }
  if (warnings.length > 0) {
    return (
      <ul className="flex flex-col gap-1 text-xs text-secondary">
        {warnings.map((w) => (
          <li key={w}>Check: {w}</li>
        ))}
      </ul>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-secondary">
      <CheckCircle2 className="h-3.5 w-3.5" /> OK
    </span>
  );
}
