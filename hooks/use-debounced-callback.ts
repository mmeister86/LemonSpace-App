import { useRef, useCallback, useEffect, useMemo } from "react";

type DebouncedCallback<Args extends unknown[]> = ((...args: Args) => void) & {
  flush: () => void;
  cancel: () => void;
};

/**
 * Debounced callback — ruft `callback` erst auf, wenn `delay` ms
 * ohne erneuten Aufruf vergangen sind. Perfekt für Auto-Save.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number,
): DebouncedCallback<Args> {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const argsRef = useRef<Args | null>(null);

  // Callback-Ref aktuell halten ohne neu zu rendern
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup bei Unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    argsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (!timeoutRef.current) {
      return;
    }

    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;

    const args = argsRef.current;
    argsRef.current = null;
    if (args) {
      callbackRef.current(...args);
    }
  }, []);

  return useMemo(() => {
    const debouncedCallback = ((...args: Args) => {
      argsRef.current = args;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        const nextArgs = argsRef.current;
        argsRef.current = null;
        if (nextArgs) {
          callbackRef.current(...nextArgs);
        }
      }, delay);
    }) as DebouncedCallback<Args>;

    debouncedCallback.flush = flush;
    debouncedCallback.cancel = cancel;

    return debouncedCallback;
  }, [cancel, delay, flush]);
}
