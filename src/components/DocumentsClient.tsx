"use client";

import { toast } from "sonner";

import React, { useCallback, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FileText,
  Upload,
  Trash2,
  Download,
  Loader2,
  RefreshCw,
  Link2,
  Folder,
  Pencil,
} from "@/components/icons";
import { api, ApiError } from "@/lib/api-client";
import { formatBytes, formatDateID } from "@/lib/ui";
import { FormSelect } from "./FormSelect";
import { useConfirmAction } from "./ConfirmProvider";
import { Input } from "@/components/ui/input";
import { DOCUMENT_CATEGORIES, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_NAME_CHARS, MAX_DOCUMENT_VERSION_CHARS, type DocumentCategory } from "@/lib/domain/schema";
import { patchDocumentSchema, formErrorsFromZod } from "@/lib/domain/validation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Doc = {
  id: string;
  name: string;
  file_type: string;
  size_bytes: number;
  category: string | null;
  version_label: string | null;
  created_at: string;
  linked_count?: number;
  linked_at?: string;
};

export function DocumentsClient({
  initialData,
}: {
  initialData: {
    docs: Doc[];
    jobs: { id: string; position: string; company: string }[];
  };
}) {
  const confirmAction = useConfirmAction();
  const searchParams = useSearchParams();
  const [docs, setDocs] = useState<Doc[]>(initialData.docs);
  const [jobs, setJobs] = useState(initialData.jobs);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<Record<string, string>>({});
  const [editingDoc, setEditingDoc] = useState<Doc | null>(null);
  const [editForm, setEditForm] = useState({ name: "", category: DOCUMENT_CATEGORIES[0] as DocumentCategory, versionLabel: "" });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<DocumentCategory>(DOCUMENT_CATEGORIES[0]);
  const [versionLabel, setVersionLabel] = useState("");
  const requestedJobId = searchParams.get("jobId");
  const defaultJobId = jobs.some((job) => job.id === requestedJobId) ? requestedJobId ?? "" : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const docsRes = await api.get<{ items: Doc[] }>("/api/documents");
      setDocs(docsRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat dokumen");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["pdf", "doc", "docx"].includes(extension)) {
      setUploadError("Format file harus PDF, DOC, atau DOCX.");
      toast.error("Format file tidak didukung");
      e.target.value = "";
      return;
    }
    if (file.name.trim().length > MAX_DOCUMENT_NAME_CHARS) {
      const message = `Nama file maksimal ${MAX_DOCUMENT_NAME_CHARS} karakter.`;
      setUploadError(message);
      toast.error(message);
      e.target.value = "";
      return;
    }
    if (file.size === 0) {
      setUploadError("File dokumen kosong.");
      toast.error("Pilih file yang berisi data");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setUploadError("Ukuran dokumen maksimal 8 MB.");
      toast.error("Ukuran file melebihi 8 MB");
      e.target.value = "";
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("name", file.name);
      form.append("category", category);
      if (versionLabel.trim()) form.append("versionLabel", versionLabel.trim());

      await api.upload("/api/documents", form);
      setVersionLabel("");
      await load();
      toast.success("Dokumen berhasil diunggah");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Gagal mengunggah dokumen";
      setUploadError(message);
      toast.error(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = (doc: Doc) => {
    window.open(`/api/documents/${doc.id}`, "_blank");
  };

  const handleDelete = async (doc: Doc) => {
    const confirmed = await confirmAction({
      title: "Arsipkan dokumen?",
      description: `"${doc.name}" akan dipindahkan ke arsip dan dapat dipulihkan jika tersedia.`,
      confirmLabel: "Arsipkan",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await api.del(`/api/documents/${doc.id}`);
      await load();
      toast.success("Dokumen dipindahkan ke arsip");
    } catch {
      toast.error("Gagal menghapus dokumen");
    }
  };

  const openEdit = (doc: Doc) => {
    setEditingDoc(doc);
    setEditForm({
      name: doc.name,
      category: (doc.category as DocumentCategory) || DOCUMENT_CATEGORIES[0],
      versionLabel: doc.version_label ?? "",
    });
    setEditErrors({});
  };

  const handleSaveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingDoc) return;
    const payload = {
      name: editForm.name.trim(),
      category: editForm.category,
      versionLabel: editForm.versionLabel.trim() || null,
    };
    const validation = patchDocumentSchema.safeParse(payload);
    const errors = validation.success ? {} : formErrorsFromZod(validation.error);
    setEditErrors(errors);
    if (!validation.success) {
      toast.error(Object.values(errors)[0] || "Periksa metadata dokumen");
      return;
    }
    setSavingEdit(true);
    try {
      await api.patch(`/api/documents/${editingDoc.id}`, validation.data);
      setDocs((current) => current.map((doc) => doc.id === editingDoc.id
        ? { ...doc, name: payload.name, category: payload.category, version_label: payload.versionLabel }
        : doc));
      setEditingDoc(null);
      toast.success("Informasi dokumen diperbarui");
    } catch {
      toast.error("Gagal memperbarui informasi dokumen");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleLink = async (doc: Doc) => {
    const jobId = linkTarget[doc.id] ?? defaultJobId;
    if (!jobId) {
      toast.error("Pilih lamaran tujuan terlebih dahulu");
      return;
    }
    try {
      await api.post(`/api/jobs/${jobId}/documents`, { documentId: doc.id });
      toast.success("Dokumen berhasil ditautkan ke lamaran");
      await load();
    } catch (err) {
      toast.error("Gagal menautkan dokumen");
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-5 sm:px-8 xl:px-10 pt-8 xl:pt-10 pb-4 border-b border-subtle">
        <div className="flex items-center gap-2.5">
          <Folder className="w-6 h-6 text-secondary" />
          <h1 className="text-2xl font-bold page-title text-primary">Documents</h1>
        </div>
        <p className="text-xs text-faint mt-1">
          Perpustakaan CV, surat lamaran, dan dokumen pendukung. Hanya PDF/DOC/DOCX, maks 8MB.
        </p>
        {defaultJobId && (
          <p className="mt-2 max-w-2xl rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
            Pilih dokumen lalu tekan ikon tautan. Lamaran tujuan sudah dipilih otomatis.
          </p>
        )}

        <div className="flex items-end gap-2 mt-4 flex-wrap">
          <div>
              <label htmlFor="document-category" className="block text-[10px] uppercase font-medium text-faint mb-1">
              Kategori
            </label>
            <FormSelect
                id="document-category"
                ariaLabel="Kategori dokumen"
              value={category}
              onValueChange={(value) => setCategory(value as DocumentCategory)}
              options={DOCUMENT_CATEGORIES.map((value) => ({ value, label: value }))}
              className="w-48"
            />
          </div>
          <div>
              <label htmlFor="document-version" className="block text-[10px] uppercase font-medium text-faint mb-1">
              Label Versi (opsional)
            </label>
            <Input
              id="document-version"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              maxLength={MAX_DOCUMENT_VERSION_CHARS}
              placeholder="CV Full Stack v2"
              className="h-9 w-44"
            />
          </div>
          <input
            ref={fileInputRef}
            aria-label="Pilih dokumen untuk diunggah"
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-3.5 py-1.5 text-xs rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Unggah Dokumen
          </button>
          <button
            onClick={load}
            className="p-1.5 rounded-md border border-subtle text-faint hover:text-primary"
            title="Muat ulang"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {uploadError && (
          <div className="mt-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 rounded-md px-3 py-2 max-w-lg">
            {uploadError}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 w-full overflow-y-auto scroll-thin p-5 sm:p-8 xl:p-10 xl:pt-6">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 skeleton rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16 text-xs text-rose-600">{error}</div>
        ) : docs.length === 0 ? (
          <div className="text-center py-20 space-y-2">
            <FileText className="w-8 h-8 text-faint mx-auto" />
            <p className="text-sm font-medium text-primary">Belum ada dokumen</p>
            <p className="text-xs text-faint max-w-sm mx-auto">
              Unggah CV, surat lamaran, atau sertifikat untuk digunakan ulang saat melamar.
            </p>
          </div>
        ) : (
          <div className="border border-subtle rounded-lg overflow-hidden">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between px-3.5 py-3 border-b border-subtle last:border-b-0 hover-row"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-primary truncate flex items-center gap-1.5">
                      {doc.name}
                      {doc.version_label && (
                        <span className="text-[9px] bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-300 px-1.5 py-0.5 rounded-full">
                          {doc.version_label}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-faint">
                      {doc.category || "Dokumen"} · {doc.file_type.toUpperCase()} ·{" "}
                      {formatBytes(doc.size_bytes)} ·{" "}
                      {doc.linked_count !== undefined
                        ? `${doc.linked_count} lamaran terkait`
                        : "terkait"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openEdit(doc)}
                    aria-label={`Edit informasi ${doc.name}`}
                    className="p-1.5 rounded hover:bg-white/5 text-faint hover:text-primary"
                    title="Edit informasi dokumen"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <FormSelect
                    value={linkTarget[doc.id] ?? defaultJobId}
                    onValueChange={(value) => setLinkTarget((current) => ({ ...current, [doc.id]: value }))}
                    options={[
                      { value: "", label: "Pilih lamaran..." },
                      ...jobs.map((job) => ({ value: job.id, label: `${job.position} — ${job.company}` })),
                    ]}
                    ariaLabel="Pilih lamaran untuk ditautkan"
                    className="max-w-44"
                  />
                  <button
                    onClick={() => handleLink(doc)}
                    className="p-1.5 rounded hover:bg-white/5 text-faint hover:text-blue-600"
                    title="Tautkan ke lamaran"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDownload(doc)}
                    className="p-1.5 rounded hover:bg-white/5 text-faint hover:text-primary"
                    title="Unduh"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(doc)}
                    className="p-1.5 rounded hover:bg-rose-950/40 text-faint hover:text-rose-600"
                    title="Hapus (arsip)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={Boolean(editingDoc)} onOpenChange={(open) => !open && setEditingDoc(null)}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit informasi dokumen</DialogTitle>
            <DialogDescription>Ubah nama, kategori, dan label versi. File yang diunggah tidak berubah.</DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-document-name">Nama dokumen *</Label>
              <Input id="edit-document-name" required maxLength={MAX_DOCUMENT_NAME_CHARS} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} aria-invalid={Boolean(editErrors.name)} />
              {editErrors.name && <p className="text-xs text-destructive">{editErrors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-document-category">Kategori</Label>
              <FormSelect id="edit-document-category" ariaLabel="Kategori dokumen" value={editForm.category} onValueChange={(category) => setEditForm({ ...editForm, category: category as DocumentCategory })} options={DOCUMENT_CATEGORIES.map((value) => ({ value, label: value }))} />
              {editErrors.category && <p className="text-xs text-destructive">{editErrors.category}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-document-version">Label versi</Label>
              <Input id="edit-document-version" maxLength={MAX_DOCUMENT_VERSION_CHARS} value={editForm.versionLabel} onChange={(event) => setEditForm({ ...editForm, versionLabel: event.target.value })} aria-invalid={Boolean(editErrors.versionLabel)} placeholder="CV Full Stack v2" />
              {editErrors.versionLabel && <p className="text-xs text-destructive">{editErrors.versionLabel}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => setEditingDoc(null)}>Batal</Button>
              <Button type="submit" disabled={savingEdit}>{savingEdit ? "Menyimpan..." : "Simpan perubahan"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
