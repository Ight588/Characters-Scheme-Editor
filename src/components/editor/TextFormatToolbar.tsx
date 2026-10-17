"use client";

import React, { useEffect, useRef } from "react";
import { Baseline, Bold, Italic, List, Underline } from "lucide-react";

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
  const [, force] = React.useReducer((value: number) => value + 1, 0);

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
