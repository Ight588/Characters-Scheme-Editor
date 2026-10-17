"use client";

/* Панели настроек: стиль стрелки и фон холста (по UI-kit, image 2) */

import React, { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, Trash2, RotateCcw } from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import {
  ArrowElement,
  BgImageFit,
  DEFAULT_ARROW_COLOR,
} from "@/lib/editor/types";
import { requestBgImage } from "@/lib/editor/filepicker";
import { ColorPicker } from "./ColorPicker";

function usePanelClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      // клики по нативным select/option не закрывают панель
      if (t && (t.tagName === "SELECT" || t.tagName === "OPTION" || t.tagName === "INPUT")) return;
      if (ref.current && !ref.current.contains(t)) onCloseRef.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    // задержка, чтобы pointerdown, открывший панель, не закрыл её сразу
    const timer = setTimeout(() => {
      window.addEventListener("pointerdown", down, true);
    }, 0);
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, []);
  const setRef = useCallback((el: HTMLDivElement | null) => {
    ref.current = el;
  }, []);
  return setRef;
}

function clampPanel(x: number, y: number, el: HTMLDivElement | null): { x: number; y: number } {
  if (!el) return { x, y };
  const r = el.getBoundingClientRect();
  const pad = 8;
  return {
    x: Math.min(Math.max(x, pad), window.innerWidth - r.width - pad),
    y: Math.min(Math.max(y, pad), window.innerHeight - r.height - pad),
  };
}

/* --------------------- Стиль стрелки --------------------- */

export function ArrowStylePanel({ id: arrowId, screen }: { id: string; screen: { x: number; y: number } }) {
  const arrow = useEditor((s) => s.elements[arrowId]) as ArrowElement | undefined;
  const updateElement = useEditor((s) => s.updateElement);
  const pushHistory = useEditor((s) => s.pushHistory);
  const saveArrowStyleFrom = useEditor((s) => s.saveArrowStyleFrom);
  const openPanel = useEditor((s) => s.openPanel);

  if (!arrow) return null;

  const patch = (changes: Partial<ArrowElement>) => updateElement(arrowId, changes);

  return (
    <ColorPicker
      variant="expanded"
      position={screen}
      value={arrow.color}
      lineStyle={arrow.lineStyle}
      thickness={arrow.thickness}
      ends={arrow.ends}
      onChange={(color) => patch({ color })}
      onLineStyleChange={(lineStyle) => patch({ lineStyle })}
      onThicknessChange={(thickness) => patch({ thickness })}
      onEndsChange={(ends) => patch({ ends })}
      onSave={() => {
        saveArrowStyleFrom(arrowId);
        useEditor.getState().openPanel(null);
      }}
      onReset={() => {
        pushHistory();
        patch({
          color: DEFAULT_ARROW_COLOR,
          lineStyle: "solid",
          thickness: "normal",
          head: "triangle",
          ends: "both",
        });
      }}
      onClose={() => openPanel(null)}
    />
  );
}

/* --------------------- Фон холста --------------------- */

const BG_FIT_LABELS: Record<BgImageFit, string> = {
  tile: "Повторяющаяся плитка",
  "tile-x": "Повторять по горизонтали",
  "tile-y": "Повторять по вертикали",
  fill: "Заполнить",
};

export function CanvasBgPanel({ screen }: { screen: { x: number; y: number } }) {
  const settings = useEditor((s) => s.settings);
  const setSettings = useEditor((s) => s.setSettings);
  const pushHistory = useEditor((s) => s.pushHistory);
  const openPanel = useEditor((s) => s.openPanel);
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPos] = React.useState(screen);

  useEffect(() => {
    setPos(clampPanel(screen.x, screen.y, ref.current));
     
  }, []);

  const panelSetRef = usePanelClose(() => openPanel(null));
  const mergedSetRef = (el: HTMLDivElement | null) => {
    ref.current = el;
    panelSetRef(el);
  };

  const reset = () => {
    pushHistory();
    setSettings({ bgColor: "#f2eeeb", bgImage: undefined, bgFit: "tile", bgOpacity: 100 });
  };

  return createPortal(
    <div
      ref={mergedSetRef}
      className="editor-panel"
      style={{ position: "fixed", left: position.x, top: position.y, zIndex: 1000, width: 340 }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* превью фона */}
      <button
        className="w-full h-[120px] rounded-[6px] border border-[var(--c-stroke)] overflow-hidden mb-3 relative flex items-center justify-center"
        style={{ background: settings.bgColor }}
        title="Нажмите, чтобы выбрать изображение фона"
        onClick={() => requestBgImage()}
      >
        {settings.bgImage ? (
           
          <img
            src={settings.bgImage}
            alt="Фон холста"
            className="w-full h-full object-cover"
            style={{ opacity: settings.bgOpacity / 100 }}
            draggable={false}
          />
        ) : (
          <span className="text-xs opacity-50">Нажмите, чтобы выбрать изображение</span>
        )}
      </button>

      <div className="flex flex-col gap-3">
        <div className="panel-row">
          <div className="flex-1 flex flex-col">
            <span className="panel-label">Размещение изображения</span>
            <select
              className="u-select"
              value={settings.bgFit}
              onChange={(e) => {
                pushHistory();
                setSettings({ bgFit: e.target.value as BgImageFit });
              }}
              disabled={!settings.bgImage}
            >
              {(Object.keys(BG_FIT_LABELS) as BgImageFit[]).map((k) => (
                <option key={k} value={k}>
                  {BG_FIT_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <input
            type="color"
            value={settings.bgColor}
            onChange={(e) => setSettings({ bgColor: e.target.value })}
            className="h-9 w-9 rounded border border-[var(--c-stroke)] bg-transparent cursor-pointer"
            title="Цвет фона"
          />
        </div>

        <div className="panel-row">
          <div className="flex-1 flex flex-col">
            <span className="panel-label">Прозрачность изображения</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={settings.bgOpacity}
                className="tslider flex-1"
                style={{ ["--fill" as string]: `${settings.bgOpacity}%` }}
                onChange={(e) => setSettings({ bgOpacity: Number(e.target.value) })}
                disabled={!settings.bgImage}
              />
              <span className="text-xs w-9 text-right opacity-70">{settings.bgOpacity}%</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="under-action text-xs text-[var(--btn-warn-text)]"
            style={{ borderBottomColor: "rgba(174,16,16,0.35)" }}
            onClick={() => {
              pushHistory();
              setSettings({ bgImage: undefined });
            }}
            disabled={!settings.bgImage}
          >
            <Trash2 size={13} /> Удалить изображение
          </button>
          <button className="under-action text-xs" onClick={reset}>
            <RotateCcw size={13} /> Сбросить фон
          </button>
          <div className="flex-1" />
          <button
            className="btn-check w-8 h-8 rounded-[6px] flex items-center justify-center"
            title="Готово"
            onClick={() => openPanel(null)}
          >
            <Check size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs opacity-70">Цвет фона:</span>
          <input
            className="u-select flex-1"
            style={{ padding: "5px 8px" }}
            value={settings.bgColor}
            onChange={(e) => setSettings({ bgColor: e.target.value })}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
