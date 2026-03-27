"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConvexConnectionState } from "convex/react";

import { cn } from "@/lib/utils";
import { toast, toastDuration } from "@/lib/toast";
import { msg } from "@/lib/toast-messages";

type BannerState = "hidden" | "reconnecting" | "disconnected" | "reconnected";

const RECONNECTED_HIDE_DELAY_MS = 1800;

export default function ConnectionBanner() {
  const connectionState = useConvexConnectionState();
  const previousConnectedRef = useRef(connectionState.isWebSocketConnected);
  const disconnectToastIdRef = useRef<string | number | undefined>(undefined);
  const [showReconnected, setShowReconnected] = useState(false);
  const [isBrowserOnline, setIsBrowserOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setIsBrowserOnline(true);
    const handleOffline = () => setIsBrowserOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const wasConnected = previousConnectedRef.current;
    const isConnected = connectionState.isWebSocketConnected;
    const didReconnect =
      !wasConnected && isConnected && connectionState.connectionCount > 1;

    if (didReconnect) {
      queueMicrotask(() => {
        setShowReconnected(true);
      });
    }

    if (!isConnected) {
      queueMicrotask(() => {
        setShowReconnected(false);
      });
    }

    previousConnectedRef.current = isConnected;
  }, [connectionState.connectionCount, connectionState.isWebSocketConnected]);

  useEffect(() => {
    if (!showReconnected) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowReconnected(false);
    }, RECONNECTED_HIDE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [showReconnected]);

  useEffect(() => {
    const connected = connectionState.isWebSocketConnected;
    const shouldAlertDisconnect =
      !connected &&
      (!isBrowserOnline ||
        connectionState.hasEverConnected ||
        connectionState.connectionRetries > 0);

    if (shouldAlertDisconnect) {
      if (disconnectToastIdRef.current === undefined) {
        disconnectToastIdRef.current = toast.error(
          msg.system.connectionLost.title,
          msg.system.connectionLost.desc,
          { duration: Number.POSITIVE_INFINITY },
        );
      }
      return;
    }

    if (connected && disconnectToastIdRef.current !== undefined) {
      toast.dismiss(disconnectToastIdRef.current);
      disconnectToastIdRef.current = undefined;
      toast.success(msg.system.reconnected.title, undefined, {
        duration: toastDuration.successShort,
      });
    }
  }, [
    connectionState.connectionRetries,
    connectionState.hasEverConnected,
    connectionState.isWebSocketConnected,
    isBrowserOnline,
  ]);

  const bannerState = useMemo<BannerState>(() => {
    if (connectionState.isWebSocketConnected) {
      return showReconnected ? "reconnected" : "hidden";
    }

    if (!isBrowserOnline) {
      return "disconnected";
    }

    if (connectionState.hasEverConnected || connectionState.connectionRetries > 0) {
      return "reconnecting";
    }

    return "hidden";
  }, [
    connectionState.connectionRetries,
    connectionState.hasEverConnected,
    connectionState.isWebSocketConnected,
    isBrowserOnline,
    showReconnected,
  ]);

  if (bannerState === "hidden") {
    return null;
  }

  const contentByState: Record<Exclude<BannerState, "hidden">, { dotClass: string; text: string }> = {
    reconnecting: {
      dotClass: "bg-amber-500",
      text: "Verbindung wird wiederhergestellt…",
    },
    disconnected: {
      dotClass: "bg-destructive",
      text: "Keine Verbindung. Wir verbinden uns automatisch erneut.",
    },
    reconnected: {
      dotClass: "bg-emerald-500",
      text: "Verbindung wiederhergestellt",
    },
  };

  const content = contentByState[bannerState];

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2">
      <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
        <span className={cn("h-1.5 w-1.5 rounded-full", content.dotClass)} aria-hidden="true" />
        <span>{content.text}</span>
      </div>
    </div>
  );
}
