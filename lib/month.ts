"use client";

import { useSyncExternalStore } from "react";

/** "YYYY-MM" for one month, or ALL_TIME. */
export type MonthValue = string;
export const ALL_TIME = "all";

const STORAGE_KEY = "o2_month";
const MONTHS_LISTED = 24;

/** The current month in the user's calendar, as YYYY-MM. */
export function currentMonth(today: Date = new Date()): MonthValue {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

/** Picker options: All time, then the last 24 months, newest first. */
export function monthOptions(today: Date = new Date()): { value: MonthValue; label: string }[] {
  const fmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
  const months = Array.from({ length: MONTHS_LISTED }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    return { value: currentMonth(d), label: fmt.format(d) };
  });
  return [{ value: ALL_TIME, label: "All time" }, ...months];
}

/** Adds ?month=YYYY-MM to an API path unless "All time" is selected. */
export function withMonth(path: string, month: MonthValue): string {
  if (month === ALL_TIME) return path;
  return `${path}${path.includes("?") ? "&" : "?"}month=${month}`;
}

// One selection shared by every list on screen, remembered across pages for the session.
let selected: MonthValue | null = null;
const listeners = new Set<() => void>();

function read(): MonthValue {
  if (selected === null) {
    try {
      selected = window.sessionStorage.getItem(STORAGE_KEY) ?? currentMonth();
    } catch {
      selected = currentMonth();
    }
  }
  return selected;
}

function setMonth(next: MonthValue) {
  selected = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The selected month (defaults to the current month) and a setter. */
export function useMonth(): [MonthValue, (next: MonthValue) => void] {
  const month = useSyncExternalStore(subscribe, read, () => currentMonth());
  return [month, setMonth];
}
