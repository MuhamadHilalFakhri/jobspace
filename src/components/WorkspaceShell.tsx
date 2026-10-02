"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { NewJobModal } from "./NewJobModal";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Layers, Plus } from "@/components/icons";

export function WorkspaceShell({
  children,
  userName,
  workspaceName,
  initialPages,
}: {
  children: React.ReactNode;
  userName?: string | null;
  workspaceName?: string;
  initialPages: { id: string; title: string; icon?: string | null }[];
}) {
  const router = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
      // Esc closes modals
      if (e.key === "Escape") {
        setCmdOpen(false);
        setNewJobOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-dvh w-full min-w-0 overflow-hidden area-app">
      <div className="hidden shrink-0 md:flex">
        <Sidebar
          userName={userName}
          workspaceName={workspaceName}
          initialPages={initialPages}
          onOpenCommandPalette={() => setCmdOpen(true)}
          onOpenNewJob={() => setNewJobOpen(true)}
        />
      </div>

      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent
          showCloseButton={false}
          className="!left-0 !top-0 !h-dvh !w-[280px] !max-w-[88vw] !translate-x-0 !translate-y-0 !rounded-none !border-y-0 !border-l-0 !p-0 !shadow-2xl"
        >
          <DialogTitle className="sr-only">Navigasi Job Space</DialogTitle>
          <Sidebar
            mobile
            userName={userName}
            workspaceName={workspaceName}
            initialPages={initialPages}
            onNavigate={() => setMobileNavOpen(false)}
            onOpenCommandPalette={() => {
              setMobileNavOpen(false);
              setCmdOpen(true);
            }}
            onOpenNewJob={() => {
              setMobileNavOpen(false);
              setNewJobOpen(true);
            }}
          />
        </DialogContent>
      </Dialog>

      <main className="flex-1 min-w-0 h-dvh overflow-y-auto area-app scroll-thin flex flex-col">
        <div className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-b border-subtle bg-background/95 px-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={() => setMobileNavOpen(true)} aria-label="Buka navigasi">
              <Layers className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold text-primary">Job Space</span>
          </div>
          <Button size="sm" onClick={() => setNewJobOpen(true)}>
            <Plus className="h-4 w-4" /> Lamaran
          </Button>
        </div>
        {children}
      </main>

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNewJob={() => setNewJobOpen(true)}
      />

      <NewJobModal
        open={newJobOpen}
        onClose={() => setNewJobOpen(false)}
        onCreated={(j) => {
          router.push(`/applications?peek=${j.id}`);
        }}
      />
    </div>
  );
}
