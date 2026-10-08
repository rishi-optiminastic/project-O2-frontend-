"use client";

import { useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Field, inputClass } from "@/components/portal/ui";
import { api, ApiError, type GstLookupResult } from "@/lib/api";

/**
 * GST number input that verifies the GSTIN and auto-fills sibling form fields.
 *
 * Designed for the existing uncontrolled (FormData) forms: on a valid 15-char
 * GSTIN it looks the number up and writes the result into any of these inputs
 * that live in the same <form> and are still empty — so it never clobbers what
 * the user has already typed:
 *   business_name  ← trade name (or legal name)
 *   legal_name     ← legal name
 *   pan            ← PAN (derived from the GSTIN)
 *   address        ← registered address   (vendor / agent forms)
 *   billing_address← registered address   (client form)
 */

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; result: GstLookupResult }
  | { kind: "warn"; message: string };

const FILL: Record<string, (r: GstLookupResult) => string | null | undefined> = {
  business_name: (r) => r.trade_name ?? r.legal_name,
  legal_name: (r) => r.legal_name,
  pan: (r) => r.pan,
  address: (r) => r.address,
  billing_address: (r) => r.address,
};

export function GstField({
  label = "GST number",
  defaultValue,
}: {
  label?: string;
  defaultValue?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueried = useRef<string>("");
  const [state, setState] = useState<State>({ kind: "idle" });

  function fillForm(r: GstLookupResult) {
    const form = inputRef.current?.form;
    if (!form) return;
    for (const [name, pick] of Object.entries(FILL)) {
      const el = form.elements.namedItem(name);
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) continue;
      const value = pick(r);
      if (value && !el.value.trim()) {
        el.value = value;
        // Nudge any listeners (kept uncontrolled, but harmless + future-proof).
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  }

  async function run(raw: string) {
    const gstin = raw.trim().toUpperCase();
    if (gstin.length !== 15 || gstin === lastQueried.current) return;
    lastQueried.current = gstin;
    setState({ kind: "loading" });
    try {
      const result = await api.lookupGst(gstin);
      if (!result.valid) {
        setState({ kind: "warn", message: result.message ?? "Invalid GSTIN." });
        return;
      }
      fillForm(result);
      setState({ kind: "ok", result });
    } catch (e) {
      setState({ kind: "warn", message: e instanceof ApiError ? e.message : "Lookup failed." });
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (state.kind !== "idle") setState({ kind: "idle" });
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length === 15) {
      timer.current = setTimeout(() => run(v), 400);
    } else {
      lastQueried.current = "";
    }
  }

  return (
    <Field label={label}>
      <input
        ref={inputRef}
        name="gst_number"
        defaultValue={defaultValue ?? undefined}
        className={inputClass}
        placeholder="22AAAAA0000A1Z5"
        maxLength={15}
        autoCapitalize="characters"
        spellCheck={false}
        onChange={onChange}
        onBlur={(e) => run(e.target.value)}
      />
      <GstStatus state={state} />
    </Field>
  );
}

function GstStatus({ state }: { state: State }) {
  if (state.kind === "idle") return null;

  if (state.kind === "loading") {
    return (
      <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-40">
        <Loader2 className="h-3 w-3 animate-spin" /> Verifying GSTIN…
      </span>
    );
  }

  if (state.kind === "warn") {
    return (
      <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-foreground/70">
        <AlertCircle className="h-3 w-3" /> {state.message}
      </span>
    );
  }

  const r = state.result;
  const name = r.legal_name ?? r.trade_name;
  const bits = [name, r.state, r.status].filter(Boolean).join(" · ");
  return (
    <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-secondary">
      <CheckCircle2 className="h-3 w-3 text-foreground" />
      {name ? `Verified — ${bits}` : `Valid · PAN ${r.pan ?? "—"} · ${r.state ?? ""}`}
    </span>
  );
}
