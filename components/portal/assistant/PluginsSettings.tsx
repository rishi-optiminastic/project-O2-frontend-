"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Plug, Plus, RefreshCw, SquareSlash, Trash2 } from "lucide-react";
import { CommandForm } from "@/components/portal/assistant/CommandForm";
import { PluginForm } from "@/components/portal/assistant/PluginForm";
import { Badge, Empty, PageHeading, Panel } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { cn } from "@/lib/utils";
import {
  api,
  ApiError,
  type AssistantCommand,
  type AssistantPlugin,
  type AssistantPluginDirectoryEntry,
  type AssistantPluginList,
} from "@/lib/api";

/** Plugins (remote MCP servers) and saved "/" commands for Ask O2. The CEO manages; the CFO can look. */
export function PluginsSettings() {
  const { hasRole } = useAuth();
  const canManage = hasRole("ADMIN_CEO");
  const { data, refetch } = useApi<AssistantPluginList>("/assistant/plugins");
  const { data: commands, refetch: refetchCommands } = useApi<AssistantCommand[]>("/assistant/commands");
  const [adding, setAdding] = useState<AssistantPluginDirectoryEntry | "custom" | null>(null);
  const [editing, setEditing] = useState<AssistantCommand | "new" | null>(null);

  const connectedKeys = new Set((data?.plugins ?? []).map((p) => p.directory_key).filter(Boolean));

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Link href="/portal/assistant" className="inline-flex w-fit items-center gap-1.5 text-sm text-secondary hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Ask O2
        </Link>
        <PageHeading
          title="Plugins"
          description="Give the Finance Agent more tools. Plugins connect it to other services; commands save prompts you use often."
        />
        {!canManage && <p className="text-sm text-secondary">Only the CEO can add or change plugins and commands.</p>}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Connected</h2>
        {!data ? (
          <Empty message="Loading plugins…" />
        ) : data.plugins.length === 0 ? (
          <Empty icon={<Plug className="h-5 w-5" />} message="No plugins yet. Connect one below." />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {data.plugins.map((p) => (
              <PluginCard key={p.id} plugin={p} canManage={canManage} onChanged={refetch} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-medium">Add a plugin</h2>
          <p className="mt-1 text-sm text-secondary">
            Ready-made ones, or any remote MCP server from the internet, including open-source ones you host.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(data?.directory ?? []).map((entry) => (
            <DirectoryCard
              key={entry.key}
              title={entry.name}
              description={entry.description}
              connected={connectedKeys.has(entry.key)}
              disabled={!canManage}
              onAdd={() => setAdding(entry)}
            />
          ))}
          <DirectoryCard
            title="Custom plugin"
            description="Paste the https URL and key of any remote MCP server."
            disabled={!canManage}
            onAdd={() => setAdding("custom")}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Saved commands</h2>
            <p className="mt-1 text-sm text-secondary">Type /name in Ask O2 to use one. They show under “Your commands”.</p>
          </div>
          {canManage && (
            <Button size="sm" magnetic={false} onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> New command
            </Button>
          )}
        </div>
        {(commands ?? []).length === 0 ? (
          <Empty icon={<SquareSlash className="h-5 w-5" />} message="No saved commands yet." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(commands ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={!canManage}
                onClick={() => setEditing(c)}
                className="rounded-2xl border border-line bg-background/70 p-4 text-left transition-colors enabled:hover:border-foreground/25"
              >
                <span className="font-mono text-sm font-medium">/{c.name}</span>
                {c.description && <span className="ml-2 text-xs text-ink-40">{c.description}</span>}
                <span className="mt-1 line-clamp-2 block text-sm text-secondary">{c.prompt}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {adding && (
        <PluginForm
          entry={adding === "custom" ? null : adding}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            void refetch();
          }}
        />
      )}
      {editing && (
        <CommandForm
          command={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refetchCommands();
          }}
        />
      )}
    </div>
  );
}

function DirectoryCard({
  title,
  description,
  connected = false,
  disabled,
  onAdd,
}: {
  title: string;
  description: string;
  connected?: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-background/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        {connected && <Badge tone="success">Connected</Badge>}
      </div>
      <p className="flex-1 text-xs leading-relaxed text-secondary">{description}</p>
      <Button size="sm" variant="secondary" magnetic={false} disabled={disabled} onClick={onAdd} className="h-9">
        <Plus className="h-4 w-4" /> {connected ? "Add another" : "Connect"}
      </Button>
    </div>
  );
}

function PluginCard({ plugin, canManage, onChanged }: { plugin: AssistantPlugin; canManage: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(plugin.last_error);
  const readOnly = plugin.tools.filter((t) => t.read_only).length;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not go through.");
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mist">
          <Plug className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{plugin.name}</p>
          <p className="truncate font-mono text-xs text-ink-40">{plugin.host}</p>
        </div>
        <Badge tone={plugin.enabled ? "success" : "neutral"}>{plugin.enabled ? "On" : "Off"}</Badge>
        {canManage && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              magnetic={false}
              disabled={busy}
              className="h-9 px-3"
              onClick={() => run(() => api.patch(`/assistant/plugins/${plugin.id}`, { enabled: !plugin.enabled }))}
            >
              {plugin.enabled ? "Turn off" : "Turn on"}
            </Button>
            <button
              type="button"
              aria-label={`Refresh ${plugin.name}'s tools`}
              disabled={busy}
              onClick={() => run(() => api.post(`/assistant/plugins/${plugin.id}/refresh`))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-secondary hover:bg-mist hover:text-foreground"
            >
              <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
            </button>
            <button
              type="button"
              aria-label={`Remove ${plugin.name}`}
              disabled={busy}
              onClick={() => confirm(`Remove ${plugin.name}? Its key is deleted.`) && run(() => api.del(`/assistant/plugins/${plugin.id}`))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-secondary hover:bg-mist hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 inline-flex items-center gap-1 text-xs text-secondary hover:text-foreground"
      >
        {plugin.tools.length} tools · {readOnly} run at once, {plugin.tools.length - readOnly} ask first
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {plugin.tools.map((t) => (
            <li key={t.name} className="rounded-xl border border-line/70 px-3 py-2">
              <p className="flex items-center gap-2 font-mono text-xs font-medium">
                {t.name}
                <span className="font-sans font-normal text-ink-40">{t.read_only ? "runs at once" : "asks first"}</span>
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-secondary">{t.description}</p>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-xs text-danger">⚠ {error}</p>}
    </Panel>
  );
}
