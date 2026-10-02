import {
  MAX_IMPORT_CELL_CHARS,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
} from "@/lib/domain/schema";

/**
 * Pure CSV helpers shared by the server (import pipeline) and the browser
 * (import preview). Kept dependency-free so client components can import it
 * without pulling the database layer into the browser bundle.
 */

/** Parses RFC-4180-ish CSV text into a matrix of raw string cells. */
export function parseCsv(text: string): string[][] {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  const appendField = () => {
    if (currentField.length > MAX_IMPORT_CELL_CHARS) {
      throw new Error(`Setiap sel CSV maksimal ${MAX_IMPORT_CELL_CHARS.toLocaleString("id-ID")} karakter.`);
    }
    if (currentRow.length >= MAX_IMPORT_COLUMNS) {
      throw new Error(`CSV maksimal memiliki ${MAX_IMPORT_COLUMNS} kolom.`);
    }
    currentRow.push(currentField);
    currentField = "";
  };
  const appendRow = () => {
    if (lines.length >= MAX_IMPORT_ROWS + 1) {
      throw new Error(`CSV maksimal berisi ${MAX_IMPORT_ROWS.toLocaleString("id-ID")} baris data.`);
    }
    lines.push(currentRow);
    currentRow = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"') {
        if (next === '"') {
          currentField += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        appendField();
      } else if (c === "\r") {
        if (next === "\n") i++;
        appendField();
        appendRow();
      } else if (c === "\n") {
        appendField();
        appendRow();
      } else {
        currentField += c;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    appendField();
    appendRow();
  }

  if (inQuotes) throw new Error("CSV memiliki tanda kutip yang belum ditutup.");

  return lines;
}

/** Escapes one CSV value and prevents spreadsheet formula execution. */
export function escapeCsvCell(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  const raw = String(cell);
  const safe = /^[\u0000-\u0020]*[=+\-@]/.test(raw) ? "'" + raw : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Serialises a matrix of cells back into CSV text (used for exports). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map(escapeCsvCell)
        .join(","),
    )
    .join("\r\n");
}
