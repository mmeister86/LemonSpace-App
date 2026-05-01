/**
 * Onboarding note:
 * Shared TypeScript utility for utils. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
