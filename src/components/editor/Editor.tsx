"use client";

/* Корневой компонент редактора: гидрация, автосохранение, горячие клавиши */

import React, { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useEditor, getPersistedSlice } from "@/lib/editor/store";
import { loadFromStorage, saveToStorage, parseWorkingFile, readTextFile } from "@/lib/editor/storage";
import { compressToWebp, compressAvatarWebp } from "@/lib/editor/image";
import { registerFilePicker } from "@/lib/editor/filepicker";
import { Canvas } from "./Canvas";
import { Toolbar, RestoreUiButton } from "./Toolbar";
import { MenusHost } from "./Menus";

const AUTOSAVE_DELAY = 600;

export default function Editor() {
  const hydrated = useEditor((s) => s.hydrated);
  const exportMode = useEditor((s) => s.exportMode);
  const hydrate = useEditor((s) => s.hydrate);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bgInputRef = useRef<HTMLInputElement | null>(null);
  const openInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImagePos = useRef<{ x: number; y: number } | null>(null);
  const pendingAvatarCard = useRef<string | null>(null);

  /* ---- гидрация из хранилища браузера ---- */
  useEffect(() => {
    // отладочный доступ для тестов
    (window as unknown as { __editor: typeof useEditor }).__editor = useEditor;
    let cancelled = false;
    loadFromStorage()
      .then((data) => {
        if (!cancelled) hydrate(data);
      })
      .catch(() => {
        if (!cancelled) hydrate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  /* ---- автосохранение ---- */
  useEffect(() => {
    if (!hydrated) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useEditor.subscribe((state) => {
      if (!state.hydrated || state.exportMode) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveToStorage(getPersistedSlice(useEditor.getState())).catch(() => {});
      }, AUTOSAVE_DELAY);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [hydrated]);

  /* ---- файловые диалоги ---- */
  useEffect(() => {
    const unregister = registerFilePicker((req) => {
      if (req.kind === "image") {
        pendingImagePos.current = req.world;
        imageInputRef.current?.click();
      } else if (req.kind === "avatar") {
        pendingAvatarCard.current = req.cardId;
        avatarInputRef.current?.click();
      } else if (req.kind === "bg") {
        bgInputRef.current?.click();
      } else if (req.kind === "open") {
        openInputRef.current?.click();
      }
    });
    return unregister;
  }, []);

  const handleImageFile = async (file: File | undefined, target: "canvas" | "avatar" | "bg") => {
    if (!file) return;
    try {
      if (target === "avatar") {
        const cardId = pendingAvatarCard.current;
        if (!cardId) return;
        const { src } = await compressAvatarWebp(file);
        useEditor.getState().pushHistory();
        useEditor.getState().updateElement(cardId, { avatar: src });
        pendingAvatarCard.current = null;
      } else if (target === "bg") {
        const { src } = await compressToWebp(file, 1600, 0.82);
        useEditor.getState().pushHistory();
        useEditor.getState().setSettings({ bgImage: src, bgOpacity: 100 });
      } else {
        const { src, w, h } = await compressToWebp(file, 1600, 0.85);
        const world =
          pendingImagePos.current ??
          (() => {
            const view = useEditor.getState().view;
            return { x: -view.x / view.scale, y: -view.y / view.scale };
          })();
        // масштабируем к разумному размеру на холсте
        const maxWorld = 360;
        const scale = Math.min(1, maxWorld / Math.max(w, h));
        useEditor.getState().addImageAt(world, src, Math.round(w * scale), Math.round(h * scale));
        pendingImagePos.current = null;
      }
      toast.success("Изображение добавлено (WEBP)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось обработать изображение");
    }
  };

  const handleOpenFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await readTextFile(file);
      const data = parseWorkingFile(text);
      useEditor.getState().loadFromFile(data);
      toast.success("Рабочий файл загружен");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось открыть файл");
    }
  };

  /* ---- горячие клавиши ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const state = useEditor.getState();
      if (state.exportMode) return;
      const target = e.target as HTMLElement;
      const typing =
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        state.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        state.redo();
      } else if (!typing && (e.key === "Delete" || e.key === "Backspace")) {
        if (state.selectedId) {
          e.preventDefault();
          state.removeElement(state.selectedId);
        }
      } else if (e.key === "Escape") {
        if (state.menu || state.panel) {
          state.openMenu(null);
          state.openPanel(null);
        } else if (state.editing) {
          state.setEditing(null);
        } else if (state.shareOpen) {
          state.setShareOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="editor-root fixed inset-0 overflow-hidden">
      <Canvas />
      <Toolbar />
      <RestoreUiButton />
      {hydrated && <MenusHost />}

      {/* оверлей экспорта */}
      {exportMode && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[var(--c-viewport-bg)]">
          <div className="text-center">
            <div className="font-bold text-[18px] text-[var(--c-headings)] mb-2">Сохранение...</div>
            <div className="text-[13px] opacity-60">Готовим холст к экспорту</div>
          </div>
        </div>
      )}

      {/* скрытые файловые input-ы */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleImageFile(e.target.files?.[0], "canvas");
          e.target.value = "";
        }}
      />
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleImageFile(e.target.files?.[0], "avatar");
          e.target.value = "";
        }}
      />
      <input
        ref={bgInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleImageFile(e.target.files?.[0], "bg");
          e.target.value = "";
        }}
      />
      <input
        ref={openInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          handleOpenFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <Toaster position="bottom-center" richColors />
    </div>
  );
}
