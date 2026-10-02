"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, CheckCircle2, AlertCircle, Loader2, ArrowRight } from "@/components/icons";
import { api, ApiError } from "@/lib/api-client";
import { parseCsv } from "@/lib/csv";
import { FormSelect } from "./FormSelect";
import { toast } from "sonner";
import { MAX_IMPORT_BYTES } from "@/lib/domain/schema";

type Summary = {
  totalRows: number;
  successRows: number;
  failedRows: number;
  failedDetails: { row: number; error: string; data?: Record<string, string> }[];
};

export function ImportClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvContent, setCsvContent] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Pilih file dengan format .csv.");
      toast.error("Format file harus CSV");
      e.target.value = "";
      return;
    }
    if (file.size === 0 || file.size > MAX_IMPORT_BYTES) {
      const message = file.size === 0 ? "File CSV kosong." : "Ukuran CSV maksimal 5 MB.";
      setError(message);
      toast.error(message);
      e.target.value = "";
      return;
    }
    setError(null);
    setSummary(null);
    try {
      const text = await file.text();
      setCsvContent(text);
      const rows = parseCsv(text);
      if (rows.length < 2) {
        setError("File CSV harus memiliki minimal 1 baris header dan 1 baris data.");
        return;
      }
      setHeaders(rows[0]);
      setPreviewRows(rows.slice(1, 6));

      // Auto-detect mappings based on header names
      const autoMap: Record<string, string> = {};
      rows[0].forEach((col) => {
        const lower = col.toLowerCase().trim();
        if (["perusahaan", "company", "nama perusahaan"].includes(lower)) autoMap[col] = "company";
        else if (["posisi", "position", "role", "jabatan"].includes(lower)) autoMap[col] = "position";
        else if (["applied_at", "tanggal lamar", "applied date"].includes(lower)) autoMap[col] = "applied_at";
        else if (["status", "tahap"].includes(lower)) autoMap[col] = "status";
        else if (["source", "sumber"].includes(lower)) autoMap[col] = "source";
        else if (["deadline", "tenggat"].includes(lower)) autoMap[col] = "deadline";
        else if (["notes", "catatan"].includes(lower)) autoMap[col] = "notes";
        else if (["salary", "gaji", "salary_range", "rentang gaji"].includes(lower)) autoMap[col] = "salary_range";
        else if (["url", "link"].includes(lower)) autoMap[col] = "job_url";
      });
      setMapping(autoMap);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal membaca file CSV valid.";
      setError(message);
      toast.error(message);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    setSummary(null);
    try {
      const invertedMapping: Record<string, string> = {};
      for (const [col, canonical] of Object.entries(mapping)) {
        if (canonical) invertedMapping[col.toLowerCase().trim()] = canonical;
      }
      const mappedFields = new Set(Object.values(invertedMapping));
      if (!mappedFields.has("company") || !mappedFields.has("position")) {
        setError("Petakan kolom Perusahaan dan Posisi sebelum menjalankan impor.");
        toast.error("Pemetaan kolom belum lengkap");
        setImporting(false);
        return;
      }

      const res = await api.post<Summary>("/api/import", {
        csv: csvContent,
        mapping: invertedMapping,
      });
      setSummary(res);
      if (res.failedRows === 0) toast.success(`${res.successRows} lamaran berhasil diimpor`);
      else toast.warning(`${res.successRows} berhasil, ${res.failedRows} perlu diperiksa`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memproses impor");
      toast.error(err instanceof ApiError ? err.message : "Gagal memproses impor");
    } finally {
      setImporting(false);
    }
  };

  const CANONICAL_FIELDS = [
    { key: "company", label: "Perusahaan (Wajib)" },
    { key: "position", label: "Posisi (Wajib)" },
    { key: "applied_at", label: "Tanggal Lamar" },
    { key: "status", label: "Status Pipeline" },
    { key: "source", label: "Sumber" },
    { key: "deadline", label: "Tenggat" },
    { key: "salary_range", label: "Gaji (Rp; angka saja)" },
    { key: "job_url", label: "URL Lowongan" },
    { key: "notes", label: "Catatan" },
  ];

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-5 sm:px-8 xl:px-10 pt-8 xl:pt-10 pb-4 border-b border-subtle">
        <div className="flex items-center gap-2.5">
          <Upload className="w-6 h-6 text-secondary" />
          <h1 className="text-2xl font-bold page-title text-primary">Impor Data CSV</h1>
        </div>
        <p className="text-xs text-faint mt-1">
          Pindahkan catatan lamaran dari Excel/Spreadsheet. Baris gagal akan dilaporkan tanpa
          menggagalkan baris yang valid (FR-09).
        </p>
      </div>

      <div className="flex-1 min-w-0 w-full overflow-y-auto scroll-thin p-5 sm:p-8 xl:p-10 space-y-6">
        {/* Upload area */}
        <div className="border border-dashed border-subtle rounded-xl p-6 text-center space-y-3">
          <input
            ref={fileRef}
            aria-label="Pilih file CSV untuk diimpor"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center mx-auto">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <button
              onClick={() => fileRef.current?.click()}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Pilih file CSV dari komputermu
            </button>
            <p className="text-[11px] text-faint mt-0.5">CSV · maks 5 MB, 5.000 baris, 100 kolom</p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Column Mapping */}
        {headers.length > 0 && !summary && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xs font-semibold text-primary uppercase tracking-wide">
                Pemetaan Kolom
              </h2>
              <p className="text-[11px] text-faint mt-0.5">
                Sesuaikan kolom dari file CSV Anda ke field target JobSpace.
              </p>
            </div>

            <div className="border border-subtle rounded-lg p-4 space-y-2.5">
              {headers.map((col) => (
                <div key={col} className="flex items-center justify-between text-xs gap-3">
                  <span className="font-mono text-secondary truncate">{col}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-faint flex-shrink-0" />
                  <FormSelect
                    value={mapping[col] || ""}
                    onValueChange={(value) => setMapping((current) => ({ ...current, [col]: value }))}
                    options={[
                      { value: "", label: "Abaikan kolom ini" },
                      ...CANONICAL_FIELDS.map((field) => ({ value: field.key, label: field.label })),
                    ]}
                    className="w-56"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-2 text-xs rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
              >
                {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Jalankan Impor
              </button>
            </div>
          </div>
        )}

        {/* Import summary report (FR-09 requirement) */}
        {summary && (
          <div className="border border-subtle rounded-xl p-6 space-y-4 bg-card">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              <div>
                <h2 className="text-sm font-semibold text-primary">Impor Selesai</h2>
                <p className="text-xs text-secondary mt-0.5">
                  Berhasil menyimpan {summary.successRows} dari {summary.totalRows} baris.
                </p>
              </div>
            </div>

            {summary.failedRows > 0 && (
              <div className="border border-rose-200 dark:border-rose-900/60 rounded-lg p-3 bg-rose-50/50 dark:bg-rose-950/20 text-xs">
                <div className="font-semibold text-rose-700 dark:text-rose-300 mb-1">
                  {summary.failedRows} baris gagal disimpan:
                </div>
                <ul className="space-y-1 text-rose-600 dark:text-rose-400">
                  {summary.failedDetails.slice(0, 10).map((f) => (
                    <li key={f.row}>
                      Baris {f.row}: {f.error}
                    </li>
                  ))}
                  {summary.failedDetails.length > 10 && (
                    <li>...dan {summary.failedDetails.length - 10} baris lainnya</li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setSummary(null);
                  setHeaders([]);
                }}
                className="px-3 py-1.5 text-xs rounded border border-subtle hover:bg-white/5"
              >
                Impor File Lain
              </button>
              <button
                onClick={() => router.push("/applications")}
                className="px-3.5 py-1.5 text-xs rounded bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                Buka Applications →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
