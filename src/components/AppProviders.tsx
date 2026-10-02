"use client";

import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/components/ConfirmProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={350}>
      <ConfirmProvider>
        <Toaster />
        {children}
      </ConfirmProvider>
    </TooltipProvider>
  );
}
