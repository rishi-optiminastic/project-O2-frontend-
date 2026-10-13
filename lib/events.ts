"use client";

import { useEffect } from "react";

/**
 * Portal-wide signals for changes made from shared UI (like the floating
 * "Record receipt / Record payment" button), so whichever page is open can
 * refresh its own figures.
 */
export const PORTAL_EVENTS = {
  receiptRecorded: "o2:receipt-recorded",
  paymentRequested: "o2:payment-requested",
} as const;

type PortalEvent = (typeof PORTAL_EVENTS)[keyof typeof PORTAL_EVENTS];

export function emitPortalEvent(event: PortalEvent) {
  window.dispatchEvent(new Event(event));
}

/** Run `handler` whenever `event` fires anywhere in the portal. */
export function usePortalEvent(event: PortalEvent, handler: () => void) {
  useEffect(() => {
    window.addEventListener(event, handler);
    return () => window.removeEventListener(event, handler);
  }, [event, handler]);
}
