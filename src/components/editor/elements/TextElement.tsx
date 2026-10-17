"use client";

/* Текстовый блок на холсте + мини-панель форматирования (B I U A ≡) */

import React, { useEffect, useRef } from "react";
import { useEditor } from "@/lib/editor/store";
import { designPixels } from "@/lib/editor/design";
import { TextElement } from "@/lib/editor/types";
import { TextFormatToolbar } from "../TextFormatToolbar";
import { useElementDrag } from "./CardElement";
import { useElementRotation } from "./useElementRotation";

/* ----------------------- Текстовый блок ----------------------- */

export function TextView({ text, interactive }: { text: TextElement; interactive: boolean }) {
  const selectedId = useEditor((state) => state.selectedId);
  const selected = useEditor((state) => state.selectedIds.includes(text.id));
  const selectedCount = useEditor((state) => state.selectedIds.length);
  const groupSelected = useEditor((state) =>
    Boolean(
      text.groupId &&
        state.selectedIds.some((selectedElementId) =>
          state.elements[selectedElementId]?.groupId === text.groupId
        )
    )
  );
  const select = useEditor((state) => state.select);
  const toggleSelection = useEditor((state) => state.toggleSelection);
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
  const outlined = selected || groupSelected;
  const showControls =
    interactiveElement && selectedId === text.id && selectedCount === 1 && !isEditing;
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
      width: ref.current.offsetWidth,
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
      const minScale = Math.max(
        (designPixels("--p-20") * 2) / state.width,
        designPixels("--p-6") / state.fontSize
      );
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
        data-selected={selected || undefined}
        className={`absolute top-0 left-0 no-select ${
          outlined && interactiveElement && !isEditing
            ? "element-selection-outline text-selection-outline"
            : ""
        }`}
        style={{
          width: "max-content",
          maxWidth: text.width,
          minWidth: isEditing ? "var(--p-24)" : undefined,
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
          if (event.shiftKey) {
            toggleSelection(text.id);
            return;
          }
          if (!useEditor.getState().selectedIds.includes(text.id)) select(text.id);
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
          if (!useEditor.getState().selectedIds.includes(text.id)) select(text.id);
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
            className="canvas-text-content editable-active"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            onBlur={(event) => {
              const next = event.relatedTarget as Element | null;
              if (next?.closest("[data-text-format-toolbar]")) return;
              commit();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") setEditing(null);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          />
        ) : (
          <div
            className="canvas-text-content"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            dangerouslySetInnerHTML={{ __html: text.html }}
          />
        )}

        {showControls && (
          <>
            <div
              data-transform-handle="rotate"
              className="transform-rotate"
              title="Повернуть текст"
              onPointerDown={beginRotate}
            >
              <span className="transform-stem" />
              <span className="transform-knob" />
            </div>
            <div
              data-transform-handle="resize"
              className="transform-resize"
              title="Масштабировать текст"
              onPointerDown={beginResize}
            />
          </>
        )}
      </div>
    </>
  );
}
