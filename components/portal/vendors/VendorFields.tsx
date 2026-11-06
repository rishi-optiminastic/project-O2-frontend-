"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Field, inputClass } from "@/components/portal/ui";
import { GstField } from "@/components/portal/GstField";
import { Select } from "@/components/portal/Select";
import { useAuth } from "@/lib/auth";
import { TDS_SECTIONS, type Vendor, type VendorBankAccount } from "@/lib/api";
import { FIELD_RULES, NAME_MAX, TEXT_MAX } from "@/lib/validation";

const BANK_ACCOUNTS_FIELD = "bank_accounts";
const GROUP_FIELD = "is_group_company";
const MSME_FIELD = "msme";
const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

/** Only these roles see, create or mark group companies (the backend enforces the same). */
export const GROUP_COMPANY_ROLES = ["ADMIN_CEO", "CFO"] as const;

const EMPTY_ACCOUNT: VendorBankAccount = { account_holder: "", bank_name: "", account_number: "", ifsc_code: "" };

type AccountInput = {
  key: keyof Omit<VendorBankAccount, "id">;
  label: string;
  placeholder?: string;
  mono?: boolean;
  // Format checks run in the browser so typos get a plain message; the API enforces the same rules.
  rules: React.InputHTMLAttributes<HTMLInputElement>;
};

const ACCOUNT_INPUTS: AccountInput[] = [
  { key: "account_holder", label: "Account holder", rules: { maxLength: NAME_MAX } },
  { key: "bank_name", label: "Bank name", rules: { maxLength: NAME_MAX } },
  { key: "account_number", label: "Account number", mono: true, rules: FIELD_RULES.accountNumber },
  { key: "ifsc_code", label: "IFSC code", placeholder: "HDFC0001234", mono: true, rules: FIELD_RULES.ifsc },
];

function isBlank(a: VendorBankAccount) {
  return ACCOUNT_INPUTS.every(({ key }) => !a[key].trim());
}

/**
 * The vendor onboarding fields shared by the create and edit forms, as the PROJECT O2 sheet
 * lays them out: name, email, GSTIN (fills the name and address), address, bank accounts,
 * COI (optional), MSME Yes/No with the Udyam number optional, and the TDS rate. The Group Co
 * form leaves the rate out. The PAN is taken from the GSTIN. Bank accounts are kept in state
 * and travel in a hidden JSON field, so the parent form can stay uncontrolled and read
 * everything with vendorPayload().
 */
export function VendorFields({ vendor }: { vendor?: Vendor }) {
  const [accounts, setAccounts] = useState<VendorBankAccount[]>(
    vendor?.bank_accounts.length
      ? vendor.bank_accounts.map((a) => ({
          account_holder: a.account_holder,
          bank_name: a.bank_name,
          account_number: a.account_number,
          ifsc_code: a.ifsc_code,
        }))
      : [EMPTY_ACCOUNT],
  );

  const { hasRole } = useAuth();
  const [isGroup, setIsGroup] = useState(vendor?.is_group_company ?? false);
  const [tdsSection, setTdsSection] = useState<string>(vendor?.default_tds_section ?? TDS_SECTIONS[0].key);

  // A new vendor answers the question; an existing one starts from what is on file.
  const [msme, setMsme] = useState<string | undefined>(vendor ? (vendor.msme ? "yes" : "no") : undefined);

  function update(index: number, key: keyof VendorBankAccount, value: string) {
    setAccounts((prev) => prev.map((a, i) => (i === index ? { ...a, [key]: value } : a)));
  }

  return (
    <>
      {hasRole(...GROUP_COMPANY_ROLES) && (
        <div className="sm:col-span-2">
          <GroupToggle value={isGroup} onChange={setIsGroup} />
          <input type="hidden" name={GROUP_FIELD} value={String(isGroup)} />
        </div>
      )}
      <Field label="Vendor name">
        <input name="business_name" maxLength={NAME_MAX} required defaultValue={vendor?.business_name} className={inputClass} />
      </Field>
      <Field label="Email">
        <input name="email" type="email" required defaultValue={vendor?.email} className={inputClass} />
      </Field>

      <GstField defaultValue={vendor?.gst_number} required />
      <Field label="COI (optional)">
        <input name="coi" {...FIELD_RULES.cin} defaultValue={vendor?.coi ?? ""} className={`${inputClass} font-mono`} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Address">
          <textarea
            name="address"
            required
            rows={2}
            maxLength={TEXT_MAX}
            defaultValue={vendor?.address ?? ""}
            placeholder="Filled from the GSTIN when found"
            className={`${inputClass} h-auto py-2.5`}
          />
        </Field>
      </div>
      <Field label="MSME">
        <Select name={MSME_FIELD} required options={YES_NO} value={msme} onValueChange={setMsme} placeholder="Yes or no" />
      </Field>
      {msme === "yes" ? (
        <Field label="Udyam number (optional)">
          <input
            name="msme_number"
            defaultValue={vendor?.msme_number ?? ""}
            placeholder="UDYAM-MH-00-0000000"
            {...FIELD_RULES.udyam}
            className={`${inputClass} font-mono`}
          />
        </Field>
      ) : (
        <div className="hidden sm:block" aria-hidden />
      )}
      {isGroup ? (
        // The Group Co form has no rate; the vendor keeps the one on file (or the default).
        <input type="hidden" name="default_tds_section" value={tdsSection} />
      ) : (
        <Field label="TDS rate on their invoices">
          <Select
            value={tdsSection}
            onValueChange={setTdsSection}
            options={TDS_SECTIONS.map((t) => ({ value: t.key, label: `${t.label} (${t.rate}%)` }))}
          />
          <input type="hidden" name="default_tds_section" value={tdsSection} />
        </Field>
      )}

      <fieldset className="flex flex-col gap-3 sm:col-span-2">
        <legend className="mb-3 text-xs tracking-eyebrow text-secondary">Bank accounts (at least one)</legend>
        {accounts.map((account, index) => (
          <div key={index} className="relative grid grid-cols-1 gap-3 rounded-2xl border border-line p-4 sm:grid-cols-2">
            <div className="flex items-center justify-between sm:col-span-2">
              <span className="text-xs font-medium text-secondary">Account {index + 1}</span>
              {accounts.length > 1 && (
                <button
                  type="button"
                  onClick={() => setAccounts((prev) => prev.filter((_, i) => i !== index))}
                  aria-label={`Remove account ${index + 1}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-40 transition-colors hover:bg-mist hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {ACCOUNT_INPUTS.map(({ key, label, placeholder, mono, rules }) => (
              <Field key={key} label={label}>
                <input
                  value={account[key]}
                  onChange={(e) => update(index, key, e.target.value)}
                  // The first account is required; a further one is skipped while left empty.
                  required={index === 0 || !isBlank(account)}
                  {...rules}
                  placeholder={placeholder}
                  className={mono ? `${inputClass} font-mono` : inputClass}
                />
              </Field>
            ))}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setAccounts((prev) => [...prev, EMPTY_ACCOUNT])}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-secondary transition-colors hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> Add another account
        </button>
        <input type="hidden" name={BANK_ACCOUNTS_FIELD} value={JSON.stringify(accounts.filter((a) => !isBlank(a)))} />
      </fieldset>
    </>
  );
}

/** Group company or any other vendor. Shown to the CFO and CEO only. */
function GroupToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const options = [
    { group: false, label: "Others", hint: "Any outside vendor" },
    { group: true, label: "Group Co", hint: "Our own sister company; only the CFO and CEO see it" },
  ];
  return (
    <div role="radiogroup" aria-label="Vendor type" className="grid grid-cols-2 gap-2 rounded-2xl border border-line p-1">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          role="radio"
          aria-checked={value === o.group}
          onClick={() => onChange(o.group)}
          className={
            "rounded-xl px-3 py-2 text-left text-sm transition-colors " +
            (value === o.group ? "bg-foreground text-white" : "text-secondary hover:bg-mist")
          }
        >
          <span className="block font-medium">{o.label}</span>
          <span className={"block text-xs " + (value === o.group ? "text-white/70" : "text-ink-40")}>{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

/** Reads a form that contains VendorFields into the API request body. */
export function vendorPayload(form: HTMLFormElement) {
  const fd = new FormData(form);
  const { [BANK_ACCOUNTS_FIELD]: accounts, [GROUP_FIELD]: group, ...fields } = Object.fromEntries(fd);
  return {
    ...fields,
    [MSME_FIELD]: fields[MSME_FIELD] === "yes",
    // Sent only by the CFO and CEO, who see the toggle; others leave the flag as it is.
    ...(group === undefined ? {} : { is_group_company: group === "true" }),
    bank_accounts: JSON.parse(String(accounts ?? "[]")) as VendorBankAccount[],
  };
}
