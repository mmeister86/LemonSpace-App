import type { ReactNode } from "react"
import { isValidElement } from "react"
import { toast as sonnerToast, type ExternalToast } from "sonner"

const SUCCESS_DURATION = 4000
const ERROR_DURATION = 6000

type SonnerPromiseInput<T> = Parameters<typeof sonnerToast.promise<T>>[0]
type SonnerPromiseOptions<T> = Parameters<typeof sonnerToast.promise<T>>[1]
type SonnerPromiseData<T> = NonNullable<SonnerPromiseOptions<T>>

function hasMessage(
  value: unknown,
): value is {
  message: ReactNode
  duration?: number
} {
  return (
    typeof value === "object" &&
    value !== null &&
    !isValidElement(value) &&
    "message" in value
  )
}

function withStateDuration<T>(state: unknown, duration: number): unknown {
  if (state === undefined) {
    return undefined
  }

  if (typeof state === "function") {
    return async (value: T) => {
      const result = await state(value)
      return withStateDuration(result, duration)
    }
  }

  if (hasMessage(state)) {
    return {
      ...state,
      duration: state.duration ?? duration,
    }
  }

  return {
    message: state as ReactNode,
    duration,
  }
}

export const toast = {
  success(message: ReactNode, options?: ExternalToast) {
    return sonnerToast.success(message, {
      ...options,
      duration: options?.duration ?? SUCCESS_DURATION,
    })
  },
  error(message: ReactNode, options?: ExternalToast) {
    return sonnerToast.error(message, {
      ...options,
      duration: options?.duration ?? ERROR_DURATION,
    })
  },
  loading(message: ReactNode, options?: ExternalToast) {
    return sonnerToast.loading(message, options)
  },
  dismiss(id?: number | string) {
    return sonnerToast.dismiss(id)
  },
  promise<T>(promise: SonnerPromiseInput<T>, options?: SonnerPromiseOptions<T>) {
    return sonnerToast.promise(promise, {
      ...options,
      success: withStateDuration<T>(options?.success, SUCCESS_DURATION) as SonnerPromiseData<T>["success"],
      error: withStateDuration<T>(options?.error, ERROR_DURATION) as SonnerPromiseData<T>["error"],
    })
  },
}

export const toastDuration = {
  success: SUCCESS_DURATION,
  error: ERROR_DURATION,
} as const
