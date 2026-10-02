"use client";

import { toast } from "sonner";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  LayoutGrid,
  Table2,
  Download,
  Upload,
  RefreshCw,
  Briefcase,
  Inbox,
  Pencil,
} from "@/components/icons";
import { StatusBadge } from "./StatusBadge";
import { PipelineStatusSelect } from "./PipelineStatusSelect";
import { api, ApiError } from "@/lib/api-client";
import { PIPELINE_STATUSES, type PipelineStatus } from "@/lib/domain/schema";
import { jobStatusSchema } from "@/lib/domain/validation";
import { formatDateID, STATUS_DOTS, STATUS_STYLES } from "@/lib/ui";
import { JobPeek } from "./JobPeek";
import { NewJobModal } from "./NewJobModal";
import { formatSalaryDisplay } from "@/lib/domain/rupiah";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Job = {
  id: string;
  company: string;
  position: string;
  status: PipelineStatus;
  appliedAt: string;
  deadline: string | null;
  source: string | null;
  location: string | null;
  workType: string | null;
  priority: string | null;
  salaryRange: string | null;
  nextAction: string | null;
  lastResponseAt: string | null;
  updatedAt: string;
};

const PAGE_SIZE = 20;
const APPLICATION_STATUS_FILTERS: { value: "" | PipelineStatus; label: string }[] = [
  { value: "", label: "Semua" },
  ...PIPELINE_STATUSES.map((status) => ({ value: status, label: status })),
];

export function ApplicationsClient({
  initialData,
}: {
  initialData: { items: Job[]; total: number };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const peekId = searchParams.get("peek");

  const [view, setView] = useState<"table" | "board">("table");
  const [query, setQuery] = useState("");
  const initialStatus = searchParams.get("status");
  const [statusFilter, setStatusFilter] = useState<"" | PipelineStatus>(
    PIPELINE_STATUSES.includes(initialStatus as PipelineStatus) ? initialStatus as PipelineStatus : "",
  );
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Job[]>(initialData.items);
  const [total, setTotal] = useState(initialData.total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [updatingJob, setUpdatingJob] = useState<string | null>(null);
  const shouldLoadAfterFilterChange = useRef(Boolean(initialStatus));

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sort: "updatedAt",
        order: "desc",
      });
      if (query.trim()) params.set("query", query.trim());
      if (statusFilter) params.set("status", statusFilter);
      const res = await api.get<{ items: Job[]; pagination: { total: number } }>(
        `/api/jobs?${params.toString()}`,
      );
      setData(res.items);
      setTotal(res.pagination.total);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, query, statusFilter]);

  useEffect(() => {
    if (!shouldLoadAfterFilterChange.current) return;
    const handle = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, query]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const changeStatus = async (jobId: string, newStatus: PipelineStatus) => {
    if (updatingJob) return;
    // Optimistic update
    const prev = data;
    const prevTotal = total;
    const shouldLeaveFilteredList = Boolean(statusFilter && statusFilter !== newStatus);
    setUpdatingJob(jobId);
    if (shouldLeaveFilteredList) {
      setData((current) => current.filter((job) => job.id !== jobId));
      setTotal((current) => Math.max(0, current - 1));
    } else {
      setData((current) => current
        .map((job) => job.id === jobId ? { ...job, status: newStatus, updatedAt: new Date().toISOString() } : job)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    }
    try {
      const validatedStatus = jobStatusSchema.safeParse(newStatus);
      if (!validatedStatus.success) throw new Error("Status lamaran tidak valid.");
      await api.patch(`/api/jobs/${jobId}`, { status: validatedStatus.data });
      toast.success("Status lamaran diperbarui");
    } catch (err) {
      setData(prev);
      setTotal(prevTotal);
      const msg =
        err instanceof ApiError ? err.message : "Gagal mengubah status";
      toast.error(msg); // transition matrix errors surface here with allowed statuses
    } finally {
      setUpdatingJob(null);
    }
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Page header */}
      <div className="px-5 sm:px-8 xl:px-10 pt-8 xl:pt-10 pb-4 border-b border-subtle">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Briefcase className="w-6 h-6 text-secondary" />
              <h1 className="text-2xl font-bold page-title text-primary">Applications</h1>
            </div>
            <p className="text-xs text-faint mt-1">
              Database lamaranmu — klik baris untuk membuka detail, ubah status inline.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => window.open("/api/export?format=csv", "_blank")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-subtle text-secondary hover:bg-white/5"
              title="Ekspor CSV"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={() => (window.location.href = "/import")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-subtle text-secondary hover:bg-white/5"
            >
              <Upload className="w-3.5 h-3.5" /> Impor
            </button>
            <button
              onClick={() => setNewOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700"
            >
              <Plus className="w-3.5 h-3.5" /> New
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-faint absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => {
                shouldLoadAfterFilterChange.current = true;
                setQuery(e.target.value);
                setPage(1);
              }}
              aria-label="Cari lamaran"
              maxLength={200}
              placeholder="Cari perusahaan, posisi, catatan..."
              className="h-9 w-full bg-card pl-8 pr-3 text-sm"
            />
          </div>

          <div className="flex items-center rounded-md border border-subtle overflow-hidden ml-auto">
            <button
              onClick={() => setView("table")}
              className={`px-2.5 py-1.5 text-xs flex items-center gap-1.5 ${
                view === "table"
                  ? "bg-black/5 dark:bg-white/10 text-primary font-medium"
                  : "text-secondary hover:bg-white/5"
              }`}
              title="Tampilan tabel"
              aria-pressed={view === "table"}
            >
              <Table2 className="w-3.5 h-3.5" /> Table
            </button>
            <button
              onClick={() => setView("board")}
              className={`px-2.5 py-1.5 text-xs flex items-center gap-1.5 ${
                view === "board"
                  ? "bg-black/5 dark:bg-white/10 text-primary font-medium"
                  : "text-secondary hover:bg-white/5"
              }`}
              title="Tampilan papan"
              aria-pressed={view === "board"}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Board
            </button>
          </div>
        </div>

        <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-0.5" style={{ scrollbarWidth: "none" }}>
          <div className="flex w-max min-w-full items-center gap-1" role="group" aria-label="Filter status lamaran">
            {APPLICATION_STATUS_FILTERS.map((filter) => {
              const active = statusFilter === filter.value;
              const dot = filter.value ? STATUS_DOTS[filter.value] : null;
              const activeColor = filter.value ? STATUS_STYLES[filter.value] : "border-subtle bg-white/[0.08] text-primary";
              return (
                <Button
                  key={filter.value || "all"}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={active}
                  onClick={() => {
                    shouldLoadAfterFilterChange.current = true;
                    setStatusFilter(filter.value);
                    setPage(1);
                  }}
                  className={`h-7 shrink-0 gap-1.5 rounded-full border px-2.5 text-xs ${
                    active
                      ? `${activeColor} ${filter.value ? "border-current/20" : ""}`
                      : "border-transparent text-secondary hover:bg-white/[0.05] hover:text-primary"
                  }`}
                >
                  {dot && <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />}
                  {filter.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-10 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 skeleton rounded" />
            ))}
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
              <button
                onClick={() => load()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-subtle hover:bg-white/5"
              >
                <RefreshCw className="w-3 h-3" /> Coba lagi
              </button>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-10">
            <div className="text-center max-w-sm">
              <Inbox className="w-10 h-10 text-faint mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-primary mb-1">
                Belum ada lamaran
              </h3>
              <p className="text-xs text-secondary mb-4">
                {query || statusFilter
                  ? "Tidak ada hasil untuk filter ini. Coba ubah kata kunci atau status."
                  : "Mulai dengan menyimpan lowongan yang menarik perhatianmu."}
              </p>
              {!query && !statusFilter && (
                <button
                  onClick={() => setNewOpen(true)}
                  className="px-3.5 py-1.5 text-xs rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700"
                >
                  + Lamaran Pertama
                </button>
              )}
            </div>
          </div>
        ) : view === "table" ? (
          <div className="flex-1 min-h-0 overflow-auto scroll-thin px-5 pb-4 sm:px-8 xl:px-10">
            <div
              className="min-w-[960px] rounded-xl border border-subtle bg-card"
              role="region"
              aria-label="Tabel lamaran; geser horizontal untuk melihat semua kolom"
              tabIndex={0}
            >
              <table className="w-full text-xs border-collapse">
                <caption className="sr-only">Daftar lamaran kerja</caption>
                <thead className="sticky top-0 z-10 bg-card border-b border-subtle">
                  <tr className="text-left text-faint">
                    <th scope="col" className="px-4 py-2.5 font-medium">Posisi</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Perusahaan</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Tipe kerja</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Lokasi</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2.5 font-medium hidden md:table-cell">Dilamar</th>
                    <th scope="col" className="px-4 py-2.5 font-medium hidden lg:table-cell">Tenggat</th>
                    <th scope="col" className="px-4 py-2.5 font-medium hidden lg:table-cell">Sumber</th>
                    <th scope="col" className="px-4 py-2.5 font-medium hidden xl:table-cell">Gaji</th>
                    <th scope="col" className="w-10 px-3 py-2.5 font-medium"><span className="sr-only">Aksi</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((job) => (
                    <tr
                      key={job.id}
                      tabIndex={0}
                      aria-label={`Buka detail lamaran ${job.position} di ${job.company}`}
                      className="interactive-table-row group cursor-pointer border-b border-subtle"
                      onClick={() => router.push(`/applications?peek=${job.id}`)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/applications?peek=${job.id}`);
                        }
                      }}
                    >
                      <td className="px-4 py-2.5 font-medium text-primary">
                        {job.position}
                      </td>
                      <td className="px-4 py-2.5 text-secondary">{job.company}</td>
                      <td className="px-4 py-2.5 text-secondary">{job.workType || "—"}</td>
                      <td className="px-4 py-2.5 text-secondary">{job.location || "—"}</td>
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <PipelineStatusSelect
                          status={job.status}
                          disabled={updatingJob === job.id}
                          label={`${job.position} di ${job.company}`}
                          onChange={(status) => changeStatus(job.id, status)}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-secondary hidden md:table-cell">
                        {formatDateID(job.appliedAt)}
                      </td>
                      <td className="px-4 py-2.5 text-secondary hidden lg:table-cell">
                        {job.deadline ? formatDateID(job.deadline) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-secondary hidden lg:table-cell">
                        {job.source || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-secondary hidden xl:table-cell">
                        {formatSalaryDisplay(job.salaryRange)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/applications?peek=${job.id}&edit=1`);
                          }}
                          aria-label={`Edit lamaran ${job.position} di ${job.company}`}
                          title="Edit lamaran"
                          className="rounded p-1.5 text-faint transition-colors hover:bg-blue-500/10 hover:text-blue-300 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <BoardView jobs={data} onStatusChange={changeStatus} />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-5 sm:px-8 xl:px-10 py-3 border-t border-subtle flex items-center justify-between text-xs text-faint">
          <span>
            {total} lamaran · Halaman {page} dari {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={page <= 1}
              onClick={() => {
                shouldLoadAfterFilterChange.current = true;
                setPage((p) => p - 1);
              }}
              className="px-2 py-1 rounded border border-subtle disabled:opacity-40 hover:bg-white/5"
            >
              ←
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => {
                shouldLoadAfterFilterChange.current = true;
                setPage((p) => p + 1);
              }}
              className="px-2 py-1 rounded border border-subtle disabled:opacity-40 hover:bg-white/5"
            >
              →
            </button>
          </div>
        </div>
      )}

      <JobPeek
        jobId={peekId}
        onClose={() => router.push("/applications")}
        onChanged={() => load(true)}
      />

      <NewJobModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => load(true)} />
    </div>
  );
}

/* --------------------------------- board --------------------------------- */

const BOARD_COLS: { label: string; statuses: PipelineStatus[] }[] = [
  { label: "Draft", statuses: ["Draft"] },
  { label: "Dilamar", statuses: ["Dilamar"] },
  { label: "Perlu Follow-up", statuses: ["Perlu Follow-up"] },
  { label: "Wawancara", statuses: ["Wawancara"] },
  { label: "Penawaran", statuses: ["Penawaran"] },
  { label: "Diterima", statuses: ["Diterima"] },
  { label: "Ditolak", statuses: ["Ditolak"] },
  { label: "Ditutup", statuses: ["Ditutup"] },
];

function BoardView({
  jobs,
  onStatusChange,
}: {
  jobs: Job[];
  onStatusChange: (jobId: string, status: PipelineStatus) => void;
}) {
  return (
    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 md:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 content-start">
        {BOARD_COLS.map((col) => {
          const colJobs = jobs.filter((j) => col.statuses.includes(j.status));
          return (
            <div
              key={col.label}
              className="min-w-0 bg-black/[0.02] dark:bg-white/[0.03] rounded-lg p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const jobId = e.dataTransfer.getData("text/plain");
                if (jobId) {
                  const target = col.statuses[0];
                  onStatusChange(jobId, target);
                }
              }}
            >
              <div className="flex items-center justify-between px-1.5 py-1.5 mb-1">
                <span className="text-[11px] font-medium text-secondary">{col.label}</span>
                <span className="text-[10px] text-faint">{colJobs.length}</span>
              </div>
              <div className="space-y-1.5 min-h-[60px]">
                {colJobs.map((job) => (
                  <div
                    key={job.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", job.id)}
                    onClick={() => {
                      window.history.pushState(null, "", `/applications?peek=${job.id}`);
                      window.dispatchEvent(new PopStateEvent("popstate"));
                    }}
                    className="border border-subtle rounded-md px-2.5 py-2 bg-card cursor-pointer hover:border-black/20 dark:hover:border-white/20 transition animate-in-fast"
                  >
                    <div className="text-[11px] font-medium text-primary truncate">
                      {job.position}
                    </div>
                    <div className="text-[10px] text-faint truncate">{job.company}</div>
                    <div className="flex items-center justify-between mt-1.5">
                      <StatusBadge status={job.status} size="sm" />
                      {job.priority === "Tinggi" && (
                        <span className="text-[9px] text-rose-500 font-medium">! Tinggi</span>
                      )}
                    </div>
                  </div>
                ))}
                {colJobs.length === 0 && (
                  <div className="border border-dashed border-subtle rounded-md h-16" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
