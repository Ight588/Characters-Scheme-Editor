"use client";

import React, { useEffect, useRef, useState } from "react";
import { Baseline, Bold, Italic, List, Underline } from "lucide-react";
import { designPixels } from "@/lib/editor/design";
import { DEFAULT_TEXT_COLOR } from "@/lib/editor/types";
import { ColorPicker } from "./ColorPicker";

function commandColorToHex(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const channels = value.match(/\d+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) return DEFAULT_TEXT_COLOR;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Общая панель rich-text форматирования для текста, заголовка и полей карточки. */
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
  const selectedRange = useRef<Range | null>(null);
  const [, force] = React.useReducer((value: number) => value + 1, 0);
  const [colorPicker, setColorPicker] = useState<{
    left: number;
    top: number;
    value: string;
  } | null>(null);

  useEffect(() => {
    const selectionChanged = () => force();
    document.addEventListener("selectionchange", selectionChanged);
    return () => document.removeEventListener("selectionchange", selectionChanged);
  }, []);

  const restoreSelection = () => {
    if (!selectedRange.current) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(selectedRange.current);
  };

  const focusSelectionHost = () => {
    const ancestor = selectedRange.current?.commonAncestorContainer;
    const element =
      ancestor instanceof Element ? ancestor : ancestor?.parentElement;
    const editor = element?.closest<HTMLElement>("[contenteditable='true']");
    editor?.focus({ preventScroll: true });
    restoreSelection();
  };

  const command = (name: string, value?: string) => {
    restoreSelection();
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
    `text-format-button ${active ? "text-format-button--active" : ""}`;

  return (
    <>
      <div
        ref={ref}
        data-text-format-toolbar
        className="editor-menu pointer-events-auto flex items-center gap-[var(--p-4)]"
        style={{
          position,
          left,
          top,
          padding: "var(--p-4)",
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
          <Bold aria-hidden />
        </button>
        <button
          className={buttonClass(isActive("italic"))}
          onPointerDown={(event) => {
            event.preventDefault();
            command("italic");
          }}
          title="Курсив"
        >
          <Italic aria-hidden />
        </button>
        <button
          className={buttonClass(isActive("underline"))}
          onPointerDown={(event) => {
            event.preventDefault();
            command("underline");
          }}
          title="Подчёркнутый"
        >
          <Underline aria-hidden />
        </button>
        <button
          className={buttonClass(isActive("foreColor"))}
          title="Цвет текста"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const selection = window.getSelection();
            selectedRange.current = selection?.rangeCount
              ? selection.getRangeAt(0).cloneRange()
              : null;
            const bounds = event.currentTarget.getBoundingClientRect();
            setColorPicker({
              left: bounds.left,
              top: bounds.bottom + designPixels("--p-8"),
              value: commandColorToHex(String(document.queryCommandValue("foreColor"))),
            });
          }}
        >
          <Baseline aria-hidden />
        </button>
        <button
          className={buttonClass(isActive("insertUnorderedList"))}
          onPointerDown={(event) => {
            event.preventDefault();
            command("insertUnorderedList");
          }}
          title="Список"
        >
          <List aria-hidden />
        </button>
      </div>

      {colorPicker && (
        <ColorPicker
          variant="compact"
          position={{ x: colorPicker.left, y: colorPicker.top }}
          value={colorPicker.value}
          onChange={(value) => {
            setColorPicker((current) => (current ? { ...current, value } : current));
            command("foreColor", value);
          }}
          onClose={() => {
            setColorPicker(null);
            focusSelectionHost();
          }}
        />
      )}
    </>
  );
}
