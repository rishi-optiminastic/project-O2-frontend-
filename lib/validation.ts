/**
 * Finance input rules for form fields, mirroring the API (backend app/schemas/fields.py).
 * The browser catches typos as people type; the API still enforces every rule.
 *
 * Patterns are matched by the browser with the `v` flag, so "-" and "/" inside
 * a character class are escaped. Letters accept either case: the API upper-cases.
 */

/** GST slabs on services; 12% and 28% remain for bills dated before September 2025. */
export const GST_RATE_SLABS = [0, 5, 12, 18, 28, 40] as const;
export const GST_RATE_OPTIONS = GST_RATE_SLABS.map((r) => ({ value: String(r), label: `${r}%` }));
/** The highest TDS rate in use (section 206AA, payee without PAN). */
export const MAX_TDS_RATE = 20;
/** The largest single amount accepted: ₹10,000 crore. */
export const MAX_AMOUNT = 100_000_000_000;
/** Longest name, title or single-line text the API accepts. */
export const NAME_MAX = 160;
/** Longest note, address or description the API accepts. */
export const TEXT_MAX = 2000;
/** No GST invoice or bill is older than 1 July 2017. */
export const GST_START = "2017-07-01";

const HOLDER_TYPE = "[ABCFGHJLPTabcfghjlpt]";

type TextRule = {
  pattern: string;
  title: string;
  maxLength: number;
  spellCheck: false;
  autoCapitalize: "characters";
  inputMode?: "numeric" | "tel";
};

function code(pattern: string, title: string, maxLength: number, inputMode?: TextRule["inputMode"]): TextRule {
  return { pattern, title, maxLength, spellCheck: false, autoCapitalize: "characters", inputMode };
}

/** Spread onto an <input>: `<input name="pan" {...FIELD_RULES.pan} />`. */
export const FIELD_RULES = {
  gstin: code(
    `[0-9]{2}[A-Za-z]{3}${HOLDER_TYPE}[A-Za-z][0-9]{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]`,
    "15 characters: state code, PAN, entity number, Z, check character (e.g. 27AAPFU0939F1ZV)",
    15,
  ),
  pan: code(`[A-Za-z]{3}${HOLDER_TYPE}[A-Za-z][0-9]{4}[A-Za-z]`, "10 characters like ABCDE1234F", 10),
  ifsc: code("[A-Za-z]{4}0[A-Za-z0-9]{6}", "11 characters: 4 letters, a zero, then 6 letters or digits (e.g. HDFC0001234)", 11),
  accountNumber: code("[0-9]{9,18}", "9 to 18 digits, no spaces", 18, "numeric"),
  udyam: code("[Uu][Dd][Yy][Aa][Mm]-[A-Za-z]{2}-[0-9]{2}-[0-9]{7}", "Like UDYAM-MH-26-0012345", 19),
  cin: code(
    "[LlUu][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}|[A-Za-z]{3}-[0-9]{4}",
    "21 character CIN (e.g. U72900MH2015PTC123456) or an LLPIN like AAB-1234",
    21,
  ),
  sac: code("99[0-9]{4}", "6 digits starting with 99 (e.g. 998311)", 6, "numeric"),
  invoiceNumber: code("[A-Za-z0-9\\/\\-]{1,16}", "Up to 16 letters, digits, - or / (GST rule 46)", 16),
  bankReference: code("[A-Za-z0-9]{6,22}", "UTR, RRN or cheque number: 6 to 22 letters or digits", 22),
  taxDocument: code("[A-Za-z0-9]{5,20}", "5 to 20 letters or digits, no spaces or symbols", 20),
  phone: code("\\+?[0-9 \\-]{8,18}", "10 digit mobile, landline with STD code, or +country code and number", 18, "tel"),
} satisfies Record<string, TextRule>;

/** For inputs outside a <form>, where the browser does not check the pattern on submit. */
export function matchesRule(rule: TextRule, value: string): boolean {
  return new RegExp(`^(?:${rule.pattern})$`, "u").test(value.trim());
}

type NumberRule = { type: "number"; step: string; min: string; max: string; inputMode: "decimal" };

function number(min: number, max: number): NumberRule {
  return { type: "number", step: "0.01", min: String(min), max: String(max), inputMode: "decimal" };
}

export const NUMBER_RULES = {
  /** Zero or more rupees, in paise. */
  money: number(0, MAX_AMOUNT),
  /** More than zero rupees. */
  positiveMoney: number(0.01, MAX_AMOUNT),
  percent: number(0, 100),
  tdsRate: number(0, MAX_TDS_RATE),
} satisfies Record<string, NumberRule>;

/** Today's date in India as YYYY-MM-DD, the API's calendar for "not in the future". */
export function indiaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** For a date something already happened on: a payment, a bill, a deposit. */
export function pastDateRule() {
  return { type: "date" as const, min: GST_START, max: indiaToday() };
}

/** For a date that is due later, such as an invoice's due date. */
export function futureDateRule() {
  return { type: "date" as const, min: indiaToday() };
}

const FIELD_LABELS: Record<string, string> = {
  gst_number: "GSTIN",
  pan: "PAN",
  ifsc_code: "IFSC",
  coi: "CIN",
  msme_number: "Udyam number",
  sac_code: "SAC code",
  tds_rate: "TDS rate",
  gst_rate: "GST rate",
  gst_component: "GST component",
  tds_deducted: "TDS deducted",
};

function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1).replaceAll("_", " ");
}

type ValidationIssue = { loc?: (string | number)[]; msg?: string };

/** Turn the API's list of field errors into one readable sentence per problem. */
export function describeValidationErrors(issues: ValidationIssue[]): string {
  return issues
    .map(({ loc = [], msg = "Invalid value" }) => {
      const text = msg.replace(/^Value error, /, "");
      const field = [...loc].reverse().find((part): part is string => typeof part === "string" && part !== "body");
      return field ? `${fieldLabel(field)}: ${text}` : text;
    })
    .join(" ");
}
