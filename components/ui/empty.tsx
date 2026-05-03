"use client"

/**
 * Onboarding note:
 * Design-system primitive for empty states. Keep copy outside this component and styling token-based.
 */

import * as React from "react"

import { cn } from "@/lib/utils"

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn("flex flex-col items-center justify-center gap-3 p-6 text-center", className)}
      {...props}
    />
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-header" className={cn("flex flex-col items-center gap-2", className)} {...props} />
}

function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "icon" }) {
  return (
    <div
      data-slot="empty-media"
      data-variant={variant}
      className={cn(
        "flex items-center justify-center text-muted-foreground",
        variant === "icon" && "size-10 rounded-full bg-muted",
        className
      )}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="empty-title" className={cn("text-sm font-medium text-foreground", className)} {...props} />
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-description"
      className={cn("max-w-sm text-xs leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle }
