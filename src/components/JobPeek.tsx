"use client";

import { toast } from "sonner";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  X,
  Calendar,
  Clock,
  Building2,
  Trash2,
  Plus,
  MessageSquare,
  FileText,
  History,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Loader2,
  CalendarClock,
  Pencil,
} from "@/components/icons";
import { StatusBadge } from "./StatusBadge";
import { api, ApiError } from "@/lib/api-client";
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  type CommunicationChannel,
  type CommunicationDirection,
  INTERVIEW_MODES,
  type InterviewMode,
  type PipelineStatus,
  allowedTransitions,
} from "@/lib/domain/schema";
import { formatBytes, formatDateID, formatDateTimeID } from "@/lib/ui";
import { FormSelect } from "./FormSelect";
import { today } from "@/lib/domain/dates";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmAction } from "./ConfirmProvider";
import { NewJobModal, type EditableJob } from "./NewJobModal";
import {
  communicationSchema,
  interviewSchema,
  formErrorsFromZod,
  jobStatusSchema,
} from "@/lib/domain/validation";

type DetailData = {
  job: EditableJob & { lastResponseAt: string | null };
  communications: {
    id: string;
    communicationDate: string;
    channel: CommunicationChannel;
    direction: CommunicationDirection;
    summary: string;
    recruiterContact: string | null;
    createdAt: string;
  }[];
  statusHistory: {
    id: string;
    fromStatus: PipelineStatus | null;
    toStatus: PipelineStatus;
    source: "pengguna" | "sistem";
    changedAt: string;
  }[];
  reminders: {
    id: string;
    type: string;
    dueDate: string;
    completedAt: string | null;
  }[];
  followUp: {
    daysSinceApplied: number;
    followUpDueDate: string;
    hasCompanyReply: boolean;
    isFlagged: boolean;
    shouldFlag: boolean;
    suggestedNextAction: string | null;
  };
  allowedStatuses: PipelineStatus[];
};

type LinkedDocument = {
  id: string;
  name: string;
  file_type: string;
  size_bytes: number;
  category: string | null;
  version_label: string | null;
  created_at: string;
  linked_at: string;
};

export function JobPeek({
  jobId,
  onClose,
  onChanged,
}: {
  jobId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const confirmAction = useConfirmAction();
  const searchParams = useSearchParams();
  const shouldEditOnOpen = searchParams.get("edit") === "1";
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "comms" | "history" | "interviews" | "documents">("overview");
  const [documents, setDocuments] = useState<LinkedDocument[]>([]);
  const [documentsForJob, setDocumentsForJob] = useState<string | null>(null);
  const [documentsRequestedFor, setDocumentsRequestedFor] = useState<string | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  // New communication form state
  const [showAddComm, setShowAddComm] = useState(false);
  const [editingComm, setEditingComm] = useState<DetailData["communications"][number] | null>(null);
  const [commForm, setCommForm] = useState({
    communicationDate: today(),
    channel: "Email" as CommunicationChannel,
    direction: "Keluar" as CommunicationDirection,
    summary: "",
    recruiterContact: "",
  });
  const [savingComm, setSavingComm] = useState(false);
  const [commErrors, setCommErrors] = useState<Record<string, string>>({});

  // New interview form state
  const [showAddInt, setShowAddInt] = useState(false);
  const [intForm, setIntForm] = useState({
    scheduledDate: today(),
    scheduledTime: "10:00",
    mode: "Online" as InterviewMode,
    locationOrLink: "",
    interviewer: "",
  });
  const [savingInt, setSavingInt] = useState(false);
  const [intErrors, setIntErrors] = useState<Record<string, string>>({});
  const [changingStatus, setChangingStatus] = useState(false);
  const [editJobOpen, setEditJobOpen] = useState(false);

  const load = useCallback(async () => {
    if (!jobId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<DetailData>(`/api/jobs/${jobId}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const loadDocuments = useCallback(async () => {
    if (!jobId) return;
    setDocumentsRequestedFor(jobId);
    setDocumentsLoading(true);
    setDocumentsError(null);
    if (documentsForJob !== jobId) setDocuments([]);
    try {
      const res = await api.get<{ items: LinkedDocument[] }>(
        `/api/documents?jobId=${encodeURIComponent(jobId)}`,
      );
      setDocuments(res.items);
      setDocumentsForJob(jobId);
    } catch (err) {
      setDocumentsError(err instanceof Error ? err.message : "Gagal memuat dokumen lamaran");
    } finally {
      setDocumentsLoading(false);
    }
  }, [jobId, documentsForJob]);

  useEffect(() => {
    if (
      activeTab === "documents" &&
      jobId &&
      documentsRequestedFor !== jobId &&
      !documentsLoading
    ) {
      void loadDocuments();
    }
  }, [activeTab, jobId, documentsRequestedFor, documentsLoading, loadDocuments]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (shouldEditOnOpen && data) setEditJobOpen(true);
  }, [shouldEditOnOpen, data]);

  if (!jobId) return null;

  const handleStatusChange = async (newStatus: PipelineStatus) => {
    if (changingStatus || !data) return;
    const validation = jobStatusSchema.safeParse(newStatus);
    if (!validation.success) {
      toast.error("Status lamaran tidak valid");
      return;
    }
    const previousStatus = data.job.status;
    const changedAt = new Date().toISOString();
    setChangingStatus(true);
    try {
      await api.patch(`/api/jobs/${jobId}`, { status: validation.data });
      setData((current) => current ? {
        ...current,
        job: { ...current.job, status: newStatus },
        allowedStatuses: allowedTransitions(newStatus),
        statusHistory: [{
          id: `optimistic-${jobId}-${changedAt}`,
          fromStatus: previousStatus,
          toStatus: newStatus,
          source: "pengguna",
          changedAt,
        }, ...current.statusHistory],
      } : current);
      onChanged();
      toast.success(`Status diubah ke ${newStatus}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Gagal mengubah status";
      toast.error(msg);
    } finally {
      setChangingStatus(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirmAction({
      title: "Pindahkan lamaran ke arsip?",
      description: "Lamaran ini dapat dipulihkan kembali dari halaman Archive.",
      confirmLabel: "Pindahkan ke arsip",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await api.del(`/api/jobs/${jobId}`);
      toast.success("Lamaran dipindahkan ke arsip");
      onClose();
      onChanged();
    } catch (err) {
      toast.error("Gagal menghapus lamaran");
    }
  };

  const handleAddComm = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = communicationSchema.safeParse({
      ...commForm,
      summary: commForm.summary.trim(),
      recruiterContact: commForm.recruiterContact.trim() || null,
    });
    const errors = validation.success ? {} : formErrorsFromZod(validation.error);
    setCommErrors(errors);
    if (!validation.success) {
      toast.error(Object.values(errors)[0] || "Periksa data komunikasi");
      return;
    }
    setSavingComm(true);
    try {
      if (editingComm) {
        await api.patch(`/api/jobs/${jobId}/communications/${editingComm.id}`, validation.data);
      } else {
        await api.post(`/api/jobs/${jobId}/communications`, validation.data);
      }
      setShowAddComm(false);
      setEditingComm(null);
      setCommForm({
        communicationDate: today(),
        channel: "Email",
        direction: "Keluar",
        summary: "",
        recruiterContact: "",
      });
      await load();
      toast.success(editingComm ? "Catatan komunikasi diperbarui" : "Catatan komunikasi disimpan");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Gagal menyimpan komunikasi";
      toast.error(msg);
    } finally {
      setSavingComm(false);
    }
  };

  const openEditComm = (communication: DetailData["communications"][number]) => {
    setEditingComm(communication);
    setCommForm({
      communicationDate: communication.communicationDate,
      channel: communication.channel,
      direction: communication.direction,
      summary: communication.summary,
      recruiterContact: communication.recruiterContact ?? "",
    });
    setCommErrors({});
    setShowAddComm(true);
  };

  const handleAddInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = interviewSchema.safeParse({
      ...intForm,
      locationOrLink: intForm.locationOrLink.trim() || null,
      interviewer: intForm.interviewer.trim() || null,
    });
    const errors = validation.success ? {} : formErrorsFromZod(validation.error);
    setIntErrors(errors);
    if (!validation.success) {
      toast.error(Object.values(errors)[0] || "Periksa data wawancara");
      return;
    }
    setSavingInt(true);
    try {
      await api.post(`/api/interviews?jobId=${jobId}`, validation.data);
      setShowAddInt(false);
      await load();
      toast.success("Jadwal wawancara disimpan");
    } catch (err) {
      toast.error("Gagal menjadwalkan wawancara");
    } finally {
      setSavingInt(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex justify-end bg-black/20 dark:bg-black/40 animate-in-fast"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl h-full bg-card border-l border-subtle shadow-2xl flex flex-col overflow-hidden animate-in-fast"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top actions */}
        <div className="h-12 px-4 border-b border-subtle flex items-center justify-between text-xs text-secondary flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-faint">Application</span>
            <ChevronRight className="w-3.5 h-3.5 text-faint" />
            <span className="font-medium text-primary truncate max-w-[200px]">
              {data?.job.position || "Detail"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditJobOpen(true)}
              disabled={!data}
              aria-label="Edit data lamaran"
              className="p-1.5 rounded text-faint hover:bg-white/5 hover:text-primary disabled:opacity-40"
              title="Edit lamaran"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 hover:bg-rose-950/40 dark:hover:bg-rose-950/40 text-faint hover:text-rose-600 rounded"
              title="Pindahkan ke Archive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/5 rounded text-faint hover:text-primary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Peek Body */}
        {loading ? (
          <div className="p-8 space-y-4">
            <div className="h-6 w-48 skeleton rounded" />
            <div className="h-4 w-32 skeleton rounded" />
            <div className="h-32 w-full skeleton rounded-lg mt-6" />
          </div>
        ) : error || !data ? (
          <div className="p-8 text-center text-xs text-rose-600">
            {error || "Data tidak ditemukan"}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scroll-thin">
            {/* Header info */}
            <div className="p-6 border-b border-subtle space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold page-title text-primary">
                    {data.job.position}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-secondary mt-1">
                    <Building2 className="w-3.5 h-3.5 text-faint" />
                    <span>{data.job.company}</span>
                    {data.job.location && (
                      <>
                        <span className="text-faint">·</span>
                        <span>{data.job.location}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-start gap-1.5 sm:items-end">
                  <StatusBadge status={data.job.status} />
                  {data.allowedStatuses.length > 0 && (
                    <div className="flex w-full max-w-[360px] flex-wrap items-center justify-start gap-1.5 text-[11px] text-faint sm:justify-end">
                      <span className="mr-1">Ubah ke:</span>
                      {data.allowedStatuses.map((st) => (
                        <button
                          key={st}
                          onClick={() => handleStatusChange(st)}
                          disabled={changingStatus}
                          className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-primary/60 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.98] disabled:cursor-wait disabled:opacity-60"
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Follow-up alert banner if qualified (FR-02) */}
              {data.followUp.isFlagged && (
                <div className="border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 rounded-lg p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">Perlu Follow-up</div>
                    <div className="text-[11px] mt-0.5 text-amber-800 dark:text-amber-300">
                      Sudah {data.followUp.daysSinceApplied} hari sejak lamaran dikirim tanpa balasan.
                      Sebaiknya kirim pesan santun untuk menanyakan status seleksi.
                    </div>
                  </div>
                  <Link
                    href="/templates"
                    className="text-[10px] font-medium underline flex-shrink-0 text-amber-700 dark:text-amber-300"
                  >
                    Gunakan template
                  </Link>
                </div>
              )}

              {/* Quick meta grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
                <Property label="Dilamar" value={formatDateID(data.job.appliedAt)} />
                <Property
                  label="Tenggat"
                  value={data.job.deadline ? formatDateID(data.job.deadline) : "—"}
                />
                <Property label="Prioritas" value={data.job.priority || "Sedang"} />
                <Property label="Sumber" value={data.job.source || "—"} />
              </div>

              {data.job.jobUrl && (
                <a
                  href={data.job.jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline pt-1"
                >
                  <ExternalLink className="w-3 h-3" /> Buka tautan lowongan asli
                </a>
              )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-subtle px-4 text-xs font-medium text-secondary">
              <TabBtn
                label="Ringkasan"
                active={activeTab === "overview"}
                onClick={() => setActiveTab("overview")}
              />
              <TabBtn
                label={`Komunikasi (${data.communications.length})`}
                active={activeTab === "comms"}
                onClick={() => setActiveTab("comms")}
              />
              <TabBtn
                label="Jadwal Wawancara"
                active={activeTab === "interviews"}
                onClick={() => setActiveTab("interviews")}
              />
              <TabBtn
                label={documentsForJob === jobId ? `Dokumen (${documents.length})` : "Dokumen"}
                active={activeTab === "documents"}
                onClick={() => {
                  setActiveTab("documents");
                  void loadDocuments();
                }}
              />
              <TabBtn
                label="Riwayat Status"
                active={activeTab === "history"}
                onClick={() => setActiveTab("history")}
              />
            </div>

            {/* Tab content */}
            <div className="p-6">
              {activeTab === "overview" && (
                <div className="space-y-5 text-xs">
                  {data.job.notes && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-faint uppercase tracking-wider">
                        Catatan
                      </div>
                      <div className="p-3 rounded-lg border border-subtle bg-black/[0.02] dark:bg-white/[0.02] leading-relaxed whitespace-pre-wrap text-primary">
                        {data.job.notes}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-faint uppercase tracking-wider">
                      Tindakan Cepat
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setActiveTab("comms");
                          setShowAddComm(true);
                        }}
                        className="px-2.5 py-1.5 rounded-md border border-subtle hover:bg-white/5 flex items-center gap-1.5 text-secondary"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-blue-500" /> Catat Komunikasi
                      </button>
                      <button
                        onClick={() => {
                          setActiveTab("interviews");
                          setShowAddInt(true);
                        }}
                        className="px-2.5 py-1.5 rounded-md border border-subtle hover:bg-white/5 flex items-center gap-1.5 text-secondary"
                      >
                        <CalendarClock className="w-3.5 h-3.5 text-violet-500" /> Jadwalkan Interview
                      </button>
                      <Link
                        href={`/documents?jobId=${data.job.id}`}
                        className="px-2.5 py-1.5 rounded-md border border-subtle hover:bg-white/5 flex items-center gap-1.5 text-secondary"
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-500" /> Tautkan Dokumen (CV)
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "documents" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-faint">
                      Dokumen yang ditautkan untuk lamaran ini.
                    </p>
                    <Link
                      href={`/documents?jobId=${data.job.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-subtle px-2.5 py-1.5 text-xs text-secondary transition hover:bg-white/5 hover:text-primary"
                    >
                      <FileText className="h-3.5 w-3.5 text-emerald-500" />
                      Kelola dokumen
                    </Link>
                  </div>

                  {documentsLoading ? (
                    <div className="space-y-2" aria-label="Memuat dokumen lamaran">
                      <div className="h-14 skeleton rounded-lg" />
                      <div className="h-14 skeleton rounded-lg" />
                    </div>
                  ) : documentsError ? (
                    <div className="rounded-lg border border-subtle p-4 text-center">
                      <p className="text-xs text-destructive" role="alert">{documentsError}</p>
                      <button
                        type="button"
                        onClick={() => void loadDocuments()}
                        className="mt-2 text-xs text-blue-400 hover:underline"
                      >
                        Coba lagi
                      </button>
                    </div>
                  ) : documentsForJob === jobId && documents.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-subtle px-4 py-8 text-center">
                      <FileText className="mx-auto h-6 w-6 text-faint" />
                      <p className="mt-2 text-sm font-medium text-primary">Belum ada dokumen tertaut</p>
                      <p className="mx-auto mt-1 max-w-sm text-xs text-faint">
                        Tautkan CV, surat lamaran, atau berkas pendukung agar tersimpan bersama lamaran ini.
                      </p>
                      <Link
                        href={`/documents?jobId=${data.job.id}`}
                        className="mt-3 inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
                      >
                        Pilih dokumen
                      </Link>
                    </div>
                  ) : (
                    <div className="divide-y divide-subtle overflow-hidden rounded-lg border border-subtle">
                      {documents.map((doc) => (
                        <div key={doc.id} className="flex min-w-0 items-center justify-between gap-3 px-3 py-2.5 hover:bg-white/[0.03]">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-950/50">
                              <FileText className="h-4 w-4 text-blue-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-primary">{doc.name}</p>
                              <p className="truncate text-[10px] text-faint">
                                {doc.category || "Dokumen"} · {doc.file_type.toUpperCase()} · {formatBytes(doc.size_bytes)}
                                {doc.version_label ? ` · ${doc.version_label}` : ""}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => window.open(`/api/documents/${doc.id}`, "_blank", "noopener,noreferrer")}
                            aria-label={`Unduh ${doc.name}`}
                            title="Unduh dokumen"
                            className="shrink-0 rounded-md border border-subtle px-2 py-1 text-[10px] text-secondary transition hover:bg-white/5 hover:text-primary"
                          >
                            Unduh
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Communications Tab (FR-03) */}
              {activeTab === "comms" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-faint">
                      Catat riwayat interaksi email, telepon, LinkedIn, atau recruiter.
                    </span>
                    <button
                      onClick={() => {
                        setEditingComm(null);
                        setCommErrors({});
                        setCommForm({ communicationDate: today(), channel: "Email", direction: "Keluar", summary: "", recruiterContact: "" });
                        setShowAddComm((s) => !s);
                      }}
                      className="px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Tambah
                    </button>
                  </div>

                  {showAddComm && (
                    <form
                      noValidate
                      onSubmit={handleAddComm}
                      className="border border-subtle rounded-lg p-3 space-y-2.5 bg-black/[0.02] dark:bg-white/[0.02]"
                    >
                      <div className="text-xs font-medium text-primary">{editingComm ? "Edit catatan komunikasi" : "Catatan komunikasi baru"}</div>
                      {Object.values(commErrors)[0] && <p className="text-xs text-destructive" role="alert">{Object.values(commErrors)[0]}</p>}
                      <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                        <div>
                          <Label htmlFor="communication-date" className="text-[11px] text-secondary font-medium">Tanggal</Label>
                          <Input
                            id="communication-date"
                            type="date"
                            max={today()}
                            value={commForm.communicationDate}
                            onChange={(e) =>
                              setCommForm({ ...commForm, communicationDate: e.target.value })
                            }
                            aria-invalid={Boolean(commErrors.communicationDate)}
                            className="mt-1 h-9"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="communication-channel" className="text-[11px] text-secondary font-medium">Kanal</Label>
                          <FormSelect
                            id="communication-channel"
                            ariaLabel="Kanal komunikasi"
                            invalid={Boolean(commErrors.channel)}
                            value={commForm.channel}
                            onValueChange={(channel) => setCommForm({ ...commForm, channel: channel as CommunicationChannel })}
                            options={COMMUNICATION_CHANNELS.map((value) => ({ value, label: value }))}
                            className="mt-1 h-9 w-full"
                          />
                        </div>
                        <div>
                          <Label htmlFor="communication-direction" className="text-[11px] text-secondary font-medium">Arah</Label>
                          <FormSelect
                            id="communication-direction"
                            ariaLabel="Arah komunikasi"
                            invalid={Boolean(commErrors.direction)}
                            value={commForm.direction}
                            onValueChange={(direction) => setCommForm({ ...commForm, direction: direction as CommunicationDirection })}
                            options={COMMUNICATION_DIRECTIONS.map((value) => ({ value, label: value }))}
                            className="mt-1 h-9 w-full"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="recruiter-contact" className="text-[11px] text-secondary font-medium">Kontak recruiter</Label>
                        <Input
                          id="recruiter-contact"
                            maxLength={300}
                            aria-invalid={Boolean(commErrors.recruiterContact)}
                          value={commForm.recruiterContact}
                          onChange={(e) =>
                            setCommForm({ ...commForm, recruiterContact: e.target.value })
                          }
                          placeholder="Nama / email / WA recruiter..."
                          className="mt-1 h-9"
                        />
                      </div>

                      <div>
                        <Label htmlFor="communication-summary" className="text-[11px] text-secondary font-medium">Ringkasan *</Label>
                        <Textarea
                          id="communication-summary"
                            maxLength={5000}
                          value={commForm.summary}
                          onChange={(e) =>
                            setCommForm({ ...commForm, summary: e.target.value })
                          }
                          placeholder="Poin penting percakapan / balasan..."
                          aria-invalid={Boolean(commErrors.summary)}
                          className="mt-1 min-h-20 resize-y"
                          required
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => { setShowAddComm(false); setEditingComm(null); }}
                          className="px-2.5 py-1 text-xs border border-subtle rounded hover:bg-white/5"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          disabled={savingComm}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1"
                        >
                          {savingComm && <Loader2 className="w-3 h-3 animate-spin" />}
                          {editingComm ? "Simpan perubahan" : "Simpan"}
                        </button>
                      </div>
                    </form>
                  )}

                  {data.communications.length === 0 ? (
                    <div className="border border-dashed border-subtle rounded-lg p-6 text-center text-xs text-faint">
                      Belum ada catatan komunikasi. Catat balasan recruiter di sini.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.communications.map((c) => (
                        <div
                          key={c.id}
                          className="border border-subtle rounded-lg p-3 text-xs space-y-1 bg-card"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-primary">
                              {c.channel} · {c.direction}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-faint">{formatDateID(c.communicationDate)}</span>
                              <button type="button" onClick={() => openEditComm(c)} aria-label={`Edit catatan komunikasi ${c.channel} ${formatDateID(c.communicationDate)}`} className="rounded p-1 text-faint transition-colors hover:bg-white/5 hover:text-primary" title="Edit catatan">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-secondary leading-relaxed">{c.summary}</p>
                          {c.recruiterContact && (
                            <div className="text-[10px] text-faint">
                              Kontak: {c.recruiterContact}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Interviews Tab (FR-06) */}
              {activeTab === "interviews" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-faint">
                      Catat jadwal wawancara, mode, tautan meeting, dan hasil.
                    </span>
                    <button
                      onClick={() => setShowAddInt((s) => !s)}
                      className="px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Jadwalkan
                    </button>
                  </div>

                  {showAddInt && (
                    <form
                      noValidate
                      onSubmit={handleAddInterview}
                      className="border border-subtle rounded-lg p-3 space-y-2.5 bg-black/[0.02] dark:bg-white/[0.02]"
                    >
                      {Object.values(intErrors)[0] && <p className="text-xs text-destructive" role="alert">{Object.values(intErrors)[0]}</p>}
                      <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                        <div>
                          <Label htmlFor="job-interview-date" className="text-[11px] text-secondary font-medium">Tanggal</Label>
                          <Input
                            id="job-interview-date"
                            type="date"
                            value={intForm.scheduledDate}
                            onChange={(e) =>
                              setIntForm({ ...intForm, scheduledDate: e.target.value })
                            }
                            aria-invalid={Boolean(intErrors.scheduledDate)}
                            className="mt-1 h-9"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="job-interview-time" className="text-[11px] text-secondary font-medium">Jam</Label>
                          <Input
                            id="job-interview-time"
                            type="time"
                            value={intForm.scheduledTime}
                            onChange={(e) =>
                              setIntForm({ ...intForm, scheduledTime: e.target.value })
                            }
                            aria-invalid={Boolean(intErrors.scheduledTime)}
                            className="mt-1 h-9"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="job-interview-mode" className="text-[11px] text-secondary font-medium">Mode</Label>
                          <FormSelect
                            id="job-interview-mode"
                            ariaLabel="Mode wawancara"
                            invalid={Boolean(intErrors.mode)}
                            value={intForm.mode}
                            onValueChange={(mode) => setIntForm({ ...intForm, mode: mode as InterviewMode })}
                            options={INTERVIEW_MODES.map((value) => ({ value, label: value }))}
                            className="mt-1 h-9 w-full"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                        <div>
                          <Label htmlFor="job-interview-location" className="text-[11px] text-secondary font-medium">Tautan / lokasi</Label>
                          <Input
                            id="job-interview-location"
                            maxLength={2000}
                            value={intForm.locationOrLink}
                            onChange={(e) =>
                              setIntForm({ ...intForm, locationOrLink: e.target.value })
                            }
                            placeholder="https://meet.google.com/..."
                            aria-invalid={Boolean(intErrors.locationOrLink)}
                            className="mt-1 h-9"
                          />
                        </div>
                        <div>
                          <Label htmlFor="job-interview-interviewer" className="text-[11px] text-secondary font-medium">Pewawancara</Label>
                          <Input
                            id="job-interview-interviewer"
                            maxLength={200}
                            value={intForm.interviewer}
                            onChange={(e) =>
                              setIntForm({ ...intForm, interviewer: e.target.value })
                            }
                            placeholder="Nama HR / User Lead..."
                            aria-invalid={Boolean(intErrors.interviewer)}
                            className="mt-1 h-9"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowAddInt(false)}
                          className="px-2.5 py-1 text-xs border border-subtle rounded hover:bg-white/5"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          disabled={savingInt}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1"
                        >
                          {savingInt && <Loader2 className="w-3 h-3 animate-spin" />}
                          Jadwalkan
                        </button>
                      </div>
                    </form>
                  )}

                  <Link
                    href={`/interviews?jobId=${jobId}`}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Buka halaman kalender / wawancara penuh →
                  </Link>
                </div>
              )}

              {/* Status History Tab (FR-01, FR-02) */}
              {activeTab === "history" && (
                <div className="space-y-3">
                  <div className="text-xs text-faint">
                    Riwayat audit perubahan status oleh pengguna dan sistem (otomatis follow-up).
                  </div>
                  <div className="space-y-2 border-l border-subtle pl-3 ml-1">
                    {data.statusHistory.map((h) => (
                      <div key={h.id} className="relative text-xs space-y-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 absolute -left-[16px] top-1.5" />
                        <div className="font-medium text-primary">
                          {h.fromStatus ? `${h.fromStatus} → ` : "Status awal: "}
                          <span className="text-blue-600 dark:text-blue-400">{h.toStatus}</span>
                        </div>
                        <div className="text-[10px] text-faint">
                          Diubah oleh <span className="font-medium">{h.source}</span> ·{" "}
                          {formatDateTimeID(h.changedAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <NewJobModal
        open={editJobOpen}
        onClose={() => setEditJobOpen(false)}
        onCreated={() => {
          void load();
          onChanged();
        }}
        job={data?.job ?? null}
      />
    </div>
  );
}

function Property({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] text-faint uppercase font-medium tracking-wide">
        {label}
      </div>
      <div className="text-primary font-medium truncate">{value}</div>
    </div>
  );
}

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 border-b-2 transition ${
        active
          ? "border-blue-600 text-primary font-semibold"
          : "border-transparent text-secondary hover:text-primary"
      }`}
    >
      {label}
    </button>
  );
}
