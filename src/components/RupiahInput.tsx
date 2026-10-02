"use client";

import React, { useRef } from "react";
import { Input } from "@/components/ui/input";
import { formatRupiahInput, rupiahDigits } from "@/lib/domain/rupiah";

type RupiahInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "onChange" | "maxLength" | "inputMode" | "pattern"
> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** Numeric-only whole-rupiah input with stable cursor position while grouping. */
export function RupiahInput({ value, onValueChange, ...props }: RupiahInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const caret = input.selectionStart ?? input.value.length;
    const digitCountBeforeCaret = rupiahDigits(input.value.slice(0, caret)).length;
    const formatted = formatRupiahInput(input.value);
    onValueChange(formatted);

    requestAnimationFrame(() => {
      if (inputRef.current !== input) return;
      let nextCaret = 0;
      let digitsSeen = 0;
      while (nextCaret < formatted.length && digitsSeen < digitCountBeforeCaret) {
        if (/\d/.test(formatted[nextCaret])) digitsSeen += 1;
        nextCaret += 1;
      }
      input.setSelectionRange(nextCaret, nextCaret);
    });
  };

  return (
    <Input
      {...props}
      ref={inputRef}
      type="text"
      inputMode="numeric"
      pattern="[0-9.]*"
      maxLength={19}
      value={value}
      onChange={handleChange}
    />
  );
}
