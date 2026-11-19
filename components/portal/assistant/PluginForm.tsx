"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Field, inputClass } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { api, ApiError, type AssistantPluginAuthType, type AssistantPluginDirectoryEntry } from "@/lib/api";

const AUTH_OPTIONS: { value: AssistantPluginAuthType; label: string }[] = [
  { value: "bearer", label: "API key (Bearer token)" },
  { value: "basic", label: "Key id and secret (Basic)" },
  { value: "header", label: "Custom header" },
  { value: "url", label: "Key is in the URL" },
  { value: "none", label: "No key" },
];

/**
 * Connects a plugin: a ready-made one from the directory (URL and key type filled in) or any remote
 * MCP server by URL. O2 checks the server answers and lists its tools before saving.
 */
export function PluginForm({
  entry,
  onClose,
  onSaved,
}: {
  /** A directory entry, or null for a custom plugin. */
  entry: AssistantPluginDirectoryEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [auth, setAuth] = useState<AssistantPluginAuthType>(entry?.auth ?? "bearer");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fixedUrl = Boolean(entry?.url);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const text = (key: string) => String(fd.get(key) ?? "");
    setSaving(true);
    setError(null);
    try {
      await api.post("/assistant/plugins", {
        name: text("name"),
        url: fixedUrl ? entry!.url : text("url"),
        directory_key: entry?.key ?? null,
        auth: {
          type: auth,
          token: text("token"),
          username: text("username"),
          password: text("password"),
          header_name: text("header_name"),
          header_value: text("header_value"),
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The plugin could not be connected.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={entry ? `Connect ${entry.name}` : "Add a custom plugin"}
      description={
        entry
          ? entry.description
          : "Any remote MCP server: paste its https URL and key. Open-source servers list theirs in their README."
      }
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4">
        <Field label="Name">
          <input name="name" required maxLength={80} defaultValue={entry?.name} placeholder="My plugin" className={inputClass} />
        </Field>

        {!fixedUrl && (
          <Field label={auth === "url" ? "Server URL (with its key)" : "Server URL"}>
            <input
              name="url"
              required
              type="url"
              maxLength={2000}
              placeholder="https://example.com/mcp"
              autoComplete="off"
              className={`${inputClass} font-mono`}
            />
          </Field>
        )}

        {!entry && (
          <Field label="How it signs in">
            <Select
              options={AUTH_OPTIONS}
              value={auth}
              onValueChange={(v) => setAuth(v as AssistantPluginAuthType)}
            />
          </Field>
        )}

        {auth === "bearer" && (
          <Field label="API key">
            <input name="token" required type="password" autoComplete="off" className={`${inputClass} font-mono`} />
          </Field>
        )}
        {auth === "basic" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Key id">
              <input name="username" required autoComplete="off" className={`${inputClass} font-mono`} />
            </Field>
            <Field label="Key secret">
              <input name="password" required type="password" autoComplete="off" className={`${inputClass} font-mono`} />
            </Field>
          </div>
        )}
        {auth === "header" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Header name">
              <input name="header_name" required pattern="[A-Za-z0-9-]{1,64}" placeholder="X-API-Key" className={`${inputClass} font-mono`} />
            </Field>
            <Field label="Header value">
              <input name="header_value" required type="password" autoComplete="off" className={`${inputClass} font-mono`} />
            </Field>
          </div>
        )}

        {entry && (
          <p className="text-xs leading-relaxed text-secondary">
            {entry.auth_help}{" "}
            <a href={entry.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-foreground underline">
              Setup guide <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        )}
        <p className="text-xs leading-relaxed text-ink-40">
          The key is stored encrypted and never shown again. Lookups the plugin marks as read-only run at once; anything
          else asks you first.
        </p>

        {error && <p role="alert" className="text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="ghost" magnetic={false} onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Connecting…" : "Connect"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
