"use client";

/* Верхняя панель: название схемы и главные кнопки (image 1) */

import React, { useEffect, useRef } from "react";
import { Undo2, Redo2, Plus, CreditCard, Settings, LocateFixed } from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import { designPixels } from "@/lib/editor/design";
import { TextFormatToolbar } from "./TextFormatToolbar";

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
  const [titleEditMinWidth, setTitleEditMinWidth] = React.useState<number | null>(null);
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
    setTitleEditMinWidth(null);
    setTitleToolbarPosition(null);
  };

  const openAddMenu = (e: React.MouseEvent) => {
    const btn = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const view = useEditor.getState().view;
    // центр вьюпорта в мировых координатах
    const world = { x: -view.x / view.scale, y: -view.y / view.scale };
    openMenu({
      type: "canvas",
      screen: { x: btn.left, y: btn.bottom + designPixels("--p-8") },
      world,
      sub: null,
    });
  };

  const openSettingsMenu = (e: React.MouseEvent) => {
    const btn = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu({
      type: "settings",
      screen: { x: btn.right, y: btn.bottom + designPixels("--p-8") },
      world: { x: 0, y: 0 },
      sub: null,
    });
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-40 flex flex-col items-center justify-between gap-0 no-select pointer-events-none p-[var(--p-16)] sm:flex-row sm:flex-wrap sm:items-start sm:gap-[var(--p-8)] sm:p-[var(--p-20)] md:p-[var(--p-24)]">
      {/* Заголовок остаётся сверху на мобильных, кнопки закреплены у нижнего края экрана. */}
      <div className="order-1 mt-0 w-full min-w-0 flex-none pointer-events-auto text-center sm:order-1 sm:mt-0 sm:w-auto sm:flex-1 sm:basis-[calc(var(--cards-dec-width)-var(--comp-pad-hor)*2)] sm:pr-[calc(var(--comp-pad-hor)+var(--cards-rel-stroke))] sm:text-left">
        {isEditingTitle ? (
          <div
            key="title-editor"
            ref={titleRef}
            data-title-editor
            contentEditable
            suppressContentEditableWarning
            className="editor-title editable-active w-full sm:text-[calc(var(--cards-age)+var(--p-12))] max-w-full break-words text-center sm:w-fit sm:text-left"
            style={{ minWidth: titleEditMinWidth ?? undefined }}
            onBlur={(event) => {
              const next = event.relatedTarget as Element | null;
              if (next?.closest("[data-text-format-toolbar]")) return;
              commitTitle();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                commitTitle();
              }
              if (e.key === "Escape") {
                setEditing(null);
                setTitleEditMinWidth(null);
                setTitleToolbarPosition(null);
              }
            }}
          />
        ) : (
          <div
            key="title-display"
            ref={titleRef}
            data-title-display
            className="editor-title editable-hover w-full sm:text-[calc(var(--cards-age)+var(--p-12))] max-w-full break-words text-center sm:w-fit sm:text-left"
            title="Дважды нажмите, чтобы редактировать"
            onDoubleClick={() => {
              const bounds = titleRef.current?.getBoundingClientRect();
              setTitleEditMinWidth(bounds?.width ?? null);
              setTitleToolbarPosition(
                bounds
                  ? { left: bounds.left, top: bounds.bottom + designPixels("--p-8") }
                  : null
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
        className={`order-2 fixed bottom-[var(--p-16)] left-0 right-0 z-40 mx-auto flex w-full max-w-full flex-row flex-wrap items-center justify-center gap-[var(--p-6)] px-[var(--p-16)] sm:static sm:order-2 sm:z-auto sm:ml-auto sm:mr-0 sm:w-auto sm:px-0 sm:justify-end sm:gap-[var(--p-8)] ${
          uiHidden ? "invisible pointer-events-none" : "pointer-events-auto"
        }`}
      >
        <button
          className="btn-gen toolbar-button sm:h-[calc(var(--comp-pad-vert)*2)] sm:w-[calc(var(--comp-pad-vert)*2)]"
          title="Отменить (Ctrl+Z)"
          onClick={undo}
          disabled={past === 0}
        >
          <Undo2 />
        </button>
        <button
          className="btn-gen toolbar-button sm:h-[calc(var(--comp-pad-vert)*2)] sm:w-[calc(var(--comp-pad-vert)*2)]"
          title="Вернуть (Ctrl+Shift+Z)"
          onClick={redo}
          disabled={future === 0}
        >
          <Redo2 />
        </button>
        <button
          className="btn-gen toolbar-button sm:h-[calc(var(--comp-pad-vert)*2)] sm:w-[calc(var(--comp-pad-vert)*2)]"
          title="Вернуться к началу координат"
          onClick={resetView}
        >
          <LocateFixed />
        </button>
        <button
          className="btn-gen toolbar-button sm:h-[calc(var(--comp-pad-vert)*2)] sm:w-[calc(var(--comp-pad-vert)*2)]"
          title="Добавить элемент"
          onClick={openAddMenu}
        >
          <Plus />
        </button>
        <button
          className="btn-gen toolbar-button sm:h-[calc(var(--comp-pad-vert)*2)] sm:w-[calc(var(--comp-pad-vert)*2)]"
          title="Скрыть интерфейс"
          onClick={toggleUiHidden}
        >
          <CreditCard />
        </button>
        <button
          className="btn-gen toolbar-button sm:h-[calc(var(--comp-pad-vert)*2)] sm:w-[calc(var(--comp-pad-vert)*2)]"
          title="Настройки"
          onClick={openSettingsMenu}
        >
          <Settings />
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
      className="btn-gen restore-ui-button"
      style={{ top: "var(--p-20)", right: "var(--p-24)" }}
      title="Показать интерфейс"
      onClick={toggleUiHidden}
    >
      <CreditCard />
    </button>
  );
}
