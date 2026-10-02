"use client";

import React, { useState } from "react";
import { BarChart3, Loader2, RefreshCw } from "@/components/icons";
import { api } from "@/lib/api-client";
import { PIPELINE_STATUSES, type PipelineStatus } from "@/lib/domain/schema";
import { STATUS_DOTS, formatDateID } from "@/lib/ui";
import type { AnalyticsInsights } from "@/lib/services/insights.service";

type Stats = {
  totalApplications: number;
  activeApplications: number;
  applicationsThisMonth: number;
  byStatus: Record<string, number>;
  followUp: { completed: number; onTime: number; rate: number };
  interviews: { total: number; passed: number; rate: number };
  offers: { count: number; rate: number };
  responseRate: number;
  responseDays: { avg: number | null };
};

const SERIES = [
  { key: "applications", label: "Lamaran", color: "#60a5fa" },
  { key: "replies", label: "Balasan", color: "#34d399" },
  { key: "interviews", label: "Wawancara", color: "#c084fc" },
  { key: "offers", label: "Penawaran", color: "#fbbf24" },
] as const;

export function AnalyticsClient({ initialStats, initialInsights }: {
  initialStats: Stats;
  initialInsights: AnalyticsInsights;
}) {
  const [stats, setStats] = useState<Stats | null>(initialStats);
  const [insights, setInsights] = useState<AnalyticsInsights>(initialInsights);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<"source" | "workType">("source");

  const load = async (weeks = insights.weeks) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<{ stats: Stats; insights: AnalyticsInsights }>(`/api/analytics?weeks=${weeks}`);
      setStats(result.stats);
      setInsights(result.insights);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat analitik");
    } finally {
      setLoading(false);
    }
  };

  const maxStatus = stats ? Math.max(1, ...PIPELINE_STATUSES.map((status) => stats.byStatus[status] ?? 0)) : 1;
  const breakdownItems = breakdown === "source" ? insights.bySource : insights.byWorkType;
  const maxBreakdown = Math.max(1, ...breakdownItems.map((item) => item.applications));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 sm:px-8 xl:px-10 pt-8 xl:pt-10 pb-4 border-b border-subtle">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <BarChart3 className="w-6 h-6 text-secondary" />
              <h1 className="text-2xl font-bold page-title text-primary">Analitik</h1>
            </div>
            <p className="text-xs text-faint mt-1">Perkembangan proses lamaran, kanal yang efektif, dan waktu tunggu tiap tahap.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-subtle p-0.5" aria-label="Rentang analitik">
              {[4, 12, 26].map((weeks) => (
                <button key={weeks} type="button" aria-pressed={insights.weeks === weeks} disabled={loading} onClick={() => void load(weeks)} className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${insights.weeks === weeks ? "bg-accent text-primary" : "text-secondary hover:bg-white/5 hover:text-primary"}`}>
                  {weeks} pekan
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void load()} disabled={loading} className="p-1.5 rounded-md border border-subtle text-faint transition hover:text-primary disabled:opacity-50" title="Muat ulang analitik" aria-label="Muat ulang analitik">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 w-full overflow-y-auto scroll-thin p-5 sm:p-8 xl:p-10 xl:pt-6">
        {error && <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</div>}
        {loading && !stats ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="w-5 h-5 animate-spin text-faint" /></div>
        ) : !stats || stats.totalApplications === 0 ? (
          <div className="text-center py-20 space-y-2">
            <BarChart3 className="w-8 h-8 text-faint mx-auto" />
            <p className="text-sm font-medium text-primary">Analitik akan muncul setelah ada lamaran</p>
            <p className="text-xs text-faint max-w-sm mx-auto">Catat lamaran dan jadwal wawancara agar perkembangan, konversi, serta waktu tunggu dapat dihitung.</p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric label="Total lamaran" value={stats.totalApplications} />
              <Metric label="Lamaran aktif" value={stats.activeApplications} />
              <Metric label="Bulan ini" value={stats.applicationsThisMonth} />
              <Metric label="Tingkat balasan" value={`${stats.responseRate}%`} sub={stats.responseDays.avg !== null ? `Rata-rata ${stats.responseDays.avg} hari` : "Belum ada waktu balasan"} />
            </div>

            <section className="space-y-3">
              <SectionHeading title="Aktivitas per pekan" description="Jumlah peristiwa pada pekan tersebut. Titik kosong berarti tidak ada aktivitas tercatat." />
              <div className="rounded-xl border border-subtle bg-card p-4 sm:p-5"><TrendChart data={insights.weeklyTrend} /></div>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <section className="space-y-3">
                <SectionHeading title="Pipeline lamaran" description="Pilih tahap di menu Lamaran untuk melihat datanya." />
                <div className="rounded-xl border border-subtle bg-card p-4 space-y-3">
                  {PIPELINE_STATUSES.map((status: PipelineStatus) => {
                    const count = stats.byStatus[status] ?? 0;
                    return <div key={status} className="flex items-center gap-3 text-xs">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOTS[status]}`} />
                      <span className="w-32 text-secondary truncate">{status}</span>
                      <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full bg-blue-400/80 transition-[width]" style={{ width: `${(count / maxStatus) * 100}%` }} /></div>
                      <span className="w-8 text-right font-medium tabular-nums text-primary">{count}</span>
                    </div>;
                  })}
                </div>
              </section>

              <section className="space-y-3">
                <SectionHeading title="Konversi proses" description="Angka dihitung dari seluruh lamaran aktif yang tersimpan." />
                <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3 gap-3">
                  <RateCard label="Wawancara" value={`${stats.interviews.rate}%`} sub={`${stats.interviews.total} jadwal · ${stats.interviews.passed} lolos`} />
                  <RateCard label="Penawaran" value={`${stats.offers.rate}%`} sub={`${stats.offers.count} penawaran`} />
                  <RateCard label="Follow-up tepat waktu" value={`${stats.followUp.rate}%`} sub={`${stats.followUp.onTime} dari ${stats.followUp.completed} selesai`} />
                </div>
              </section>
            </div>

            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionHeading title="Sumber dan tipe kerja" description="Bandingkan tingkat balasan, wawancara, dan penawaran untuk tiap kelompok." />
                <div className="inline-flex rounded-lg border border-subtle p-0.5" aria-label="Kelompok data">
                  {(["source", "workType"] as const).map((key) => <button key={key} type="button" aria-pressed={breakdown === key} onClick={() => setBreakdown(key)} className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${breakdown === key ? "bg-accent text-primary" : "text-secondary hover:bg-white/5 hover:text-primary"}`}>
                    {key === "source" ? "Sumber" : "Tipe kerja"}
                  </button>)}
                </div>
              </div>
              {breakdownItems.length === 0 ? <EmptyState text="Belum ada informasi untuk kelompok ini." /> : (
                <div className="overflow-x-auto rounded-xl border border-subtle bg-card">
                  <table className="w-full min-w-[620px] text-xs">
                    <thead className="border-b border-subtle text-left text-faint"><tr>
                      <th className="px-4 py-3 font-medium">{breakdown === "source" ? "Sumber" : "Tipe kerja"}</th>
                      <th className="px-4 py-3 font-medium">Lamaran</th><th className="px-4 py-3 font-medium">Balasan</th><th className="px-4 py-3 font-medium">Wawancara</th><th className="px-4 py-3 font-medium">Penawaran</th>
                    </tr></thead>
                    <tbody>{breakdownItems.map((item) => <tr key={item.label} className="border-b border-subtle last:border-0 hover:bg-white/[0.025]">
                      <td className="px-4 py-3"><div className="font-medium text-primary">{item.label}</div><div className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-blue-400/80" style={{ width: `${(item.applications / maxBreakdown) * 100}%` }} /></div></td>
                      <td className="px-4 py-3 tabular-nums text-secondary">{item.applications}</td><td className="px-4 py-3 tabular-nums text-secondary">{item.responseRate}%</td><td className="px-4 py-3 tabular-nums text-secondary">{item.interviewRate}%</td><td className="px-4 py-3 tabular-nums text-secondary">{item.offerRate}%</td>
                    </tr>)}</tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <SectionHeading title="Lama di tahap saat ini" description="Rata-rata hari sejak status terakhir dimulai. Gunakan sebagai sinyal untuk meninjau tindak lanjut." />
              {insights.stageAging.length === 0 ? <EmptyState text="Belum ada lamaran aktif di pipeline." /> : <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {insights.stageAging.map((stage) => <div key={stage.status} className="rounded-xl border border-subtle bg-card p-4">
                  <div className="text-[10px] uppercase tracking-wide text-faint">{stage.status}</div>
                  <div className="mt-2 flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums text-primary">{stage.averageDays}</span><span className="text-xs text-secondary">hari rata-rata</span></div>
                  <div className="mt-1 text-[11px] text-faint">{stage.count} lamaran saat ini</div>
                </div>)}
              </div>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function TrendChart({ data }: { data: AnalyticsInsights["weeklyTrend"] }) {
  const width = 760;
  const height = 250;
  const left = 36;
  const right = 14;
  const top = 16;
  const bottom = 28;
  const max = Math.max(1, ...data.flatMap((week) => SERIES.map((series) => week[series.key])));
  const x = (index: number) => left + (data.length <= 1 ? 0 : index * (width - left - right)) / (data.length - 1);
  const y = (value: number) => height - bottom - (value / max) * (height - top - bottom);
  const labels = new Set([0, Math.floor((data.length - 1) / 2), Math.max(0, data.length - 1)]);
  return <>
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">{SERIES.map((series) => <span key={series.key} className="inline-flex items-center gap-1.5 text-[11px] text-secondary"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />{series.label}</span>)}</div>
    <div className="w-full overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px] w-full" role="img" aria-label="Grafik aktivitas mingguan JobSpace">
      {[0, 0.33, 0.66, 1].map((ratio) => { const lineY = top + ratio * (height - top - bottom); return <g key={ratio}><line x1={left} x2={width - right} y1={lineY} y2={lineY} stroke="currentColor" className="text-white/10" strokeDasharray="3 5" /><text x={left - 8} y={lineY + 4} textAnchor="end" fill="currentColor" className="text-faint" fontSize="10">{Math.round(max * (1 - ratio))}</text></g>; })}
      {SERIES.map((series) => { const points = data.map((week, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(week[series.key])}`).join(" "); return <g key={series.key}><path d={points} fill="none" stroke={series.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />{data.map((week, index) => <circle key={`${series.key}-${week.weekStart}`} cx={x(index)} cy={y(week[series.key])} r="3.2" fill={series.color}><title>{`${series.label}: ${week[series.key]} · pekan ${formatDateID(week.weekStart)}`}</title></circle>)}</g>; })}
      {[...labels].map((index) => <text key={index} x={x(index)} y={height - 6} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"} fill="currentColor" className="text-faint" fontSize="10">{data[index] ? formatDateID(data[index].weekStart) : ""}</text>)}
    </svg></div>
  </>;
}

function Metric({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return <div className="rounded-xl border border-subtle bg-card p-4"><div className="text-[10px] text-faint uppercase tracking-wide font-medium">{label}</div><div className="mt-1 text-2xl font-bold tabular-nums text-primary page-title">{value}</div>{sub && <div className="mt-0.5 text-[10px] text-faint">{sub}</div>}</div>;
}

function RateCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-xl border border-subtle bg-card p-4"><div className="text-[10px] text-faint uppercase tracking-wide font-medium">{label}</div><div className="mt-1 text-xl font-bold text-blue-300">{value}</div><div className="mt-1 text-[10px] text-faint">{sub}</div></div>;
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return <div><h2 className="text-sm font-semibold text-primary">{title}</h2><p className="mt-1 text-xs text-faint">{description}</p></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-subtle px-4 py-6 text-center text-xs text-faint">{text}</div>;
}
