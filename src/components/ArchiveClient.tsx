"use client";

import { toast } from "sonner";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw, Trash2, RefreshCw, Pencil } from "@/components/icons";
import { api } from "@/lib/api-client";
import { formatDateID } from "@/lib/ui";
import { STATUS_STYLES } from "@/lib/ui";
import { useConfirmAction } from "./ConfirmProvider";

type ArchivedJob = {
  id: string;
  company: string;
  position: string;
  status: string;
  appliedAt: string;
  deletedAt: string | null;
};

export function ArchiveClient({ initialItems }: { initialItems: ArchivedJob[] }) {
  const router = useRouter();
  const confirmAction = useConfirmAction();
  const [items, setItems] = useState<ArchivedJob[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [purging, setPurging] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ items: ArchivedJob[] }>("/api/jobs?archived=true&pageSize=100");
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat arsip");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRestore = async (job: ArchivedJob) => {
    setRestoring(job.id);
    try {
      await api.patch(`/api/jobs/${job.id}`, { restore: true });
      setItems((current) => current.filter((item) => item.id !== job.id));
      toast.success("Lamaran dipulihkan");
    } catch {
      toast.error("Gagal memulihkan lamaran");
    } finally {
      setRestoring(null);
    }
  };

  const handleRestoreAndEdit = async (job: ArchivedJob) => {
    setRestoring(job.id);
    try {
      await api.patch(`/api/jobs/${job.id}`, { restore: true });
      setItems((current) => current.filter((item) => item.id !== job.id));
      toast.success("Lamaran dipulihkan; kamu bisa mengedit detailnya sekarang");
      router.push(`/applications?peek=${job.id}`);
    } catch {
      toast.error("Gagal memulihkan lamaran untuk diedit");
    } finally {
      setRestoring(null);
    }
  };

  const handlePurge = async (job: ArchivedJob) => {
    const confirmed = await confirmAction({
      title: "Hapus lamaran secara permanen?",
      description: `"${job.position} @ ${job.company}" beserta riwayat komunikasi, wawancara, dan pengingat akan terhapus dan tidak dapat dipulihkan.`,
      confirmLabel: "Hapus permanen",
      destructive: true,
    });
    if (!confirmed) return;
    setPurging(job.id);
    try {
      await api.del(`/api/jobs/${job.id}?purge=true`);
      setItems((current) => current.filter((item) => item.id !== job.id));
      toast.success("Lamaran dihapus permanen");
    } catch {
      toast.error("Gagal menghapus permanen");
    } finally {
      setPurging(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-5 sm:px-8 xl:px-10 pt-8 xl:pt-10 pb-4 border-b border-subtle">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Archive className="w-6 h-6 text-secondary" />
              <h1 className="text-2xl font-bold page-title text-primary">Archive</h1>
            </div>
            <p className="text-xs text-faint mt-1">
              Lamaran yang dihapus (soft-delete) disimpan di sini dan dapat dipulihkan (FR-01).
            </p>
          </div>
          <button
            onClick={load}
            className="p-1.5 rounded-md border border-subtle text-faint hover:text-primary"
            title="Muat ulang"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
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
            <Archive className="w-8 h-8 text-faint mx-auto" />
            <p className="text-sm font-medium text-primary">Arsip kosong</p>
            <p className="text-xs text-faint max-w-sm mx-auto">
              Lamaran yang kamu hapus dari daftar aktif akan muncul di sini untuk dipulihkan.
            </p>
          </div>
        ) : (
          <div className="border border-subtle rounded-lg overflow-hidden">
            {items.map((j) => (
              <div
                key={j.id}
                className="flex items-center justify-between px-3.5 py-3 border-b border-subtle last:border-b-0 hover-row"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-primary truncate">
                    {j.position} — {j.company}
                  </div>
                  <div className="text-[10px] text-faint">
                    Dilamar {formatDateID(j.appliedAt)} · Dihapus{" "}
                    {j.deletedAt ? formatDateID(j.deletedAt.slice(0, 10)) : "—"}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[j.status as keyof typeof STATUS_STYLES] || ""}`}
                  >
                    {j.status}
                  </span>
                  <button
                    onClick={() => handleRestoreAndEdit(j)}
                    disabled={restoring === j.id}
                    className="px-2 py-1 text-[10px] rounded border border-subtle hover:bg-white/5 text-secondary flex items-center gap-1 disabled:opacity-50"
                    title="Pulihkan dan buka untuk diedit"
                  >
                    <Pencil className="w-3 h-3" /> Pulihkan & edit
                  </button>
                  <button
                    onClick={() => handleRestore(j)}
                    disabled={restoring === j.id}
                    className="px-2 py-1 text-[10px] rounded border border-subtle hover:bg-white/5 text-secondary flex items-center gap-1"
                    title="Pulihkan"
                  >
                    <RotateCcw className="w-3 h-3" /> Pulihkan
                  </button>
                  <button
                    onClick={() => handlePurge(j)}
                    disabled={purging === j.id}
                    className="p-1.5 rounded hover:bg-rose-950/40 text-faint hover:text-rose-300 disabled:opacity-50"
                    title="Hapus permanen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
