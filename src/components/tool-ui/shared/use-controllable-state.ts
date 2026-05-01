"use client";

/**
 * Onboarding note:
 * Source module for use controllable state. Keep it isolated from UI concerns unless explicitly used as a client entry point.
 */

import { useCallback, useMemo, useState } from "react";

export type UseControllableStateOptions<T> = {
  value?: T;
  defaultValue: T;
  onChange?: (next: T) => void;
};

export function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: UseControllableStateOptions<T>) {
  const [uncontrolled, setUncontrolled] = useState<T>(defaultValue);
  const isControlled = value !== undefined;

  const currentValue = useMemo(
    () => (isControlled ? (value as T) : uncontrolled),
    [isControlled, value, uncontrolled],
  );

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === "function"
          ? (next as (prev: T) => T)(currentValue)
          : next;

      if (!isControlled) {
        setUncontrolled(resolved);
      }

      onChange?.(resolved);
      return resolved;
    },
    [currentValue, isControlled, onChange],
  );

  const setUncontrolledValue = useCallback((next: T) => {
    setUncontrolled(next);
  }, []);

  return {
    value: currentValue,
    isControlled,
    setValue,
    setUncontrolledValue,
  };
}
