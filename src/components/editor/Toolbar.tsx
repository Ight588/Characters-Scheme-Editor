"use client";

/* Верхняя панель: название схемы и главные кнопки (image 1) */

import React, { useEffect, useRef } from "react";
import { Undo2, Redo2, Plus, CreditCard, Settings, LocateFixed } from "lucide-react";
import { useEditor } from "@/lib/editor/store";

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
  const isEditingTitle = editing?.id === "__title__";

  useEffect(() => {
    if (isEditingTitle && titleRef.current) {
      const el = titleRef.current;
      el.textContent = title;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
     
  }, [isEditingTitle]);

  const commitTitle = () => {
    if (!isEditingTitle) return;
    const text = (titleRef.current?.textContent ?? "").trim();
    if (text !== title) setTitle(text);
    setEditing(null);
    setTitleEditWidth(null);
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
    <div className="absolute top-0 left-0 right-0 z-40 flex flex-row flex-wrap items-start justify-between gap-2 no-select pointer-events-none p-4 sm:p-5 md:p-6">
      {/* Заголовок */}
      <div className="pointer-events-auto min-w-0 flex-1 basis-[240px] pr-[32px]">
        {isEditingTitle ? (
          <div
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
              }
            }}
          />
        ) : (
          <div
            ref={titleRef}
            className="editable-hover font-bold text-[19px] sm:text-[22px] leading-tight text-[var(--c-headings)] border-b-2 border-[#9a7c5e]/60 pb-1 w-fit max-w-full break-words"
            title="Дважды нажмите, чтобы редактировать"
            onDoubleClick={() => {
              setTitleEditWidth(titleRef.current?.getBoundingClientRect().width ?? null);
              setEditing({ id: "__title__", field: "title" });
            }}
          >
            {title || <span className="opacity-80">Введите название...</span>}
          </div>
        )}
      </div>

      {/* Кнопки */}
      <div
        aria-hidden={uiHidden}
        className={`ml-auto flex max-w-full flex-row flex-wrap items-center justify-end gap-1.5 sm:gap-2 ${
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
