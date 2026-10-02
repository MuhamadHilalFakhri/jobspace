"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

export function FormSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Pilih opsi",
  className,
  invalid,
  disabled,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const selectValue = value || "__jobspace_empty__";

  return (
    <Select
      value={selectValue}
      onValueChange={(nextValue) =>
        onValueChange(nextValue === "__jobspace_empty__" ? "" : nextValue)
      }
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={cn("h-9 w-full rounded-md bg-card text-sm", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {options.map((option) => (
          <SelectItem
            key={option.value || "__jobspace_empty__"}
            value={option.value || "__jobspace_empty__"}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
