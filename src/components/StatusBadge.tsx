import React from "react";
import type { PipelineStatus } from "@/lib/domain/schema";
import { STATUS_STYLES, STATUS_DOTS } from "@/lib/ui";

export function StatusBadge({
  status,
  size = "md",
}: {
  status: PipelineStatus;
  size?: "sm" | "md";
}) {
  const style =
    STATUS_STYLES[status] ||
    "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300";
  const dot = STATUS_DOTS[status] || "bg-neutral-400";

  const padding = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${padding} ${style}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />
      <span className="truncate">{status}</span>
    </span>
  );
}
