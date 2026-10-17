"use client";

/* Текстовый блок на холсте + мини-панель форматирования (B I U A ≡) */

import React, { useEffect, useRef } from "react";
import { Bold, Italic, Underline, Baseline, List } from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import { TextElement } from "@/lib/editor/types";
import { useElementDrag } from "./CardElement";
import { useElementRotation } from "./useElementRotation";

/* -------- Панель форматирования выделенного текста -------- */

export function TextFormatToolbar({
  top,
  left,
  position = "absolute",
  placement = "above",
}: {
  top: number;
  left: number;
  position?: "absolute" | "fixed";
  placement?: "above" | "below";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const selectionChanged = () => force();
    document.addEventListener("selectionchange", selectionChanged);
    return () => document.removeEventListener("selectionchange", selectionChanged);
  }, []);

  const command = (name: string, value?: string) => {
    document.execCommand(name, false, value);
    force();
  };

  const isActive = (name: string) => {
    try {
      return document.queryCommandState(name);
    } catch {
      return false;
    }
  };

  const buttonClass = (active: boolean) =>
    `w-7 h-7 rounded-[3px] flex items-center justify-center transition-colors ${
      active ? "bg-[#9a7c5e]/25 text-[#170500]" : "hover:bg-black/5 text-[#0b0a0a]"
    }`;

  return (
    <div
      ref={ref}
      data-text-format-toolbar
      className="editor-menu pointer-events-auto flex items-center gap-1"
      style={{
        position,
        left,
        top,
        padding: "4px",
        zIndex: 50,
        transform: placement === "above" ? "translateY(-110%)" : undefined,
      }}
      onPointerDown={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        className={buttonClass(isActive("bold"))}
        onPointerDown={(event) => {
          event.preventDefault();
          command("bold");
        }}
        title="Жирный"
      >
        <Bold size={14} />
      </button>
      <button
        className={buttonClass(isActive("italic"))}
        onPointerDown={(event) => {
          event.preventDefault();
          command("italic");
        }}
        title="Курсив"
      >
        <Italic size={14} />
      </button>
      <button
        className={buttonClass(isActive("underline"))}
        onPointerDown={(event) => {
          event.preventDefault();
          command("underline");
        }}
        title="Подчёркнутый"
      >
        <Underline size={14} />
      </button>
      <label
        className={`${buttonClass(isActive("foreColor"))} cursor-pointer relative`}
        title="Цвет текста"
      >
        <Baseline size={14} />
        <input
          type="color"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={(event) => command("foreColor", event.target.value)}
        />
      </label>
      <button
        className={buttonClass(isActive("insertUnorderedList"))}
        onPointerDown={(event) => {
          event.preventDefault();
          command("insertUnorderedList");
        }}
        title="Список"
      >
        <List size={14} />
      </button>
    </div>
  );
}

/* ----------------------- Текстовый блок ----------------------- */

export function TextView({ text, interactive }: { text: TextElement; interactive: boolean }) {
  const selectedId = useEditor((state) => state.selectedId);
  const select = useEditor((state) => state.select);
  const openMenu = useEditor((state) => state.openMenu);
  const setEditing = useEditor((state) => state.setEditing);
  const editing = useEditor((state) => state.editing);
  const setRect = useEditor((state) => state.setRect);
  const exportMode = useEditor((state) => state.exportMode);
  const { onPointerDown } = useElementDrag("move");
  const ref = useRef<HTMLDivElement | null>(null);
  const editRef = useRef<HTMLDivElement | null>(null);
  const resizeState = useRef<{
    pointerX: number;
    pointerY: number;
    centerX: number;
    centerY: number;
    distance: number;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    pushed: boolean;
  } | null>(null);
  const isEditing = editing?.id === text.id && editing.field === "html";
  const interactiveElement = interactive && !exportMode;
  const selected = selectedId === text.id;
  const showControls = interactiveElement && selected && !isEditing;
  const beginRotate = useElementRotation(text.id, text.rotation, ref, showControls);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setRect(text.id, element.offsetWidth, element.offsetHeight)
    );
    observer.observe(element);
    setRect(text.id, element.offsetWidth, element.offsetHeight);
    return () => observer.disconnect();
  }, [text.id, setRect]);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.innerHTML = text.html;
      editRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(editRef.current);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditing, text.html]);

  const dragMove = (dxWorld: number, dyWorld: number) => {
    const current = useEditor.getState().elements[text.id];
    if (current) {
      useEditor.getState().moveElement(text.id, current.x + dxWorld, current.y + dyWorld);
    }
  };

  const commit = () => {
    if (!isEditing) return;
    const html = editRef.current?.innerHTML ?? "";
    if (html !== text.html) {
      useEditor.getState().pushHistory();
      useEditor.getState().updateElement(text.id, { html });
    }
    setEditing(null);
  };

  const beginResize = (event: React.PointerEvent) => {
    if (!showControls || event.button !== 0 || !ref.current) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = ref.current.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    resizeState.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      centerX,
      centerY,
      distance: Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
      x: text.x,
      y: text.y,
      width: text.width,
      height: ref.current.offsetHeight,
      fontSize: text.fontSize,
      pushed: false,
    };

    const move = (moveEvent: PointerEvent) => {
      const state = resizeState.current;
      if (!state) return;
      if (
        !state.pushed &&
        Math.hypot(
          moveEvent.clientX - state.pointerX,
          moveEvent.clientY - state.pointerY
        ) > 3
      ) {
        useEditor.getState().pushHistory();
        state.pushed = true;
      }
      if (!state.pushed) return;

      const currentDistance = Math.hypot(
        moveEvent.clientX - state.centerX,
        moveEvent.clientY - state.centerY
      );
      const minScale = Math.max(40 / state.width, 6 / state.fontSize);
      const scale = Math.max(minScale, currentDistance / state.distance);
      const width = state.width * scale;
      const height = state.height * scale;
      useEditor.getState().updateElement(text.id, {
        x: state.x + (state.width - width) / 2,
        y: state.y + (state.height - height) / 2,
        width: Math.round(width * 10) / 10,
        fontSize: Math.round(state.fontSize * scale * 10) / 10,
      });
    };

    const end = () => {
      resizeState.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const showToolbar = isEditing && interactiveElement;

  return (
    <>
      {showToolbar && <TextFormatToolbar top={text.y - 6} left={text.x + 10} />}
      <div
        ref={ref}
        data-element-id={text.id}
        data-element-rotation={text.rotation}
        data-text-font-size={text.fontSize}
        className={`absolute top-0 left-0 no-select ${
          selected && interactiveElement && !isEditing
            ? "outline outline-[1.5px] outline-[#9a7c5e]/50 rounded-[3px]"
            : ""
        }`}
        style={{
          width: text.width,
          transform: `translate(${text.x}px, ${text.y}px) rotate(${text.rotation}deg)`,
          transformOrigin: "center",
          color: text.color,
          fontSize: text.fontSize,
        }}
        onPointerDown={(event) => {
          const activeEditing = useEditor.getState().editing;
          if (
            !interactiveElement ||
            event.button !== 0 ||
            (activeEditing?.id === text.id && activeEditing.field === "html")
          ) return;
          event.stopPropagation();
          select(text.id);
          onPointerDown(event, dragMove);
        }}
        onDoubleClick={(event) => {
          if (!interactiveElement) return;
          event.stopPropagation();
          setEditing({ id: text.id, field: "html" });
        }}
        onContextMenu={(event) => {
          if (!interactiveElement) return;
          event.preventDefault();
          event.stopPropagation();
          select(text.id);
          openMenu({
            type: "text",
            screen: { x: event.clientX, y: event.clientY },
            world: { x: 0, y: 0 },
            elementId: text.id,
          });
        }}
      >
        {isEditing ? (
          <div
            ref={editRef}
            contentEditable
            suppressContentEditableWarning
            className="editable-active leading-[1.45] min-h-[1.4em]"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            onBlur={commit}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") setEditing(null);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          />
        ) : (
          <div
            className="leading-[1.45] min-h-[1.4em]"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            dangerouslySetInnerHTML={{ __html: text.html }}
          />
        )}

        {showControls && (
          <>
            <div
              data-transform-handle="rotate"
              className="absolute left-1/2 -top-8 flex h-8 w-5 -translate-x-1/2 cursor-grab flex-col items-center active:cursor-grabbing"
              title="Повернуть текст"
              onPointerDown={beginRotate}
            >
              <span className="h-4 w-px bg-[#9a7c5e]" />
              <span className="h-4 w-4 rounded-full border-2 border-[#9a7c5e] bg-[var(--c-menus-bg)]" />
            </div>
            <div
              data-transform-handle="resize"
              className="absolute -right-1.5 -bottom-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-[#9a7c5e] bg-[var(--c-menus-bg)]"
              title="Масштабировать текст"
              onPointerDown={beginResize}
            />
          </>
        )}
      </div>
    </>
  );
}
