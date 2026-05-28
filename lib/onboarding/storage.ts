"use client";

export type OnboardingTourStatus = "started" | "completed" | "skipped";
export type OnboardingTourKey = "dashboardTour" | "canvasTour";
export type OnboardingMilestone = "firstWorkspace" | "firstOutput";

export type OnboardingTourState = {
  status: OnboardingTourStatus;
  lastStep?: number;
  startedAt?: number;
  completedAt?: number;
  skippedAt?: number;
};

export type OnboardingState = {
  dashboardTour?: OnboardingTourState;
  canvasTour?: OnboardingTourState;
  firstWorkspaceCreatedAt?: number;
  firstOutputCreatedAt?: number;
};

export type PendingCanvasTour = {
  canvasId: string;
  createdAt: number;
};

const ONBOARDING_STATE_PREFIX = "lemonspace.onboarding:state:v1:";
export const ONBOARDING_PENDING_CANVAS_TOUR_KEY =
  "lemonspace.onboarding:pending-canvas-tour:v1";

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function stateKey(userId: string) {
  return `${ONBOARDING_STATE_PREFIX}${userId}`;
}

function isTerminalTourState(value: OnboardingTourState | undefined) {
  return value?.status === "completed" || value?.status === "skipped";
}

function mergeTourState(
  remote: OnboardingTourState | undefined,
  local: OnboardingTourState | undefined,
): OnboardingTourState | undefined {
  if (isTerminalTourState(remote)) return remote;
  if (isTerminalTourState(local)) return local;
  if (!remote) return local;
  if (!local) return remote;

  return {
    ...remote,
    ...local,
    startedAt: remote.startedAt ?? local.startedAt,
    lastStep: Math.max(remote.lastStep ?? 0, local.lastStep ?? 0),
  };
}

export function mergeOnboardingState(
  remote: OnboardingState | null | undefined,
  local: OnboardingState | null | undefined,
): OnboardingState {
  const remoteState = remote ?? {};
  const localState = local ?? {};

  return {
    dashboardTour: mergeTourState(remoteState.dashboardTour, localState.dashboardTour),
    canvasTour: mergeTourState(remoteState.canvasTour, localState.canvasTour),
    firstWorkspaceCreatedAt:
      remoteState.firstWorkspaceCreatedAt ?? localState.firstWorkspaceCreatedAt,
    firstOutputCreatedAt:
      remoteState.firstOutputCreatedAt ?? localState.firstOutputCreatedAt,
  };
}

export function readLocalOnboardingState(userId: string): OnboardingState | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  return safeParse<OnboardingState>(storage.getItem(stateKey(userId)));
}

export function writeLocalOnboardingState(userId: string, state: OnboardingState) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(stateKey(userId), JSON.stringify(state));
  } catch {
    // Local onboarding state is a convenience cache; Convex remains authoritative.
  }
}

export function updateLocalOnboardingState(
  userId: string,
  updater: (current: OnboardingState) => OnboardingState,
) {
  const current = readLocalOnboardingState(userId) ?? {};
  const next = updater(current);
  writeLocalOnboardingState(userId, next);
  return next;
}

export function readPendingCanvasTour(): PendingCanvasTour | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  return safeParse<PendingCanvasTour>(
    storage.getItem(ONBOARDING_PENDING_CANVAS_TOUR_KEY),
  );
}

export function writePendingCanvasTour(value: PendingCanvasTour) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(ONBOARDING_PENDING_CANVAS_TOUR_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage failures; the user can still start Canvas onboarding manually.
  }
}

export function clearPendingCanvasTour() {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.removeItem(ONBOARDING_PENDING_CANVAS_TOUR_KEY);
}
