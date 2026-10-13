"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Field, inputClass } from "@/components/portal/ui";
import { GstField } from "@/components/portal/GstField";
import type { Vendor, VendorBankAccount } from "@/lib/api";
import { FIELD_RULES, NAME_MAX } from "@/lib/validation";

const BANK_ACCOUNTS_FIELD = "bank_accounts";

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
 * The vendor onboarding fields shared by the create and edit forms.
 * Bank accounts are kept in state and travel in a hidden JSON field, so the
 * parent form can stay uncontrolled and read everything with vendorPayload().
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

  function update(index: number, key: keyof VendorBankAccount, value: string) {
    setAccounts((prev) => prev.map((a, i) => (i === index ? { ...a, [key]: value } : a)));
  }

  return (
    <>
      <Field label="Vendor name">
        <input name="business_name" maxLength={NAME_MAX} required defaultValue={vendor?.business_name} className={inputClass} />
      </Field>
      <Field label="Email">
        <input name="email" type="email" required defaultValue={vendor?.email} className={inputClass} />
      </Field>
      <Field label="Phone">
        <input name="phone" type="tel" {...FIELD_RULES.phone} defaultValue={vendor?.phone ?? ""} className={inputClass} />
      </Field>
      <GstField defaultValue={vendor?.gst_number} />
      <Field label="MSME (Udyam number, if registered)">
        <input
          name="msme_number"
          defaultValue={vendor?.msme_number ?? ""}
          placeholder="UDYAM-MH-00-0000000"
          {...FIELD_RULES.udyam}
          className={`${inputClass} font-mono`}
        />
      </Field>
      <Field label="COI (Certificate of Incorporation)">
        <input name="coi" {...FIELD_RULES.cin} defaultValue={vendor?.coi ?? ""} className={`${inputClass} font-mono`} />
      </Field>
      <Field label="PAN">
        <input
          name="pan"
          defaultValue={vendor?.pan ?? ""}
          placeholder="AAAAA0000A"
          {...FIELD_RULES.pan}
          className={`${inputClass} font-mono`}
        />
      </Field>

      <fieldset className="flex flex-col gap-3 sm:col-span-2">
        <legend className="mb-3 text-xs tracking-eyebrow text-secondary">Bank accounts</legend>
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
                  // An untouched account is skipped; a started one must be complete.
                  required={!isBlank(account)}
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

/** Reads a form that contains VendorFields into the API request body. */
export function vendorPayload(form: HTMLFormElement) {
  const fd = new FormData(form);
  const { [BANK_ACCOUNTS_FIELD]: accounts, ...fields } = Object.fromEntries(fd);
  return { ...fields, bank_accounts: JSON.parse(String(accounts ?? "[]")) as VendorBankAccount[] };
}
