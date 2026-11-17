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
