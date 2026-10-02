"use client";

import { PIPELINE_STATUSES, type PipelineStatus } from "@/lib/domain/schema";
import { STATUS_DOTS, STATUS_STYLES } from "@/lib/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PipelineStatusSelect({
  status,
  disabled,
  label,
  onChange,
}: {
  status: PipelineStatus;
  disabled?: boolean;
  label: string;
  onChange: (status: PipelineStatus) => void;
}) {
  return (
    <Select value={status} onValueChange={(value) => onChange(value as PipelineStatus)} disabled={disabled}>
      <SelectTrigger
        aria-label={`Status lamaran ${label}`}
        className={`h-7 w-[160px] rounded-md border border-current/15 px-2 py-0 text-[11px] font-medium transition-colors hover:brightness-110 ${STATUS_STYLES[status]}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {PIPELINE_STATUSES.map((value) => (
          <SelectItem key={value} value={value}>
            <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOTS[value]}`} aria-hidden="true" />
            <span>{value}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
