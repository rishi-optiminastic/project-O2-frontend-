"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { PORTAL_EVENTS } from "@/lib/events";

/** Minimal GET hook with loading / error / refetch. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<T>(path));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // When Ask O2 runs a change, whatever page is open reloads its data quietly (no loading state).
  useEffect(() => {
    if (!path) return;
    const quiet = () => {
      api.get<T>(path).then(setData).catch(() => {});
    };
    window.addEventListener(PORTAL_EVENTS.assistantActed, quiet);
    return () => window.removeEventListener(PORTAL_EVENTS.assistantActed, quiet);
  }, [path]);

  return { data, loading, error, refetch, setData };
}
