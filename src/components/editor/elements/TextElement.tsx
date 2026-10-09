"use client";

/* Текстовый блок на холсте + мини-панель форматирования (B I U A ≡) */

import React, { useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  Underline,
  Baseline,
  List,
} from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import { TextElement } from "@/lib/editor/types";
import { useElementDrag } from "./CardElement";

/* -------- Панель форматирования выделенного текста -------- */

export function TextFormatToolbar({ top, left }: { top: number; left: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const sel = () => force();
    document.addEventListener("selectionchange", sel);
    return () => document.removeEventListener("selectionchange", sel);
  }, []);

  const cmd = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    force();
  };

  const isActive = (command: string) => {
    try {
      return document.queryCommandState(command);
    } catch {
      return false;
    }
  };

  const btn = (active: boolean) =>
    `w-7 h-7 rounded-[3px] flex items-center justify-center transition-colors ${
      active ? "bg-[#9a7c5e]/25 text-[#170500]" : "hover:bg-black/5 text-[#0b0a0a]"
    }`;

  return (
    <div
      ref={ref}
      className="editor-menu flex items-center gap-1"
      style={{ position: "absolute", left, top, padding: "4px", zIndex: 50, transform: "translateY(-110%)" }}
      onPointerDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button className={btn(isActive("bold"))} onMouseDown={(e) => { e.preventDefault(); cmd("bold"); }} title="Жирный">
        <Bold size={14} />
      </button>
      <button className={btn(isActive("italic"))} onMouseDown={(e) => { e.preventDefault(); cmd("italic"); }} title="Курсив">
        <Italic size={14} />
      </button>
      <button className={btn(isActive("underline"))} onMouseDown={(e) => { e.preventDefault(); cmd("underline"); }} title="Подчёркнутый">
        <Underline size={14} />
      </button>
      <label
        className={`${btn(isActive("foreColor"))} cursor-pointer relative`}
        title="Цвет текста"
      >
        <Baseline size={14} />
        <input
          type="color"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={(e) => cmd("foreColor", e.target.value)}
        />
      </label>
      <button className={btn(isActive("insertUnorderedList"))} onMouseDown={(e) => { e.preventDefault(); cmd("insertUnorderedList"); }} title="Список">
        <List size={14} />
      </button>
    </div>
  );
}

/* ----------------------- Текстовый блок ----------------------- */

export function TextView({ text, interactive }: { text: TextElement; interactive: boolean }) {
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const openMenu = useEditor((s) => s.openMenu);
  const setEditing = useEditor((s) => s.setEditing);
  const editing = useEditor((s) => s.editing);
  const setRect = useEditor((s) => s.setRect);
  const exportMode = useEditor((s) => s.exportMode);
  const { onPointerDown } = useElementDrag("move");
  const ref = useRef<HTMLDivElement | null>(null);
  const editRef = useRef<HTMLDivElement | null>(null);
  const isEditing = editing?.id === text.id && editing.field === "html";
  const interactiveEl = interactive && !exportMode;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRect(text.id, el.offsetWidth, el.offsetHeight));
    ro.observe(el);
    setRect(text.id, el.offsetWidth, el.offsetHeight);
    return () => ro.disconnect();
  }, [text.id, setRect]);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.innerHTML = text.html;
      editRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(editRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
     
  }, [isEditing]);

  const dragMove = (dxW: number, dyW: number) => {
    const cur = useEditor.getState().elements[text.id];
    if (cur) useEditor.getState().moveElement(text.id, cur.x + dxW, cur.y + dyW);
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

  const showToolbar = isEditing && interactiveEl;

  return (
    <>
      {showToolbar && (
        <TextFormatToolbar
          top={text.y - 6}
          left={text.x + 10}
        />
      )}
      <div
        ref={ref}
        data-element-id={text.id}
        className={`absolute top-0 left-0 no-select ${selectedId === text.id && interactiveEl && !isEditing ? "outline outline-[1.5px] outline-[#9a7c5e]/50 rounded-[3px]" : ""}`}
        style={{
          width: text.width,
          transform: `translate(${text.x}px, ${text.y}px)`,
          color: text.color,
        }}
        onPointerDown={(e) => {
          if (!interactiveEl || e.button !== 0 || isEditing) return;
          e.stopPropagation();
          select(text.id);
          onPointerDown(e, dragMove);
        }}
        onDoubleClick={(e) => {
          if (!interactiveEl) return;
          e.stopPropagation();
          useEditor.getState().pushHistory();
          setEditing({ id: text.id, field: "html" });
        }}
        onContextMenu={(e) => {
          if (!interactiveEl) return;
          e.preventDefault();
          e.stopPropagation();
          select(text.id);
          openMenu({
            type: "text",
            screen: { x: e.clientX, y: e.clientY },
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
            className="editable-active text-[14px] leading-[1.45] min-h-[1.4em]"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                setEditing(null);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            className="text-[14px] leading-[1.45] min-h-[1.4em]"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            dangerouslySetInnerHTML={{ __html: text.html }}
          />
        )}
      </div>
    </>
  );
}
