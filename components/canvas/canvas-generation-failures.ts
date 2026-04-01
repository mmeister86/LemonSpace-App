import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import type { Doc } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";

import {
  GENERATION_FAILURE_THRESHOLD,
  GENERATION_FAILURE_WINDOW_MS,
} from "./canvas-helpers";

export function useGenerationFailureWarnings(
  t: ReturnType<typeof useTranslations<'toasts'>>,
  convexNodes: Doc<"nodes">[] | undefined,
): void {
  const recentGenerationFailureTimestampsRef = useRef<number[]>([]);
  const previousNodeStatusRef = useRef<Map<string, string | undefined>>(new Map());
  const hasInitializedGenerationFailureTrackingRef = useRef(false);

  useEffect(() => {
    if (!convexNodes) return;

    const nextNodeStatusMap = new Map<string, string | undefined>();
    let detectedGenerationFailures = 0;

    for (const node of convexNodes) {
      nextNodeStatusMap.set(node._id, node.status);

      if (node.type !== "ai-image") {
        continue;
      }

      const previousStatus = previousNodeStatusRef.current.get(node._id);
      if (
        hasInitializedGenerationFailureTrackingRef.current &&
        node.status === "error" &&
        previousStatus !== "error"
      ) {
        detectedGenerationFailures += 1;
      }
    }

    previousNodeStatusRef.current = nextNodeStatusMap;

    if (!hasInitializedGenerationFailureTrackingRef.current) {
      hasInitializedGenerationFailureTrackingRef.current = true;
      return;
    }

    if (detectedGenerationFailures === 0) {
      return;
    }

    const now = Date.now();
    const recentFailures = recentGenerationFailureTimestampsRef.current.filter(
      (timestamp) => now - timestamp <= GENERATION_FAILURE_WINDOW_MS,
    );

    for (let index = 0; index < detectedGenerationFailures; index += 1) {
      recentFailures.push(now);
    }

    if (recentFailures.length >= GENERATION_FAILURE_THRESHOLD) {
      toast.warning(t('ai.openrouterIssuesTitle'), t('ai.openrouterIssuesDesc'));
      recentGenerationFailureTimestampsRef.current = [];
      return;
    }

    recentGenerationFailureTimestampsRef.current = recentFailures;
  }, [t, convexNodes]);
}
