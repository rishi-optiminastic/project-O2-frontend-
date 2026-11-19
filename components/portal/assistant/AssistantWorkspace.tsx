"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FolderKanban,
  Loader2,
  MessageSquare,
  Paperclip,
  Plug,
  Plus,
  Receipt,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import { ActionCard } from "@/components/portal/assistant/ActionCard";
import {
  matchingCommands,
  SlashMenu,
  recordCommandFor,
  parseSlash,
  savedCommands,
  useSlashRecords,
  type SlashItem,
  type SlashRecord,
} from "@/components/portal/assistant/SlashMenu";
import { useApi } from "@/lib/useApi";
import { emitPortalEvent, PORTAL_EVENTS } from "@/lib/events";
import { cn } from "@/lib/utils";
import {
  api,
  ApiError,
  type AssistantCommand,
  type AssistantConversation,
  type AssistantConversationSummary,
  type AssistantStatus,
} from "@/lib/api";

const MAX_TEXT = 4000;
const STORAGE_KEY = "o2.assistant.conversation";
const ATTACH_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx";
const NEW_CHAT = "New chat";
const EXAMPLES: { icon: LucideIcon; title: string; prompt: string }[] = [
  { icon: Receipt, title: "Receivables", prompt: "What is still unpaid this month?" },
  { icon: Truck, title: "Vendor bills", prompt: "Show VENDOR 1's bills that are still due" },
  { icon: FolderKanban, title: "Projects", prompt: "Create a project for lokmat" },
  { icon: ShieldCheck, title: "Approvals", prompt: "Which payment requests are waiting for my approval?" },
];
/** The brand gradient, as on the dashboard greeting. */
const BRAND_GRADIENT = "bg-gradient-to-r from-[#3f6fd6] via-[#7f8fd0] to-[#e0a92e]";

function rememberedId(): number | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function remember(id: number | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, String(id));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private windows can refuse storage; the page works without it.
  }
}

/** Every page that shows money or records hears about a change the assistant made. */
function announceChange() {
  emitPortalEvent(PORTAL_EVENTS.assistantActed);
  emitPortalEvent(PORTAL_EVENTS.receiptRecorded);
  emitPortalEvent(PORTAL_EVENTS.paymentRequested);
  emitPortalEvent(PORTAL_EVENTS.vendorInvoiceRecorded);
}

/**
 * Ask O2, full page: chats on the left, the conversation in the middle, the composer at the bottom.
 * Questions are answered at once; every change is a confirm card that runs only after "Yes, do it".
 */
export function AssistantWorkspace() {
  const { data: status } = useApi<AssistantStatus>("/assistant/status");
  const { data: chats, refetch: refetchChats } = useApi<AssistantConversationSummary[]>("/assistant/conversations");
  const { data: saved } = useApi<AssistantCommand[]>("/assistant/commands");
  const [conversation, setConversation] = useState<AssistantConversation | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ id: number; name: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [deciding, setDeciding] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // "/" commands: "/cl" lists matching commands, "/clients lok" lists matching clients.
  const [slashActive, setSlashActive] = useState(0);
  const [slashClosedFor, setSlashClosedFor] = useState<string | null>(null);
  const slash = parseSlash(text);
  const chosen = slash && slash.query !== null ? recordCommandFor(slash.command) : undefined;
  const { records, loading: recordsLoading } = useSlashRecords(chosen, slash?.query ?? "");
  const slashItems: SlashItem[] = !slash
    ? []
    : chosen
      ? records.map((record) => ({ type: "record", record }))
      : matchingCommands(slash.command, savedCommands(saved ?? [])).map((command) => ({ type: "command", command }));
  const slashOpen = Boolean(slash) && slashClosedFor !== text && (Boolean(chosen) || slashItems.length > 0);
  const slashIndex = Math.min(slashActive, Math.max(slashItems.length - 1, 0));

  function replaceSlash(value: string) {
    if (!slash) return;
    setText(text.slice(0, slash.start) + value);
    setSlashActive(0);
    inputRef.current?.focus();
  }

  function chooseSlash(item: SlashItem) {
    if (item.type === "record") replaceSlash(`${item.record.mention} `);
    else if (item.command.type === "record") replaceSlash(`/${item.command.name} `);
    else replaceSlash(item.command.prompt);
  }

  function openRecord(record: SlashRecord) {
    replaceSlash("");
    router.push(record.href);
  }

  /** Arrow keys, Enter, Tab and Esc drive the "/" menu while it is open. True when the key was used. */
  function slashKey(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!slashOpen) return false;
    const item = slashItems[slashIndex];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const step = e.key === "ArrowDown" ? 1 : -1;
      setSlashActive(Math.min(Math.max(slashIndex + step, 0), Math.max(slashItems.length - 1, 0)));
    } else if (e.key === "Escape") {
      setSlashClosedFor(text);
    } else if ((e.key === "Enter" || e.key === "Tab") && item) {
      if (item.type === "record" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) openRecord(item.record);
      else chooseSlash(item);
    } else {
      return false;
    }
    e.preventDefault();
    return true;
  }

  const open = useCallback(async (id: number) => {
    setError(null);
    setFiles([]);
    try {
      setConversation(await api.get<AssistantConversation>(`/assistant/conversations/${id}`));
      remember(id);
    } catch {
      remember(null);
      setConversation(null);
    }
  }, []);

  // Reopen the chat the user had open last time.
  useEffect(() => {
    const id = rememberedId();
    if (!id) return;
    let live = true;
    api
      .get<AssistantConversation>(`/assistant/conversations/${id}`)
      .then((c) => live && setConversation(c))
      .catch(() => remember(null));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conversation, sending]);

  function newChat() {
    remember(null);
    setConversation(null);
    setFiles([]);
    setError(null);
    inputRef.current?.focus();
  }

  async function remove(id: number) {
    try {
      await api.del(`/assistant/conversations/${id}`);
      if (conversation?.id === id) newChat();
      void refetchChats();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The chat could not be deleted.");
    }
  }

  async function ensureConversation(): Promise<AssistantConversation> {
    if (conversation) return conversation;
    const created = await api.post<AssistantConversation>("/assistant/conversations");
    setConversation(created);
    remember(created.id);
    return created;
  }

  async function send(message: string) {
    const body = message.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const conv = await ensureConversation();
      const updated = await api.post<AssistantConversation>(`/assistant/conversations/${conv.id}/messages`, {
        text: body,
        file_ids: files.map((f) => f.id),
      });
      setConversation(updated);
      setText("");
      setFiles([]);
      void refetchChats();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The assistant could not reply. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function attach(file: File) {
    setError(null);
    try {
      const conv = await ensureConversation();
      const saved = await api.upload<{ id: number; name: string }>(`/assistant/conversations/${conv.id}/files`, file);
      setFiles((all) => [...all, saved]);
      void refetchChats();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The file could not be attached.");
    }
  }

  async function decide(id: number, decision: "confirm" | "cancel") {
    setDeciding(id);
    setError(null);
    try {
      setConversation(await api.post<AssistantConversation>(`/assistant/actions/${id}/${decision}`));
      if (decision === "confirm") announceChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That did not go through. Try again.");
      if (conversation) void open(conversation.id);
    } finally {
      setDeciding(null);
    }
  }

  const messages = conversation?.messages ?? [];
  const title = conversation?.title && conversation.title !== NEW_CHAT ? conversation.title : "Ask O2";

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] overflow-hidden lg:h-[calc(100dvh-4.6rem)]">
      {/* Chats */}
      <nav aria-label="Chats" className="hidden w-72 shrink-0 flex-col border-r border-line/60 bg-background/40 md:flex">
        <div className="p-3">
          <button
            type="button"
            onClick={newChat}
            className="flex h-10 w-full items-center gap-2 rounded-xl border border-line bg-background px-3 text-sm font-medium transition-colors hover:border-foreground/30"
          >
            <Plus className="h-4 w-4" /> New chat
          </button>
        </div>
        <p className="px-4 pb-2 text-[11px] tracking-eyebrow text-ink-40">Recent</p>
        <ul className="flex-1 overflow-y-auto px-2 pb-3">
          {(chats ?? []).length === 0 && <li className="px-3 py-2 text-sm text-ink-40">No chats yet.</li>}
          {(chats ?? []).map((c) => (
            <li key={c.id} className="group relative">
              <button
                type="button"
                onClick={() => void open(c.id)}
                aria-current={conversation?.id === c.id ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 pr-9 text-left text-sm transition-colors",
                  conversation?.id === c.id ? "bg-foreground/[0.07] text-foreground" : "text-secondary hover:bg-foreground/[0.04]",
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{c.title}</span>
              </button>
              <button
                type="button"
                onClick={() => void remove(c.id)}
                aria-label={`Delete chat ${c.title}`}
                className="absolute right-1.5 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-ink-40 hover:bg-mist hover:text-danger group-hover:flex group-focus-within:flex"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-line/60 p-3">
          <Link
            href="/portal/assistant/plugins"
            className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm text-secondary transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <Plug className="h-4 w-4" /> Plugins &amp; commands
          </Link>
        </div>
      </nav>

      {/* Conversation */}
      <section className="relative isolate flex min-w-0 flex-1 flex-col">
        {/* Soft brand glow on the welcome screen. Fixed to the top of the screen, so it runs up behind
            the app's see-through top bar as well and nothing cuts it off. */}
        {messages.length === 0 && !sending && (
          <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[38rem] overflow-hidden">
            <div className="absolute left-[34%] top-[-5rem] h-96 w-96 rounded-full bg-[#3f6fd6]/25 blur-3xl" />
            <div className="absolute right-[8%] top-[-1rem] h-80 w-80 rounded-full bg-[#e0a92e]/25 blur-3xl" />
            <div className="absolute left-[56%] top-[-7rem] h-72 w-72 rounded-full bg-[#7f8fd0]/25 blur-3xl" />
          </div>
        )}
        <header
          className={cn(
            "flex items-center gap-2 px-5 py-3",
            messages.length === 0 && !sending ? "border-b border-transparent" : "border-b border-line/60",
          )}
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          <h1 className="min-w-0 flex-1 truncate text-base font-medium">{title}</h1>
          <button
            type="button"
            onClick={newChat}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-secondary hover:bg-mist hover:text-foreground md:hidden"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        </header>

        {status && !status.configured ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <p className="max-w-md text-sm text-secondary">
              Ask O2 is not set up yet. Add the OpenRouter key (<span className="font-mono">OPENROUTER_API_KEY</span>) to the
              API&apos;s environment to turn it on.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto" aria-live="polite">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-6">
                {messages.length === 0 && !sending ? (
                  <div className="relative flex flex-col items-center gap-7 pt-[9vh] text-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-background/80 px-3 py-1 text-xs font-medium text-secondary backdrop-blur">
                      <span className={`h-1.5 w-1.5 rounded-full ${BRAND_GRADIENT}`} aria-hidden />
                      Introducing
                    </span>
                    <div>
                      <h2 className="text-4xl font-bold leading-[1.05] tracking-[-0.03em] md:text-5xl">
                        <span className={`${BRAND_GRADIENT} bg-clip-text text-transparent`}>Finance Agent</span>
                        <br />
                        <span className="font-light text-foreground">for your daily tasks</span>
                      </h2>
                      <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-secondary">
                        Ask about invoices, vendors, payments and taxes, or tell it what to do. Every change is shown to you
                        first and runs only after you click <span className="font-medium text-foreground">Yes, do it</span>.
                      </p>
                    </div>
                    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                      {EXAMPLES.map(({ icon: Icon, title, prompt }) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => void send(prompt)}
                          className="group flex items-start gap-3 rounded-2xl border border-line bg-background/70 p-4 text-left backdrop-blur transition-all hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[0_18px_40px_-28px_rgba(63,111,214,0.55)]"
                        >
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${BRAND_GRADIENT} text-white`}>
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-medium tracking-eyebrow text-ink-40">{title}</span>
                            <span className="mt-0.5 block text-sm text-secondary group-hover:text-foreground">{prompt}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-stretch")}>
                      {m.text && (
                        <p
                          className={cn(
                            "whitespace-pre-wrap break-words text-sm leading-relaxed",
                            m.role === "user" ? "max-w-[80%] rounded-2xl bg-foreground px-4 py-2.5 text-background" : "text-foreground",
                          )}
                        >
                          {m.text}
                        </p>
                      )}
                      {m.files.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-1">
                          {m.files.map((f) => (
                            <span key={f.id} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-secondary">
                              {f.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {m.actions.map((a) => (
                        <div key={a.id} className="max-w-xl">
                          <ActionCard action={a} busy={deciding === a.id} onDecide={decide} />
                        </div>
                      ))}
                    </div>
                  ))
                )}
                {sending && (
                  <p className="flex items-center gap-2 text-sm text-ink-40">
                    <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                  </p>
                )}
                <div ref={endRef} />
              </div>
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(text);
              }}
              className="px-5 pb-5"
            >
              {/* A gradient edge: the brand colours framing the composer */}
              <div className={`relative mx-auto w-full max-w-3xl rounded-2xl p-px ${BRAND_GRADIENT} shadow-[0_18px_40px_-26px_rgba(63,111,214,0.6)]`}>
              {slashOpen && (
                <SlashMenu
                  items={slashItems}
                  active={slashIndex}
                  loading={Boolean(chosen) && recordsLoading}
                  emptyText={
                    !chosen
                      ? "No such command."
                      : slash?.query?.trim()
                        ? `No ${chosen.name} match "${slash.query.trim()}".`
                        : `No ${chosen.name} yet.`
                  }
                  onHover={setSlashActive}
                  onChoose={chooseSlash}
                  onOpen={openRecord}
                />
              )}
              <div className="rounded-[15px] bg-background p-2">
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-2 pt-1">
                    {files.map((f) => (
                      <span key={f.id} className="flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-xs text-secondary">
                        {f.name}
                        <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((all) => all.filter((x) => x.id !== f.id))}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setSlashActive(0);
                  }}
                  onKeyDown={(e) => {
                    if (slashKey(e)) return;
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(text);
                    }
                  }}
                  rows={2}
                  maxLength={MAX_TEXT}
                  placeholder="Ask the Finance Agent or tell it what to do…  Type / for records and quick asks"
                  aria-label="Message to Ask O2"
                  aria-autocomplete="list"
                  className="max-h-48 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-ink-40"
                />
                <div className="flex items-center justify-between">
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ATTACH_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void attach(file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-secondary transition-colors hover:bg-mist hover:text-foreground"
                  >
                    <Paperclip className="h-4 w-4" /> Attach
                  </button>
                  <button
                    type="submit"
                    aria-label="Send"
                    disabled={sending || !text.trim()}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${BRAND_GRADIENT} text-white transition-opacity disabled:opacity-40`}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              </div>
              {error && (
                <p role="alert" className="mx-auto mt-2 w-full max-w-3xl text-xs text-danger">
                  ⚠ {error}
                </p>
              )}
            </form>
          </>
        )}
      </section>
    </div>
  );
}
