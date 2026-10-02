"use client";

import { toast } from "sonner";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  AlertCircle,
  Clock,
  Sparkles,
  TrendingUp,
  Loader2,
  Briefcase,
  Compass,
  Building2,
  CheckSquare,
  FileText,
  Mail,
} from "@/components/icons";
import { StatusBadge } from "./StatusBadge";
import { api } from "@/lib/api-client";
import { formatDateID, relativeDays } from "@/lib/ui";
import type { PipelineStatus } from "@/lib/domain/schema";
import { PIPELINE_STATUSES } from "@/lib/domain/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { today as getToday } from "@/lib/domain/dates";
import type { DashboardAction, DataQualityItem, WorkspacePreferences } from "@/lib/services/workspace.service";

type DashboardStats = {
  totalApplications: number;
  activeApplications: number;
  applicationsThisMonth: number;
  byStatus: Record<string, number>;
  responseRate: number;
  responseDays: { avg: number | null };
  offers: { count: number; rate: number };
  followUp: { completed: number; onTime: number; rate: number };
  interviews: { total: number; passed: number; rate: number };
  workspace: {
    companies: number;
    opportunities: number;
    tasks: number;
    completedTasks: number;
    documents: number;
    templates: number;
    activeReminders: number;
    overdueReminders: number;
    upcomingInterviews: number;
  };
};

type Job = {
  id: string;
  company: string;
  position: string;
  status: PipelineStatus;
  appliedAt: string;
  deadline: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  priority: string | null;
  companyId?: string | null;
};

type Reminder = {
  id: string;
  jobId: string;
  company: string;
  position: string;
  dueDate: string;
  type: string;
  completedAt: string | null;
};

type Interview = {
  id: string;
  jobId: string;
  company: string;
  position: string;
  scheduledDate: string;
  scheduledTime: string;
  mode: string;
  result: string;
};

const BOARD_GROUPS: { label: string; statuses: PipelineStatus[] }[] = [
  { label: "Tersimpan", statuses: ["Draft"] },
  { label: "Dilamar", statuses: ["Dilamar"] },
  { label: "Follow-up", statuses: ["Perlu Follow-up"] },
  { label: "Wawancara", statuses: ["Wawancara"] },
  { label: "Penawaran", statuses: ["Penawaran", "Diterima"] },
  { label: "Selesai", statuses: ["Ditolak", "Ditutup"] },
];

export function HomePage({
  userId,
  userName,
  initialData,
}: {
  userId: string;
  userName: string;
  initialData: {
    jobs: Job[];
    jobTotal: number;
    reminders: Reminder[];
    interviews: Interview[];
    stats: DashboardStats;
    preferences: WorkspacePreferences;
    actions: DashboardAction[];
    quality: DataQualityItem[];
  };
}) {
  const [jobs, setJobs] = useState<Job[]>(initialData.jobs);
  const [jobTotal, setJobTotal] = useState(initialData.jobTotal);
  const [reminders, setReminders] = useState<Reminder[]>(initialData.reminders);
  const [interviews, setInterviews] = useState<Interview[]>(initialData.interviews);
  const [stats, setStats] = useState(initialData.stats);
  const [preferences, setPreferences] = useState(initialData.preferences);
  const [actions, setActions] = useState(initialData.actions);
  const [quality] = useState(initialData.quality);
  const [notes, setNotes] = useState(initialData.preferences.quickNotes);
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaved, setNotesSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [goalApplication, setGoalApplication] = useState(String(initialData.preferences.weeklyApplicationGoal));
  const [goalFollowUp, setGoalFollowUp] = useState(String(initialData.preferences.weeklyFollowUpGoal));
  const [savingGoals, setSavingGoals] = useState(false);
  const latestNotes = useRef(notes);
  const notesSaveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const initializedNotes = useRef(false);

  useEffect(() => {
    if (initializedNotes.current) return;
    initializedNotes.current = true;
    if (initialData.preferences.quickNotes) return;
    const legacyNotes = localStorage.getItem(`jobspace:home-notes:${userId}`) || localStorage.getItem("jobspace:home-notes") || "";
    if (!legacyNotes) return;
    latestNotes.current = legacyNotes;
    setNotes(legacyNotes);
    setNotesDirty(true);
    localStorage.removeItem(`jobspace:home-notes:${userId}`);
    localStorage.removeItem("jobspace:home-notes");
  }, [initialData.preferences.quickNotes, userId]);

  // Debounce notes so editing does not issue a database write per keystroke.
  useEffect(() => {
    if (!notesDirty) return;
    setNotesSaved("saving");
    const handle = setTimeout(() => {
      const value = latestNotes.current;
      const saveRequest = notesSaveQueue.current
        .catch(() => undefined)
        .then(() => api.patch<WorkspacePreferences>("/api/workspace", { quickNotes: value }));
      notesSaveQueue.current = saveRequest;
      saveRequest
        .then((saved) => {
          setPreferences(saved);
          if (latestNotes.current === value) setNotesDirty(false);
          localStorage.removeItem(`jobspace:home-notes:${userId}`);
          setNotesSaved("saved");
          setTimeout(() => setNotesSaved("idle"), 1200);
        })
        .catch(() => {
          setNotesSaved("idle");
          toast.error("Catatan belum tersimpan. Periksa koneksi lalu coba lagi.");
        });
    }, 700);
    return () => clearTimeout(handle);
  }, [notes, notesDirty, userId]);

  const saveGoals = async (event: React.FormEvent) => {
    event.preventDefault();
    const weeklyApplicationGoal = Number(goalApplication);
    const weeklyFollowUpGoal = Number(goalFollowUp);
    if (![weeklyApplicationGoal, weeklyFollowUpGoal].every((value) => Number.isInteger(value) && value >= 1 && value <= 100)) {
      toast.error("Target mingguan harus berupa angka 1–100");
      return;
    }
    setSavingGoals(true);
    try {
      const saved = await api.patch<WorkspacePreferences>("/api/workspace", { weeklyApplicationGoal, weeklyFollowUpGoal });
      setPreferences(saved);
      setGoalApplication(String(saved.weeklyApplicationGoal));
      setGoalFollowUp(String(saved.weeklyFollowUpGoal));
      toast.success("Target mingguan diperbarui");
    } catch {
      toast.error("Target belum tersimpan");
    } finally {
      setSavingGoals(false);
    }
  };

  const completeReminder = async (
    reminderId: string,
    action?: Pick<DashboardAction, "dueDate" | "detail">,
  ) => {
    const reminderToComplete = reminders.find((reminder) => reminder.id === reminderId);
    const dueDate = reminderToComplete?.dueDate ?? action?.dueDate ?? null;
    const isFollowUp = reminderToComplete?.type === "follow_up" || action?.detail === "Tindak lanjut lamaran";
    try {
      await api.post(`/api/reminders/${reminderId}/complete`, {});
      setReminders((current) => current.filter((reminder) => reminder.id !== reminderId));
      setStats((current) => ({
        ...current,
        workspace: {
          ...current.workspace,
          activeReminders: Math.max(0, current.workspace.activeReminders - 1),
          overdueReminders: Math.max(
            0,
            current.workspace.overdueReminders - (dueDate && dueDate < getToday() ? 1 : 0),
          ),
        },
      }));
      if (isFollowUp) {
        setPreferences((current) => ({ ...current, followUpsThisWeek: current.followUpsThisWeek + 1 }));
      }
      setActions((current) => current.filter((item) => !(item.kind === "reminder" && item.recordId === reminderId)));
      toast.success("Pengingat ditandai selesai");
    } catch {
      toast.error("Gagal menyelesaikan pengingat");
    }
  };

  const completeDashboardAction = async (action: DashboardAction) => {
    if (action.kind === "reminder") {
      await completeReminder(action.recordId, action);
      return;
    }
    if (action.kind !== "task") return;
    try {
      await api.patch(`/api/tasks/${action.recordId}`, { completed: true });
      setActions((current) => current.filter((item) => item.id !== action.id));
      setStats((current) => ({
        ...current,
        workspace: {
          ...current.workspace,
          tasks: Math.max(0, current.workspace.tasks - 1),
          completedTasks: current.workspace.completedTasks + 1,
        },
      }));
      toast.success("Tugas ditandai selesai");
    } catch {
      toast.error("Tugas belum selesai. Coba lagi.");
    }
  };

  const snoozeDashboardAction = async (action: DashboardAction) => {
    if (action.kind !== "reminder") return;
    const dueDate = addDays(action.dueDate || today, 1);
    try {
      await api.patch(`/api/reminders/${action.recordId}`, { dueDate });
      setActions((current) => current.map((item) => item.id === action.id ? { ...item, dueDate } : item));
      setReminders((current) => current.map((item) => item.id === action.recordId ? { ...item, dueDate } : item));
      toast.success("Pengingat ditunda satu hari");
    } catch {
      toast.error("Pengingat belum dapat ditunda");
    }
  };

  const today = getToday();

  const upcomingInterviews = interviews
    .filter((i) => i.scheduledDate >= today && i.result === "Menunggu")
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    .slice(0, 4);

  const dueToday = reminders.filter((r) => r.dueDate === today);

  const recentApplications = [...jobs]
    .sort((a, b) => (b.appliedAt > a.appliedAt ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="flex-1 pb-24">
      {/* Page header */}
      <div className="w-full min-w-0 px-5 sm:px-8 xl:px-12 pt-8 xl:pt-12 pb-2">
        <div className="flex items-center gap-3">
          <Briefcase className="h-8 w-8 shrink-0 text-blue-400 sm:h-9 sm:w-9" />
          <h1 className="text-3xl font-bold page-title text-primary sm:text-4xl">Dashboard</h1>
        </div>
        <p className="text-xs text-faint mt-2 capitalize">
          {new Intl.DateTimeFormat("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Jakarta",
          }).format(new Date())}
        </p>
        <p className="text-sm text-secondary mt-4 font-serif max-w-2xl leading-relaxed">
          Selamat datang kembali, {userName}. Ini workspace pribadimu untuk mengelola seluruh
          proses pencarian kerja — dari menyimpan peluang, melamar, wawancara, hingga
          keputusan akhir.
        </p>
      </div>

      <div className="w-full min-w-0 px-5 sm:px-8 xl:px-12 space-y-10 mt-8">
          <section aria-labelledby="workspace-overview-title" className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id="workspace-overview-title" className="text-sm font-semibold text-primary">Ringkasan workspace</h2>
                <p className="mt-1 text-xs text-faint">Semua angka dihitung dari data tersimpan, bukan hanya daftar yang sedang terlihat.</p>
              </div>
              <Link href="/analytics" className="inline-flex items-center gap-1 text-xs text-secondary transition hover:text-primary">
                Lihat analitik <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard href="/applications" icon={<Briefcase className="h-4 w-4" />} label="Lamaran" value={stats.totalApplications} detail={`${stats.activeApplications} aktif · ${stats.applicationsThisMonth} bulan ini`} />
              <SummaryCard href="/opportunities" icon={<Compass className="h-4 w-4" />} label="Peluang tersimpan" value={stats.workspace.opportunities} detail="Lowongan yang sedang ditinjau" />
              <SummaryCard href="/companies" icon={<Building2 className="h-4 w-4" />} label="Perusahaan" value={stats.workspace.companies} detail="Perusahaan dalam daftar riset" />
              <SummaryCard href="/interviews" icon={<CalendarClock className="h-4 w-4" />} label="Wawancara mendatang" value={stats.workspace.upcomingInterviews} detail={`${stats.interviews.total} jadwal · ${stats.interviews.passed} lolos`} />
              <SummaryCard href="/reminders" icon={<Clock className="h-4 w-4" />} label="Pengingat aktif" value={stats.workspace.activeReminders} detail={`${stats.workspace.overdueReminders} terlambat`} tone={stats.workspace.overdueReminders > 0 ? "warning" : "default"} />
              <SummaryCard href="/tasks" icon={<CheckSquare className="h-4 w-4" />} label="Tugas terbuka" value={stats.workspace.tasks} detail={`${stats.workspace.completedTasks} selesai`} />
              <SummaryCard href="/documents" icon={<FileText className="h-4 w-4" />} label="Dokumen" value={stats.workspace.documents} detail="CV dan berkas pendukung" />
              <SummaryCard href="/templates" icon={<Mail className="h-4 w-4" />} label="Template" value={stats.workspace.templates} detail="Draf pesan yang siap dipakai" />
            </div>

            <Card className="bg-card">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-primary">Target mingguan</h3>
                    <p className="mt-1 text-xs text-faint">Atur ritme yang realistis untuk lamaran dan follow-up.</p>
                  </div>
                  <form onSubmit={saveGoals} className="flex flex-wrap items-end gap-2">
                    <label className="space-y-1 text-[10px] text-faint">
                      <span>Lamaran / pekan</span>
                      <Input type="number" min={1} max={100} value={goalApplication} onChange={(event) => setGoalApplication(event.target.value)} className="h-8 w-24 text-xs" aria-label="Target lamaran per pekan" />
                    </label>
                    <label className="space-y-1 text-[10px] text-faint">
                      <span>Follow-up / pekan</span>
                      <Input type="number" min={1} max={100} value={goalFollowUp} onChange={(event) => setGoalFollowUp(event.target.value)} className="h-8 w-24 text-xs" aria-label="Target follow-up per pekan" />
                    </label>
                    <button type="submit" disabled={savingGoals} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                      {savingGoals ? "Menyimpan…" : "Simpan target"}
                    </button>
                  </form>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <GoalProgress label="Lamaran terkirim" value={preferences.applicationsThisWeek} goal={preferences.weeklyApplicationGoal} />
                  <GoalProgress label="Follow-up selesai" value={preferences.followUpsThisWeek} goal={preferences.weeklyFollowUpGoal} />
                </div>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="pipeline-title" className="space-y-4">
            <div>
              <h2 id="pipeline-title" className="text-sm font-semibold text-primary">Pipeline lamaran</h2>
              <p className="mt-1 text-xs text-faint">Pilih status untuk membuka daftar lamaran yang cocok.</p>
            </div>
            <Card className="bg-card">
              <CardContent className="grid grid-cols-1 gap-x-8 gap-y-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
                {PIPELINE_STATUSES.map((status) => {
                  const count = stats.byStatus[status] ?? 0;
                  const width = stats.totalApplications ? Math.round((count / stats.totalApplications) * 100) : 0;
                  return (
                    <Link key={status} href={`/applications?status=${encodeURIComponent(status)}`} className="group space-y-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate text-secondary transition-colors group-hover:text-foreground">{status}</span>
                        <span className="font-medium tabular-nums text-primary">{count}</span>
                      </span>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary transition-[width] duration-300 group-hover:bg-primary/80" style={{ width: `${width}%` }} />
                      </span>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MetricCard label="Tingkat balasan" value={`${stats.responseRate}%`} detail={stats.responseDays.avg === null ? "Belum ada balasan tercatat" : `Rata-rata balasan ${stats.responseDays.avg} hari`} />
              <MetricCard label="Penawaran" value={stats.offers.count} detail={`${stats.offers.rate}% dari lamaran terkirim`} />
              <MetricCard label="Follow-up tepat waktu" value={`${stats.followUp.rate}%`} detail={`${stats.followUp.onTime} dari ${stats.followUp.completed} selesai`} />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div><SectionHeader title="Pusat aksi hari ini" noMargin /><p className="mt-2 text-xs text-faint">Tenggat, follow-up, tugas, dan wawancara yang perlu ditangani.</p></div>
              <Link href="/reminders" className="shrink-0 text-xs text-secondary transition hover:text-primary">Semua pengingat <ArrowRight className="inline h-3 w-3" /></Link>
            </div>
            {actions.length === 0 ? <EmptyRow text="Tidak ada aksi mendesak. Semua agenda dekat sudah tertangani." /> : (
              <div className="overflow-hidden rounded-xl border border-subtle bg-card">
                {actions.map((action) => <div key={`${action.kind}-${action.id}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-3.5 py-3 last:border-0 hover:bg-white/[0.025]">
                  <div className="flex min-w-0 items-center gap-3">
                    <ActionDot kind={action.kind} />
                    <div className="min-w-0">
                      <Link href={action.href} className="block truncate text-xs font-medium text-primary hover:text-blue-300 hover:underline">{action.title}</Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-faint"><span>{action.label}</span><span>·</span><span>{action.detail}</span>{action.dueDate && <><span>·</span><span>{relativeDays(action.dueDate)}</span></>}</div>
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    {(action.kind === "reminder" || action.kind === "task") && <button type="button" onClick={() => void completeDashboardAction(action)} className="rounded-md border border-subtle px-2.5 py-1.5 text-[10px] font-medium text-secondary transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300">Selesai</button>}
                    {action.kind === "reminder" && <button type="button" onClick={() => void snoozeDashboardAction(action)} className="rounded-md border border-subtle px-2.5 py-1.5 text-[10px] text-secondary transition hover:bg-white/5 hover:text-primary">Tunda 1 hari</button>}
                    <Link href={action.href} className="rounded-md px-2 py-1.5 text-[10px] text-blue-300 transition hover:bg-blue-500/10">Buka</Link>
                  </div>
                </div>)}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3"><SectionHeader title="Perlu diperiksa" /><p className="mt-2 text-xs text-faint">Duplikat, tindakan yang belum dicatat, dan lamaran yang lama tidak diperbarui.</p></div>
            {quality.length === 0 ? <EmptyRow text="Data lamaran terlihat lengkap dan tidak ada duplikat yang terdeteksi." /> : (
              <div className="overflow-hidden rounded-xl border border-subtle bg-card">
                {quality.map((item) => <div key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-3.5 py-3 last:border-0">
                  <div className="min-w-0"><div className="truncate text-xs font-medium text-primary">{item.title}</div><div className="mt-0.5 text-[10px] text-faint">{item.detail}</div></div>
                  <Link href={item.href} className="shrink-0 rounded-md border border-subtle px-2.5 py-1.5 text-[10px] text-secondary transition hover:bg-white/5 hover:text-primary">Tinjau lamaran</Link>
                </div>)}
              </div>
            )}
          </section>

          {/* Upcoming */}
          <section>
            <SectionHeader title="Agenda mendatang" />
            {upcomingInterviews.length === 0 && dueToday.length === 0 ? (
              <EmptyRow text="Belum ada agenda mendatang. Jadwalkan wawancara atau follow-up." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {upcomingInterviews.map((i) => (
                  <Link
                    key={i.id}
                    href={`/interviews?edit=${i.id}`}
                    className="border border-subtle rounded-lg px-3.5 py-3 bg-card/60"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <CalendarClock className="w-3.5 h-3.5 text-violet-500" />
                      <span className="text-[10px] font-medium text-faint uppercase tracking-wide">
                        Wawancara · {i.mode}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-primary truncate">
                      {i.position}
                    </div>
                    <div className="text-[11px] text-secondary truncate">{i.company}</div>
                    <div className="text-[10px] text-faint mt-1.5">
                      {relativeDays(i.scheduledDate)} · {i.scheduledTime.slice(0, 5)}
                    </div>
                  </Link>
                ))}
                {dueToday.map((r) => (
                  <div
                    key={r.id}
                    className="border border-subtle rounded-lg px-3.5 py-3 bg-card/60"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-[10px] font-medium text-faint uppercase tracking-wide">
                        Follow-up Hari Ini
                      </span>
                    </div>
                      <Link href={`/applications?peek=${r.jobId}&edit=1`} className="block text-xs font-medium text-primary truncate hover:underline">
                      {r.position}
                      </Link>
                    <div className="text-[11px] text-secondary truncate">{r.company}</div>
                    <button
                      type="button"
                      onClick={() => completeReminder(r.id)}
                      className="text-[10px] text-blue-600 dark:text-blue-400 mt-1.5 inline-flex items-center gap-1 hover:underline"
                    >
                      Tandai selesai <ArrowRight className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Applications board preview */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="Lamaran" noMargin />
              <Link
                href="/applications"
                className="text-[11px] text-secondary hover:text-primary flex items-center gap-1"
              >
                Lihat semua <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3 -mx-1 px-1">
              {BOARD_GROUPS.map((group) => {
                const groupJobs = jobs.filter((j) => group.statuses.includes(j.status));
                const groupCount = group.statuses.reduce((sum, status) => sum + (stats.byStatus[status] ?? 0), 0);
                const remainingCount = Math.max(0, groupCount - Math.min(4, groupJobs.length));
                return (
                  <div key={group.label} className="min-w-0">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-[11px] font-medium text-secondary">
                        {group.label}
                      </span>
                      <span className="text-[10px] text-faint">{groupCount}</span>
                    </div>
                    <div className="space-y-1.5 min-h-[40px]">
                      {groupJobs.slice(0, 4).map((j) => (
                        <Link
                          key={j.id}
                          href={`/applications?peek=${j.id}`}
                          className="block border border-subtle rounded-md px-2.5 py-2 bg-card/60 hover:border-black/20 dark:hover:border-white/20 transition"
                        >
                          <div className="text-[11px] font-medium text-primary truncate">
                            {j.position}
                          </div>
                          <div className="text-[10px] text-faint truncate">{j.company}</div>
                          <div className="mt-1.5">
                            <StatusBadge status={j.status} size="sm" />
                          </div>
                        </Link>
                      ))}
                      {groupJobs.length === 0 && (
                        <div className="border border-dashed border-subtle rounded-md h-12" />
                      )}
                      {remainingCount > 0 && <Link href={`/applications?status=${encodeURIComponent(group.statuses[0])}`} className="block px-1 text-[10px] text-blue-300 hover:underline">+{remainingCount} lainnya di daftar</Link>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Recent Applications */}
          <section>
            <SectionHeader title="Lamaran terbaru" />
            {recentApplications.length === 0 ? (
              <EmptyRow text="Belum ada lamaran. Mulai dengan menyimpan lowongan yang menarik." />
            ) : (
              <div className="border border-subtle rounded-lg overflow-hidden">
                {recentApplications.map((j) => (
                  <Link
                    key={j.id}
                    href={`/applications?peek=${j.id}`}
                    className="flex items-center justify-between px-3.5 py-2.5 border-b border-subtle last:border-b-0 hover-row"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-6 h-6 rounded bg-black/5 dark:bg-white/10 flex items-center justify-center text-[10px] font-semibold text-secondary flex-shrink-0">
                        {j.company.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-primary truncate">
                          {j.position}
                        </div>
                        <div className="text-[10px] text-faint truncate">{j.company}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-[10px] text-faint hidden sm:block">
                        {formatDateID(j.appliedAt)}
                      </span>
                      <StatusBadge status={j.status} size="sm" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Quick Notes (block-style editable) */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="Catatan cepat" noMargin />
              <span className="text-[10px] text-faint h-4">
                {notesSaved === "saving" && (
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> Menyimpan...
                  </span>
                )}
                {notesSaved === "saved" && (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Sparkles className="w-2.5 h-2.5" /> Tersimpan
                  </span>
                )}
              </span>
            </div>
            <div className="border border-subtle rounded-lg p-4">
              <Textarea
                aria-label="Catatan cepat"
                value={notes}
                onChange={(e) => { latestNotes.current = e.target.value; setNotes(e.target.value); setNotesDirty(true); }}
                maxLength={10000}
                placeholder="Catat ide, strategi pencarian kerja, atau hal yang perlu diingat..."
                className="min-h-[110px] resize-y border-0 bg-transparent px-0 py-0 text-sm text-primary placeholder:text-faint leading-relaxed focus-visible:ring-0"
              />
            </div>
          </section>

          {/* Quick Stats ribbon */}
          <section className="pt-2">
            <div className="flex flex-wrap gap-6 text-xs">
              <StatChip icon={<TrendingUp className="w-3.5 h-3.5" />} label="Total Lamaran" value={jobTotal} />
              <StatChip
                icon={<Clock className="w-3.5 h-3.5" />}
                label="Perlu Follow-up"
                value={stats.byStatus["Perlu Follow-up"] ?? 0}
              />
              <StatChip
                icon={<CalendarClock className="w-3.5 h-3.5" />}
                label="Wawancara Mendatang"
                value={stats.workspace.upcomingInterviews}
              />
              <StatChip
                icon={<AlertCircle className="w-3.5 h-3.5" />}
                label="Follow-up Terlambat"
                value={stats.workspace.overdueReminders}
              />
            </div>
          </section>
      </div>
    </div>
  );
}

function SectionHeader({ title, noMargin }: { title: string; noMargin?: boolean }) {
  return (
    <div className={noMargin ? "" : "mb-3"}>
      <h2 className="text-[13px] font-semibold text-primary tracking-tight">{title}</h2>
      <div className="h-px bg-black/[0.06] dark:bg-white/[0.08] mt-1.5" />
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-subtle rounded-lg px-4 py-6 text-center text-xs text-faint">
      {text}
    </div>
  );
}

function GoalProgress({ label, value, goal }: { label: string; value: number; goal: number }) {
  const percent = Math.min(100, Math.round((value / Math.max(1, goal)) * 100));
  return <div>
    <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
      <span className="text-secondary">{label}</span>
      <span className="tabular-nums text-primary">{value} / {goal}</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(value, goal)}>
      <div className="h-full rounded-full bg-blue-400 transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
    <p className="mt-1 text-[10px] text-faint">{Math.max(0, goal - value)} lagi untuk mencapai target pekan ini.</p>
  </div>;
}

function ActionDot({ kind }: { kind: DashboardAction["kind"] }) {
  const colors: Record<DashboardAction["kind"], string> = {
    reminder: "bg-amber-400",
    task: "bg-blue-400",
    interview: "bg-violet-400",
    stale: "bg-rose-400",
  };
  return <span className={`h-2 w-2 shrink-0 rounded-full ${colors[kind]}`} aria-hidden="true" />;
}

function AttentionDot({ tone }: { tone: "danger" | "info" | "warning" | "neutral" }) {
  const colors = {
    danger: "bg-rose-500",
    info: "bg-violet-500",
    warning: "bg-amber-500",
    neutral: "bg-neutral-400",
  };
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors[tone]}`} />;
}

function StatChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-faint">{icon}</span>
      <span className="text-secondary">{label}</span>
      <span className="font-semibold text-primary">{value}</span>
    </div>
  );
}

function SummaryCard({
  href,
  icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
  tone?: "default" | "warning";
}) {
  return (
    <Link href={href} className="group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="h-full bg-card transition-colors duration-150 group-hover:border-primary/50 group-hover:bg-accent/40">
        <CardContent className="flex items-start gap-3 p-4">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-secondary transition-colors group-hover:text-primary ${tone === "warning" ? "text-amber-400" : ""}`}>
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-secondary">{label}</span>
            <span className="mt-1 block text-2xl font-semibold leading-none tracking-tight text-primary tabular-nums">{value}</span>
            <span className={`mt-2 block truncate text-[11px] ${tone === "warning" ? "text-amber-300" : "text-faint"}`}>{detail}</span>
          </span>
          <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-faint opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
        </CardContent>
      </Card>
    </Link>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <Card className="bg-card">
      <CardContent className="p-4">
        <p className="text-xs text-faint">{label}</p>
        <p className="mt-1 text-xl font-semibold tracking-tight text-primary tabular-nums">{value}</p>
        <p className="mt-1 text-[11px] text-secondary">{detail}</p>
      </CardContent>
    </Card>
  );
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
