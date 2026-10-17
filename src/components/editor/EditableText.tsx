"use client";

/* Текст, редактируемый по клику левой кнопкой мыши (contentEditable) */

import React, { useEffect, useRef } from "react";
import { useEditor } from "@/lib/editor/store";

type EditableTextProps = {
  id: string;
  field: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
  wrap?: boolean;
  title?: string;
  as?: "span" | "div";
  placeholder?: string;
};

export function EditableText({
  id,
  field,
  value,
  onChange,
  className,
  style,
  multiline = false,
  wrap = false,
  title,
  as = "span",
  placeholder,
}: EditableTextProps) {
  const editing = useEditor((s) => s.editing);
  const setEditing = useEditor((s) => s.setEditing);
  const pushHistory = useEditor((s) => s.pushHistory);
  const isEditing = editing?.id === id && editing.field === field;
  const ref = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef<string>(value);

  useEffect(() => {
    if (isEditing && ref.current) {
      const el = ref.current;
      el.textContent = value;
      el.focus();
      // каретка в конец
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      startedRef.current = value;
    }
     
  }, [isEditing]);

  const commit = () => {
    if (!isEditing) return;
    const text = ref.current?.innerText ?? "";
    const clean = multiline ? text.replace(/\n$/, "") : text.replace(/\n/g, " ").trim();
    if (clean !== startedRef.current) {
      pushHistory();
      onChange(clean);
    }
    setEditing(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (ref.current) ref.current.textContent = startedRef.current;
      setEditing(null);
      return;
    }
    if (e.key === "Enter") {
      if (!multiline || !e.shiftKey) {
        e.preventDefault();
        commit();
      } else {
        e.preventDefault();
        document.execCommand("insertLineBreak");
      }
    }
    e.stopPropagation();
  };

  const Tag = as;

  if (isEditing) {
    return (
      <Tag
        ref={ref}
        className={`editable-active ${className ?? ""}`}
        style={{
          ...style,
          whiteSpace: multiline ? "pre-wrap" : wrap ? "normal" : "nowrap",
        }}
        contentEditable
        suppressContentEditableWarning
        onBlur={commit}
        onKeyDown={handleKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        data-nodrag="1"
      />
    );
  }

  return (
    <Tag
      className={`editable-hover ${className ?? ""}`}
      style={style}
      title={title ?? "Нажмите, чтобы редактировать"}
      onPointerDown={(event) => {
        // На touch короткий tap всё ещё откроет редактор через onClick, а
        // движение должно всплыть к карточке и начать её перетаскивание.
        if (event.pointerType !== "touch" && !event.shiftKey) event.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.shiftKey) return;
        setEditing({ id, field });
      }}
    >
      {value
        ? value
        : placeholder
          ? (
            <span className="opacity-40">{placeholder}</span>
          )
          : multiline
            ? ""
            : "…"}
    </Tag>
  );
}
