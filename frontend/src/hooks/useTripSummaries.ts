import { useCallback, useEffect, useState } from 'react';
import { listTripSummaries, type TripSummary } from '../data/repo';

interface Result {
  summaries: TripSummary[];
  /** 首次載入是否還在進行。IndexedDB 很快，但不是同步的。 */
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** 讀取存檔列表。寫入後呼叫 `reload()` 重抓。 */
export function useTripSummaries(): Result {
  const [summaries, setSummaries] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    listTripSummaries().then(
      (rows) => {
        if (cancelled) return;
        setSummaries(rows);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '讀取存檔失敗');
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { summaries, loading, error, reload };
}
