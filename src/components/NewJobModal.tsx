"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "@/components/icons";
import { PIPELINE_STATUSES, PRIORITIES, type PipelineStatus } from "@/lib/domain/schema";
import { api, ApiError } from "@/lib/api-client";
import { createJobSchema, patchJobSchema, formErrorsFromZod } from "@/lib/domain/validation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RupiahInput } from "@/components/RupiahInput";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/FormSelect";
import { normalizeRupiahAmount } from "@/lib/domain/rupiah";
import { today } from "@/lib/domain/dates";

export type EditableJob = {
  id: string;
  company: string;
  position: string;
  appliedAt: string;
  deadline: string | null;
  status: PipelineStatus;
  source: string | null;
  location: string | null;
  workType: string | null;
  priority: string | null;
  salaryRange: string | null;
  jobUrl: string | null;
  notes: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  matchScore: number | null;
  interestLevel: string | null;
  techStack: string[];
};

const emptyForm = () => ({
  company: "",
  position: "",
  appliedAt: today(),
  deadline: "",
  status: "Draft" as PipelineStatus,
  source: "",
  location: "",
  workType: "",
  priority: "Sedang",
  salaryRange: "",
  jobUrl: "",
  notes: "",
  nextAction: "",
  nextActionDate: "",
  matchScore: "",
  interestLevel: "",
  techStack: "",
});

const WORK_TYPE_OPTIONS = [
  { value: "Remote", label: "Remote" },
  { value: "Hybrid", label: "Hybrid" },
  { value: "On-site", label: "On-site" },
  { value: "Remote / Hybrid", label: "Remote / Hybrid" },
  { value: "Hybrid / On-site", label: "Hybrid / On-site" },
  { value: "Penuh waktu", label: "Penuh waktu" },
  { value: "Paruh waktu", label: "Paruh waktu" },
  { value: "Kontrak", label: "Kontrak" },
  { value: "Magang", label: "Magang" },
  { value: "Freelance", label: "Freelance" },
  { value: "Lainnya", label: "Lainnya" },
] as const;

/**
 * Create Application dialog. Mirrors server validation so users get help
 * before submit, but the server remains authoritative.
 */
export function NewJobModal({ open, onClose, onCreated, job = null }: {
  open: boolean;
  onClose: () => void;
  onCreated: (job: { id: string }) => void;
  job?: EditableJob | null;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState(emptyForm);
  const workTypeOptions = form.workType && !WORK_TYPE_OPTIONS.some((option) => option.value === form.workType)
    ? [{ value: form.workType, label: `${form.workType} (tersimpan)` }, ...WORK_TYPE_OPTIONS]
    : WORK_TYPE_OPTIONS;

  useEffect(() => {
    if (open) {
      setError(null);
      setFieldErrors({});
      setForm(job ? {
        company: job.company,
        position: job.position,
        appliedAt: job.appliedAt,
        deadline: job.deadline ?? "",
        status: job.status,
        source: job.source ?? "",
        location: job.location ?? "",
        workType: job.workType ?? "",
        priority: job.priority ?? "Sedang",
        salaryRange: job.salaryRange ?? "",
        jobUrl: job.jobUrl ?? "",
        notes: job.notes ?? "",
        nextAction: job.nextAction ?? "",
        nextActionDate: job.nextActionDate ?? "",
        matchScore: job.matchScore === null ? "" : String(job.matchScore),
        interestLevel: job.interestLevel ?? "",
        techStack: job.techStack.join(", "),
      } : emptyForm());
    }
  }, [open, job]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const payload: Record<string, unknown> = {
        company: form.company.trim(),
        position: form.position.trim(),
        appliedAt: form.appliedAt,
        status: form.status,
        workType: form.workType.trim() || null,
        nextAction: form.nextAction.trim() || null,
        nextActionDate: form.nextActionDate || null,
        matchScore: form.matchScore.trim() ? Number(form.matchScore) : null,
        interestLevel: form.interestLevel.trim() || null,
        techStack: form.techStack.split(",").map((value) => value.trim()).filter(Boolean),
      };
      payload.deadline = form.deadline || null;
      payload.source = form.source.trim() || null;
      payload.location = form.location.trim() || null;
      payload.salaryRange = form.salaryRange.trim() ? normalizeRupiahAmount(form.salaryRange) : null;
      payload.jobUrl = form.jobUrl.trim() || null;
      if (form.priority) payload.priority = form.priority;
      payload.notes = form.notes.trim() || null;

      const validation = job
        ? patchJobSchema.safeParse(payload)
        : createJobSchema.safeParse(payload);
      if (!validation.success) {
        setFieldErrors(formErrorsFromZod(validation.error));
        setError("Periksa kembali data yang ditandai.");
        setSaving(false);
        return;
      }

      if (job) {
        await api.patch(`/api/jobs/${job.id}`, validation.data);
        toast.success("Lamaran diperbarui");
      } else {
        const created = await api.post<{ id: string }>("/api/jobs", validation.data);
        onCreated(created);
        toast.success("Lamaran berhasil disimpan");
      }
      onClose();
      if (job) onCreated({ id: job.id });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.fields) setFieldErrors(err.fields);
        toast.error(err.message);
      } else {
        setError("Terjadi kesalahan jaringan. Coba lagi.");
        toast.error("Lamaran belum tersimpan", { description: "Periksa koneksi lalu coba lagi." });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2.5rem)]">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 sm:px-7 sm:py-5 sm:pr-14">
          <DialogTitle>{job ? "Edit lamaran" : "Lamaran baru"}</DialogTitle>
          <DialogDescription>{job ? "Perbarui informasi lamaran dan tindakan berikutnya." : "Catat peluang kerja dan atur status awalnya."}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
          {error && (
            <div className="text-xs bg-destructive/10 text-destructive rounded-md px-3 py-2 border border-destructive/20" role="alert">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Perusahaan" htmlFor="job-company" error={fieldErrors.company}>
              <Input
                id="job-company"
                maxLength={200}
                aria-invalid={Boolean(fieldErrors.company)}
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="PT Example Technology"
                required
                autoFocus
              />
            </Field>

            <Field label="Posisi" htmlFor="job-position" error={fieldErrors.position}>
              <Input
                id="job-position"
                maxLength={200}
                aria-invalid={Boolean(fieldErrors.position)}
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="Full Stack Developer"
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-3">
            <Field label="Tanggal Lamar" htmlFor="job-applied-at" error={fieldErrors.appliedAt}>
              <Input
                id="job-applied-at"
                type="date"
                max={today()}
                aria-invalid={Boolean(fieldErrors.appliedAt)}
                value={form.appliedAt}
                onChange={(e) => setForm({ ...form, appliedAt: e.target.value })}
                required
              />
            </Field>

            <Field label="Tenggat" htmlFor="job-deadline" error={fieldErrors.deadline}>
              <Input
                id="job-deadline"
                type="date"
                min={form.appliedAt || undefined}
                aria-invalid={Boolean(fieldErrors.deadline)}
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </Field>

            <Field label="Status" htmlFor="job-status" error={fieldErrors.status}>
              <FormSelect
                id="job-status"
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status: status as PipelineStatus })}
                options={PIPELINE_STATUSES.map((status) => ({ value: status, label: status }))}
                invalid={Boolean(fieldErrors.status)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Sumber" htmlFor="job-source" error={fieldErrors.source}>
              <Input
                id="job-source"
                maxLength={200}
                aria-invalid={Boolean(fieldErrors.source)}
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="LinkedIn, Glints, Referral..."
              />
            </Field>

            <Field label="Lokasi" htmlFor="job-location" error={fieldErrors.location}>
              <Input
                id="job-location"
                maxLength={200}
                aria-invalid={Boolean(fieldErrors.location)}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Jakarta / Remote"
              />
            </Field>
          </div>

          <Field label="Tipe kerja" htmlFor="job-work-type" error={fieldErrors.workType}>
            <FormSelect
              id="job-work-type"
              ariaLabel="Tipe kerja"
              value={form.workType}
              onValueChange={(workType) => setForm({ ...form, workType })}
              options={[{ value: "", label: "Tidak ditentukan" }, ...workTypeOptions]}
              placeholder="Pilih tipe kerja"
              invalid={Boolean(fieldErrors.workType)}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Prioritas">
              <FormSelect
                value={form.priority}
                onValueChange={(priority) => setForm({ ...form, priority })}
                options={PRIORITIES.map((priority) => ({ value: priority, label: priority }))}
              />
            </Field>

            <Field label="Gaji (Rp)" htmlFor="job-salary" description="Angka saja; pemisah ribuan ditambahkan otomatis. Maksimal 15 digit." error={fieldErrors.salaryRange}>
              <RupiahInput
                id="job-salary"
                aria-invalid={Boolean(fieldErrors.salaryRange)}
                value={form.salaryRange}
                onValueChange={(salaryRange) => setForm({ ...form, salaryRange })}
                placeholder="1.000.000"
              />
            </Field>
          </div>

          <Field label="URL Lowongan" htmlFor="job-url" error={fieldErrors.jobUrl}>
            <Input
              id="job-url"
              type="url"
              maxLength={2000}
              aria-invalid={Boolean(fieldErrors.jobUrl)}
              value={form.jobUrl}
              onChange={(e) => setForm({ ...form, jobUrl: e.target.value })}
              placeholder="https://..."
            />
          </Field>

          <Field label="Catatan" htmlFor="job-notes" error={fieldErrors.notes}>
            <Textarea
              id="job-notes"
              className="min-h-24 resize-y"
              maxLength={10000}
              aria-invalid={Boolean(fieldErrors.notes)}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Konteks tambahan, kontak HR, versi CV yang dipakai..."
            />
          </Field>

          <div className="border-t border-border pt-4 space-y-4">
            <h3 className="text-xs font-semibold text-secondary">Tindakan dan kecocokan</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tindakan berikutnya" htmlFor="job-next-action" error={fieldErrors.nextAction}>
                <Input id="job-next-action" maxLength={200} value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} placeholder="Kirim email follow-up" />
              </Field>
              <Field label="Tanggal tindakan" htmlFor="job-next-action-date" error={fieldErrors.nextActionDate}>
                <Input id="job-next-action-date" type="date" value={form.nextActionDate} onChange={(e) => setForm({ ...form, nextActionDate: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Minat" htmlFor="job-interest-level" error={fieldErrors.interestLevel}>
                <Input id="job-interest-level" maxLength={100} value={form.interestLevel} onChange={(e) => setForm({ ...form, interestLevel: e.target.value })} placeholder="Tinggi / Sedang" />
              </Field>
              <Field label="Kecocokan (%)" htmlFor="job-match-score" error={fieldErrors.matchScore}>
                <Input id="job-match-score" type="number" min={0} max={100} step={1} value={form.matchScore} onChange={(e) => setForm({ ...form, matchScore: e.target.value })} placeholder="0–100" />
              </Field>
              <Field label="Tech stack" htmlFor="job-tech-stack" error={fieldErrors.techStack}>
                <Input id="job-tech-stack" maxLength={2440} value={form.techStack} onChange={(e) => setForm({ ...form, techStack: e.target.value })} placeholder="React, TypeScript" />
              </Field>
            </div>
          </div>
          </div>

          <div className="sticky bottom-0 mt-auto flex flex-col-reverse items-stretch gap-2 border-t border-border bg-popover/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-end sm:px-7">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={saving}
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {saving ? "Menyimpan..." : job ? "Simpan perubahan" : "Simpan Lamaran"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  error,
  description,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={htmlFor} className="block text-xs font-medium text-secondary">
        {label}
      </Label>
      {children}
      {description && <p className="text-[11px] text-faint">{description}</p>}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
