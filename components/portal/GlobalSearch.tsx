"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, Users, Truck, CornerDownLeft } from "lucide-react";
import { api, type Client, type Invoice, type Vendor } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Hit {
  type: "client" | "invoice" | "vendor";
  id: number;
  title: string;
  subtitle: string;
  href: string;
}

const ICONS = { client: Users, invoice: FileText, vendor: Truck };

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K to focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside to close
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const runSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [clients, invoices, vendors] = await Promise.all([
        api.get<Client[]>(`/clients?search=${encodeURIComponent(query)}`).catch(() => []),
        api.get<Invoice[]>(`/invoices?search=${encodeURIComponent(query)}`).catch(() => []),
        api.get<Vendor[]>(`/vendors?search=${encodeURIComponent(query)}`).catch(() => []),
      ]);
      const out: Hit[] = [
        ...invoices.slice(0, 5).map((i) => ({
          type: "invoice" as const,
          id: i.id,
          title: i.display_number,
          subtitle: `${formatINR(i.total_amount)} · ${i.status}`,
          href: `/portal/invoices/${i.id}`,
        })),
        ...clients.slice(0, 5).map((c) => ({
          type: "client" as const,
          id: c.id,
          title: c.business_name,
          subtitle: c.email,
          href: `/portal/clients/${c.id}`,
        })),
        ...vendors.slice(0, 5).map((v) => ({
          type: "vendor" as const,
          id: v.id,
          title: v.business_name,
          subtitle: v.is_verified ? "Verified vendor" : "Vendor",
          href: `/portal/vendors/${v.id}`,
        })),
      ];
      setHits(out);
      setActive(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => runSearch(q), 220);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  const go = (hit: Hit) => {
    setOpen(false);
    setQ("");
    router.push(hit.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      go(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="flex h-10 w-72 items-center gap-2 rounded-full border border-white/60 bg-white/55 px-4 text-sm text-ink-40 focus-within:border-foreground/30">
        <Search className="h-4 w-4 shrink-0" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search everything…"
          aria-label="Search clients, invoices and vendors"
          className="w-full bg-transparent text-foreground outline-none placeholder:text-ink-40"
        />
        <kbd className="hidden shrink-0 rounded border border-line bg-white/70 px-1.5 text-[10px] text-ink-40 sm:block">
          ⌘K
        </kbd>
      </div>

      {open && q.trim().length >= 2 && (
        <div className="popover-surface absolute right-0 top-12 z-[120] w-80 overflow-hidden rounded-2xl p-2 shadow-[0_30px_60px_-30px_rgba(17,17,17,0.35)]">
          {loading && <p className="px-3 py-3 text-sm text-ink-40">Searching…</p>}
          {!loading && hits.length === 0 && (
            <p className="px-3 py-3 text-sm text-ink-40">No matches for “{q}”.</p>
          )}
          {!loading &&
            hits.map((hit, i) => {
              const Icon = ICONS[hit.type];
              return (
                <button
                  key={`${hit.type}-${hit.id}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(hit)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    i === active ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.04]",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white/60">
                    <Icon className="h-4 w-4 text-secondary" strokeWidth={1.5} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{hit.title}</span>
                    <span className="block truncate text-xs text-ink-40">{hit.subtitle}</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-ink-40">{hit.type}</span>
                </button>
              );
            })}
          {!loading && hits.length > 0 && (
            <div className="mt-1 flex items-center gap-1.5 border-t border-white/55 px-3 pt-2 text-[10px] text-ink-40">
              <CornerDownLeft className="h-3 w-3" /> to open · ↑↓ to navigate
            </div>
          )}
        </div>
      )}
    </div>
  );
}
