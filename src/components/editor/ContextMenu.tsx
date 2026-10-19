"use client";

/* Контекстное меню и панели в стиле UI-kit */

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Link2,
  Group,
  Copy,
  CopyPlus,
  ChevronsDownUp,
  Unlink2,
  Trash2,
  ImagePlus,
  ArrowRight,
  Type,
  PaintBucket,
  Save,
  FolderOpen,
  ChevronsUpDown,
  Users,
  Palette,
  FileDown,
  Eraser,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useEditor, MenuState } from "@/lib/editor/store";
import { designPixels } from "@/lib/editor/design";
import { requestOpenFile } from "@/lib/editor/filepicker";
import { exportWorkingFile } from "@/lib/editor/exporters";

function richTextToPlainText(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<\/li\s*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

export type MenuItem = {
  label: string;
  icon?: React.ReactNode;
  warn?: boolean;
  action?: () => void;
  sub?: "cards" | "statuses" | "styles" | "link" | "group" | "unlink";
  subTitle?: string;
  disabled?: boolean;
};

/* ---------------------- Иконки пунктов ---------------------- */

export const MenuIcons = {
  link: <Link2 className="menu-icon" />,
  group: <Group className="menu-icon" />,
  copy: <Copy className="menu-icon" />,
  duplicate: <CopyPlus className="menu-icon" />,
  collapse: <ChevronsDownUp className="menu-icon" />,
  expand: <ChevronsUpDown className="menu-icon" />,
  unlink: <Unlink2 className="menu-icon" />,
  delete: <Trash2 className="menu-icon" />,
  image: <ImagePlus className="menu-icon" />,
  arrow: <ArrowRight className="menu-icon" />,
  text: <Type className="menu-icon" />,
  paint: <PaintBucket className="menu-icon" />,
  save: <Save className="menu-icon" />,
  open: <FolderOpen className="menu-icon" />,
  users: <Users className="menu-icon" />,
  palette: <Palette className="menu-icon" />,
  share: <FileDown className="menu-icon" />,
  clear: <Eraser className="menu-icon" />,
  reset: <RotateCcw className="menu-icon" />,
  plus: <Plus className="menu-icon" />,
};

/* ---------------------- Контейнер меню ---------------------- */

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return ref;
}

function clampToViewport(x: number, y: number, w: number, h: number): Point2 {
  const pad = designPixels("--p-8");
  return {
    x: Math.min(Math.max(x, pad), window.innerWidth - w - pad),
    y: Math.min(Math.max(y, pad), window.innerHeight - h - pad),
  };
}

type Point2 = { x: number; y: number };

/* ---------------------- Меню ---------------------- */

export function ContextMenu({
  state,
  items,
}: {
  state: MenuState;
  items: MenuItem[];
}) {
  const openMenu = useEditor((s) => s.openMenu);
  const ref = useOutsideClose(() => openMenu(null));
  const [pos, setPos] = React.useState<Point2>({ x: state.screen.x, y: state.screen.y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const clamped = clampToViewport(state.screen.x, state.screen.y, r.width, r.height);
    if (clamped.x !== pos.x || clamped.y !== pos.y) setPos(clamped);
     
  }, []);

  const sub = state.sub;
  const subItems =
    sub === "link" || sub === "group" || sub === "unlink" || sub === "cards"
      ? "cards"
      : sub === "statuses"
        ? "statuses"
        : sub === "styles"
          ? "styles"
          : null;

  return createPortal(
    <div
      ref={ref}
      className="editor-menu context-menu"
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 1000 }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {subItems === "statuses" && <StatusesList state={state} />}
      {subItems === "styles" && <StylesList state={state} />}
      {subItems === "cards" && <CardsList state={state} items={items} />}
      {!subItems && (
        <div className="flex flex-col gap-[var(--cards-rel-stroke)]">
          {items.map((item, i) =>
            item.sub ? (
              <button
                key={i}
                className={`menu-item ${item.warn ? "menu-item--warn" : ""}`}
                onClick={() =>
                  openMenu({ ...state, sub: item.sub, subTitle: item.subTitle })
                }
                disabled={item.disabled}
              >
                {item.icon}
                <span className="flex-1 truncate">{item.label}</span>
                <span className="text-[var(--cards-age)] opacity-50">▸</span>
              </button>
            ) : (
              <button
                key={i}
                className={`menu-item ${item.warn ? "menu-item--warn" : ""}`}
                onClick={item.action}
                disabled={item.disabled}
                style={item.disabled ? { opacity: 0.4 } : undefined}
              >
                {item.icon}
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>,
    document.body
  );
}

/* ---------------- Списки выбора (подменю) ---------------- */

function BackRow({ title }: { title: string }) {
  const openMenu = useEditor((s) => s.openMenu);
  const menu = useEditor((s) => s.menu);
  return (
    <button
      className="menu-item mb-[var(--p-4)]"
      onClick={() => menu && openMenu({ ...menu, sub: null, subTitle: undefined })}
    >
      <span className="text-[var(--cards-age)]">◀</span>
      <span className="font-[var(--font-weight-bold-small)] text-[calc(var(--cards-age)+var(--cards-rel-stroke))]">{title}</span>
    </button>
  );
}

function CardsList({ state, items }: { state: MenuState; items: MenuItem[] }) {
  const elements = useEditor((s) => s.elements);
  const order = useEditor((s) => s.order);
  const linkCards = useEditor((s) => s.linkCards);
  const groupCards = useEditor((s) => s.groupCards);
  const unlinkCards = useEditor((s) => s.unlinkCards);
  const openMenu = useEditor((s) => s.openMenu);

  const cards = order
    .map((id) => elements[id])
    .filter((el): el is import("@/lib/editor/types").CardElement => el?.kind === "card");
  const visibleCards =
    state.sub === "unlink" && state.elementId
      ? cards.filter((card) =>
          Object.values(elements).some(
            (element) =>
              element.kind === "arrow" &&
              ((element.fromCard === state.elementId && element.toCard === card.id) ||
                (element.toCard === state.elementId && element.fromCard === card.id))
          )
        )
      : cards;

  const back = () => openMenu({ ...state, sub: null, subTitle: undefined });

  return (
    <div>
      <BackRow title={state.subTitle ?? "Список карточек"} />
      {visibleCards.length === 0 && (
        <div className="px-[var(--p-8)] py-[var(--p-12)] text-[calc(var(--cards-age)+var(--cards-rel-stroke))] opacity-60">Нет других карточек</div>
      )}
      {visibleCards.map((card, i) => {
        if (state.elementId === card.id && state.sub !== "unlink") return null;
        return (
          <button
            key={card.id}
            className="menu-list-item truncate"
            style={{ borderBottom: i === visibleCards.length - 1 ? "none" : undefined }}
            onClick={() => {
              if (!state.elementId) return;
              if (state.sub === "link") linkCards(state.elementId, card.id);
              else if (state.sub === "group") groupCards(state.elementId, card.id);
              else if (state.sub === "unlink") unlinkCards(state.elementId, card.id);
              else back();
            }}
            title={card.name || "Без имени"}
          >
            {i + 1}. {card.name || "Без имени"}
          </button>
        );
      })}
      {items && null}
    </div>
  );
}

function StatusesList({ state }: { state: MenuState }) {
  const savedStatuses = useEditor((s) => s.savedStatuses);
  const applySavedStatus = useEditor((s) => s.applySavedStatus);
  const deleteSavedStatus = useEditor((s) => s.deleteSavedStatus);
  return (
    <div>
      <BackRow title={state.subTitle ?? "Список статусов"} />
      {savedStatuses.length === 0 && (
        <div className="px-[var(--p-8)] py-[var(--p-12)] text-[calc(var(--cards-age)+var(--cards-rel-stroke))] opacity-60">Пока нет сохранённых статусов</div>
      )}
      {savedStatuses.map((item, i) => (
        <div key={item.id} className="flex items-center gap-[var(--p-4)]">
          <button
            className="menu-list-item flex-1 truncate"
            style={{ borderBottom: i === savedStatuses.length - 1 ? "none" : undefined }}
            onClick={() => state.elementId && applySavedStatus(state.elementId, item.id)}
          >
            {i + 1}. {richTextToPlainText(item.text) || "Статус"}
          </button>
          <button
            className="menu-item--warn p-[var(--p-6)] rounded-[var(--menus-radius)] hover:bg-[var(--c-hover)]"
            title="Удалить из сохранённых"
            onClick={() => deleteSavedStatus(item.id)}
          >
            {MenuIcons.delete}
          </button>
        </div>
      ))}
    </div>
  );
}

function StylesList({ state }: { state: MenuState }) {
  const savedArrowStyles = useEditor((s) => s.savedArrowStyles);
  const applySavedArrowStyle = useEditor((s) => s.applySavedArrowStyle);
  const deleteSavedArrowStyle = useEditor((s) => s.deleteSavedArrowStyle);
  return (
    <div>
      <BackRow title={state.subTitle ?? "Список стилей"} />
      {savedArrowStyles.length === 0 && (
        <div className="px-[var(--p-8)] py-[var(--p-12)] text-[calc(var(--cards-age)+var(--cards-rel-stroke))] opacity-60">Пока нет сохранённых стилей</div>
      )}
      {savedArrowStyles.map((item, i) => (
        <div key={item.id} className="flex items-center gap-[var(--p-4)]">
          <button
            className="menu-list-item flex flex-1 items-center gap-[var(--p-8)] truncate"
            style={{ borderBottom: i === savedArrowStyles.length - 1 ? "none" : undefined }}
            onClick={() => state.elementId && applySavedArrowStyle(state.elementId, item.id)}
          >
            <svg className="style-preview" viewBox="0 0 26 10">
              <line
                x1="1"
                y1="5"
                x2="20"
                y2="5"
                stroke={item.color}
                strokeDasharray={item.lineStyle === "dashed" ? "5 4" : undefined}
              />
              {item.head !== "none" && item.ends !== "start" && item.ends !== "none" && (
                <polygon points="20,1.5 25,5 20,8.5" fill={item.color} />
              )}
              {item.head !== "none" && (item.ends === "both" || item.ends === "start") && (
                <polygon points="6,1.5 1,5 6,8.5" fill={item.color} />
              )}
            </svg>
            <span className="truncate">
              {i + 1}. {item.lineStyle === "dashed" ? "Пунктир" : "Обычная"}
            </span>
          </button>
          <button
            className="menu-item--warn p-[var(--p-6)] rounded-[var(--menus-radius)] hover:bg-[var(--c-hover)]"
            title="Удалить из сохранённых"
            onClick={() => deleteSavedArrowStyle(item.id)}
          >
            {MenuIcons.delete}
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Пункт «Сохранить файл…» и «Открыть файл…» ---------- */

export function useFileActions() {
  const openShare = useEditor((s) => s.setShareOpen);
  return {
    saveFile: () => {
      try {
        exportWorkingFile();
      } catch (e) {
        console.error(e);
      }
    },
    openFile: () => requestOpenFile(),
    share: () => openShare(true),
  };
}
