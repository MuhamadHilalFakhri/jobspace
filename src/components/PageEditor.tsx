"use client";

import { toast } from "sonner";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, PAGE_ICON_OPTIONS, ProjectIcon } from "@/components/icons";
import { api } from "@/lib/api-client";
import { BlockEditor, newBlock, type Block, type BlockType } from "./BlockEditor";
import { FormSelect } from "./FormSelect";
import { useConfirmAction } from "./ConfirmProvider";
import { pageMetaSchema, saveBlocksSchema, formErrorsFromZod } from "@/lib/domain/validation";
import { Input } from "@/components/ui/input";

type PageData = {
  id: string;
  title: string;
  icon: string | null;
  section: string;
  blocks: { id?: string; type: string; content: Record<string, unknown>; position: number }[];
};

export function PageEditor({
  pageId,
  initialPage,
}: {
  pageId: string;
  initialPage: PageData;
}) {
  const router = useRouter();
  const confirmAction = useConfirmAction();
  const [page, setPage] = useState<PageData | null>(initialPage);
  const [title, setTitle] = useState(initialPage.title);
  const [titleInput, setTitleInput] = useState<string | null>(initialPage.title);
  const [icon, setIcon] = useState(normalizePageIcon(initialPage.icon));
  const [blocks, setBlocks] = useState<Block[]>(
    initialPage.blocks.length > 0
      ? initialPage.blocks.map((b, i) => ({
          key: b.id || `server-${i}`,
          id: b.id,
          type: normalizeType(b.type),
          content: b.content || {},
        }))
      : [newBlock()],
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  const handleSave = async () => {
    const finalTitle = titleInput?.trim() || title || "Untitled";
    const meta = pageMetaSchema.safeParse({ title: finalTitle, icon });
    const pageBlocks = saveBlocksSchema.safeParse({
      blocks: blocks.map((block, position) => ({ type: block.type, content: block.content, position })),
    });
    if (!meta.success || !pageBlocks.success) {
      const errors = meta.success ? {} : formErrorsFromZod(meta.error);
      setTitleError(errors.title ?? null);
      const message = Object.values(errors)[0] ?? (pageBlocks.success ? "Periksa isi halaman" : pageBlocks.error.issues[0]?.message);
      toast.error(message || "Periksa data halaman");
      return;
    }
    setTitleError(null);
    setSaving(true);
    try {
      await Promise.all([
        api.put(`/api/pages?id=${pageId}`, {
          blocks: pageBlocks.data.blocks,
        }),
        api.patch(`/api/pages?id=${pageId}`, meta.data),
      ]);
      setTitle(finalTitle);
      setTitleInput(finalTitle);
      window.dispatchEvent(new Event("jobspace:pages-changed"));
      toast.success("Halaman tersimpan");
    } catch {
      toast.error("Gagal menyimpan halaman");
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (newTitle: string) => {
    const finalTitle = newTitle.trim() || "Untitled";
    const validation = pageMetaSchema.safeParse({ title: finalTitle, icon });
    if (!validation.success) {
      const message = formErrorsFromZod(validation.error).title;
      setTitleError(message ?? "Judul halaman tidak valid");
      toast.error(message ?? "Judul halaman tidak valid");
      return;
    }
    try {
      await api.patch(`/api/pages?id=${pageId}`, validation.data);
      setTitle(finalTitle);
      setTitleInput(finalTitle);
      setTitleError(null);
      window.dispatchEvent(new Event("jobspace:pages-changed"));
    } catch {
      toast.error("Gagal menyimpan judul halaman");
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirmAction({
      title: "Hapus halaman?",
      description: `Halaman "${title}" dan blok di dalamnya akan dihapus.`,
      confirmLabel: "Hapus halaman",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await api.del(`/api/pages?id=${pageId}`);
      window.dispatchEvent(new Event("jobspace:pages-changed"));
      router.push("/");
    } catch {
      toast.error("Gagal menghapus halaman");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-faint" />
        <span className="ml-2 text-xs text-faint">Memuat halaman...</span>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-rose-600">
        {error || "Halaman tidak ditemukan"}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scroll-thin">
      <div className="w-full min-w-0 px-5 sm:px-8 xl:px-10 py-8 xl:py-10">
        {/* Page header */}
        <div className="mb-2 flex items-start justify-between">
          <div className="flex items-start gap-2 flex-1">
            <div className="flex items-center gap-2 shrink-0">
              <ProjectIcon name={icon} className="w-7 h-7 text-secondary" />
              <FormSelect
                value={icon}
                onValueChange={setIcon}
                options={PAGE_ICON_OPTIONS.map((option) => ({ value: option.name, label: option.label }))}
                ariaLabel="Pilih ikon halaman"
                className="w-32"
              />
            </div>
            <Input
              value={titleInput ?? title}
              aria-invalid={Boolean(titleError)}
              maxLength={200}
              onChange={(e) => { setTitleInput(e.target.value); setTitleError(null); }}
              onBlur={(e) => handleRename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder="Untitled"
              className="h-11 flex-1 border-0 bg-transparent px-1 shadow-none text-2xl font-bold page-title text-primary placeholder:text-faint/50 sm:text-3xl focus-visible:ring-0"
            />
          </div>
          {titleError && <p className="mb-2 text-xs text-destructive" role="alert">{titleError}</p>}
          <button
            onClick={handleDelete}
            className="p-1.5 rounded hover:bg-rose-950/40 text-faint hover:text-rose-600 flex-shrink-0"
            title="Hapus halaman"
            aria-label="Hapus halaman"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="text-[10px] text-faint mb-6">Bagian: {page.section}</div>

        <BlockEditor
          blocks={blocks}
          onChange={setBlocks}
          onSave={handleSave}
          saving={saving}
        />
      </div>
    </div>
  );
}

function normalizeType(t: string): BlockType {
  const allowed: BlockType[] = [
    "text",
    "heading_1",
    "heading_2",
    "heading_3",
    "bulleted_list",
    "numbered_list",
    "todo",
    "quote",
    "divider",
    "code",
    "callout",
  ];
  return allowed.includes(t as BlockType) ? (t as BlockType) : "text";
}

function normalizePageIcon(icon: string | null): string {
  return PAGE_ICON_OPTIONS.some((option) => option.name === icon)
    ? icon as string
    : "Document";
}
