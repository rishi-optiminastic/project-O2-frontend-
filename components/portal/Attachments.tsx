"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, History, Paperclip, Trash2, Upload } from "lucide-react";
import { Panel, Field, inputClass } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError } from "@/lib/api";
import { fileSize, type DocumentFile } from "@/lib/finance";
import { formatDate } from "@/lib/utils";

export type Category = { value: string; label: string };

const PREVIEWABLE = ["application/pdf", "image/png", "image/jpeg"];
const ACCEPT_DOCS = ".pdf,.jpg,.jpeg,.png";
const ACCEPT_DOCS_SHEETS = ".pdf,.jpg,.jpeg,.png,.xls,.xlsx";

/**
 * Files attached to one record: upload, new versions, preview, download and removal.
 * Files are always fetched with the user's login; nothing has a public link.
 */
export function Attachments({
  entityType,
  entityId,
  categories,
  title = "Documents",
  canUpload = true,
  canRemove = false,
  imagesAndPdfOnly = false,
  bare = false,
  onChange,
}: {
  entityType: string;
  entityId: number;
  categories: Category[];
  title?: string;
  canUpload?: boolean;
  canRemove?: boolean;
  imagesAndPdfOnly?: boolean;
  /** Without the panel frame, for use inside another card. */
  bare?: boolean;
  onChange?: () => void;
}) {
  const { data: docs, refetch } = useApi<DocumentFile[]>(`/documents?entity_type=${entityType}&entity_id=${entityId}`);
  const [uploading, setUploading] = useState<{ replaces?: DocumentFile } | null>(null);
  const [preview, setPreview] = useState<DocumentFile | null>(null);
  const [historyOf, setHistoryOf] = useState<DocumentFile | null>(null);
  const [removing, setRemoving] = useState<DocumentFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = (value: string) => categories.find((c) => c.value === value)?.label ?? value;

  function done() {
    refetch();
    onChange?.();
  }

  async function download(doc: DocumentFile) {
    setError(null);
    try {
      await api.download(`/documents/${doc.id}/content`, doc.file_name);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Download failed");
    }
  }

  const body = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-medium tracking-eyebrow text-secondary">
          <Paperclip className="h-4 w-4" /> {title}
        </h3>
        {canUpload && (
          <Button size="sm" variant="secondary" magnetic={false} onClick={() => setUploading({})}>
            <Upload className="h-4 w-4" /> Upload
          </Button>
        )}
      </div>
      {docs && docs.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line/60 rounded-2xl border border-line bg-white/50">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-ink-40" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.file_name}</p>
                <p className="text-xs text-ink-40">
                  {label(d.category)} · v{d.version} · {fileSize(d.size_bytes)} · {d.uploaded_by_name ?? "—"} · {formatDate(d.created_at)}
                  {d.note && <> · {d.note}</>}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {PREVIEWABLE.includes(d.content_type) && (
                  <IconButton label={`Preview ${d.file_name}`} onClick={() => setPreview(d)}>
                    <Eye className="h-4 w-4" />
                  </IconButton>
                )}
                <IconButton label={`Download ${d.file_name}`} onClick={() => download(d)}>
                  <Download className="h-4 w-4" />
                </IconButton>
                {d.version > 1 && (
                  <IconButton label="Earlier versions" onClick={() => setHistoryOf(d)}>
                    <History className="h-4 w-4" />
                  </IconButton>
                )}
                {canUpload && (
                  <button
                    onClick={() => setUploading({ replaces: d })}
                    className="rounded-lg px-2 py-1 text-xs text-secondary transition-colors hover:bg-mist hover:text-foreground"
                  >
                    New version
                  </button>
                )}
                {canRemove && (
                  <IconButton label={`Remove ${d.file_name}`} onClick={() => setRemoving(d)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-xs text-ink-40">
          {docs ? "No files attached yet." : "Loading files…"}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}

      {uploading && (
        <UploadDialog
          entityType={entityType}
          entityId={entityId}
          categories={categories}
          replaces={uploading.replaces}
          accept={imagesAndPdfOnly ? ACCEPT_DOCS : ACCEPT_DOCS_SHEETS}
          onClose={() => setUploading(null)}
          onDone={() => {
            setUploading(null);
            done();
          }}
        />
      )}
      {preview && <PreviewDialog doc={preview} onClose={() => setPreview(null)} onDownload={() => download(preview)} />}
      {historyOf && <VersionsDialog doc={historyOf} onClose={() => setHistoryOf(null)} onDownload={download} />}
      {removing && (
        <RemoveDialog
          doc={removing}
          onClose={() => setRemoving(null)}
          onDone={() => {
            setRemoving(null);
            done();
          }}
        />
      )}
    </div>
  );
  return bare ? body : <Panel>{body}</Panel>;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-40 transition-colors hover:bg-mist hover:text-foreground"
    >
      {children}
    </button>
  );
}

function UploadDialog({
  entityType,
  entityId,
  categories,
  replaces,
  accept,
  onClose,
  onDone,
}: {
  entityType: string;
  entityId: number;
  categories: Category[];
  replaces?: DocumentFile;
  accept: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [category, setCategory] = useState(replaces?.category ?? categories[0]?.value);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError("Choose a file.");
      return;
    }
    const note = String(new FormData(e.currentTarget).get("note") ?? "");
    setSaving(true);
    setError(null);
    try {
      await api.form("/documents", {
        entity_type: entityType,
        entity_id: String(entityId),
        category: category ?? "",
        note: note || null,
        replaces_id: replaces ? String(replaces.id) : null,
        file,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={replaces ? `New version of ${replaces.file_name}` : "Upload a file"}
      description={`${accept.replaceAll(".", "").toUpperCase().replaceAll(",", ", ")} · up to 10 MB. The earlier version stays in the history.`}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {!replaces && categories.length > 1 && (
          <Field label="Document type">
            <Select value={category} onValueChange={setCategory} options={categories} />
          </Field>
        )}
        <Field label="File">
          <input
            type="file"
            accept={accept}
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={`${inputClass} h-auto py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-mist file:px-3 file:py-1.5 file:text-sm`}
          />
        </Field>
        <Field label="Note (optional)">
          <input name="note" maxLength={500} className={inputClass} placeholder="e.g. Signed copy from the client" />
        </Field>
        {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Uploading…" : "Upload"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function PreviewDialog({ doc, onClose, onDownload }: { doc: DocumentFile; onClose: () => void; onDownload: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .blobUrl(`/documents/${doc.id}/content?inline=true`)
      .then((u) => {
        if (cancelled) return URL.revokeObjectURL(u);
        urlRef.current = u;
        setUrl(u);
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not open the file"));
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [doc.id]);

  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title={doc.file_name} size="wide">
      <div className="flex flex-col gap-4">
        {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
        {!url && !error && <p className="text-sm text-ink-40">Opening…</p>}
        {url &&
          (doc.content_type === "application/pdf" ? (
            <iframe src={url} title={doc.file_name} className="h-[65vh] w-full rounded-xl border border-line bg-white" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a private blob URL, not an optimisable asset
            <img src={url} alt={doc.file_name} className="max-h-[65vh] w-full rounded-xl border border-line object-contain" />
          ))}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onDownload}>
            <Download className="h-4 w-4" /> Download
          </Button>
          <Button type="button" magnetic={false} onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

function VersionsDialog({ doc, onClose, onDownload }: { doc: DocumentFile; onClose: () => void; onDownload: (d: DocumentFile) => void }) {
  const { data } = useApi<DocumentFile[]>(`/documents/${doc.id}/versions`);
  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title="Version history" description={doc.file_name}>
      <ul className="flex flex-col divide-y divide-line/60 rounded-2xl border border-line">
        {(data ?? []).map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>
              <span className="font-medium">v{v.version}</span> · {v.file_name}
              <span className="block text-xs text-ink-40">
                {v.uploaded_by_name ?? "—"} · {formatDate(v.created_at)}
                {v.removed_at && <> · removed: {v.removed_reason}</>}
                {v.is_current && <> · current</>}
              </span>
            </span>
            <IconButton label={`Download version ${v.version}`} onClick={() => onDownload(v)}>
              <Download className="h-4 w-4" />
            </IconButton>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function RemoveDialog({ doc, onClose, onDone }: { doc: DocumentFile; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
    setSaving(true);
    try {
      await api.post(`/documents/${doc.id}/remove`, { reason });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove the file");
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Remove ${doc.file_name}?`}
      description="It leaves this record but stays in the audit history."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Reason">
          <input name="reason" required maxLength={500} className={inputClass} placeholder="Uploaded to the wrong invoice" />
        </Field>
        {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={onClose}>
            Keep it
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            Remove
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** Document categories per record type, matching the backend's rules. */
export const DOC_CATEGORIES = {
  client_invoice: [{ value: "supporting", label: "Supporting document" }],
  payment: [{ value: "receipt_proof", label: "Payment proof" }],
  client: [
    { value: "compliance", label: "Compliance document" },
    { value: "coi", label: "Certificate of incorporation" },
    { value: "gst_certificate", label: "GST certificate" },
    { value: "pan", label: "PAN card" },
    { value: "contract", label: "Contract" },
    { value: "other", label: "Other" },
  ],
  vendor: [
    { value: "compliance", label: "Compliance document" },
    { value: "annual_contract", label: "Annual service contract" },
    { value: "gst_certificate", label: "GST certificate" },
    { value: "pan", label: "PAN card" },
    { value: "msme", label: "MSME certificate" },
    { value: "cancelled_cheque", label: "Cancelled cheque" },
    { value: "other", label: "Other" },
  ],
  vendor_invoice: [
    { value: "bill", label: "Vendor invoice copy" },
    { value: "supporting", label: "Supporting document" },
  ],
  vendor_report_submission: [
    { value: "report", label: "Report" },
    { value: "progress", label: "Work progress report" },
    { value: "completion", label: "Completion report" },
    { value: "photo", label: "Photograph" },
    { value: "deliverable", label: "Deliverable" },
    { value: "evidence", label: "Other evidence" },
  ],
  project: [
    { value: "supporting", label: "Supporting document" },
    { value: "contract", label: "Client contract" },
    { value: "work_order", label: "Signed work order" },
    { value: "other", label: "Other" },
  ],
  payment_approval: [{ value: "supporting", label: "Supporting document" }],
  bank_transaction: [{ value: "evidence", label: "Evidence" }],
  gst_filing: [
    { value: "challan", label: "Tax payment challan" },
    { value: "gstr1", label: "GSTR-1 acknowledgement" },
    { value: "gstr3b", label: "GSTR-3B acknowledgement" },
    { value: "reconciliation", label: "Reconciliation working" },
    { value: "other", label: "Other" },
  ],
} satisfies Record<string, Category[]>;
