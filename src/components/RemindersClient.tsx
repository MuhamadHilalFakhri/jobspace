"use client";

import { toast } from "sonner";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, AlertTriangle, CalendarClock, Loader2, RefreshCw, Pencil } from "@/components/icons";
import { api } from "@/lib/api-client";
import { formatDateID, relativeDays } from "@/lib/ui";
import { today as getToday } from "@/lib/domain/dates";

type Reminder = {
  id: string;
  jobId: string;
  company: string;
  position: string;
  type: "follow_up" | "deadline";
  dueDate: string;
  completedAt: string | null;
  status: string;
};

export function RemindersClient({ initialItems }: { initialItems: Reminder[] }) {
  const [items, setItems] = useState<Reminder[]>(initialItems);
  const [tab, setTab] = useState<"aktif" | "selesai">("aktif");
  const [loading, setLoading] = useState(false);
  const [hasSelectedTab, setHasSelectedTab] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ items: Reminder[] }>(`/api/reminders?status=${tab}`);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat pengingat");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (!hasSelectedTab) return;
    load();
  }, [hasSelectedTab, load]);

  const complete = async (id: string) => {
    setCompleting(id);
    try {
      await api.post(`/api/reminders/${id}/complete`);
      setItems((list) => list.filter((r) => r.id !== id));
      toast.success("Pengingat ditandai selesai");
    } catch {
      toast.error("Gagal menandai selesai. Coba lagi.");
    } finally {
      setCompleting(null);
    }
  };

  const today = getToday();
  const completed = items.filter((r) => Boolean(r.completedAt));
  const overdue = items.filter((r) => r.dueDate < today);
  const dueToday = items.filter((r) => r.dueDate === today);
  const upcoming = items.filter((r) => r.dueDate > today);

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-5 sm:px-8 xl:px-10 pt-8 xl:pt-10 pb-4 border-b border-subtle">
        <div className="flex items-center gap-2.5">
          <Clock className="w-6 h-6 text-secondary" />
          <h1 className="text-2xl font-bold page-title text-primary">Follow-ups & Tenggat</h1>
        </div>
        <p className="text-xs text-faint mt-1">
          Pengingat follow-up otomatis (7 hari tanpa balasan) dan tenggat lamaran.
        </p>

        <div className="flex items-center gap-1 mt-4">
          {(["aktif", "selesai"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setHasSelectedTab(true);
                setTab(t);
              }}
              className={`px-3 py-1.5 text-xs rounded-md font-medium capitalize transition ${
                tab === t
                  ? "bg-black/[0.06] dark:bg-white/10 text-primary"
                  : "text-secondary hover:bg-white/5"
              }`}
              aria-pressed={tab === t}
            >
              {t}
            </button>
          ))}
          <button
            onClick={load}
            className="ml-auto p-1.5 rounded-md border border-subtle text-faint hover:text-primary"
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
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="text-sm font-medium text-primary">
              {tab === "aktif" ? "Tidak ada pengingat aktif" : "Belum ada pengingat selesai"}
            </p>
            <p className="text-xs text-faint max-w-sm mx-auto">
              {tab === "aktif"
                ? "Semua tindak lanjut sudah terkendali. Pengingat muncul otomatis ketika lamaran berstatus Perlu Follow-up atau memiliki tenggat."
                : "Tandai pengingat aktif sebagai selesai untuk melihat riwayatnya di sini."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {completed.length > 0 && tab === "selesai" && (
              <Group
                title="Selesai"
                icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                items={completed}
                onComplete={complete}
                completing={completing}
                readOnly
              />
            )}
            {overdue.length > 0 && tab === "aktif" && (
              <Group
                title="Terlambat"
                icon={<AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                items={overdue}
                onComplete={complete}
                completing={completing}
                highlight
              />
            )}
            {dueToday.length > 0 && tab === "aktif" && (
              <Group
                title="Hari Ini"
                icon={<Clock className="w-3.5 h-3.5 text-amber-500" />}
                items={dueToday}
                onComplete={complete}
                completing={completing}
              />
            )}
            {upcoming.length > 0 && (
              <Group
                title="Mendatang"
                icon={<CalendarClock className="w-3.5 h-3.5 text-blue-500" />}
                items={upcoming}
                onComplete={complete}
                completing={completing}
                readOnly={tab === "selesai"}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Group({
  title,
  icon,
  items,
  onComplete,
  completing,
  highlight,
  readOnly,
}: {
  title: string;
  icon: React.ReactNode;
  items: Reminder[];
  onComplete: (id: string) => void;
  completing: string | null;
  highlight?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h2 className="text-xs font-semibold text-secondary uppercase tracking-wide">
          {title}
        </h2>
        <span className="text-[10px] text-faint">{items.length}</span>
      </div>
      <div className="border border-subtle rounded-lg overflow-hidden">
        {items.map((r) => (
          <div
            key={r.id}
            className={`flex items-center justify-between px-3.5 py-3 border-b border-subtle last:border-b-0 hover-row ${
              highlight ? "bg-rose-950/20" : ""
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  r.type === "follow_up" ? "bg-amber-500" : "bg-blue-500"
                }`}
              />
              <div className="min-w-0">
                <Link
                  href={`/applications?peek=${r.jobId}`}
                  className="text-xs font-medium text-primary hover:underline truncate block"
                >
                  {r.position}
                </Link>
                <div className="text-[10px] text-faint truncate">
                  {r.company} · {r.type === "follow_up" ? "Follow-up" : "Tenggat lamaran"} ·{" "}
                  {formatDateID(r.dueDate)} ({relativeDays(r.dueDate)})
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href={`/applications?peek=${r.jobId}`}
                aria-label={`Edit data lamaran ${r.position} di ${r.company}`}
                title="Edit data lamaran terkait"
                className="rounded p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Link>
              {r.completedAt ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Selesai {formatDateID(r.completedAt.slice(0, 10))}
                </span>
              ) : (
                !readOnly && (
                  <button
                    onClick={() => onComplete(r.id)}
                    disabled={completing === r.id}
                    className="px-2.5 py-1 text-[10px] rounded-md border border-subtle hover:bg-white/5 text-secondary flex items-center gap-1"
                  >
                    {completing === r.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    Tandai selesai
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
