"use client";

/**
 * Onboarding note:
 * Source module for use signature reset. Keep it isolated from UI concerns unless explicitly used as a client entry point.
 */

import { useEffect, useRef } from "react";

export function useSignatureReset(
  signature: string,
  onSignatureChange: () => void,
) {
  const previousSignature = useRef(signature);

  useEffect(() => {
    if (previousSignature.current === signature) return;
    previousSignature.current = signature;
    onSignatureChange();
  }, [signature, onSignatureChange]);
}
