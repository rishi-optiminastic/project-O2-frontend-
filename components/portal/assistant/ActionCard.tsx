"use client";

import { useState } from "react";
import { Check, Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { api, ApiError, type AssistantAction } from "@/lib/api";

type Decision = "confirm" | "cancel";

const STATUS_TEXT: Record<Exclude<AssistantAction["status"], "pending">, { text: string; tone: string }> = {
  running: { text: "Working on it…", tone: "text-secondary" },
  done: { text: "Done", tone: "text-success" },
  failed: { text: "Failed", tone: "text-danger" },
  cancelled: { text: "Cancelled", tone: "text-ink-40" },
  expired: { text: "Expired: ask again", tone: "text-ink-40" },
};

/**
 * A change the assistant proposed, exactly as it will run: nothing happens until "Yes, do it".
 * Downloads show a button instead.
 */
export function ActionCard({
  action,
  busy,
  onDecide,
}: {
  action: AssistantAction;
  busy: boolean;
  onDecide: (id: number, decision: Decision) => Promise<void>;
}) {
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (action.kind === "download" && action.download) {
    const { path, filename } = action.download;
    return (
      <div className="rounded-2xl border border-line bg-background/70 p-3">
        <p className="text-sm">{action.summary}</p>
        <Button
          type="button"
          variant="secondary"
          magnetic={false}
          className="mt-2"
          onClick={() =>
            api.download(path, filename).catch((e) => setDownloadError(e instanceof ApiError ? e.message : "Download failed"))
          }
        >
          <Download className="h-4 w-4" /> Download
        </Button>
        {downloadError && <p className="mt-1 text-xs text-danger">⚠ {downloadError}</p>}
      </div>
    );
  }

  const pending = action.status === "pending";
  const status = action.status === "pending" ? null : STATUS_TEXT[action.status];
  return (
    <div
      className={
        "rounded-2xl border p-3 " + (pending ? "border-foreground/25 bg-background shadow-sm" : "border-line bg-background/60")
      }
    >
      <p className="text-xs tracking-eyebrow text-secondary">{pending ? "Confirm this change" : "Change"}</p>
      <p className="mt-1 text-sm font-medium leading-snug">{action.summary}</p>
      {action.fields.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {action.fields.map((f, i) => (
            <div key={`${f.label}-${i}`} className="contents">
              <dt className="text-ink-40">{f.label}</dt>
              <dd className="break-words text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {pending ? (
        <div className="mt-3 flex gap-2">
          <Button type="button" magnetic={false} disabled={busy} onClick={() => onDecide(action.id, "confirm")}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Yes, do it
          </Button>
          <Button type="button" variant="secondary" magnetic={false} disabled={busy} onClick={() => onDecide(action.id, "cancel")}>
            <X className="h-4 w-4" /> Cancel
          </Button>
        </div>
      ) : (
        status && (
          <p className={"mt-2 text-xs font-medium " + status.tone} role="status">
            {status.text}
            {action.status === "failed" && action.error && <span className="font-normal">: {action.error}</span>}
          </p>
        )
      )}
    </div>
  );
}
