"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Briefcase,
  Compass,
  Building2,
  FileText,
  CheckSquare,
  Plus,
  Calendar,
  Settings,
  PanelLeftClose,
  ProjectIcon,
} from "@/components/icons";
import { api } from "@/lib/api-client";
import { Input } from "@/components/ui/input";

type SearchResults = {
  jobs: { id: string; company: string; position: string; status: string }[];
  opportunities: { id: string; company: string; position: string }[];
  pages: { id: string; title: string; icon?: string }[];
  companies: { id: string; name: string }[];
  tasks: { id: string; title: string; status: string }[];
};

const EMPTY: SearchResults = {
  jobs: [],
  opportunities: [],
  pages: [],
  companies: [],
  tasks: [],
};

type Command = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords?: string;
};

export function CommandPalette({
  open,
  onClose,
  onNewJob,
}: {
  open: boolean;
  onClose: () => void;
  onNewJob: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [activeIndex, setActiveIndex] = useState(0);

  // Debounced fuzzy-ish search
  useEffect(() => {
    if (!open) return;
    if (query.trim().length < 1) {
      setResults(EMPTY);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await api.get<SearchResults>(
          `/api/search?q=${encodeURIComponent(query.trim())}`,
        );
        setResults(res);
      } catch {
        setResults(EMPTY);
      }
    }, 180);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const commands: Command[] = [
    { id: "new-job", label: "Buat Lamaran Baru", icon: Plus, action: () => { onClose(); onNewJob(); }, keywords: "new application lamaran" },
    { id: "go-apps", label: "Buka Applications", icon: Briefcase, action: () => go("/applications") },
    { id: "go-opps", label: "Buka Opportunities", icon: Compass, action: () => go("/opportunities") },
    { id: "go-companies", label: "Buka Companies", icon: Building2, action: () => go("/companies") },
    { id: "go-interviews", label: "Buka Interviews", icon: Calendar, action: () => go("/interviews") },
    { id: "go-tasks", label: "Buka Tasks", icon: CheckSquare, action: () => go("/tasks") },
    { id: "go-docs", label: "Buka Documents", icon: FileText, action: () => go("/documents") },
    { id: "go-analytics", label: "Buka Analytics", icon: Settings, action: () => go("/analytics") },
    { id: "toggle-sidebar", label: "Toggle Sidebar", icon: PanelLeftClose, action: () => { window.dispatchEvent(new Event("jobspace:toggle-sidebar")); onClose(); } },
  ];

  const filteredCommands = query.trim()
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          (c.keywords || "").includes(query.toLowerCase()),
      )
    : commands;

  type Row = { key: string; label: string; hint?: string; icon: React.ReactNode; onSelect: () => void };
  const rows: Row[] = [];

  if (query.trim()) {
    results.jobs.forEach((j) =>
      rows.push({
        key: `job-${j.id}`,
        label: `${j.position} — ${j.company}`,
        hint: j.status,
        icon: <Briefcase className="w-3.5 h-3.5 text-faint" />,
        onSelect: () => go(`/applications?peek=${j.id}`),
      }),
    );
    results.opportunities.forEach((o) =>
      rows.push({
        key: `opp-${o.id}`,
        label: `${o.position} — ${o.company}`,
        hint: "Opportunity",
        icon: <Compass className="w-3.5 h-3.5 text-faint" />,
        onSelect: () => go(`/opportunities`),
      }),
    );
    results.pages.forEach((p) =>
      rows.push({
        key: `page-${p.id}`,
        label: p.title,
        hint: "Page",
        icon: <ProjectIcon name={p.icon} className="w-3.5 h-3.5 text-faint" />,
        onSelect: () => go(`/pages/${p.id}`),
      }),
    );
    results.companies.forEach((c) =>
      rows.push({
        key: `company-${c.id}`,
        label: c.name,
        hint: "Company",
        icon: <Building2 className="w-3.5 h-3.5 text-faint" />,
        onSelect: () => go("/companies"),
      }),
    );
    results.tasks.forEach((t) =>
      rows.push({
        key: `task-${t.id}`,
        label: t.title,
        hint: t.status,
        icon: <CheckSquare className="w-3.5 h-3.5 text-faint" />,
        onSelect: () => go(`/tasks`),
      }),
    );
  }

  filteredCommands.forEach((c) => {
    const Icon = c.icon;
    rows.push({
      key: `cmd-${c.id}`,
      label: c.label,
      hint: "Command",
      icon: <Icon className="w-3.5 h-3.5 text-faint" />,
      onSelect: c.action,
    });
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      rows[activeIndex]?.onSelect();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/25 dark:bg-black/50 animate-in-fast"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-lg bg-card rounded-xl shadow-2xl border border-subtle overflow-hidden animate-in-fast"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3.5 py-3 border-b border-subtle">
          <Search className="w-4 h-4 text-faint flex-shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cari lowongan, perusahaan, halaman, atau perintah..."
            maxLength={100}
            className="h-9 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 text-sm text-primary placeholder:text-faint"
            aria-label="Kata kunci pencarian"
          />
          <kbd className="text-[10px] text-faint border border-subtle px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5 scroll-thin">
          {rows.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-faint">
              Tidak ada hasil untuk &quot;{query}&quot;
            </div>
          ) : (
            rows.map((row, idx) => (
              <button
                key={row.key}
                onClick={row.onSelect}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-left text-xs transition ${
                  idx === activeIndex
                    ? "bg-black/5 dark:bg-white/10"
                    : "hover:bg-white/5"
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  {row.icon}
                  <span className="truncate text-primary">{row.label}</span>
                </span>
                {row.hint && (
                  <span className="text-[10px] text-faint flex-shrink-0 ml-2">{row.hint}</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="px-3.5 py-2 border-t border-subtle flex items-center justify-between text-[10px] text-faint">
          <span>↑↓ navigasi · ⏎ pilih</span>
          <span>Ctrl / ⌘ + K</span>
        </div>
      </div>
    </div>
  );
}
