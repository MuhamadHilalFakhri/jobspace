"use client";

import { toast } from "sonner";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  Plus,
  Loader2,
  RefreshCw,
  Video,
  MapPin,
  Phone,
  Clock,
  Microphone,
  Pencil,
} from "@/components/icons";
import { api } from "@/lib/api-client";
import { formatDateID, relativeDays } from "@/lib/ui";
import { FormSelect } from "./FormSelect";
import { interviewSchema, interviewPatchSchema, formErrorsFromZod } from "@/lib/domain/validation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INTERVIEW_MODES, INTERVIEW_RESULTS } from "@/lib/domain/schema";
import { today as getToday } from "@/lib/domain/dates";

type Interview = {
  id: string;
  jobId: string;
  company: string;
  position: string;
  scheduledDate: string;
  scheduledTime: string;
  mode: string;
  locationOrLink: string | null;
  interviewer: string | null;
  result: string;
  notes: string | null;
  prepChecklist: { id: string; label: string; done: boolean }[];
};

const DEFAULT_PREP_CHECKLIST = [
  { id: "research-company", label: "Riset perusahaan dan produknya", done: false },
  { id: "review-role", label: "Tinjau ulang deskripsi posisi", done: false },
  { id: "examples", label: "Siapkan contoh pengalaman kerja", done: false },
  { id: "questions", label: "Siapkan pertanyaan untuk pewawancara", done: false },
  { id: "cv", label: "Siapkan CV dan portofolio", done: false },
  { id: "connection", label: "Cek koneksi, tautan, atau rute", done: false },
];

const MODE_ICON: Record<string, React.ReactNode> = {
  Online: <Video className="w-3 h-3" />,
  Onsite: <MapPin className="w-3 h-3" />,
  Telepon: <Phone className="w-3 h-3" />,
};

const RESULT_STYLES: Record<string, string> = {
  Menunggu: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  Lanjut: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  "Tidak Lanjut": "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  Diterima: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  Ditolak: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
};

export function InterviewsClient({
  initialData,
}: {
  initialData: {
    items: Interview[];
    jobs: { id: string; position: string; company: string }[];
  };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const [items, setItems] = useState<Interview[]>(initialData.items);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Interview | null>(null);
  const [jobs, setJobs] = useState(initialData.jobs);
  const [form, setForm] = useState({
    jobId: "",
    scheduledDate: "",
    scheduledTime: "10:00",
    mode: "Online",
    locationOrLink: "",
    interviewer: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ items: Interview[] }>("/api/interviews");
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat jadwal wawancara");
    } finally {
      setLoading(false);
    }
  }, []);

  const openNew = () => {
    setEditing(null);
    setFieldErrors({});
    setForm({ jobId: "", scheduledDate: "", scheduledTime: "10:00", mode: "Online", locationOrLink: "", interviewer: "", notes: "" });
    setShowForm(true);
  };

  const openEdit = (interview: Interview) => {
    setEditing(interview);
    setFieldErrors({});
    setForm({
      jobId: interview.jobId,
      scheduledDate: interview.scheduledDate,
      scheduledTime: interview.scheduledTime,
      mode: interview.mode,
      locationOrLink: interview.locationOrLink ?? "",
      interviewer: interview.interviewer ?? "",
      notes: interview.notes ?? "",
    });
    setShowForm(true);
  };

  useEffect(() => {
    if (!editId) return;
    const target = items.find((item) => item.id === editId);
    if (!target) return;
    openEdit(target);
    router.replace("/interviews", { scroll: false });
  }, [editId, items, router]);

  const updatePrepChecklist = async (interview: Interview, checklist: Interview["prepChecklist"]) => {
    const previous = interview.prepChecklist;
    setItems((current) => current.map((item) => item.id === interview.id ? { ...item, prepChecklist: checklist } : item));
    try {
      await api.patch(`/api/interviews/${interview.id}`, { prepChecklist: checklist });
      toast.success("Checklist persiapan tersimpan");
    } catch {
      setItems((current) => current.map((item) => item.id === interview.id ? { ...item, prepChecklist: previous } : item));
      toast.error("Checklist persiapan gagal disimpan");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      scheduledDate: form.scheduledDate,
      scheduledTime: form.scheduledTime,
      mode: form.mode,
      locationOrLink: form.locationOrLink.trim() || null,
      interviewer: form.interviewer.trim() || null,
      notes: form.notes.trim() || null,
    };
    const validation = editing
      ? interviewPatchSchema.safeParse(payload)
      : interviewSchema.safeParse(payload);
    const errors = validation.success ? {} : formErrorsFromZod(validation.error);
    const missingJob = !editing && !form.jobId;
    if (missingJob) errors.jobId = "Pilih lamaran yang terkait";
    setFieldErrors(errors);
    if (!validation.success || missingJob) {
      toast.error(Object.values(errors)[0] || "Periksa kembali data wawancara");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/api/interviews/${editing.id}`, validation.data);
        setItems((current) => current.map((item) => item.id === editing.id
          ? { ...item, ...payload }
          : item));
        toast.success("Jadwal wawancara diperbarui");
      } else {
        await api.post(`/api/interviews?jobId=${form.jobId}`, payload);
        await load();
        toast.success("Jadwal wawancara disimpan");
      }
      setShowForm(false);
      setEditing(null);
    } catch {
      toast.error(editing ? "Gagal memperbarui jadwal wawancara" : "Gagal menyimpan jadwal wawancara");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateResult = async (id: string, result: string) => {
    setUpdating(id);
    try {
      const validation = interviewPatchSchema.safeParse({ result });
      if (!validation.success) {
        toast.error(validation.error.issues[0]?.message || "Hasil wawancara tidak valid");
        return;
      }
      await api.patch(`/api/interviews/${id}`, validation.data);
      setItems((current) => current.map((item) => item.id === id ? { ...item, result } : item));
      toast.success("Hasil wawancara diperbarui");
    } catch {
      toast.error("Gagal memperbarui hasil wawancara");
    } finally {
      setUpdating(null);
    }
  };

  const today = getToday();
  const upcoming = items
    .filter((i) => i.scheduledDate >= today)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const past = items
    .filter((i) => i.scheduledDate < today)
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-5 sm:px-8 xl:px-10 pt-8 xl:pt-10 pb-4 border-b border-subtle">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Microphone className="w-6 h-6 text-secondary" />
              <h1 className="text-2xl font-bold page-title text-primary">Interviews</h1>
            </div>
            <p className="text-xs text-faint mt-1">
              Semua jadwal wawancara dan hasilnya (FR-06). Klik hasil untuk memperbarui.
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
              Jadwal Wawancara
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 w-full overflow-y-auto scroll-thin p-5 sm:p-8 xl:p-10 xl:pt-6 space-y-8">
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
            <Calendar className="w-8 h-8 text-faint mx-auto" />
            <p className="text-sm font-medium text-primary">Belum ada jadwal wawancara</p>
            <p className="text-xs text-faint max-w-sm mx-auto">
              Tambahkan jadwal setelah kamu dihubungi HRD — lengkap dengan mode dan tautan meeting.
            </p>
          </div>
        ) : (
          <>
            <section>
              <h2 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">
                Mendatang ({upcoming.length})
              </h2>
              <div className="border border-subtle rounded-lg overflow-hidden">
                {upcoming.map((iv) => (
                  <InterviewRow
                    key={iv.id}
                    interview={iv}
                    onResult={(r) => handleUpdateResult(iv.id, r)}
                    onEdit={() => openEdit(iv)}
                    onPrepChange={(checklist) => void updatePrepChecklist(iv, checklist)}
                    updating={updating === iv.id}
                  />
                ))}
              </div>
            </section>

            {past.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">
                  Selesai ({past.length})
                </h2>
                <div className="border border-subtle rounded-lg overflow-hidden">
                  {past.map((iv) => (
                    <InterviewRow
                      key={iv.id}
                      interview={iv}
                      onResult={(r) => handleUpdateResult(iv.id, r)}
                      onEdit={() => openEdit(iv)}
                      onPrepChange={(checklist) => void updatePrepChecklist(iv, checklist)}
                      updating={updating === iv.id}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={(open) => {
        setShowForm(open);
        if (!open) setEditing(null);
      }}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit jadwal wawancara" : "Jadwal wawancara baru"}</DialogTitle>
            <DialogDescription>{editing ? "Perbarui waktu, mode, kontak, atau catatan wawancara." : "Pilih lamaran dan isi waktu yang sudah disepakati."}</DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={handleSave} className="space-y-4">
            {editing ? (
              <div className="space-y-1.5">
                <Label>Lamaran</Label>
                <p className="rounded-md border border-subtle bg-card px-3 py-2 text-sm text-secondary">{editing.position} · {editing.company}</p>
              </div>
            ) : <div className="space-y-1.5">
              <Label htmlFor="interview-job">Lamaran *</Label>
              <FormSelect
                id="interview-job"
                ariaLabel="Lamaran terkait wawancara"
                invalid={Boolean(fieldErrors.jobId)}
                value={form.jobId}
                onValueChange={(jobId) => setForm({ ...form, jobId })}
                options={[
                  { value: "", label: "Pilih lamaran..." },
                  ...jobs.map((job) => ({ value: job.id, label: `${job.position} — ${job.company}` })),
                ]}
              />
              {fieldErrors.jobId && <p className="text-xs text-destructive" role="alert">{fieldErrors.jobId}</p>}
            </div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="interview-date">Tanggal *</Label>
                <Input id="interview-date" type="date" required aria-invalid={Boolean(fieldErrors.scheduledDate)} value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
                {fieldErrors.scheduledDate && <p className="text-xs text-destructive">{fieldErrors.scheduledDate}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="interview-time">Waktu *</Label>
                <Input id="interview-time" type="time" required aria-invalid={Boolean(fieldErrors.scheduledTime)} value={form.scheduledTime} onChange={(e) => setForm({ ...form, scheduledTime: e.target.value })} />
                {fieldErrors.scheduledTime && <p className="text-xs text-destructive">{fieldErrors.scheduledTime}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="interview-mode">Mode *</Label>
              <FormSelect id="interview-mode" ariaLabel="Mode wawancara" value={form.mode} onValueChange={(mode) => setForm({ ...form, mode })} options={INTERVIEW_MODES.map((value) => ({ value, label: value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="interview-location">Tautan / lokasi</Label>
              <Input id="interview-location" maxLength={2000} aria-invalid={Boolean(fieldErrors.locationOrLink)} value={form.locationOrLink} onChange={(e) => setForm({ ...form, locationOrLink: e.target.value })} placeholder="https://meet.google.com/... atau alamat kantor" />
              {fieldErrors.locationOrLink && <p className="text-xs text-destructive">{fieldErrors.locationOrLink}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="interview-interviewer">Pewawancara</Label>
              <Input id="interview-interviewer" maxLength={200} aria-invalid={Boolean(fieldErrors.interviewer)} value={form.interviewer} onChange={(e) => setForm({ ...form, interviewer: e.target.value })} placeholder="cth. Rina (HR Manager)" />
              {fieldErrors.interviewer && <p className="text-xs text-destructive" role="alert">{fieldErrors.interviewer}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="interview-notes">Catatan persiapan dan hasil</Label>
              <Textarea id="interview-notes" maxLength={10000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} aria-invalid={Boolean(fieldErrors.notes)} placeholder="Catat pertanyaan, poin pengalaman yang ingin diceritakan, atau hasil wawancara..." className="min-h-24 resize-y" />
              {fieldErrors.notes && <p className="text-xs text-destructive">{fieldErrors.notes}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
              <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : editing ? "Simpan perubahan" : "Simpan jadwal"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InterviewRow({
  interview: iv,
  onResult,
  onEdit,
  onPrepChange,
  updating,
}: {
  interview: Interview;
  onResult: (r: string) => void;
  onEdit: () => void;
  onPrepChange: (checklist: Interview["prepChecklist"]) => void;
  updating: boolean;
}) {
  const [showPrep, setShowPrep] = useState(false);
  const prepChecklist = iv.prepChecklist.length ? iv.prepChecklist : DEFAULT_PREP_CHECKLIST;
  const completedPrep = prepChecklist.filter((item) => item.done).length;
  return (
    <div className="border-b border-subtle last:border-b-0 hover-row">
      <div className="flex items-center justify-between gap-3 px-3.5 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-medium text-primary">
          {MODE_ICON[iv.mode]}
          <Link href={`/applications?peek=${iv.jobId}`} className="hover:underline truncate">
            {iv.position} — {iv.company}
          </Link>
        </div>
        <div className="text-[10px] text-faint mt-0.5 flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
                      {formatDateID(iv.scheduledDate)} · {iv.scheduledTime}
          </span>
                      <span>({relativeDays(iv.scheduledDate)})</span>
                      {iv.locationOrLink && <span className="truncate max-w-[220px]">· {iv.locationOrLink}</span>}
          {iv.interviewer && <span>· bersama {iv.interviewer}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {iv.scheduledDate >= getToday() && <button type="button" onClick={() => setShowPrep((open) => !open)} aria-expanded={showPrep} className="rounded-md border border-subtle px-2 py-1.5 text-[10px] text-secondary transition-colors hover:bg-white/5 hover:text-primary">Persiapan {completedPrep}/{prepChecklist.length}</button>}
        <FormSelect
          value={iv.result}
          disabled={updating}
          ariaLabel={`Hasil wawancara ${iv.position} di ${iv.company}`}
          onValueChange={onResult}
          options={INTERVIEW_RESULTS.map((value) => ({ value, label: value }))}
          className={`w-36 text-xs ${RESULT_STYLES[iv.result] || ""}`}
        />
        <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit jadwal wawancara ${iv.position} di ${iv.company}`} className="text-faint hover:text-primary">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
      </div>
      {showPrep && <div className="space-y-2 border-t border-subtle bg-white/[0.015] px-4 py-3">
        <p className="text-[11px] font-medium text-secondary">Checklist persiapan wawancara</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {prepChecklist.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-2 text-xs text-secondary hover:text-primary">
            <input type="checkbox" checked={item.done} onChange={(event) => onPrepChange(prepChecklist.map((entry) => entry.id === item.id ? { ...entry, done: event.target.checked } : entry))} className="mt-0.5 accent-blue-500" />
            <span>{item.label}</span>
          </label>)}
        </div>
        <button type="button" onClick={onEdit} className="text-[11px] text-blue-300 transition hover:text-blue-200 hover:underline">Tambah catatan persiapan</button>
      </div>}
    </div>
  );
}

