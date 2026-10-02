"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Code2,
  Megaphone,
  Trash2,
  GripVertical,
  Plus,
  Copy,
  ProjectIcon,
} from "@/components/icons";
import { MAX_PAGE_BLOCK_TEXT_CHARS, PAGE_BLOCK_TYPES } from "@/lib/domain/schema";

export type BlockType = (typeof PAGE_BLOCK_TYPES)[number];

export type Block = {
  /** Client-side stable key; server ids are reused when present. */
  key: string;
  id?: string;
  type: BlockType;
  content: Record<string, unknown>;
};

const BLOCK_MENU: { type: BlockType; label: string; icon: React.ReactNode; hint: string }[] = [
  { type: "text", label: "Text", icon: <Type className="w-3.5 h-3.5" />, hint: "Paragraf biasa" },
  { type: "heading_1", label: "Heading 1", icon: <Heading1 className="w-3.5 h-3.5" />, hint: "Judul besar" },
  { type: "heading_2", label: "Heading 2", icon: <Heading2 className="w-3.5 h-3.5" />, hint: "Sub-judul" },
  { type: "heading_3", label: "Heading 3", icon: <Heading3 className="w-3.5 h-3.5" />, hint: "Sub-sub-judul" },
  { type: "bulleted_list", label: "Bulleted list", icon: <List className="w-3.5 h-3.5" />, hint: "Daftar poin" },
  { type: "numbered_list", label: "Numbered list", icon: <ListOrdered className="w-3.5 h-3.5" />, hint: "Daftar bernomor" },
  { type: "todo", label: "To-do", icon: <CheckSquare className="w-3.5 h-3.5" />, hint: "Checklist" },
  { type: "quote", label: "Quote", icon: <Quote className="w-3.5 h-3.5" />, hint: "Kutipan" },
  { type: "divider", label: "Divider", icon: <Minus className="w-3.5 h-3.5" />, hint: "Garis pemisah" },
  { type: "code", label: "Code", icon: <Code2 className="w-3.5 h-3.5" />, hint: "Blok kode" },
  { type: "callout", label: "Callout", icon: <Megaphone className="w-3.5 h-3.5" />, hint: "Sorotan" },
];

let keyCounter = 0;
export function newBlock(type: BlockType = "text", text = ""): Block {
  keyCounter += 1;
  const boundedText = text.slice(0, MAX_PAGE_BLOCK_TEXT_CHARS);
  return {
    key: `local-${Date.now()}-${keyCounter}`,
    type,
    content:
      type === "todo"
        ? { text: boundedText, checked: false }
        : type === "callout"
          ? { text: boundedText, icon: "InfoCircle" }
          : { text: boundedText },
  };
}

function blockText(block: Block): string {
  const v = block.content?.text;
  return typeof v === "string" ? v : "";
}

/** Slash-command input: detects "/query" at the start of an empty-ish block. */
export function BlockEditor({
  blocks,
  onChange,
  onSave,
  saving,
  placeholder = "Tulis sesuatu, atau tekan '/' untuk perintah...",
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  onSave?: (blocks: Block[]) => void;
  saving?: boolean;
  placeholder?: string;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  const update = useCallback(
    (next: Block[]) => {
      onChange(next);
    },
    [onChange],
  );

  const setText = (key: string, text: string) => {
    const boundedText = text.slice(0, MAX_PAGE_BLOCK_TEXT_CHARS);
    update(blocks.map((b) => (b.key === key ? { ...b, content: { ...b.content, text: boundedText } } : b)));
    // Slash command detection
    if (boundedText.startsWith("/") && !boundedText.includes(" ")) {
      setMenuFor(key);
      setQuery(boundedText.slice(1).toLowerCase());
    } else if (menuFor === key) {
      setMenuFor(null);
      setQuery("");
    }
  };

  const toggleTodo = (key: string) => {
    update(
      blocks.map((b) =>
        b.key === key ? { ...b, content: { ...b.content, checked: !b.content.checked } } : b,
      ),
    );
  };

  const convertBlock = (key: string, type: BlockType) => {
    update(blocks.map((b) => (b.key === key ? { ...b, type, content: { ...b.content, text: "" } } : b)));
    setMenuFor(null);
    setQuery("");
  };

  const insertAfter = (key: string | null, type: BlockType = "text") => {
    const fresh = newBlock(type);
    if (!key) {
      update([...blocks, fresh]);
      return;
    }
    const idx = blocks.findIndex((b) => b.key === key);
    const next = [...blocks];
    next.splice(idx + 1, 0, fresh);
    update(next);
  };

  const removeBlock = (key: string) => {
    const next = blocks.filter((b) => b.key !== key);
    update(next.length > 0 ? next : [newBlock()]);
  };

  const duplicateBlock = (key: string) => {
    const idx = blocks.findIndex((b) => b.key === key);
    if (idx === -1) return;
    const src = blocks[idx];
    const next = [...blocks];
    next.splice(idx + 1, 0, { ...newBlock(src.type), content: { ...src.content } });
    update(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>, block: Block, index: number) => {
    if (e.key === "Enter" && !e.shiftKey) {
      const text = blockText(block);
      if (menuFor === block.key) return; // enter selects from the menu
      e.preventDefault();
      // Continue lists naturally
      const continueTypes: BlockType[] = ["bulleted_list", "numbered_list", "todo"];
      const nextType = continueTypes.includes(block.type) && text.trim() ? block.type : "text";
      if (continueTypes.includes(block.type) && !text.trim()) {
        // Empty list item → convert back to paragraph
        update(blocks.map((b) => (b.key === block.key ? { ...b, type: "text" } : b)));
        return;
      }
      insertAfter(block.key, nextType);
      return;
    }

    if (e.key === "Backspace" && !blockText(block) && blocks.length > 1) {
      e.preventDefault();
      const prev = blocks[index - 1];
      removeBlock(block.key);
      if (prev) {
        const el = document.querySelector<HTMLElement>(`[data-block-key="${prev.key}"]`);
        el?.focus();
      }
      return;
    }

    if (e.key === "ArrowUp" && index > 0) {
      if (!blockText(block)) {
        e.preventDefault();
        document.querySelector<HTMLElement>(`[data-block-key="${blocks[index - 1].key}"]`)?.focus();
      }
    }

    if (e.key === "Escape") setMenuFor(null);
  };

  // Focus the newly created block after Enter.
  const lastKeyRef = useRef<string>("");
  useEffect(() => {
    const last = blocks[blocks.length - 1];
    if (last && lastKeyRef.current !== last.key && !blockText(last)) {
      lastKeyRef.current = last.key;
    }
  }, [blocks]);

  const filteredMenu = BLOCK_MENU.filter(
    (m) => !query || m.label.toLowerCase().includes(query) || m.type.includes(query),
  );

  return (
    <div className="space-y-0.5" ref={areaRef}>
      {blocks.map((block, index) => (
        <div
          key={block.key}
          className={`group relative -mx-1 px-1 rounded ${
            dragOverKey === block.key ? "border-t-2 border-blue-400" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverKey(block.key);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverKey(null);
            if (!dragKey || dragKey === block.key) return;
            const from = blocks.findIndex((b) => b.key === dragKey);
            const to = blocks.findIndex((b) => b.key === block.key);
            if (from === -1 || to === -1) return;
            const next = [...blocks];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            update(next);
            setDragKey(null);
          }}
        >
          {/* Block gutter: drag handle + add */}
          <div className="absolute -left-0.5 top-1.5 flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
            <button
              draggable
              onDragStart={() => setDragKey(block.key)}
              onDragEnd={() => setDragKey(null)}
              className="p-0.5 text-faint hover:text-primary cursor-grab active:cursor-grabbing"
              title="Geser blok"
              aria-label="Geser blok"
            >
              <GripVertical className="w-3 h-3" />
            </button>
          </div>

          <div className="flex items-start gap-1.5">
            <div className="flex-1 min-w-0">{renderBlock(block)}</div>
            <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity pt-0.5">
              <button
                onClick={() => duplicateBlock(block.key)}
                className="px-1 text-[10px] text-faint hover:text-primary"
                title="Duplikat blok"
                aria-label="Duplikat blok"
              >
                <Copy className="w-3 h-3" />
              </button>
              <button
                onClick={() => removeBlock(block.key)}
                className="p-0.5 text-faint hover:text-rose-600"
                title="Hapus blok"
                aria-label="Hapus blok"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Slash command menu */}
          {menuFor === block.key && filteredMenu.length > 0 && (
            <div className="absolute z-30 mt-1 left-0 w-64 max-h-72 overflow-y-auto scroll-thin bg-card border border-subtle rounded-lg shadow-lg p-1">
              <div className="text-[10px] text-faint px-2 py-1 uppercase tracking-wide">
                Blok dasar
              </div>
              {filteredMenu.map((m) => (
                <button
                  key={m.type}
                  onClick={() => convertBlock(block.key, m.type)}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-xs text-left hover:bg-white/5"
                >
                  <span className="text-faint">{m.icon}</span>
                  <span className="flex-1 text-primary">{m.label}</span>
                  <span className="text-[10px] text-faint">{m.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Trailing add button */}
      <button
        onClick={() => insertAfter(blocks[blocks.length - 1]?.key ?? null)}
        className="flex items-center gap-1.5 text-xs text-faint hover:text-primary mt-2 px-1 py-1 rounded"
      >
        <Plus className="w-3 h-3" /> Tambah blok
      </button>

      {onSave && (
        <div className="flex items-center gap-3 pt-4">
          <button
            onClick={() => onSave(blocks)}
            disabled={saving}
            className="px-3.5 py-1.5 text-xs rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Menyimpan..." : "Simpan Halaman"}
          </button>
          <span className="text-[10px] text-faint">
            {saving ? "Menyimpan..." : "Perubahan belum tersimpan otomatis"}
          </span>
        </div>
      )}

      {/* Hidden inputs get the keyboard handlers through renderBlock closures */}
      <input type="hidden" value={placeholder} readOnly />
      <span className="hidden">{placeholder}</span>
      {/* eslint-disable-next-line react/jsx-no-useless-fragment */}
      <>{/* handlers bound per block below */}</>
      <KeyboardBindings
        blocks={blocks}
        onKeyDown={handleKeyDown}
        setText={setText}
        toggleTodo={toggleTodo}
        menuFor={menuFor}
      />
    </div>
  );
}

/** Renders the visual frame for a block (the input is bound in KeyboardBindings). */
function renderBlock(block: Block) {
  const text = blockText(block);
  switch (block.type) {
    case "heading_1":
      return (
        <input
          data-block-key={block.key}
          data-block-input="1"
          maxLength={MAX_PAGE_BLOCK_TEXT_CHARS}
          defaultValue={text}
          placeholder="Heading 1"
          className="w-full bg-transparent outline-none text-2xl font-bold page-title text-primary placeholder:text-faint/60 py-1"
        />
      );
    case "heading_2":
      return (
        <input
          data-block-key={block.key}
          data-block-input="1"
          maxLength={MAX_PAGE_BLOCK_TEXT_CHARS}
          defaultValue={text}
          placeholder="Heading 2"
          className="w-full bg-transparent outline-none text-xl font-semibold page-title text-primary placeholder:text-faint/60 py-1"
        />
      );
    case "heading_3":
      return (
        <input
          data-block-key={block.key}
          data-block-input="1"
          maxLength={MAX_PAGE_BLOCK_TEXT_CHARS}
          defaultValue={text}
          placeholder="Heading 3"
          className="w-full bg-transparent outline-none text-base font-semibold text-primary placeholder:text-faint/60 py-1"
        />
      );
    case "bulleted_list":
      return (
        <div className="flex items-start gap-2">
          <span className="text-faint pt-1.5 text-xs">•</span>
          <input
            data-block-key={block.key}
            data-block-input="1"
            maxLength={MAX_PAGE_BLOCK_TEXT_CHARS}
            defaultValue={text}
            placeholder="List item"
            className="flex-1 bg-transparent outline-none text-sm text-primary placeholder:text-faint/60 py-1"
          />
        </div>
      );
    case "numbered_list":
      return (
        <div className="flex items-start gap-2">
          <span className="text-faint pt-1.5 text-xs">1.</span>
          <input
            data-block-key={block.key}
            data-block-input="1"
            maxLength={MAX_PAGE_BLOCK_TEXT_CHARS}
            defaultValue={text}
            placeholder="List item"
            className="flex-1 bg-transparent outline-none text-sm text-primary placeholder:text-faint/60 py-1"
          />
        </div>
      );
    case "todo":
      return (
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            data-block-key={block.key}
            data-block-todo="1"
            defaultChecked={!!block.content.checked}
            className="mt-1.5 rounded border-subtle accent-blue-600"
          />
          <input
            data-block-key={block.key}
            data-block-input="1"
            maxLength={MAX_PAGE_BLOCK_TEXT_CHARS}
            defaultValue={text}
            placeholder="To-do"
            className={`flex-1 bg-transparent outline-none text-sm py-1 placeholder:text-faint/60 ${
              block.content.checked ? "line-through text-faint" : "text-primary"
            }`}
          />
        </div>
      );
    case "quote":
      return (
        <div className="border-l-2 border-black/20 dark:border-white/20 pl-3">
          <input
            data-block-key={block.key}
            data-block-input="1"
            maxLength={MAX_PAGE_BLOCK_TEXT_CHARS}
            defaultValue={text}
            placeholder="Kutipan"
            className="w-full bg-transparent outline-none text-sm italic font-serif text-secondary placeholder:text-faint/60 py-1"
          />
        </div>
      );
    case "divider":
      return <hr className="border-t border-subtle my-3" />;
    case "code":
      return (
        <input
          data-block-key={block.key}
          data-block-input="1"
          maxLength={MAX_PAGE_BLOCK_TEXT_CHARS}
          defaultValue={text}
          placeholder="// kode"
          className="w-full bg-black/[0.04] dark:bg-white/[0.06] rounded-md px-3 py-2 outline-none text-xs font-mono text-primary placeholder:text-faint/60"
        />
      );
    case "callout":
      return (
        <div className="flex items-start gap-2 bg-blue-50/60 dark:bg-blue-950/30 rounded-md px-3 py-2">
          <ProjectIcon
            name={typeof block.content.icon === "string" ? block.content.icon : null}
            fallback="InfoCircle"
            className="w-4 h-4 text-blue-600 dark:text-blue-400"
          />
          <input
            data-block-key={block.key}
            data-block-input="1"
            maxLength={MAX_PAGE_BLOCK_TEXT_CHARS}
            defaultValue={text}
            placeholder="Callout"
            className="flex-1 bg-transparent outline-none text-sm text-primary placeholder:text-faint/60"
          />
        </div>
      );
    default:
      return (
        <input
          data-block-key={block.key}
          data-block-input="1"
          maxLength={MAX_PAGE_BLOCK_TEXT_CHARS}
          defaultValue={text}
          placeholder="Tulis sesuatu, atau tekan '/' untuk perintah..."
          className="w-full bg-transparent outline-none text-sm text-primary placeholder:text-faint/60 py-1 leading-relaxed"
        />
      );
  }
}

/**
 * Binds focus/blur/change/keydown listeners to rendered block inputs so that the
 * controlled-ish editor keeps working without re-rendering on every keystroke.
 */
function KeyboardBindings({
  blocks,
  onKeyDown,
  setText,
  toggleTodo,
  menuFor,
}: {
  blocks: Block[];
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>, block: Block, index: number) => void;
  setText: (key: string, text: string) => void;
  toggleTodo: (key: string) => void;
  menuFor: string | null;
}) {
  const blockRef = useRef(blocks);
  blockRef.current = blocks;
  const menuRef = useRef(menuFor);
  menuRef.current = menuFor;

  useEffect(() => {
    const area = document;
    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target?.dataset) return;
      if (target.dataset.blockInput === "1") {
        const key = (target as HTMLInputElement).dataset.blockKey;
        if (!key) return;
        const idx = blockRef.current.findIndex((b) => b.key === key);
        if (idx === -1) return;
        if (e.type === "input") setText(key, (target as HTMLInputElement).value);
        if (e.type === "keydown")
          onKeyDown(e as unknown as React.KeyboardEvent<HTMLElement>, blockRef.current[idx], idx);
      }
    };
    const types = ["input", "keydown"];
    for (const t of types) area.addEventListener(t, handler, true);
    return () => {
      for (const t of types) area.removeEventListener(t, handler, true);
    };
  }, [onKeyDown, setText]);

  // Sync todo checkboxes
  useEffect(() => {
    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target?.dataset?.blockTodo === "1") {
        const key = (target as HTMLInputElement).dataset.blockKey;
        if (key) toggleTodo(key);
      }
    };
    document.addEventListener("change", handler, true);
    return () => document.removeEventListener("change", handler, true);
  }, [toggleTodo]);

  // Flush a "/" block back to the latest server text when switching blocks
  useEffect(() => {
    for (const b of blocks) {
      const el = document.querySelector<HTMLInputElement>(`[data-block-key="${b.key}"]`);
      if (el && el.value !== blockText(b) && !el.dataset.focusedTick && menuRef.current !== b.key) {
        el.value = blockText(b);
      }
    }
  }, [blocks]);

  return null;
}
