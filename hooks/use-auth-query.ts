"use client";

import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";

/**
 * Wrapper um `useQuery` der automatisch `"skip"` nutzt wenn der
 * Convex-Auth-Token noch nicht bereit ist. Verhindert "Unauthenticated"-Fehler
 * bei Queries die `requireAuth` nutzen.
 *
 * Nutzt nur `isAuthenticated` (nicht `isLoading`) als Guard — wenn ein
 * `initialToken` vom SSR vorhanden ist, springt `isAuthenticated` sofort
 * auf `true` ohne Loading-Phase, sodass Queries ohne Verzögerung feuern.
 */
export function useAuthQuery<F extends FunctionReference<"query">>(
  query: F,
  ...args: [] | [FunctionArgs<F> | "skip"]
): FunctionReturnType<F> | undefined {
  const { isAuthenticated } = useConvexAuth();

  const shouldSkip = !isAuthenticated || args[0] === "skip";

  return useQuery(query, shouldSkip ? "skip" : (args[0] ?? ({} as FunctionArgs<F>)));
}
