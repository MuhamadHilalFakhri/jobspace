"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckSquare, Plus, RefreshCw, Square, Trash2, Pencil } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { TASK_STATUSES, TASK_TYPES, PRIORITIES } from "@/lib/domain/schema";
import { createTaskSchema, patchTaskSchema, formErrorsFromZod } from "@/lib/domain/validation";
import { formatDateID, relativeDays } from "@/lib/ui";
import { FormSelect } from "./FormSelect";
import { useConfirmAction } from "./ConfirmProvider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { today as getToday } from "@/lib/domain/dates";

type TaskStatus = (typeof TASK_STATUSES)[number];
type TaskStatusFilter = "all" | TaskStatus;
type DateFilter = "all" | "today" | "upcoming" | "overdue" | "undated";

type Task = {
  id: string;
  title: string;
  task_type: string | null;
  status: string;
  priority: string;
  job_position: string | null;
  company_name: string | null;
  due_date: string | null;
  completed_at: string | null;
  job_id: string | null;
  notes: string | null;
};

const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; dot: string; badge: string; selectedFilter: string }
> = {
  Todo: {
    label: "To do",
    dot: "bg-amber-400",
    badge: "border-amber-400/20 bg-amber-500/15 text-amber-300 dark:bg-amber-500/15 dark:hover:bg-amber-500/20",
    selectedFilter: "border-amber-400/20 bg-amber-500/10 text-amber-200",
  },
  "In Progress": {
    label: "In Progress",
    dot: "bg-sky-400",
    badge: "border-sky-400/20 bg-sky-500/15 text-sky-300 dark:bg-sky-500/15 dark:hover:bg-sky-500/20",
    selectedFilter: "border-sky-400/20 bg-sky-500/10 text-sky-200",
  },
  Done: {
    label: "Completed",
    dot: "bg-emerald-400",
    badge: "border-emerald-400/20 bg-emerald-500/15 text-emerald-300 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/20",
    selectedFilter: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
  },
  Cancelled: {
    label: "Cancelled",
    dot: "bg-slate-400",
    badge: "border-slate-400/20 bg-slate-500/15 text-slate-300 dark:bg-slate-500/15 dark:hover:bg-slate-500/20",
    selectedFilter: "border-slate-400/20 bg-slate-500/10 text-slate-200",
  },
};

const TASK_FILTERS: { key: TaskStatusFilter; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "Todo", label: "To do" },
  { key: "In Progress", label: "In Progress" },
  { key: "Done", label: "Completed" },
  { key: "Cancelled", label: "Cancelled" },
];

const DATE_FILTER_OPTIONS = [
  { value: "all", label: "Semua tenggat" },
  { value: "today", label: "Hari ini" },
  { value: "upcoming", label: "Mendatang" },
  { value: "overdue", label: "Terlambat" },
  { value: "undated", label: "Tanpa tanggal" },
] as const;

const PRIORITY_STYLES: Record<string, string> = {
  Rendah: "border-slate-400/20 bg-slate-500/10 text-slate-300",
  Sedang: "border-amber-400/20 bg-amber-500/10 text-amber-300",
  Tinggi: "border-rose-400/20 bg-rose-500/10 text-rose-300",
};

function taskStatus(task: Pick<Task, "status" | "completed_at">): TaskStatus {
  if (task.completed_at) return "Done";
  return TASK_STATUSES.includes(task.status as TaskStatus)
    ? (task.status as TaskStatus)
    : "Todo";
}

function TaskStatusSelect({
  status,
  disabled,
  onChange,
  label,
}: {
  status: TaskStatus;
  disabled: boolean;
  onChange: (status: TaskStatus) => void;
  label: string;
}) {
  const meta = TASK_STATUS_META[status];

  return (
    <Select value={status} onValueChange={(value) => onChange(value as TaskStatus)} disabled={disabled}>
      <SelectTrigger
        aria-label={`Status ${label}`}
        className={`h-7 w-[132px] rounded-md border px-2 py-0 text-[11px] font-medium ${meta.badge}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {TASK_STATUSES.map((value) => (
          <SelectItem key={value} value={value}>
            <span className={`size-1.5 shrink-0 rounded-full ${TASK_STATUS_META[value].dot}`} aria-hidden="true" />
            <span>{TASK_STATUS_META[value].label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TasksClient({ initialItems }: { initialItems: Task[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const confirmAction = useConfirmAction();
  const [items, setItems] = useState<Task[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState("Application");
  const [priority, setPriority] = useState("Sedang");
  const [dueDate, setDueDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [updatingTask, setUpdatingTask] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState({ title: "", taskType: "Application", priority: "Sedang", dueDate: "", notes: "" });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ items: Task[] }>("/api/tasks");
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat tugas");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { title: title.trim(), taskType, priority, dueDate: dueDate || null };
    const validation = createTaskSchema.safeParse(payload);
    const errors = validation.success ? {} : formErrorsFromZod(validation.error);
    setFieldErrors(errors);
    if (!validation.success) {
      toast.error(Object.values(errors)[0] || "Periksa data tugas");
      return;
    }
    setAdding(true);
    try {
      const created = await api.post<{ id: string }>("/api/tasks", payload);
      const newTask: Task = {
        id: created.id,
        title: payload.title,
        task_type: payload.taskType,
        status: "Todo",
        priority: payload.priority,
        job_position: null,
        company_name: null,
        due_date: payload.dueDate,
        completed_at: null,
        job_id: null,
        notes: null,
      };
      setItems((current) => [...current, newTask].sort((left, right) =>
        (left.due_date || "9999-12-31").localeCompare(right.due_date || "9999-12-31"),
      ));
      setTitle("");
      setDueDate("");
      toast.success("Tugas ditambahkan");
    } catch {
      toast.error("Gagal menambahkan tugas");
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      taskType: task.task_type ?? "Other",
      priority: task.priority,
      dueDate: task.due_date ?? "",
      notes: task.notes ?? "",
    });
    setEditErrors({});
  };

  useEffect(() => {
    if (!editId) return;
    const task = items.find((item) => item.id === editId);
    if (!task) return;
    openEdit(task);
    router.replace("/tasks", { scroll: false });
  }, [editId, items, router]);

  const handleSaveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingTask) return;
    const payload = {
      title: editForm.title.trim(),
      taskType: editForm.taskType,
      priority: editForm.priority,
      dueDate: editForm.dueDate || null,
      notes: editForm.notes.trim() || null,
    };
    const validation = patchTaskSchema.safeParse(payload);
    const errors = validation.success ? {} : formErrorsFromZod(validation.error);
    setEditErrors(errors);
    if (!validation.success) {
      toast.error(Object.values(errors)[0] || "Periksa data tugas");
      return;
    }
    setSavingEdit(true);
    try {
      await api.patch(`/api/tasks/${editingTask.id}`, validation.data);
      setItems((current) => current.map((task) => task.id === editingTask.id
        ? {
            ...task,
            title: payload.title,
            task_type: payload.taskType,
            priority: payload.priority,
            due_date: payload.dueDate,
            notes: payload.notes,
          }
        : task));
      setEditingTask(null);
      toast.success("Tugas diperbarui");
    } catch {
      toast.error("Gagal memperbarui tugas");
    } finally {
      setSavingEdit(false);
    }
  };

  const updateStatus = async (task: Task, nextStatus: TaskStatus) => {
    if (updatingTask) return;
    const validation = patchTaskSchema.safeParse({ status: nextStatus });
    if (!validation.success) {
      toast.error("Status tugas tidak valid");
      return;
    }

    const previousStatus = task.status;
    const previousCompletedAt = task.completed_at;
    const nextCompletedAt = nextStatus === "Done"
      ? task.completed_at || new Date().toISOString()
      : null;
    setUpdatingTask(task.id);
    setItems((current) => current.map((item) => item.id === task.id
      ? { ...item, status: nextStatus, completed_at: nextCompletedAt }
      : item));

    try {
      await api.patch(`/api/tasks/${task.id}`, validation.data);
      toast.success(nextStatus === "Done"
        ? "Tugas ditandai selesai"
        : nextStatus === "Todo"
          ? "Tugas dikembalikan ke To do"
          : "Status tugas diperbarui");
    } catch {
      setItems((current) => current.map((item) => item.id === task.id
        ? { ...item, status: previousStatus, completed_at: previousCompletedAt }
        : item));
      toast.error("Gagal memperbarui status tugas");
    } finally {
      setUpdatingTask(null);
    }
  };

  const toggleComplete = (task: Task) => {
    const nextStatus = taskStatus(task) === "Done" ? "Todo" : "Done";
    void updateStatus(task, nextStatus);
  };

  const handleDelete = async (id: string) => {
    if (updatingTask === id) return;
    const confirmed = await confirmAction({
      title: "Hapus tugas?",
      description: "Tugas ini akan dipindahkan ke arsip.",
      confirmLabel: "Hapus tugas",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await api.del(`/api/tasks/${id}`);
      setItems((current) => current.filter((task) => task.id !== id));
      toast.success("Tugas dihapus");
    } catch {
      toast.error("Gagal menghapus tugas");
    }
  };

  const today = getToday();
  const counts = items.reduce<Record<TaskStatus, number>>((result, task) => {
    result[taskStatus(task)] += 1;
    return result;
  }, { Todo: 0, "In Progress": 0, Done: 0, Cancelled: 0 });

  const filtered = items.filter((task) => {
    const status = taskStatus(task);
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (query.trim()) {
      const search = query.trim().toLocaleLowerCase("id-ID");
      const searchable = [task.title, task.task_type, task.job_position, task.company_name, task.notes]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("id-ID");
      if (!searchable.includes(search)) return false;
    }
    if (dateFilter === "today") return task.due_date === today;
    if (dateFilter === "upcoming") return Boolean(task.due_date && task.due_date > today);
    if (dateFilter === "overdue") return Boolean(task.due_date && task.due_date < today && status !== "Done" && status !== "Cancelled");
    if (dateFilter === "undated") return !task.due_date;
    return true;
  });

  return (
    <div className="flex flex-1 flex-col min-w-0">
      <header className="border-b border-subtle px-5 pb-4 pt-8 sm:px-8 xl:px-10 xl:pt-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <CheckSquare className="h-6 w-6 text-secondary" />
              <h1 className="page-title text-2xl font-bold text-primary">Tasks</h1>
            </div>
            <p className="mt-1 text-xs text-faint">
              Kelola tugas pencarian kerja, tenggat, dan progres dalam satu tabel.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={load}
            disabled={loading}
            aria-label="Muat ulang tugas"
            title="Muat ulang"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div
          className="mt-4 flex items-center gap-1 overflow-x-auto pb-1"
          role="group"
          aria-label="Filter status tugas"
          style={{ scrollbarWidth: "none" }}
        >
          {TASK_FILTERS.map((filter) => {
            const active = statusFilter === filter.key;
            const meta = filter.key === "all" ? null : TASK_STATUS_META[filter.key];
            const count = filter.key === "all" ? items.length : counts[filter.key];
            return (
              <Button
                key={filter.key}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={active}
                onClick={() => setStatusFilter(filter.key)}
                className={`h-7 shrink-0 gap-1.5 rounded-full border px-2.5 text-xs ${
                  active
                    ? meta?.selectedFilter ?? "border-subtle bg-white/[0.08] text-primary"
                    : "border-transparent text-secondary hover:bg-white/[0.05] hover:text-primary"
                }`}
              >
                {meta && <span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />}
                {filter.label}
                <span className={`rounded px-1 text-[10px] tabular-nums ${active ? "bg-black/10 text-current" : "text-faint"}`}>
                  {count}
                </span>
              </Button>
            );
          })}
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-8 xl:p-10 xl:pt-6">
        <form noValidate onSubmit={handleAdd} className="mb-5 flex flex-wrap items-start gap-2">
          <div className="min-w-48 flex-1 basis-full sm:basis-56">
            <Input
              maxLength={300}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Tugas baru..."
              aria-label="Nama tugas baru"
              aria-invalid={Boolean(fieldErrors.title)}
              className="h-9 w-full"
              required
            />
            {fieldErrors.title && <p className="mt-1 text-xs text-destructive">{fieldErrors.title}</p>}
          </div>
          <FormSelect
            value={taskType}
            ariaLabel="Jenis tugas baru"
            onValueChange={setTaskType}
            options={TASK_TYPES.map((value) => ({ value, label: value }))}
            className="h-9 w-full sm:w-40"
          />
          <FormSelect
            value={priority}
            ariaLabel="Prioritas tugas baru"
            onValueChange={setPriority}
            options={PRIORITIES.map((value) => ({ value, label: value }))}
            className="h-9 w-full sm:w-32"
          />
          <div>
            <Input
              aria-label="Tenggat tugas baru"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              aria-invalid={Boolean(fieldErrors.dueDate)}
              className="h-9 w-full sm:w-40"
            />
            {fieldErrors.dueDate && <p className="mt-1 text-xs text-destructive" role="alert">{fieldErrors.dueDate}</p>}
          </div>
          <Button type="submit" disabled={adding} size="icon" aria-label="Tambah tugas" className="h-9 w-9">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </form>

        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <FormSelect
            value={dateFilter}
            ariaLabel="Filter tenggat tugas"
            onValueChange={(value) => setDateFilter(value as DateFilter)}
            options={DATE_FILTER_OPTIONS.map((option) => ({ ...option }))}
            className="h-8 w-full sm:w-44"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={120}
            aria-label="Cari tugas"
            placeholder="Cari tugas atau jenis..."
            className="h-8 w-full sm:max-w-xs"
          />
        </div>

        {loading ? (
          <div className="overflow-hidden rounded-xl border border-subtle">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-12 border-b border-subtle skeleton last:border-0" />)}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-subtle px-4 py-14 text-center">
            <p className="mb-3 text-sm text-rose-300">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5" /> Coba lagi
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-subtle px-4 py-14 text-center">
            <CheckSquare className="mx-auto mb-3 h-8 w-8 text-faint" />
            <p className="text-sm font-medium text-primary">
              {items.length === 0 ? "Belum ada tugas" : "Tidak ada tugas yang cocok"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-faint">
              {items.length === 0
                ? "Tambahkan tugas pencarian kerja dari formulir di atas."
                : "Ubah filter status, tenggat, atau kata kunci untuk melihat tugas lainnya."}
            </p>
            {items.length > 0 && (statusFilter !== "all" || dateFilter !== "all" || query) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => { setStatusFilter("all"); setDateFilter("all"); setQuery(""); }}
              >
                Hapus filter
              </Button>
            )}
          </div>
        ) : (
          <div
            className="overflow-x-auto rounded-xl border border-subtle bg-card"
            role="region"
            aria-label="Tabel tugas; geser horizontal untuk melihat semua kolom"
            tabIndex={0}
          >
            <table className="w-full min-w-[1020px] border-collapse text-xs">
              <caption className="sr-only">Daftar tugas pencarian kerja</caption>
              <thead className="sticky top-0 z-10 border-b border-subtle bg-card">
                <tr className="text-left text-faint">
                  <th scope="col" className="px-3.5 py-2.5 font-medium">Tugas</th>
                  <th scope="col" className="px-3.5 py-2.5 font-medium">Tenggat</th>
                  <th scope="col" className="px-3.5 py-2.5 font-medium">Lamaran / perusahaan</th>
                  <th scope="col" className="px-3.5 py-2.5 font-medium">Jenis</th>
                  <th scope="col" className="px-3.5 py-2.5 font-medium">Prioritas</th>
                  <th scope="col" className="px-3.5 py-2.5 font-medium">Status</th>
                  <th scope="col" className="w-12 px-3.5 py-2.5 font-medium"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => {
                  const status = taskStatus(task);
                  const overdue = task.due_date && task.due_date < today && status !== "Done" && status !== "Cancelled";
                  return (
                    <tr key={task.id} className="interactive-table-row group border-b border-subtle last:border-0">
                      <td className="max-w-[360px] px-3.5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => toggleComplete(task)}
                            disabled={Boolean(updatingTask)}
                            className="shrink-0 rounded text-faint transition-colors hover:text-emerald-300 disabled:opacity-50"
                            aria-label={status === "Done" ? "Kembalikan tugas ke To do" : "Tandai tugas selesai"}
                            title={status === "Done" ? "Kembalikan ke To do" : "Tandai selesai"}
                          >
                            {status === "Done"
                              ? <CheckSquare className="h-4 w-4 text-emerald-400" />
                              : <Square className="h-4 w-4" />}
                          </button>
                          <div className="min-w-0">
                            <div className={`truncate font-medium ${status === "Done" ? "text-faint line-through" : "text-primary"}`} title={task.title}>
                              {task.title}
                            </div>
                            {task.notes && <div className="mt-0.5 truncate text-[10px] text-faint" title={task.notes}>{task.notes}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 tabular-nums">
                        {task.due_date ? (
                          <div>
                            <div className={overdue ? "font-medium text-rose-300" : "text-secondary"}>{formatDateID(task.due_date)}</div>
                            <div className={`mt-0.5 text-[10px] ${overdue ? "text-rose-300/80" : "text-faint"}`}>{relativeDays(task.due_date)}</div>
                          </div>
                        ) : <span className="text-faint">Tanpa tanggal</span>}
                      </td>
                      <td className="max-w-[220px] px-3.5 py-2.5">
                        {task.job_position || task.company_name ? (
                          <div className="min-w-0">
                            <div className="truncate text-secondary" title={task.job_position || task.company_name || undefined}>
                              {task.job_position || task.company_name}
                            </div>
                            {task.job_position && task.company_name && (
                              <div className="mt-0.5 truncate text-[10px] text-faint" title={task.company_name}>
                                {task.company_name}
                              </div>
                            )}
                          </div>
                        ) : <span className="text-faint">Umum</span>}
                      </td>
                      <td className="px-3.5 py-2.5">
                        {task.task_type
                          ? <span className="inline-flex max-w-40 truncate rounded-md border border-subtle bg-white/[0.035] px-2 py-1 text-[10px] text-secondary">{task.task_type}</span>
                          : <span className="text-faint">—</span>}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-medium ${PRIORITY_STYLES[task.priority] ?? "border-subtle bg-white/[0.035] text-secondary"}`}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <TaskStatusSelect
                          status={status}
                          disabled={Boolean(updatingTask)}
                          label={task.title}
                          onChange={(nextStatus) => { void updateStatus(task, nextStatus); }}
                        />
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => openEdit(task)}
                          aria-label={`Edit tugas ${task.title}`}
                          className="mr-1 text-faint opacity-100 transition-colors hover:bg-blue-500/10 hover:text-blue-300 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleDelete(task.id)}
                          aria-label={`Hapus tugas ${task.title}`}
                          className="text-faint opacity-100 transition-colors hover:bg-rose-500/10 hover:text-rose-300 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <Dialog open={Boolean(editingTask)} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit tugas</DialogTitle>
            <DialogDescription>Perbarui judul, tenggat, prioritas, atau catatan tugas.</DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-task-title">Nama tugas *</Label>
              <Input id="edit-task-title" maxLength={300} required value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} aria-invalid={Boolean(editErrors.title)} />
              {editErrors.title && <p className="text-xs text-destructive">{editErrors.title}</p>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-task-type">Jenis tugas</Label>
                <FormSelect id="edit-task-type" ariaLabel="Jenis tugas" value={editForm.taskType} onValueChange={(taskType) => setEditForm({ ...editForm, taskType })} options={TASK_TYPES.map((value) => ({ value, label: value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-task-priority">Prioritas</Label>
                <FormSelect id="edit-task-priority" ariaLabel="Prioritas tugas" value={editForm.priority} onValueChange={(priority) => setEditForm({ ...editForm, priority })} options={PRIORITIES.map((value) => ({ value, label: value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-task-due-date">Tenggat</Label>
              <Input id="edit-task-due-date" type="date" value={editForm.dueDate} onChange={(event) => setEditForm({ ...editForm, dueDate: event.target.value })} aria-invalid={Boolean(editErrors.dueDate)} />
              {editErrors.dueDate && <p className="text-xs text-destructive">{editErrors.dueDate}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-task-notes">Catatan</Label>
              <Textarea id="edit-task-notes" maxLength={5000} value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} aria-invalid={Boolean(editErrors.notes)} />
              {editErrors.notes && <p className="text-xs text-destructive">{editErrors.notes}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => setEditingTask(null)}>Batal</Button>
              <Button type="submit" disabled={savingEdit}>{savingEdit ? "Menyimpan..." : "Simpan perubahan"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
