"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pipette, RotateCcw, Save } from "lucide-react";
import { designPixels } from "@/lib/editor/design";
import {
  DEFAULT_TEXT_COLOR,
  type ArrowEnds,
  type ArrowThickness,
} from "@/lib/editor/types";

type Point = { x: number; y: number };
type HsvColor = { h: number; s: number; v: number };

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

function normalizeHex(value: string): string {
  const color = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color
      .slice(1)
      .split("")
      .map((character) => character + character)
      .join("")}`.toLowerCase();
  }
  return DEFAULT_TEXT_COLOR;
}

function hexToHsv(value: string): HsvColor {
  const color = normalizeHex(value);
  const red = Number.parseInt(color.slice(1, 3), 16) / 255;
  const green = Number.parseInt(color.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(color.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { h: hue, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex({ h, s, v }: HsvColor): string {
  const chroma = v * s;
  const section = h / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (section < 1) [red, green] = [chroma, x];
  else if (section < 2) [red, green] = [x, chroma];
  else if (section < 3) [green, blue] = [chroma, x];
  else if (section < 4) [green, blue] = [x, chroma];
  else if (section < 5) [red, blue] = [x, chroma];
  else [red, blue] = [chroma, x];

  const match = v - chroma;
  const channel = (number: number) =>
    Math.round((number + match) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function clampPosition(position: Point, element: HTMLElement): Point {
  const bounds = element.getBoundingClientRect();
  const padding = designPixels("--p-8");
  return {
    x: Math.min(
      Math.max(position.x, padding),
      Math.max(padding, window.innerWidth - bounds.width - padding)
    ),
    y: Math.min(
      Math.max(position.y, padding),
      Math.max(padding, window.innerHeight - bounds.height - padding)
    ),
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

type EyeDropperWindow = Window &
  typeof globalThis & {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
  };

export function ColorControl({
  value,
  onChange,
}: Pick<CommonProps, "value" | "onChange">) {
  const normalized = normalizeHex(value);
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(normalized));
  const [hexDraft, setHexDraft] = useState(normalized);
  const [lastNormalized, setLastNormalized] = useState(normalized);
  const dragPointer = useRef<number | null>(null);
  const eyeDropperAvailable =
    typeof window !== "undefined" && Boolean((window as EyeDropperWindow).EyeDropper);

  if (normalized !== lastNormalized) {
    const next = hexToHsv(normalized);
    setLastNormalized(normalized);
    setHsv((current) => ({ ...next, h: next.s === 0 ? current.h : next.h }));
    setHexDraft(normalized);
  }

  const emit = (next: HsvColor) => {
    const color = hsvToHex(next);
    setHsv(next);
    setHexDraft(color);
    onChange(color);
  };

  const updateSaturationValue = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    emit({
      h: hsv.h,
      s: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      v: Math.min(1, Math.max(0, 1 - (event.clientY - bounds.top) / bounds.height)),
    });
  };

  const commitHex = (raw: string) => {
    if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw.trim())) {
      setHexDraft(hsvToHex(hsv));
      return;
    }
    const color = normalizeHex(raw);
    const next = hexToHsv(color);
    setHsv((current) => ({ ...next, h: next.s === 0 ? current.h : next.h }));
    setHexDraft(color);
    onChange(color);
  };

  const pickFromScreen = async () => {
    const EyeDropper = (window as EyeDropperWindow).EyeDropper;
    if (!EyeDropper) return;
    try {
      const result = await new EyeDropper().open();
      commitHex(result.sRGBHex);
    } catch {
      // Отмена системной пипетки не меняет выбранный цвет.
    }
  };

  return (
    <div className="color-control" data-color-control>
      <div
        className="color-field"
        style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        role="slider"
        tabIndex={0}
        aria-label="Насыщенность и яркость"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={hsvToHex(hsv)}
        onPointerDown={(event) => {
          event.preventDefault();
          dragPointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateSaturationValue(event);
        }}
        onPointerMove={(event) => {
          if (dragPointer.current === event.pointerId) updateSaturationValue(event);
        }}
        onPointerUp={(event) => {
          if (dragPointer.current === event.pointerId) dragPointer.current = null;
        }}
        onPointerCancel={() => {
          dragPointer.current = null;
        }}
      >
        <span
          className="color-field-marker"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>

      <input
        className="color-hue-slider"
        type="range"
        min={0}
        max={359}
        step={1}
        value={Math.round(hsv.h)}
        aria-label="Оттенок"
        onChange={(event) => emit({ ...hsv, h: Number(event.target.value) })}
      />

      <div className="color-hex-row">
        <input
          aria-label="HEX-код цвета"
          value={hexDraft}
          maxLength={7}
          spellCheck={false}
          className="color-picker-hex"
          onChange={(event) => {
            const next = event.target.value;
            setHexDraft(next);
            if (/^#[0-9a-f]{6}$/i.test(next)) commitHex(next);
          }}
          onBlur={(event) => commitHex(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitHex(event.currentTarget.value);
              event.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="color-eyedropper"
          aria-label="Взять цвет с экрана"
          title={
            eyeDropperAvailable
              ? "Взять цвет с экрана"
              : "Пипетка не поддерживается этим браузером"
          }
          disabled={!eyeDropperAvailable}
          onClick={pickFromScreen}
        >
          <Pipette aria-hidden />
        </button>
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
    <label className="color-style-field">
      <span>{label}</span>
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
  const [position, setPosition] = useState(props.position);
  const expanded = props.variant === "expanded";

  useEffect(() => {
    if (ref.current) setPosition(clampPosition(props.position, ref.current));
  }, [props.position.x, props.position.y, props.variant, ref]);

  const panel = (
    <div
      ref={ref}
      data-color-picker-variant={props.variant}
      data-text-format-toolbar
      className={`color-picker color-picker--${props.variant} no-select`}
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {expanded ? (
        <>
          <div className="color-picker-expanded-content">
            <div className="color-picker-style-fields">
              <StyleField
                label="Стиль"
                value={props.lineStyle}
                onChange={(next) => props.onLineStyleChange(next as "solid" | "dashed")}
              >
                <option value="solid">Обычный</option>
                <option value="dashed">Пунктирный</option>
              </StyleField>
              <StyleField
                label="Толщина"
                value={props.thickness}
                onChange={(next) => props.onThicknessChange(next as ArrowThickness)}
              >
                <option value="thin">Тонкая</option>
                <option value="normal">Обычная</option>
                <option value="thick">Толстая</option>
              </StyleField>
              <StyleField
                label="Наличие кончиков"
                value={props.ends}
                onChange={(next) => props.onEndsChange(next as ArrowEnds)}
              >
                <option value="both">Оба конца</option>
                <option value="end">В конец</option>
                <option value="start">В начало</option>
                <option value="none">Без концов</option>
              </StyleField>
            </div>
            <ColorControl value={props.value} onChange={props.onChange} />
          </div>

          <div className="color-picker-actions">
            <button type="button" onClick={props.onSave}>
              <Save aria-hidden />
              <span>Сохранить стиль</span>
            </button>
            <button type="button" className="color-picker-reset" onClick={props.onReset}>
              <RotateCcw aria-hidden />
              <span>Сбросить стиль</span>
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
