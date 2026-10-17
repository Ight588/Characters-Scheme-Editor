"use client";

/* Верхняя панель: название схемы и главные кнопки (image 1) */

import React, { useEffect, useRef } from "react";
import { Undo2, Redo2, Plus, CreditCard, Settings, LocateFixed } from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import { TextFormatToolbar } from "./elements/TextElement";

function titleHasText(html: string): boolean {
  return html
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim().length > 0;
}

export function Toolbar() {
  const title = useEditor((s) => s.title);
  const setTitle = useEditor((s) => s.setTitle);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const past = useEditor((s) => s.past.length);
  const future = useEditor((s) => s.future.length);
  const openMenu = useEditor((s) => s.openMenu);
  const resetView = useEditor((s) => s.resetView);
  const toggleUiHidden = useEditor((s) => s.toggleUiHidden);
  const uiHidden = useEditor((s) => s.uiHidden);
  const setEditing = useEditor((s) => s.setEditing);
  const editing = useEditor((s) => s.editing);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const [titleEditWidth, setTitleEditWidth] = React.useState<number | null>(null);
  const [titleToolbarPosition, setTitleToolbarPosition] = React.useState<{
    left: number;
    top: number;
  } | null>(null);
  const isEditingTitle = editing?.id === "__title__";

  useEffect(() => {
    if (isEditingTitle && titleRef.current) {
      const element = titleRef.current;
      element.innerHTML = title;
      element.focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditingTitle, title]);

  const commitTitle = () => {
    if (!isEditingTitle) return;
    const html = (titleRef.current?.innerHTML ?? "").trim();
    const nextTitle = titleHasText(html) ? html : "";
    if (nextTitle !== title) setTitle(nextTitle);
    setEditing(null);
    setTitleEditWidth(null);
    setTitleToolbarPosition(null);
  };

  const openAddMenu = (e: React.MouseEvent) => {
    const btn = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const view = useEditor.getState().view;
    // центр вьюпорта в мировых координатах
    const world = { x: -view.x / view.scale, y: -view.y / view.scale };
    openMenu({
      type: "canvas",
      screen: { x: btn.left, y: btn.bottom + 8 },
      world,
      sub: null,
    });
  };

  const openSettingsMenu = (e: React.MouseEvent) => {
    const btn = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu({
      type: "settings",
      screen: { x: btn.right, y: btn.bottom + 8 },
      world: { x: 0, y: 0 },
      sub: null,
    });
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-40 flex flex-col items-stretch justify-between gap-0 no-select pointer-events-none p-4 sm:flex-row sm:flex-wrap sm:items-start sm:gap-2 sm:p-5 md:p-6">
      {/* Заголовок: на мобильных занимает всю ширину под кнопками */}
      <div className="order-2 mt-6 w-full min-w-0 flex-none pointer-events-auto sm:order-1 sm:mt-0 sm:w-auto sm:flex-1 sm:basis-[240px] sm:pr-[32px]">
        {isEditingTitle ? (
          <div
            key="title-editor"
            ref={titleRef}
            contentEditable
            suppressContentEditableWarning
            className="editable-active font-bold text-[19px] sm:text-[22px] leading-tight text-[var(--c-headings)] max-w-full border-b-2 border-[#9a7c5e]/60 pb-1 break-words"
            style={{ width: titleEditWidth ?? undefined, minWidth: titleEditWidth ?? undefined }}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                commitTitle();
              }
              if (e.key === "Escape") {
                setEditing(null);
                setTitleEditWidth(null);
                setTitleToolbarPosition(null);
              }
            }}
          />
        ) : (
          <div
            key="title-display"
            ref={titleRef}
            className="editable-hover w-full max-w-full break-words border-b-2 border-[#9a7c5e]/60 pb-1 font-bold text-[19px] leading-tight text-[var(--c-headings)] sm:w-fit sm:text-[22px]"
            title="Дважды нажмите, чтобы редактировать"
            onDoubleClick={() => {
              const bounds = titleRef.current?.getBoundingClientRect();
              setTitleEditWidth(bounds?.width ?? null);
              setTitleToolbarPosition(
                bounds ? { left: bounds.left, top: bounds.bottom + 8 } : null
              );
              setEditing({ id: "__title__", field: "title" });
            }}
          >
            {titleHasText(title) ? (
              <span dangerouslySetInnerHTML={{ __html: title }} />
            ) : (
              <span className="opacity-80">Введите название...</span>
            )}
          </div>
        )}
      </div>

      {isEditingTitle && titleToolbarPosition && (
        <TextFormatToolbar
          position="fixed"
          placement="below"
          left={titleToolbarPosition.left}
          top={titleToolbarPosition.top}
        />
      )}

      {/* Кнопки */}
      <div
        aria-hidden={uiHidden}
        className={`order-1 ml-auto flex w-full max-w-full flex-row flex-wrap items-center justify-end gap-1.5 sm:order-2 sm:w-auto sm:gap-2 ${
          uiHidden ? "invisible pointer-events-none" : "pointer-events-auto"
        }`}
      >
        <button
          className="btn-gen w-9 h-9 sm:w-10 sm:h-10 rounded-[8px] flex items-center justify-center shadow-sm"
          title="Отменить (Ctrl+Z)"
          onClick={undo}
          disabled={past === 0}
        >
          <Undo2 size={17} />
        </button>
        <button
          className="btn-gen w-9 h-9 sm:w-10 sm:h-10 rounded-[8px] flex items-center justify-center shadow-sm"
          title="Вернуть (Ctrl+Shift+Z)"
          onClick={redo}
          disabled={future === 0}
        >
          <Redo2 size={17} />
        </button>
        <button
          className="btn-gen w-9 h-9 sm:w-10 sm:h-10 rounded-[8px] flex items-center justify-center shadow-sm"
          title="Вернуться к началу координат"
          onClick={resetView}
        >
          <LocateFixed size={17} />
        </button>
        <button
          className="btn-gen w-9 h-9 sm:w-10 sm:h-10 rounded-[8px] flex items-center justify-center shadow-sm"
          title="Добавить элемент"
          onClick={openAddMenu}
        >
          <Plus size={19} />
        </button>
        <button
          className="btn-gen w-9 h-9 sm:w-10 sm:h-10 rounded-[8px] flex items-center justify-center shadow-sm"
          title="Скрыть интерфейс"
          onClick={toggleUiHidden}
        >
          <CreditCard size={17} />
        </button>
        <button
          className="btn-gen w-9 h-9 sm:w-10 sm:h-10 rounded-[8px] flex items-center justify-center shadow-sm"
          title="Настройки"
          onClick={openSettingsMenu}
        >
          <Settings size={17} />
        </button>
      </div>
    </div>
  );
}

/* Плавающая кнопка возврата интерфейса */
export function RestoreUiButton() {
  const uiHidden = useEditor((s) => s.uiHidden);
  const toggleUiHidden = useEditor((s) => s.toggleUiHidden);
  if (!uiHidden) return null;
  return (
    <button
      className="btn-gen absolute z-40 w-9 h-9 rounded-[8px] flex items-center justify-center opacity-30 hover:opacity-100 transition-opacity"
      style={{ top: "var(--p-20)", right: "var(--p-24)" }}
      title="Показать интерфейс"
      onClick={toggleUiHidden}
    >
      <CreditCard size={17} />
    </button>
  );
}
