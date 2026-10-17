"use client";

/* Сборка всех меню и диалогов редактора */

import React, { useState } from "react";
import { toast } from "sonner";
import { useEditor, MenuState } from "@/lib/editor/store";
import {
  DEFAULT_STATUS_COLOR,
  CardElement,
  ArrowElement,
} from "@/lib/editor/types";
import { requestImageAt } from "@/lib/editor/filepicker";
import { ContextMenu, MenuIcons, MenuItem, useFileActions } from "./ContextMenu";
import { ColorPicker } from "./ColorPicker";
import { ArrowStylePanel, CanvasBgPanel } from "./Panels";
import { exportCanvasAsImage, exportWorkingFile } from "@/lib/editor/exporters";

/* ---------------- Элементы меню холста ---------------- */

function useCanvasItems(menu: MenuState): MenuItem[] {
  const clipboard = useEditor((s) => s.clipboard);
  const addCardAt = useEditor((s) => s.addCardAt);
  const addArrowAt = useEditor((s) => s.addArrowAt);
  const addTextAt = useEditor((s) => s.addTextAt);
  const pasteAt = useEditor((s) => s.pasteAt);
  const openPanel = useEditor((s) => s.openPanel);
  const clearCanvas = useEditor((s) => s.clearCanvas);

  const items: MenuItem[] = [];
  if (clipboard) {
    items.push({
      label: "Вставить сюда",
      icon: MenuIcons.copy,
      action: () => pasteAt(menu.world),
    });
  }
  items.push(
    {
      label: "Добавить карточку",
      icon: MenuIcons.users,
      action: () => addCardAt(menu.world),
    },
    {
      label: "Добавить стрелку",
      icon: MenuIcons.arrow,
      action: () => addArrowAt(menu.world),
    },
    {
      label: "Добавить изображение",
      icon: MenuIcons.image,
      action: () => requestImageAt(menu.world),
    },
    {
      label: "Добавить текст",
      icon: MenuIcons.text,
      action: () => addTextAt(menu.world),
    },
    {
      label: "Изменить фон холста",
      icon: MenuIcons.paint,
      action: () => openPanel({ type: "canvas-bg", screen: menu.screen }),
    },
    {
      label: "Очистить холст",
      icon: MenuIcons.clear,
      warn: true,
      action: () => clearCanvas(),
    }
  );
  return items;
}

/* ---------------- Элементы меню карточки ---------------- */

function useCardItems(menu: MenuState): MenuItem[] {
  const elements = useEditor((s) => s.elements);
  const toggleCollapse = useEditor((s) => s.toggleCollapse);
  const duplicateElement = useEditor((s) => s.duplicateElement);
  const copyCard = useEditor((s) => s.copyCard);
  const removeElement = useEditor((s) => s.removeElement);
  const updateElement = useEditor((s) => s.updateElement);
  const ungroupCard = useEditor((s) => s.ungroupCard);

  const card = menu.elementId ? (elements[menu.elementId] as CardElement | undefined) : undefined;
  if (!card) return [];

  const otherCards = Object.values(elements).filter(
    (el) => el.kind === "card" && el.id !== card.id
  ).length;
  const hasLinks = Object.values(elements).some(
    (element) =>
      element.kind === "arrow" &&
      ((element.fromCard === card.id &&
        Boolean(element.toCard && elements[element.toCard]?.kind === "card")) ||
        (element.toCard === card.id &&
          Boolean(element.fromCard && elements[element.fromCard]?.kind === "card")))
  );

  const items: MenuItem[] = [];
  if (!card.status) {
    items.push({
      label: "Добавить статус",
      icon: MenuIcons.palette,
      action: () =>
        updateElement(card.id, { status: { text: "Статус", color: DEFAULT_STATUS_COLOR } }),
    });
  }
  items.push(
    {
      label: "Связать с...",
      icon: MenuIcons.link,
      sub: "link" as const,
      subTitle: "Список карточек",
      disabled: otherCards === 0,
    },
    {
      label: "Сгруппировать с...",
      icon: MenuIcons.group,
      sub: "group" as const,
      subTitle: "Список карточек",
      disabled: otherCards === 0,
    }
  );
  if (card.groupId) {
    items.push({
      label: "Разгруппировать",
      icon: MenuIcons.unlink,
      action: () => ungroupCard(card.id),
    });
  }
  items.push(
    {
      label: "Скопировать",
      icon: MenuIcons.copy,
      action: () => copyCard(card.id),
    },
    {
      label: "Дублировать",
      icon: MenuIcons.duplicate,
      action: () => duplicateElement(card.id),
    },
    {
      label: card.collapsed ? "Развернуть" : "Свернуть",
      icon: card.collapsed ? MenuIcons.expand : MenuIcons.collapse,
      action: () => toggleCollapse(card.id),
    }
  );
  if (hasLinks) {
    items.push({
      label: "Отвязать от...",
      icon: MenuIcons.unlink,
      sub: "unlink" as const,
      subTitle: "Связанные карточки",
    });
  }
  items.push({
    label: "Удалить",
    icon: MenuIcons.delete,
    warn: true,
    action: () => removeElement(card.id),
  });
  return items;
}

/* ---------------- Элементы меню стрелки ---------------- */

function useArrowItems(menu: MenuState): MenuItem[] {
  const elements = useEditor((s) => s.elements);
  const openPanel = useEditor((s) => s.openPanel);
  const openMenu = useEditor((s) => s.openMenu);
  const setEditing = useEditor((s) => s.setEditing);
  const removeElement = useEditor((s) => s.removeElement);
  const saveArrowStyleFrom = useEditor((s) => s.saveArrowStyleFrom);

  const arrow = menu.elementId
    ? (elements[menu.elementId] as ArrowElement | undefined)
    : undefined;
  if (!arrow) return [];

  return [
    {
      label: arrow.label ? "Редактировать описание" : "Добавить описание",
      icon: MenuIcons.text,
      action: () => {
        openMenu(null);
        setEditing({ id: arrow.id, field: "label" });
      },
    },
    {
      label: "Изменить стиль",
      icon: MenuIcons.paint,
      action: () => openPanel({ type: "arrow-style", id: arrow.id, screen: menu.screen }),
    },
    {
      label: "Сохранять стиль",
      icon: MenuIcons.save,
      action: () => {
        saveArrowStyleFrom(arrow.id);
      },
    },
    {
      label: "Открыть сохранённые",
      icon: MenuIcons.open,
      sub: "styles" as const,
      subTitle: "Список стилей",
      action: () => openMenu({ ...menu, sub: "styles", subTitle: "Список стилей" }),
    },
    {
      label: "Удалить",
      icon: MenuIcons.delete,
      warn: true,
      action: () => removeElement(arrow.id),
    },
  ];
}

/* ---------------- Элементы меню статуса ---------------- */

function useStatusItems(menu: MenuState): MenuItem[] {
  const elements = useEditor((s) => s.elements);
  const openMenu = useEditor((s) => s.openMenu);
  const updateElement = useEditor((s) => s.updateElement);
  const saveStatusFromCard = useEditor((s) => s.saveStatusFromCard);

  const card = menu.elementId ? (elements[menu.elementId] as CardElement | undefined) : undefined;
  if (!card || !card.status) return [];

  return [
    {
      label: "Изменить цвет",
      icon: MenuIcons.palette,
      action: () => openMenu({ ...menu, sub: "status-color" }),
    },
    {
      label: "Сохранять статус",
      icon: MenuIcons.save,
      action: () => saveStatusFromCard(card.id),
    },
    {
      label: "Открыть сохранённые",
      icon: MenuIcons.open,
      sub: "statuses" as const,
      subTitle: "Список статусов",
      action: () => openMenu({ ...menu, sub: "statuses", subTitle: "Список статусов" }),
    },
    {
      label: "Удалить статус",
      icon: MenuIcons.delete,
      warn: true,
      action: () => updateElement(card.id, { status: null }),
    },
  ];
}

/* ---------------- Меню настроек ---------------- */

function useSettingsItems(menu: MenuState): MenuItem[] {
  const { saveFile, openFile, share } = useFileActions();
  const expandAllCards = useEditor((s) => s.expandAllCards);
  const collapseAllCards = useEditor((s) => s.collapseAllCards);
  const openPanel = useEditor((s) => s.openPanel);
  const clearCanvas = useEditor((s) => s.clearCanvas);
  const clearAllData = useEditor((s) => s.clearAllData);
  void menu;

  return [
    { label: "Сохранить файл...", icon: MenuIcons.save, action: saveFile },
    { label: "Открыть файл...", icon: MenuIcons.open, action: openFile },
    { label: "Развернуть все карточки", icon: MenuIcons.expand, action: expandAllCards },
    { label: "Свернуть все карточки", icon: MenuIcons.collapse, action: collapseAllCards },
    { label: "Поделиться холстом...", icon: MenuIcons.share, action: share },
    {
      label: "Изменить фон холста",
      icon: MenuIcons.paint,
      action: () => openPanel({ type: "canvas-bg", screen: menu.screen }),
    },
    { label: "Очистить холст", icon: MenuIcons.clear, warn: true, action: () => clearCanvas() },
    {
      label: "Очистить все данные",
      icon: MenuIcons.delete,
      warn: true,
      action: () => {
        clearAllData();
        toast.success("Все данные удалены");
      },
    },
  ];
}

/* ---------------- Меню изображения / текста ---------------- */

function useSimpleItems(menu: MenuState, kind: "image" | "text"): MenuItem[] {
  const duplicateElement = useEditor((s) => s.duplicateElement);
  const removeElement = useEditor((s) => s.removeElement);
  const setEditing = useEditor((s) => s.setEditing);
  void kind;
  return [
    ...(menu.type === "text"
      ? [
          {
            label: "Редактировать",
            icon: MenuIcons.text,
            action: () => {
              useEditor.getState().openMenu(null);
              setEditing({ id: menu.elementId!, field: "html" });
            },
          } as MenuItem,
        ]
      : []),
    {
      label: "Дублировать",
      icon: MenuIcons.duplicate,
      action: () => duplicateElement(menu.elementId!),
    },
    {
      label: "Удалить",
      icon: MenuIcons.delete,
      warn: true,
      action: () => removeElement(menu.elementId!),
    },
  ];
}

/* ---------------- Диалог «Поделиться холстом» ---------------- */

export function ShareDialog() {
  const shareOpen = useEditor((s) => s.shareOpen);
  const setShareOpen = useEditor((s) => s.setShareOpen);
  const [mode, setMode] = useState<"full" | "mini">("full");
  const [busy, setBusy] = useState<string | null>(null);

  if (!shareOpen) return null;

  const run = async (kind: "png" | "pdf" | "json") => {
    setBusy(kind);
    try {
      if (kind === "json") {
        exportWorkingFile();
        toast.success("Рабочий файл сохранён");
        setShareOpen(false);
      } else {
        await exportCanvasAsImage(mode, kind);
        toast.success(kind === "png" ? "Изображение PNG сохранено" : "PDF сохранён");
        setShareOpen(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/25"
      onPointerDown={() => setShareOpen(false)}
    >
      <div
        className="export-dialog w-[380px] no-select"
        style={{ padding: "var(--p-20)" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[16px] text-[var(--c-headings)]">Поделиться холстом</h2>
          <button
            className="w-7 h-7 rounded-[4px] hover:bg-black/5 text-lg leading-none"
            onClick={() => setShareOpen(false)}
            title="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="text-[13px] mb-1 font-semibold">Режим</div>
        <div className="flex flex-col gap-1 mb-4">
          <label className="menu-item cursor-pointer">
            <input
              type="radio"
              name="export-mode"
              checked={mode === "full"}
              onChange={() => setMode("full")}
            />
            <span>С полным описанием</span>
          </label>
          <label className="menu-item cursor-pointer">
            <input
              type="radio"
              name="export-mode"
              checked={mode === "mini"}
              onChange={() => setMode("mini")}
            />
            <span>Мини-версия (свёрнутые карточки)</span>
          </label>
        </div>

        <div className="text-[13px] mb-1 font-semibold">Формат</div>
        <div className="flex flex-col gap-1">
          <button className="menu-item" onClick={() => run("png")} disabled={busy !== null}>
            {MenuIcons.image}
            <span className="flex-1 text-left">Изображение (PNG)</span>
            {busy === "png" && <span className="text-xs opacity-60">сохранение…</span>}
          </button>
          <button className="menu-item" onClick={() => run("pdf")} disabled={busy !== null}>
            {MenuIcons.share}
            <span className="flex-1 text-left">Документ (PDF)</span>
            {busy === "pdf" && <span className="text-xs opacity-60">сохранение…</span>}
          </button>
          <button className="menu-item" onClick={() => run("json")} disabled={busy !== null}>
            {MenuIcons.save}
            <span className="flex-1 text-left">Рабочий файл (JSON)</span>
            {busy === "json" && <span className="text-xs opacity-60">сохранение…</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Выбор цвета статуса ---------------- */

function StatusColorPicker({ menu }: { menu: MenuState }) {
  const elements = useEditor((s) => s.elements);
  const updateElement = useEditor((s) => s.updateElement);
  const openMenu = useEditor((s) => s.openMenu);
  const card = menu.elementId ? (elements[menu.elementId] as CardElement | undefined) : undefined;
  if (!card) return null;
  return (
    <ColorPicker
      variant="compact"
      value={card.status?.color ?? DEFAULT_STATUS_COLOR}
      position={menu.screen}
      onChange={(c) => {
        if (card.status) updateElement(card.id, { status: { ...card.status, color: c } });
      }}
      onClose={() => openMenu(null)}
    />
  );
}

/* ---------------- Точка сборки ---------------- */

export function MenusHost() {
  const menu = useEditor((s) => s.menu);
  const panel = useEditor((s) => s.panel);

  // все хуки вызываются безусловно — порядок стабилен
  const canvasItems = useCanvasItems(menu ?? { type: "canvas", screen: { x: 0, y: 0 }, world: { x: 0, y: 0 } });
  const cardItems = useCardItems(menu ?? { type: "card", screen: { x: 0, y: 0 }, world: { x: 0, y: 0 } });
  const arrowItems = useArrowItems(menu ?? { type: "arrow", screen: { x: 0, y: 0 }, world: { x: 0, y: 0 } });
  const statusItems = useStatusItems(menu ?? { type: "status", screen: { x: 0, y: 0 }, world: { x: 0, y: 0 } });
  const settingsItems = useSettingsItems(menu ?? { type: "settings", screen: { x: 0, y: 0 }, world: { x: 0, y: 0 } });
  const imageItems = useSimpleItems(menu ?? { type: "image", screen: { x: 0, y: 0 }, world: { x: 0, y: 0 } }, "image");
  const textItems = useSimpleItems(menu ?? { type: "text", screen: { x: 0, y: 0 }, world: { x: 0, y: 0 } }, "text");

  const panels = (
    <>
      {panel?.type === "arrow-style" && <ArrowStylePanel id={panel.id} screen={panel.screen} />}
      {panel?.type === "canvas-bg" && <CanvasBgPanel screen={panel.screen} />}
      <ShareDialog />
    </>
  );

  if (!menu) return panels;

  // подменю выбора цвета статуса
  if (menu.type === "status" && menu.sub === "status-color") {
    return (
      <>
        <StatusColorPicker menu={menu} />
        {panels}
      </>
    );
  }

  let items: MenuItem[] = [];
  if (menu.type === "canvas") items = canvasItems;
  else if (menu.type === "card") items = cardItems;
  else if (menu.type === "arrow") items = arrowItems;
  else if (menu.type === "status") items = statusItems;
  else if (menu.type === "settings") items = settingsItems;
  else if (menu.type === "image") items = imageItems;
  else if (menu.type === "text") items = textItems;

  return (
    <>
      <ContextMenu
        key={`${menu.type}-${menu.screen.x}-${menu.screen.y}-${menu.sub ?? ""}`}
        state={menu}
        items={items}
      />
      {panels}
    </>
  );
}
