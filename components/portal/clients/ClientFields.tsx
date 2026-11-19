"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Field, inputClass } from "@/components/portal/ui";
import { GstField } from "@/components/portal/GstField";
import { AgentSelect } from "@/components/portal/AgentSelect";
import { Select } from "@/components/portal/Select";
import type { AgentOption, Client } from "@/lib/api";
import { FIELD_RULES, NAME_MAX, TEXT_MAX } from "@/lib/validation";

const MSME_OPTIONS = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
];

/** Most addresses a client can add besides its official email (mirrors MAX_OTHER_EMAILS in the backend). */
const MAX_OTHER_EMAILS = 10;
/** The extra addresses travel in this hidden field as JSON, so the form can stay uncontrolled. */
const OTHER_EMAILS_FIELD = "other_emails_json";

/**
 * The client intake fields, shared by the create and edit forms. Everything is required except
 * the COI. Besides the official email a client can have more addresses; invoices go to all of them.
 */
export function ClientFields({ client, agents }: { client?: Client; agents: AgentOption[] | null }) {
  const [msme, setMsme] = useState(client?.msme ?? false);
  const [otherEmails, setOtherEmails] = useState<string[]>(client?.other_emails ?? []);

  function setEmail(index: number, value: string) {
    setOtherEmails((all) => all.map((e, i) => (i === index ? value : e)));
  }

  return (
    <>
      <Field label="Business name">
        <input name="business_name" maxLength={NAME_MAX} required defaultValue={client?.business_name} className={inputClass} />
      </Field>
      <Field label="Official email">
        <input name="email" type="email" required defaultValue={client?.email} className={inputClass} />
      </Field>

      {/* More addresses that receive the client's invoices. */}
      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-2 text-xs tracking-eyebrow text-secondary">Other emails (optional)</legend>
        {otherEmails.map((email, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(i, e.target.value)}
              placeholder="accounts@client.com"
              aria-label={`Other email ${i + 1}`}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setOtherEmails((all) => all.filter((_, j) => j !== i))}
              aria-label={`Remove ${email || "this email"}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-40 transition-colors hover:bg-mist hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setOtherEmails((all) => [...all, ""])}
            disabled={otherEmails.length >= MAX_OTHER_EMAILS}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:text-foreground disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Add another email
          </button>
          <span className="text-xs text-ink-40">Invoices and proformas are emailed to the official email and all of these.</span>
        </div>
        <input type="hidden" name={OTHER_EMAILS_FIELD} value={JSON.stringify(otherEmails.map((e) => e.trim()).filter(Boolean))} />
      </fieldset>

      <GstField defaultValue={client?.gst_number} required />
      <Field label="Referral agent">
        <AgentSelect options={agents} defaultValue={client?.agent_id} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Address">
          <textarea
            name="billing_address"
            required
            maxLength={TEXT_MAX}
            rows={2}
            defaultValue={client?.billing_address ?? ""}
            className={inputClass + " h-auto py-2.5"}
          />
        </Field>
      </div>
      <Field label="COI (optional)">
        <input name="coi" {...FIELD_RULES.cin} defaultValue={client?.coi ?? ""} className={inputClass} />
      </Field>
      <Field label="MSME">
        <Select name="msme" options={MSME_OPTIONS} value={msme ? "yes" : "no"} onValueChange={(v) => setMsme(v === "yes")} />
      </Field>
      {msme && (
        <Field label="MSME number (Udyam)">
          <input name="msme_number" required {...FIELD_RULES.udyam} defaultValue={client?.msme_number ?? ""} className={inputClass} />
        </Field>
      )}
    </>
  );
}

/** The request body for the fields above. */
export function clientBody(fd: FormData) {
  const { [OTHER_EMAILS_FIELD]: otherEmails, ...fields } = Object.fromEntries(fd);
  return {
    ...fields,
    other_emails: JSON.parse(String(otherEmails ?? "[]")) as string[],
    agent_id: Number(fd.get("agent_id")),
    msme: fd.get("msme") === "yes",
  };
}
