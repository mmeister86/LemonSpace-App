"use client"

/**
 * Onboarding note:
 * Hexta-compatible command-menu facade backed by the local ShadCN command/dialog primitives.
 * Do not add global keyboard shortcuts here; Canvas owns Cmd/Ctrl+K.
 */

import * as React from "react"

import {
  Command,
  CommandDialog,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

const CommandMenu = CommandDialog
const CommandMenuTrigger = ({ children }: { children: React.ReactNode }) => <>{children}</>
const CommandMenuContent = Command
const CommandMenuInput = CommandInput
const CommandMenuList = CommandList
const CommandMenuItem = CommandItem
const CommandMenuSeparator = CommandSeparator

function useCommandMenuShortcut(_callback: () => void) {
  React.useEffect(() => {
    void _callback
    return undefined
  }, [_callback])
}

function useCommandMenu() {
  return { value: "", setValue: () => undefined, selectedIndex: 0, setSelectedIndex: () => undefined }
}

export {
  CommandMenu,
  CommandMenuContent,
  CommandMenuInput,
  CommandMenuItem,
  CommandMenuList,
  CommandMenuSeparator,
  CommandMenuTrigger,
  useCommandMenu,
  useCommandMenuShortcut,
}
