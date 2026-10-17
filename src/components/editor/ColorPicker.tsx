"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, Save } from "lucide-react";
import type { ArrowEnds, ArrowThickness } from "@/lib/editor/types";

type Point = { x: number; y: number };

type CommonProps = {
  value: string;
  onChange: (color: string) => void;
  position: Point;
  onClose: () => void;
};

type CompactColorPickerProps = CommonProps & {
  variant: "compact";
};

type ExpandedColorPickerProps = CommonProps & {
  variant: "expanded";
  lineStyle: "solid" | "dashed";
  thickness: ArrowThickness;
  ends: ArrowEnds;
  onLineStyleChange: (value: "solid" | "dashed") => void;
  onThicknessChange: (value: ArrowThickness) => void;
  onEndsChange: (value: ArrowEnds) => void;
  onSave: () => void;
  onReset: () => void;
};

export type ColorPickerProps = CompactColorPickerProps | ExpandedColorPickerProps;

const PICKER_SIZE = {
  expanded: { width: 245, height: 193 },
  compact: { width: 127, height: 155 },
} as const;

function normalizeHex(value: string): string {
  const color = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color
      .slice(1)
      .split("")
      .map((char) => char + char)
      .join("")}`.toLowerCase();
  }
  return "#000000";
}

function clampPosition(position: Point, variant: ColorPickerProps["variant"]): Point {
  if (typeof window === "undefined") return position;
  const { width, height } = PICKER_SIZE[variant];
  const padding = 8;
  return {
    x: Math.min(Math.max(position.x, padding), Math.max(padding, window.innerWidth - width - padding)),
    y: Math.min(Math.max(position.y, padding), Math.max(padding, window.innerHeight - height - padding)),
  };
}

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onCloseRef.current();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", keydown);
    };
  }, []);

  return ref;
}

function ColorControl({ value, onChange }: Pick<CommonProps, "value" | "onChange">) {
  const color = normalizeHex(value);

  return (
    <div className="flex h-[123px] w-[95px] flex-none flex-col items-center gap-[8px]" data-color-control>
      <label
        className="relative h-[96px] min-h-[95px] w-[95px] min-w-[95px] flex-none cursor-pointer overflow-hidden rounded-[5px]"
        style={{ background: "linear-gradient(180deg, #D9D9D9 0%, #737373 100%)" }}
        title="Выбрать цвет"
      >
        <input
          aria-label="Выбрать цвет"
          type="color"
          value={color}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>

      <div className="flex h-[19px] w-[95px] flex-none items-center gap-[10px] self-stretch rounded-[3px] bg-[rgba(154,124,94,0.07)] p-[4px]">
        <input
          key={color}
          aria-label="HEX-код цвета"
          defaultValue={color}
          maxLength={7}
          spellCheck={false}
          className="color-picker-hex h-[11px] min-w-0 flex-1 border-0 bg-transparent p-0 text-[9px] leading-[11px] text-black/20 outline-none"
          onChange={(event) => {
            const next = event.target.value.trim();
            if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next.toLowerCase());
          }}
          onBlur={(event) => {
            const next = event.currentTarget.value.trim();
            if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(next)) {
              const normalized = normalizeHex(next);
              event.currentTarget.value = normalized;
              if (normalized !== color) onChange(normalized);
            } else {
              event.currentTarget.value = color;
            }
          }}
        />
      </div>
    </div>
  );
}

function StyleField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex h-[33px] w-[102px] flex-none flex-col items-start gap-[6px] self-stretch">
      <span className="h-[11px] w-[102px] text-[9px] font-semibold leading-[11px] text-[#0B0A0A]">
        {label}
      </span>
      <select
        aria-label={label}
        className="color-picker-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

export function ColorPicker(props: ColorPickerProps) {
  const ref = useOutsideClose(props.onClose);
  const position = clampPosition(props.position, props.variant);
  const expanded = props.variant === "expanded";

  const panel = (
    <div
      ref={ref}
      data-color-picker-variant={props.variant}
      className={`color-picker fixed z-[1001] box-border flex flex-col items-start justify-center gap-[12px] rounded-[8px] border border-black/20 bg-[#F9F7F6] p-[16px] no-select ${
        expanded ? "h-[193px] w-[245px]" : "h-[155px] w-[127px]"
      }`}
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {expanded ? (
        <>
          <div className="flex h-[123px] w-[213px] flex-none items-center gap-[16px] self-stretch">
            <div className="flex h-[123px] w-[102px] flex-1 flex-col items-start gap-[12px] self-stretch">
              <StyleField
                label="Стиль"
                value={props.lineStyle}
                onChange={(value) => props.onLineStyleChange(value as "solid" | "dashed")}
              >
                <option value="solid">Обычный</option>
                <option value="dashed">Пунктирный</option>
              </StyleField>
              <StyleField
                label="Толщина"
                value={props.thickness}
                onChange={(value) => props.onThicknessChange(value as ArrowThickness)}
              >
                <option value="thin">Тонкая</option>
                <option value="normal">Обычная</option>
                <option value="thick">Толстая</option>
              </StyleField>
              <StyleField
                label="Наличие кончиков"
                value={props.ends}
                onChange={(value) => props.onEndsChange(value as ArrowEnds)}
              >
                <option value="both">Оба конца</option>
                <option value="end">В конец</option>
                <option value="start">В начало</option>
                <option value="none">Без концов</option>
              </StyleField>
            </div>

            <ColorControl value={props.value} onChange={props.onChange} />
          </div>

          <div className="flex h-[26px] w-[213px] flex-none items-center gap-[6px]">
            <button
              type="button"
              className="flex h-[26px] w-[106px] flex-none items-center gap-[4px] rounded-[3px] p-[6px] text-[#0B0A0A] hover:bg-black/5"
              onClick={props.onSave}
            >
              <Save className="flex-none" size={14} strokeWidth={1.7} />
              <span className="whitespace-nowrap text-[9px] leading-[11px]">Сохранить стиль</span>
            </button>
            <button
              type="button"
              className="flex h-[26px] w-[101px] flex-none items-center gap-[4px] rounded-[3px] p-[6px] text-[#AE1010] hover:bg-[rgba(174,16,16,0.06)]"
              onClick={props.onReset}
            >
              <RotateCcw className="flex-none" size={14} strokeWidth={1.7} />
              <span className="whitespace-nowrap text-[9px] leading-[11px]">Сбросить стиль</span>
            </button>
          </div>
        </>
      ) : (
        <ColorControl value={props.value} onChange={props.onChange} />
      )}
    </div>
  );

  return createPortal(panel, document.body);
}
