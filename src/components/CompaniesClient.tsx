"use client";

import { toast } from "sonner";

import React, { useCallback, useState } from "react";
import { Building2, Plus, Globe, Link2, Trash2, RefreshCw, Briefcase, Pencil } from "@/components/icons";
import { api } from "@/lib/api-client";
import { useConfirmAction } from "./ConfirmProvider";
import { createCompanySchema, formErrorsFromZod } from "@/lib/domain/validation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Company = {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  linkedin: string | null;
  location: string | null;
  size: string | null;
  notes: string | null;
  application_count?: number;
};

export function CompaniesClient({ initialItems }: { initialItems: Company[] }) {
  const confirmAction = useConfirmAction();
  const [items, setItems] = useState<Company[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [form, setForm] = useState({ name: "", industry: "", website: "", linkedin: "", location: "", size: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ items: Company[] }>("/api/companies");
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat perusahaan");
    } finally {
      setLoading(false);
    }
  }, []);

  const openNew = () => {
    setEditingCompany(null);
    setForm({ name: "", industry: "", website: "", linkedin: "", location: "", size: "", notes: "" });
    setFieldErrors({});
    setShowModal(true);
  };

  const openEdit = (company: Company) => {
    setEditingCompany(company);
    setForm({
      name: company.name,
      industry: company.industry ?? "",
      website: company.website ?? "",
      linkedin: company.linkedin ?? "",
      location: company.location ?? "",
      size: company.size ?? "",
      notes: company.notes ?? "",
    });
    setFieldErrors({});
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      industry: form.industry.trim() || null,
      website: form.website.trim() || null,
      linkedin: form.linkedin.trim() || null,
      location: form.location.trim() || null,
      size: form.size.trim() || null,
      notes: form.notes.trim() || null,
    };
    const validation = createCompanySchema.safeParse(payload);
    const errors = validation.success ? {} : formErrorsFromZod(validation.error);
    setFieldErrors(errors);
    if (!validation.success) {
      toast.error(Object.values(errors)[0] || "Periksa kembali data perusahaan");
      return;
    }
    setSaving(true);
    try {
      if (editingCompany) {
        await api.patch(`/api/companies/${editingCompany.id}`, validation.data);
        setItems((current) => current.map((company) => company.id === editingCompany.id
          ? { ...company, ...payload }
          : company).sort((left, right) => left.name.localeCompare(right.name)));
        toast.success("Perusahaan diperbarui");
      } else {
        const created = await api.post<{ id: string }>("/api/companies", validation.data);
        setItems((current) => [...current, {
          id: created.id,
          ...payload,
          application_count: 0,
        }].sort((left, right) => left.name.localeCompare(right.name)));
        toast.success("Perusahaan ditambahkan");
      }
      setShowModal(false);
      setEditingCompany(null);
    } catch {
      toast.error(editingCompany ? "Gagal memperbarui perusahaan" : "Gagal menambahkan perusahaan");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmAction({
      title: "Hapus perusahaan?",
      description: "Informasi riset perusahaan akan dihapus. Lamaran yang tertaut tetap tersimpan.",
      confirmLabel: "Hapus perusahaan",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await api.del(`/api/companies/${id}`);
      setItems((l) => l.filter((c) => c.id !== id));
      toast.success("Perusahaan dihapus");
    } catch {
      toast.error("Gagal menghapus");
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-5 sm:px-8 xl:px-10 pt-8 xl:pt-10 pb-4 border-b border-subtle">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Building2 className="w-6 h-6 text-secondary" />
              <h1 className="text-2xl font-bold page-title text-primary">Companies</h1>
            </div>
            <p className="text-xs text-faint mt-1">
              Riset terstruktur tiap perusahaan: industri, budaya, dan lowongan yang kamu lamar.
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
              Perusahaan Baru
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 w-full overflow-y-auto scroll-thin p-5 sm:p-8 xl:p-10 xl:pt-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 skeleton rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16 text-xs text-rose-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 space-y-2">
            <Building2 className="w-8 h-8 text-faint mx-auto" />
            <p className="text-sm font-medium text-primary">Belum ada perusahaan</p>
            <p className="text-xs text-faint max-w-sm mx-auto">
              Tambahkan perusahaan target untuk menyimpan hasil riset dan menghubungkan lamaranmu.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map((c) => (
              <div
                key={c.id}
                className="border border-subtle rounded-xl p-4 bg-card hover:border-white/20 transition-colors group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-neutral-500" />
                    </div>
                    <div>
                      <h2 className="text-xs font-semibold text-primary">{c.name}</h2>
                      <div className="text-[10px] text-faint">
                        {c.industry || "Industri belum diisi"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(c)}
                      aria-label={`Edit ${c.name}`}
                      className="p-1 rounded hover:bg-white/5 text-faint hover:text-primary"
                      title="Edit perusahaan"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      aria-label={`Hapus ${c.name}`}
                      className="p-1 rounded hover:bg-rose-950/40 text-faint hover:text-rose-300"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {c.application_count !== undefined && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium flex items-center gap-1">
                      <Briefcase className="w-2.5 h-2.5" />
                      {c.application_count} lamaran
                    </span>
                  )}
                  {c.website && (
                    <a
                      href={c.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-secondary hover:text-primary flex items-center gap-1"
                    >
                      <Globe className="w-2.5 h-2.5" /> Website
                    </a>
                  )}
                  {c.location && <span className="text-[10px] text-faint">{c.location}</span>}
                  {c.size && <span className="text-[10px] text-faint">{c.size}</span>}
                  {c.linkedin && (
                    <a
                      href={c.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-secondary hover:text-primary flex items-center gap-1"
                    >
                      <Link2 className="w-2.5 h-2.5" /> LinkedIn
                    </a>
                  )}
                </div>

                {c.notes && (
                  <p className="text-xs text-secondary mt-2 line-clamp-2">{c.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showModal} onOpenChange={(open) => {
        setShowModal(open);
        if (!open) setEditingCompany(null);
      }}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCompany ? "Edit perusahaan" : "Perusahaan baru"}</DialogTitle>
            <DialogDescription>Perbarui informasi riset perusahaan dan detail yang terhubung.</DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="company-name">Nama perusahaan *</Label>
              <Input id="company-name" required maxLength={200} aria-invalid={Boolean(fieldErrors.name)} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="company-industry">Industri</Label>
                <Input id="company-industry" maxLength={120} aria-invalid={Boolean(fieldErrors.industry)} value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Fintech / SaaS" />
                {fieldErrors.industry && <p className="text-xs text-destructive">{fieldErrors.industry}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company-location">Lokasi</Label>
                <Input id="company-location" maxLength={200} aria-invalid={Boolean(fieldErrors.location)} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Jakarta" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company-size">Ukuran perusahaan</Label>
                <Input id="company-size" maxLength={100} aria-invalid={Boolean(fieldErrors.size)} value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="51–200 karyawan" />
                {fieldErrors.size && <p className="text-xs text-destructive">{fieldErrors.size}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-website">Website</Label>
              <Input id="company-website" type="url" maxLength={500} aria-invalid={Boolean(fieldErrors.website)} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
              {fieldErrors.website && <p className="text-xs text-destructive">{fieldErrors.website}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-linkedin">LinkedIn</Label>
              <Input id="company-linkedin" type="url" maxLength={500} aria-invalid={Boolean(fieldErrors.linkedin)} value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} placeholder="https://linkedin.com/company/..." />
              {fieldErrors.linkedin && <p className="text-xs text-destructive">{fieldErrors.linkedin}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-notes">Catatan riset</Label>
              <Textarea id="company-notes" maxLength={10000} aria-invalid={Boolean(fieldErrors.notes)} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Budaya kerja, produk, kontak, atau hal penting lain..." />
              {fieldErrors.notes && <p className="text-xs text-destructive">{fieldErrors.notes}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Batal</Button>
              <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : editingCompany ? "Simpan perubahan" : "Simpan perusahaan"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
