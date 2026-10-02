"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Briefcase,
  Compass,
  Building2,
  Calendar,
  CheckSquare,
  FileText,
  BarChart3,
  Archive,
  Star,
  Settings,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Layout,
  Clock,
  Sparkles,
  Layers,
  FileSpreadsheet,
  X,
  ProjectIcon,
} from "@/components/icons";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
};

const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Sparkles },
  { href: "/applications", label: "Lamaran", icon: Briefcase },
  { href: "/opportunities", label: "Peluang", icon: Compass },
  { href: "/companies", label: "Perusahaan", icon: Building2 },
  { href: "/interviews", label: "Wawancara", icon: Calendar },
  { href: "/tasks", label: "Tugas", icon: CheckSquare },
  { href: "/reminders", label: "Tindak lanjut", icon: Clock },
  { href: "/documents", label: "Dokumen", icon: FileText },
  { href: "/templates", label: "Template", icon: FileSpreadsheet },
  { href: "/analytics", label: "Analitik", icon: BarChart3 },
  { href: "/archive", label: "Arsip", icon: Archive },
];

export function Sidebar({
  userName,
  workspaceName,
  initialPages,
  onOpenCommandPalette,
  onOpenNewJob,
  onNavigate,
  mobile = false,
  className = "",
}: {
  userName?: string | null;
  workspaceName?: string;
  initialPages: { id: string; title: string; icon?: string | null }[];
  onOpenCommandPalette: () => void;
  onOpenNewJob: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [pages, setPages] = useState(initialPages);

  useEffect(() => {
    const reloadPages = () => {
      api.get<{ items: { id: string; title: string; icon?: string }[] }>("/api/pages")
        .then((res) => setPages(res.items || []))
        .catch(() => {});
    };
    const handlePagesChanged = () => reloadPages();
    window.addEventListener("jobspace:pages-changed", handlePagesChanged);
    return () => window.removeEventListener("jobspace:pages-changed", handlePagesChanged);
  }, []);

  const handleLogout = async () => {
    try {
      await api.post("/api/auth/logout");
      router.push("/login");
    } catch {
      window.location.href = "/login";
    }
  };

  const handleCreatePage = async () => {
    try {
      const res = await api.post<{ id: string }>("/api/pages", {
        title: "Untitled Page",
        icon: "Document",
      });
      setPages((current) => [...current, { id: res.id, title: "Untitled Page", icon: "Document" }]);
      toast.success("Halaman baru dibuat");
      onNavigate?.();
      router.push(`/pages/${res.id}`);
    } catch {
      toast.error("Gagal membuat halaman");
    }
  };

  if (collapsed) {
    return (
    <aside className={`w-12 h-dvh border-r border-subtle area-sidebar flex flex-col items-center py-3 select-none flex-shrink-0 ${className}`}>
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 hover:bg-white/5 rounded-md text-secondary"
          title="Buka sidebar"
          aria-label="Buka sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="h-px w-6 bg-black/10 dark:bg-white/10 my-2" />
        <button
          onClick={onOpenNewJob}
          className="p-2 hover:bg-white/5 rounded-md text-blue-600 dark:text-blue-400"
          title="Tambah Lamaran Baru"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={onOpenCommandPalette}
          className="p-2 hover:bg-white/5 rounded-md text-secondary"
          title="Cari (Ctrl+K)"
        >
          <Search className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className={`w-60 h-dvh border-r border-subtle area-sidebar flex flex-col select-none flex-shrink-0 text-sm ${className}`}>
      {/* Workspace Switcher Header */}
      <div className="h-12 px-3 flex items-center justify-between border-b border-subtle">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
            <Briefcase className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-primary truncate text-xs tracking-tight">
            {workspaceName || "Hilal's Job Space"}
          </span>
        </div>
        {mobile ? (
          <button
            onClick={onNavigate}
            className="rounded-md p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-primary"
            aria-label="Tutup navigasi"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 hover:bg-white/5 rounded text-faint hover:text-primary"
            title="Tutup sidebar"
            aria-label="Tutup sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Quick Action Buttons */}
      <div className="p-2 space-y-1">
        <button
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-secondary hover:bg-white/5 text-xs font-medium"
        >
          <span className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-faint" />
            <span>Cari / Perintah</span>
          </span>
          <kbd className="text-[10px] text-faint bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
            ⌘K
          </kbd>
        </button>

        <button
          onClick={onOpenNewJob}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-blue-300 bg-blue-950/40 hover:bg-blue-900/60 text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Lamaran Baru</span>
        </button>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 scroll-thin space-y-0.5">
        <div className="text-[10px] font-semibold tracking-wider text-faint uppercase px-2.5 pt-2 pb-1">
          Ruang kerja
        </div>

        {MAIN_NAV.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs transition ${
                isActive
                  ? "bg-black/10 dark:bg-white/10 font-medium text-primary"
                  : "text-secondary hover:bg-white/5 hover:text-primary"
              }`}
            >
              <Icon className="w-4 h-4 text-faint" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}

        {/* Private Pages (Notion-style) */}
        <div className="pt-4 pb-1 flex items-center justify-between px-2.5">
          <span className="text-[10px] font-semibold tracking-wider text-faint uppercase">
            Halaman Pribadi
          </span>
          <button
            onClick={handleCreatePage}
            className="text-faint hover:text-primary p-0.5 rounded hover:bg-white/5"
            title="Tambah halaman baru"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {pages.length === 0 ? (
          <div className="px-2.5 py-1 text-[11px] text-faint italic">
            Belum ada halaman.
          </div>
        ) : (
          pages.map((p) => {
            const isActive = pathname === `/pages/${p.id}`;
            return (
              <Link
                key={p.id}
                href={`/pages/${p.id}`}
                onClick={onNavigate}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition ${
                  isActive
                    ? "bg-black/10 dark:bg-white/10 font-medium text-primary"
                    : "text-secondary hover:bg-white/5 hover:text-primary"
                }`}
              >
                <ProjectIcon name={p.icon} className="w-3.5 h-3.5 shrink-0 text-faint" />
                <span className="truncate">{p.title || "Untitled"}</span>
              </Link>
            );
          })
        )}
      </div>

      {/* Footer / Profile */}
      <div className="p-2 border-t border-subtle space-y-0.5 text-xs text-secondary">
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <div className="min-w-0">
            <div className="text-xs font-medium text-primary truncate">
              {userName || "Hilal Fakhri"}
            </div>
            <div className="text-[10px] text-faint">Free Personal</div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1 hover:bg-rose-950/40 dark:hover:bg-rose-950/50 text-faint hover:text-rose-600 rounded"
            title="Keluar"
            aria-label="Keluar dari akun"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
