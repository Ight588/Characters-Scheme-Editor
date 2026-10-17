"use client";

/* Текст, редактируемый по клику левой кнопкой мыши (contentEditable) */

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "@/lib/editor/store";
import { TextFormatToolbar } from "./TextFormatToolbar";

type EditableTextProps = {
  id: string;
  field: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
  wrap?: boolean;
  rich?: boolean;
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
  rich = false,
  title,
  as = "span",
  placeholder,
}: EditableTextProps) {
  const editing = useEditor((state) => state.editing);
  const setEditing = useEditor((state) => state.setEditing);
  const pushHistory = useEditor((state) => state.pushHistory);
  const isEditing = editing?.id === id && editing.field === field;
  const ref = useRef<HTMLElement | null>(null);
  const startedRef = useRef<string>(value);
  const [toolbar, setToolbar] = React.useState<{
    left: number;
    top: number;
    placement: "above" | "below";
  } | null>(null);

  useEffect(() => {
    if (!isEditing || !ref.current) {
      setToolbar(null);
      return;
    }

    const element = ref.current;
    if (rich) element.innerHTML = value;
    else element.textContent = value;
    element.focus();

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    startedRef.current = value;

    if (rich) {
      const bounds = element.getBoundingClientRect();
      const placement = bounds.top < 56 ? "below" : "above";
      setToolbar({
        left: bounds.left,
        top: placement === "above" ? bounds.top - 6 : bounds.bottom + 6,
        placement,
      });
    }
  }, [isEditing]);

  const commit = () => {
    if (!isEditing) return;
    const raw = rich ? (ref.current?.innerHTML ?? "") : (ref.current?.innerText ?? "");
    const clean = rich
      ? raw.trim()
      : multiline
        ? raw.replace(/\n$/, "")
        : raw.replace(/\n/g, " ").trim();
    if (clean !== startedRef.current) {
      pushHistory();
      onChange(clean);
    }
    setToolbar(null);
    setEditing(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (ref.current) {
        if (rich) ref.current.innerHTML = startedRef.current;
        else ref.current.textContent = startedRef.current;
      }
      setToolbar(null);
      setEditing(null);
      return;
    }
    if (event.key === "Enter") {
      if (!multiline || !event.shiftKey) {
        event.preventDefault();
        commit();
      } else {
        event.preventDefault();
        document.execCommand("insertLineBreak");
      }
    }
    event.stopPropagation();
  };

  const Tag = as;

  if (isEditing) {
    return (
      <>
        {rich && toolbar &&
          createPortal(
            <TextFormatToolbar
              position="fixed"
              placement={toolbar.placement}
              left={toolbar.left}
              top={toolbar.top}
            />,
            document.body
          )}
        <Tag
          key={`${field}-editor`}
          ref={ref as React.Ref<HTMLDivElement>}
          data-editable-field={field}
          className={`editable-active ${className ?? ""}`}
          style={{
            ...style,
            whiteSpace: multiline ? "pre-wrap" : wrap ? "normal" : "nowrap",
          }}
          contentEditable
          suppressContentEditableWarning
          onBlur={(event) => {
            const next = event.relatedTarget as Element | null;
            if (next?.closest("[data-text-format-toolbar]")) return;
            commit();
          }}
          onKeyDown={handleKeyDown}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          data-nodrag="1"
        />
      </>
    );
  }

  const hasValue = rich
    ? value
        .replace(/<br\s*\/?\s*>/gi, " ")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .trim().length > 0
    : Boolean(value);

  return (
    <Tag
      key={`${field}-display`}
      ref={ref as React.Ref<HTMLDivElement>}
      data-editable-field={field}
      className={`editable-hover ${className ?? ""}`}
      style={style}
      title={title ?? "Нажмите, чтобы редактировать"}
      onPointerDown={(event) => {
        // На touch короткий tap всё ещё откроет редактор через onClick, а
        // движение должно всплыть к карточке и начать её перетаскивание.
        if (event.pointerType !== "touch" && !event.shiftKey) event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.shiftKey) return;
        if (useEditor.getState().elements[id]) useEditor.getState().select(id);
        setEditing({ id, field });
      }}
    >
      {hasValue ? (
        rich ? (
          <span dangerouslySetInnerHTML={{ __html: value }} />
        ) : (
          value
        )
      ) : placeholder ? (
        <span className="opacity-40">{placeholder}</span>
      ) : multiline ? (
        ""
      ) : (
        "…"
      )}
    </Tag>
  );
}
