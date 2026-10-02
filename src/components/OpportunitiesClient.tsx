"use client";

import { toast } from "sonner";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Compass,
  Plus,
  ArrowRight,
  ExternalLink,
  Trash2,
  Loader2,
  RefreshCw,
  Pencil,
} from "@/components/icons";
import { api } from "@/lib/api-client";
import { formatDateID } from "@/lib/ui";
import { useConfirmAction } from "./ConfirmProvider";
import { createOpportunitySchema, formErrorsFromZod } from "@/lib/domain/validation";
import { OPPORTUNITY_STATUSES, type OpportunityStatus } from "@/lib/domain/schema";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RupiahInput } from "@/components/RupiahInput";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "./FormSelect";
import { formatSalaryDisplay, normalizeRupiahAmount } from "@/lib/domain/rupiah";

type Opportunity = {
  id: string;
  company: string;
  position: string;
  source: string | null;
  url: string | null;
  location: string | null;
  salaryRange: string | null;
  deadline: string | null;
  status: string;
  notes: string | null;
  interestLevel: string | null;
  techStack: string[];
  matchScore: number | null;
  createdAt: string;
};

export function OpportunitiesClient({ initialItems }: { initialItems: Opportunity[] }) {
  const router = useRouter();
  const confirmAction = useConfirmAction();
  const [items, setItems] = useState<Opportunity[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);

  // Form modal state
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [source, setSource] = useState("LinkedIn");
  const [url, setUrl] = useState("");
  const [location, setLocation] = useState("");
  const [salary, setSalary] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [interestLevel, setInterestLevel] = useState("");
  const [techStack, setTechStack] = useState("");
  const [matchScore, setMatchScore] = useState("");
  const [status, setStatus] = useState<OpportunityStatus>("Inbox");
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ items: Opportunity[] }>("/api/opportunities");
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat peluang");
    } finally {
      setLoading(false);
    }
  }, []);

  const openNew = () => {
    setEditing(null);
    setCompany(""); setPosition(""); setSource("LinkedIn"); setUrl("");
    setLocation(""); setSalary(""); setDeadline(""); setNotes("");
    setInterestLevel(""); setTechStack(""); setMatchScore(""); setStatus("Inbox");
    setFieldErrors({});
    setShowModal(true);
  };

  const openEdit = (opp: Opportunity) => {
    setEditing(opp);
    setCompany(opp.company); setPosition(opp.position); setSource(opp.source ?? "");
    setUrl(opp.url ?? ""); setLocation(opp.location ?? ""); setSalary(opp.salaryRange ?? "");
    setDeadline(opp.deadline ?? ""); setNotes(opp.notes ?? "");
    setInterestLevel(opp.interestLevel ?? ""); setTechStack(opp.techStack.join(", "));
    setMatchScore(opp.matchScore === null ? "" : String(opp.matchScore));
    setStatus(opp.status as OpportunityStatus);
    setFieldErrors({});
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      company: company.trim(),
      position: position.trim(),
      source: source.trim() || null,
      url: url.trim() || null,
      location: location.trim() || null,
      salaryRange: salary.trim() ? normalizeRupiahAmount(salary) : null,
      deadline: deadline || null,
      interestLevel: interestLevel.trim() || null,
      techStack: techStack.split(",").map((value) => value.trim()).filter(Boolean),
      matchScore: matchScore.trim() ? Number(matchScore) : null,
      status,
      notes: notes.trim() || null,
    };
    const validation = createOpportunitySchema.safeParse(payload);
    const errors = validation.success ? {} : formErrorsFromZod(validation.error);
    setFieldErrors(errors);
    if (!validation.success) {
      toast.error(Object.values(errors)[0] || "Periksa data peluang kerja");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/api/opportunities/${editing.id}`, validation.data);
        setItems((current) => current.map((item) => item.id === editing.id
          ? { ...item, ...validation.data }
          : item));
        toast.success("Peluang diperbarui");
      } else {
        const created = await api.post<{ id: string }>("/api/opportunities", validation.data);
        setItems((current) => [{
          id: created.id,
          company: payload.company,
          position: payload.position,
          source: payload.source,
          url: payload.url,
          location: payload.location,
          salaryRange: validation.data.salaryRange ?? null,
          deadline: payload.deadline,
          status: payload.status,
          notes: payload.notes,
          interestLevel: payload.interestLevel,
          techStack: payload.techStack,
          matchScore: payload.matchScore,
          createdAt: new Date().toISOString(),
        }, ...current]);
        toast.success("Peluang berhasil disimpan");
      }
      setShowModal(false);
      setEditing(null);
    } catch {
      toast.error("Gagal menambahkan peluang");
    } finally {
      setSaving(false);
    }
  };

  const handleConvert = async (opp: Opportunity) => {
    const confirmed = await confirmAction({
      title: "Jadikan peluang sebagai lamaran?",
      description: `"${opp.position} @ ${opp.company}" akan dibuat sebagai lamaran baru.`,
      confirmLabel: "Buat lamaran",
    });
    if (!confirmed) return;
    setConverting(opp.id);
    try {
      const res = await api.post<{ id: string }>(`/api/opportunities/${opp.id}/convert`, {});
      toast.success("Peluang dikonversi menjadi lamaran");
      router.push(`/applications?peek=${res.id}`);
    } catch {
      toast.error("Gagal mengonversi peluang. Coba muat ulang sebelum mencoba lagi.");
    } finally {
      setConverting(null);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmAction({
      title: "Hapus peluang?",
      description: "Peluang ini akan dihapus dari daftar tersimpan.",
      confirmLabel: "Hapus peluang",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await api.del(`/api/opportunities/${id}`);
      setItems((list) => list.filter((i) => i.id !== id));
      toast.success("Peluang dihapus");
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
              <Compass className="w-6 h-6 text-secondary" />
              <h1 className="text-2xl font-bold page-title text-primary">Opportunities</h1>
            </div>
            <p className="text-xs text-faint mt-1">
              Simpan lowongan menarik sebelum kamu resmi melamar. Konversi ke Lamaran dalam 1 klik.
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
              Peluang Baru
            </button>
          </div>
        </div>
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
        ) : items.length === 0 ? (
          <div className="text-center py-20 space-y-2">
            <Compass className="w-8 h-8 text-faint mx-auto" />
            <p className="text-sm font-medium text-primary">Belum ada peluang tersimpan</p>
            <p className="text-xs text-faint max-w-sm mx-auto">
              Temukan lowongan menarik di LinkedIn atau JobStreet dan simpan di sini sebelum mulai melamar.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map((opp) => (
              <div
                key={opp.id}
                className="border border-subtle rounded-xl p-4 bg-card hover:border-black/20 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xs font-semibold text-primary">{opp.position}</h2>
                      <div className="text-[11px] text-secondary font-medium mt-0.5">
                        {opp.company}
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-secondary font-medium">
                      {opp.status}
                    </span>
                  </div>

                  <div className="text-[10px] text-faint mt-3 space-y-0.5">
                    {opp.source && <div>Sumber: {opp.source}</div>}
                    {opp.salaryRange && <div>Gaji: {formatSalaryDisplay(opp.salaryRange)}</div>}
                    {opp.deadline && <div>Tenggat: {formatDateID(opp.deadline)}</div>}
                    {opp.url && (
                      <a
                        href={opp.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline mt-1"
                      >
                        Buka lowongan asli <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>

                  {opp.notes && (
                    <p className="text-xs text-secondary mt-2.5 p-2 rounded bg-black/[0.02] dark:bg-white/[0.02] border border-subtle line-clamp-3">
                      {opp.notes}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 mt-3 border-t border-subtle">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(opp)} aria-label={`Edit ${opp.position} di ${opp.company}`} className="p-1.5 rounded hover:bg-white/5 text-faint hover:text-primary" title="Edit peluang">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(opp.id)}
                      aria-label={`Hapus ${opp.position} di ${opp.company}`}
                      className="p-1.5 rounded hover:bg-rose-950/40 text-faint hover:text-rose-300"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => handleConvert(opp)}
                    disabled={converting === opp.id}
                    className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5"
                  >
                    {converting === opp.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ArrowRight className="w-3 h-3" />
                    )}
                    Convert to Application
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Add Opportunity */}
      <Dialog open={showModal} onOpenChange={(open) => {
        setShowModal(open);
        if (!open) setEditing(null);
      }}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit peluang" : "Simpan peluang baru"}</DialogTitle>
            <DialogDescription>Ubah detail lowongan yang kamu simpan untuk riset.</DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={handleSave} className="space-y-4">
            <FormField label="Perusahaan *" htmlFor="opportunity-company" error={fieldErrors.company}>
              <Input id="opportunity-company" required maxLength={200} aria-invalid={Boolean(fieldErrors.company)} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="cth. PT Solusi Digital" />
            </FormField>
            <FormField label="Posisi *" htmlFor="opportunity-position" error={fieldErrors.position}>
              <Input id="opportunity-position" required maxLength={200} aria-invalid={Boolean(fieldErrors.position)} value={position} onChange={(e) => setPosition(e.target.value)} placeholder="cth. Frontend Developer" />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Sumber" htmlFor="opportunity-source" error={fieldErrors.source}><Input id="opportunity-source" maxLength={200} aria-invalid={Boolean(fieldErrors.source)} value={source} onChange={(e) => setSource(e.target.value)} placeholder="LinkedIn / Glints" /></FormField>
              <FormField label="Gaji (Rp)" htmlFor="opportunity-salary" description="Angka saja; pemisah ribuan ditambahkan otomatis. Maksimal 15 digit." error={fieldErrors.salaryRange}><RupiahInput id="opportunity-salary" aria-invalid={Boolean(fieldErrors.salaryRange)} value={salary} onValueChange={setSalary} placeholder="1.000.000" /></FormField>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Lokasi" htmlFor="opportunity-location" error={fieldErrors.location}><Input id="opportunity-location" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Jakarta / Remote" /></FormField>
              <FormField label="Status" htmlFor="opportunity-status" error={fieldErrors.status}><FormSelect id="opportunity-status" value={status} onValueChange={(value) => setStatus(value as OpportunityStatus)} options={OPPORTUNITY_STATUSES.map((value) => ({ value, label: value }))} /></FormField>
            </div>
            <FormField label="URL lowongan" htmlFor="opportunity-url" error={fieldErrors.url}>
              <Input id="opportunity-url" type="url" maxLength={2000} aria-invalid={Boolean(fieldErrors.url)} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </FormField>
            <FormField label="Tenggat (opsional)" htmlFor="opportunity-deadline" error={fieldErrors.deadline}>
              <Input id="opportunity-deadline" type="date" aria-invalid={Boolean(fieldErrors.deadline)} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField label="Minat" htmlFor="opportunity-interest" error={fieldErrors.interestLevel}><Input id="opportunity-interest" maxLength={100} value={interestLevel} onChange={(e) => setInterestLevel(e.target.value)} placeholder="Tinggi / Sedang" /></FormField>
              <FormField label="Kecocokan (%)" htmlFor="opportunity-score" error={fieldErrors.matchScore}><Input id="opportunity-score" type="number" min={0} max={100} step={1} value={matchScore} onChange={(e) => setMatchScore(e.target.value)} placeholder="0–100" /></FormField>
              <FormField label="Tech stack" htmlFor="opportunity-stack" error={fieldErrors.techStack}><Input id="opportunity-stack" maxLength={2440} value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="React, TypeScript" /></FormField>
            </div>
            <FormField label="Catatan" htmlFor="opportunity-notes" error={fieldErrors.notes}><Textarea id="opportunity-notes" maxLength={10000} aria-invalid={Boolean(fieldErrors.notes)} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Kriteria khusus, tech stack yang diminta..." /></FormField>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Batal</Button>
              <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : editing ? "Simpan perubahan" : "Simpan peluang"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormField({ label, htmlFor, description, error, children }: { label: string; htmlFor?: string; description?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {description && <p className="text-[11px] text-faint">{description}</p>}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
