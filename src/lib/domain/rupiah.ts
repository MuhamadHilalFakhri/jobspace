const MAX_RUPIAH_DIGITS = 15;

/** Keep only a bounded whole-rupiah amount from a text input. */
export function rupiahDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, MAX_RUPIAH_DIGITS);
}

/** Format an amount as the user types, using Indonesian thousands separators. */
export function formatRupiahInput(value: string): string {
  const digits = rupiahDigits(value);
  if (!digits) return "";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(digits));
}

/** Convert either raw digits or Indonesian-grouped digits into a DB-safe string. */
export function normalizeRupiahAmount(value: string): string {
  const digits = rupiahDigits(value);
  return digits.replace(/^0+(?=\d)/, "");
}

/** Format new numeric values while preserving legacy salary ranges as stored. */
export function formatSalaryDisplay(value: string | null | undefined): string {
  if (!value) return "—";
  const isRawAmount = /^\d{1,15}$/.test(value);
  const isGroupedAmount = /^\d{1,3}(?:\.\d{3})+$/.test(value);
  if (!isRawAmount && !isGroupedAmount) return value;

  const digits = value.replace(/\./g, "");
  if (digits.length > MAX_RUPIAH_DIGITS) return value;
  return `Rp ${formatRupiahInput(digits)}`;
}
