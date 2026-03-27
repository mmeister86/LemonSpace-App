import { gooeyToast, type GooeyPromiseData } from "goey-toast";

const DURATION = {
  success: 4000,
  successShort: 2000,
  error: 6000,
  warning: 5000,
  info: 4000,
} as const;

export type ToastDurationOverrides = {
  duration?: number;
};

export const toast = {
  success(
    message: string,
    description?: string,
    opts?: ToastDurationOverrides,
  ) {
    return gooeyToast.success(message, {
      description,
      duration: opts?.duration ?? DURATION.success,
    });
  },

  error(
    message: string,
    description?: string,
    opts?: ToastDurationOverrides,
  ) {
    return gooeyToast.error(message, {
      description,
      duration: opts?.duration ?? DURATION.error,
    });
  },

  warning(
    message: string,
    description?: string,
    opts?: ToastDurationOverrides,
  ) {
    return gooeyToast.warning(message, {
      description,
      duration: opts?.duration ?? DURATION.warning,
    });
  },

  info(
    message: string,
    description?: string,
    opts?: ToastDurationOverrides,
  ) {
    return gooeyToast.info(message, {
      description,
      duration: opts?.duration ?? DURATION.info,
    });
  },

  promise<T>(promise: Promise<T>, data: GooeyPromiseData<T>) {
    return gooeyToast.promise(promise, data);
  },

  action(
    message: string,
    opts: {
      description?: string;
      label: string;
      onClick: () => void;
      successLabel?: string;
      type?: "success" | "info" | "warning";
      duration?: number;
    },
  ) {
    const t = opts.type ?? "info";
    return gooeyToast[t](message, {
      description: opts.description,
      duration: opts.duration ?? (t === "success" ? DURATION.success : DURATION.info),
      action: {
        label: opts.label,
        onClick: opts.onClick,
        successLabel: opts.successLabel,
      },
    });
  },

  update(
    id: string | number,
    opts: {
      title?: string;
      description?: string;
      type?: "default" | "success" | "error" | "warning" | "info";
    },
  ) {
    gooeyToast.update(id, opts);
  },

  dismiss(id?: string | number) {
    gooeyToast.dismiss(id);
  },
};

export const toastDuration = {
  success: DURATION.success,
  successShort: DURATION.successShort,
  error: DURATION.error,
  warning: DURATION.warning,
  info: DURATION.info,
} as const;
