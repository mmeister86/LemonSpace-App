import { useRef, useCallback, useEffect } from "react";

/**
 * Debounced callback — ruft `callback` erst auf, wenn `delay` ms
 * ohne erneuten Aufruf vergangen sind. Perfekt für Auto-Save.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number,
): (...args: Args) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

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

  const debouncedFn = useCallback(
    (...args: Args) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay],
  );

  return debouncedFn;
}
