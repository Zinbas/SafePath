import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchExternalIncidents } from '../services/incidents';
import type { IngestionResult } from '../services/incidents';

export interface LiveIncidentsState {
  data: IngestionResult | null;
  error: string;
  loading: boolean;
  /** Local timestamp of the last successful fetch. */
  updatedAt: number | null;
  refresh: () => void;
}

const MAX_BACKOFF_MS = 240_000; // 4 minutes max

/**
 * Polls the ingestion API so the UI shows current news without a manual refresh.
 * Pauses polling when the tab is hidden to save network/battery.
 * Uses exponential error backoff (60s -> 120s -> 240s) on repeated failures.
 */
export function useLiveIncidents(refreshMs = 60_000): LiveIncidentsState {
  const [data, setData] = useState<IngestionResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);

  const controllerRef = useRef<AbortController | null>(null);
  const failureCountRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const clearScheduled = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const scheduleNext = (delayMs: number) => {
      clearScheduled();
      if (cancelled) return;
      timerRef.current = window.setTimeout(() => {
        // Do not poll if the tab is hidden
        if (document.visibilityState === 'hidden') return;
        void load(false);
      }, delayMs);
    };

    const load = async (showSpinner: boolean) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      if (showSpinner) setLoading(true);

      try {
        const result = await fetchExternalIncidents(controller.signal);
        if (cancelled) return;
        setData(result);
        setError('');
        setUpdatedAt(Date.now());
        failureCountRef.current = 0; // Reset backoff on success
        scheduleNext(refreshMs);
      } catch (loadError) {
        if (cancelled || (loadError instanceof Error && loadError.name === 'AbortError')) return;
        failureCountRef.current += 1;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load live reports.');

        // Exponential backoff: base * 2^failures, capped at 240s
        const backoffMultiplier = Math.pow(2, Math.min(failureCountRef.current, 3));
        const backoffMs = Math.min(refreshMs * backoffMultiplier, MAX_BACKOFF_MS);
        scheduleNext(backoffMs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load(true);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible again; if stale or no pending timer, refresh immediately
        clearScheduled();
        void load(false);
      } else {
        // Tab hidden; cancel pending poll
        clearScheduled();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      clearScheduled();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      controllerRef.current?.abort();
    };
  }, [refreshMs, requestNumber]);

  const refresh = useCallback(() => {
    failureCountRef.current = 0;
    setRequestNumber((value) => value + 1);
  }, []);

  return { data, error, loading, updatedAt, refresh };
}
