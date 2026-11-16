import type { Invoice } from "@/lib/api";

/** Rounding slack, matching the backend's settlement tolerance. */
export const RECEIPT_TOLERANCE = 0.01;

const paise = (n: number) => Math.round(n * 100) / 100;

/** TDS the client has yet to deduct; it settles part of what is due without cash. */
export function tdsStillExpected(invoice: Invoice): number {
  const tdsSoFar = (invoice.payments ?? []).reduce((sum, p) => sum + p.tds_deducted, 0);
  return Math.min(Math.max(paise(invoice.expected_tds - tdsSoFar), 0), invoice.amount_pending);
}

/**
 * Cash that clears an invoice: what is pending less the TDS the client keeps. The invoice list
 * carries no payments, so the TDS still expected is the full expected TDS while nothing is received.
 */
export function cashToClear(invoice: Invoice): number {
  return Math.max(paise(invoice.amount_pending - tdsStillExpected(invoice)), 0);
}

/** Oldest invoice first (by tax invoice date, then id), the order a client's money is applied in. */
export function oldestFirst(invoices: Invoice[]): Invoice[] {
  return [...invoices].sort((a, b) => (a.invoice_date ?? "").localeCompare(b.invoice_date ?? "") || a.id - b.id);
}

/** Split ``total`` over the invoices oldest first, each up to the cash that clears it; what is left stays unallocated. */
export function splitOldestFirst(total: number, invoices: Invoice[]): Record<number, number> {
  let left = paise(total);
  const split: Record<number, number> = {};
  for (const inv of oldestFirst(invoices)) {
    const share = Math.min(left, cashToClear(inv));
    split[inv.id] = paise(Math.max(share, 0));
    left = paise(left - split[inv.id]);
  }
  return split;
}

/**
 * Split ``total`` equally across every service line of the invoices, then add it up per invoice.
 *
 * Each line can take at most its part of the cash that clears its invoice (in proportion to the
 * line's amount with GST). A line that needs less than an equal share is settled and the rest is
 * shared among the other lines, so the split is as even as the invoices allow. Worked in paise;
 * what no line can take stays unallocated.
 */
export function splitEquallyByService(total: number, invoices: Invoice[]): Record<number, number> {
  const lines: { invoiceId: number; owed: number }[] = [];
  for (const inv of invoices) {
    const cash = Math.round(cashToClear(inv) * 100);
    const weights = inv.lines?.length ? inv.lines.map((l) => l.taxable_value + l.gst_amount) : [1];
    const sum = weights.reduce((s, w) => s + w, 0) || 1;
    let given = 0;
    weights.forEach((w, i) => {
      const owed = i === weights.length - 1 ? cash - given : Math.floor((cash * w) / sum);
      given += owed;
      lines.push({ invoiceId: inv.id, owed });
    });
  }
  let left = Math.round(total * 100);
  const open = lines.filter((l) => l.owed > 0).sort((a, b) => a.owed - b.owed);
  const taken = open.map((l, i) => {
    const take = Math.min(l.owed, Math.floor(left / (open.length - i)));
    left -= take;
    return take;
  });
  // Paise left by rounding down go one each to lines with room.
  open.forEach((l, i) => {
    if (left > 0 && taken[i] < l.owed) {
      taken[i] += 1;
      left -= 1;
    }
  });
  const split: Record<number, number> = Object.fromEntries(invoices.map((inv) => [inv.id, 0]));
  open.forEach((l, i) => (split[l.invoiceId] += taken[i]));
  return Object.fromEntries(Object.entries(split).map(([id, p]) => [id, paise(p / 100)]));
}

/** How many services an invoice bills (an invoice from before lines existed counts as one). */
export function serviceCount(invoice: Invoice): number {
  return invoice.lines?.length || 1;
}

/** Share ``gst`` over the lines in proportion to their amounts; the last line takes the rounding. */
export function splitGst(gst: number, amounts: number[]): number[] {
  const total = amounts.reduce((s, a) => s + a, 0);
  if (gst <= 0 || total <= 0) return amounts.map(() => 0);
  let given = 0;
  return amounts.map((a, i) => {
    if (i === amounts.length - 1) return paise(gst - given);
    const share = paise((gst * a) / total);
    given = paise(given + share);
    return share;
  });
}
