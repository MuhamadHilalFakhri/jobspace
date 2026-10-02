"use client";

import { toast } from "sonner";

import React, { useCallback, useState } from "react";
import {
  FileCode2,
  Mail,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Download,
  RefreshCw,
} from "@/components/icons";
import { api } from "@/lib/api-client";
import { formatDateID } from "@/lib/ui";
import { FormSelect } from "./FormSelect";
import { useConfirmAction } from "./ConfirmProvider";
import { templateSchema, formErrorsFromZod } from "@/lib/domain/validation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Template = {
  id: string;
  name: string;
  type: "email" | "surat";
  content: string;
  deleted_at: string | null;
  created_at: string;
};

export function TemplatesClient({ initialItems }: { initialItems: Template[] }) {
  const confirmAction = useConfirmAction();
  const [items, setItems] = useState<Template[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: "", type: "email" as "email" | "surat", content: "" });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ items: Template[] }>("/api/templates");
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat template");
    } finally {
      setLoading(false);
    }
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", type: "email", content: "" });
    setShowForm(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setForm({ name: t.name, type: t.type, content: t.content });
    setShowForm(true);
  };

  const handleSave = async () => {
    const validation = templateSchema.safeParse({ ...form, name: form.name.trim(), content: form.content.trim() });
    const errors = validation.success ? {} : formErrorsFromZod(validation.error);
    setFieldErrors(errors);
    if (!validation.success) {
      toast.error(Object.values(errors)[0] || "Periksa data template");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/api/templates/${editing.id}`, form);
        setItems((current) => current.map((item) => item.id === editing.id ? { ...item, ...form } : item));
      } else {
        const created = await api.post<{ id: string }>("/api/templates", form);
        setItems((current) => [{
          id: created.id,
          ...form,
          deleted_at: null,
          created_at: new Date().toISOString(),
        }, ...current]);
      }
      setShowForm(false);
      toast.success(editing ? "Template diperbarui" : "Template dibuat");
    } catch {
      toast.error("Gagal menyimpan template");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: Template) => {
    const confirmed = await confirmAction({
      title: "Hapus template?",
      description: `Template "${t.name}" akan dihapus dari daftar.`,
      confirmLabel: "Hapus template",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await api.del(`/api/templates/${t.id}`);
      setItems((current) => current.filter((item) => item.id !== t.id));
      toast.success("Template dihapus");
    } catch {
      toast.error("Gagal menghapus template");
    }
  };

  const handleCopy = async (t: Template) => {
    try {
      await navigator.clipboard.writeText(t.content);
      toast.success("Template disalin ke clipboard");
    } catch {
      toast.error("Gagal menyalin. Salin manual dari pratinjau.");
    }
  };

  const handleDownload = (t: Template) => {
    const blob = new Blob([t.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t.name.replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-5 sm:px-8 xl:px-10 pt-8 xl:pt-10 pb-4 border-b border-subtle">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Mail className="w-6 h-6 text-secondary" />
              <h1 className="text-2xl font-bold page-title text-primary">Templates</h1>
            </div>
            <p className="text-xs text-faint mt-1">
              Template email follow-up & surat lamaran yang dapat dipakai ulang (FR-09).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="p-1.5 rounded-md border border-subtle text-faint hover:text-primary"
              title="Muat ulang"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={openNew}
              className="px-3.5 py-1.5 text-xs rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Template Baru
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 w-full overflow-y-auto scroll-thin p-5 sm:p-8 xl:p-10 xl:pt-6">
        {showForm && (
          <div className="mb-6 border border-subtle rounded-xl p-5 space-y-3 bg-card">
            <h2 className="text-xs font-semibold text-primary uppercase tracking-wide">
              {editing ? "Ubah Template" : "Template Baru"}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="template-name" className="mb-1 block text-xs">
                  Nama
                </Label>
                <Input
                  id="template-name"
                  maxLength={200}
                  aria-invalid={Boolean(fieldErrors.name)}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Follow-up setelah wawancara"
                />
                {fieldErrors.name && <p className="mt-1 text-xs text-destructive">{fieldErrors.name}</p>}
              </div>
              <div>
                <Label htmlFor="template-type" className="mb-1 block text-xs">
                  Tipe
                </Label>
                <FormSelect
                  id="template-type"
                  value={form.type}
                  onValueChange={(type) => setForm({ ...form, type: type as "email" | "surat" })}
                  options={[{ value: "email", label: "Email" }, { value: "surat", label: "Surat Lamaran" }]}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="template-content" className="mb-1 block text-xs">
                Isi Template
              </Label>
              <Textarea
                id="template-content"
                maxLength={20000}
                aria-invalid={Boolean(fieldErrors.content)}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Tulis draf template di sini..."
                rows={8}
              />
              {fieldErrors.content && <p className="mt-1 text-xs text-destructive">{fieldErrors.content}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setShowForm(false)}
                variant="outline"
              >
                Batal
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 skeleton rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16 text-xs text-rose-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 space-y-2">
            <FileCode2 className="w-8 h-8 text-faint mx-auto" />
            <p className="text-sm font-medium text-primary">Belum ada template</p>
            <p className="text-xs text-faint max-w-sm mx-auto">
              Simpan template follow-up atau surat lamaran yang sering dipakai.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map((t) => (
              <div
                key={t.id}
                className="border border-subtle rounded-xl p-4 hover:border-white/20 transition-colors group bg-card"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {t.type === "email" ? (
                      <Mail className="w-4 h-4 text-blue-600" />
                    ) : (
                      <FileText className="w-4 h-4 text-violet-600" />
                    )}
                    <div>
                      <div className="text-xs font-semibold text-primary">{t.name}</div>
                      <div className="text-[10px] text-faint">
                        {t.type === "email" ? "Email" : "Surat Lamaran"} ·{" "}
                        {formatDateID(t.created_at.slice(0, 10))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(t)}
                      className="p-1 rounded hover:bg-white/5 text-faint hover:text-primary"
                      title="Ubah"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(t)}
                      className="p-1 rounded hover:bg-rose-950/40 text-faint hover:text-rose-300"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-secondary mt-2 line-clamp-3 whitespace-pre-wrap font-mono text-[11px]">
                  {t.content}
                </p>

                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-subtle">
                  <button
                    onClick={() => handleCopy(t)}
                    className="px-2 py-1 text-[10px] rounded border border-subtle hover:bg-white/5 flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> Salin
                  </button>
                  <button
                    onClick={() => handleDownload(t)}
                    className="px-2 py-1 text-[10px] rounded border border-subtle hover:bg-white/5 flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Unduh
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
