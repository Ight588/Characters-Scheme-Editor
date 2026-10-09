"use client";

/* Панели настроек: стиль стрелки и фон холста (по UI-kit, image 2) */

import React, { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, Trash2, RotateCcw } from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import {
  ArrowElement,
  ArrowEnds,
  ArrowHead,
  ArrowThickness,
  BgImageFit,
} from "@/lib/editor/types";
import { requestBgImage } from "@/lib/editor/filepicker";

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
  const removeElement = useEditor((s) => s.removeElement);
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

  if (!arrow) return null;

  const patch = (p: Partial<ArrowElement>) => updateElement(arrowId, p);

  return createPortal(
    <div
      ref={mergedSetRef}
      className="editor-panel"
      style={{ position: "fixed", left: position.x, top: position.y, zIndex: 1000 }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex flex-col gap-3">
        <div className="panel-row">
          <div className="w-[110px] flex flex-col">
            <span className="panel-label">Стиль</span>
            <select
              className="u-select"
              value={arrow.lineStyle}
              onChange={(e) => patch({ lineStyle: e.target.value as "solid" | "dashed" })}
            >
              <option value="solid">Обычный</option>
              <option value="dashed">Пунктирный</option>
            </select>
          </div>
          <div className="flex-1" />
          {/* мини-превью */}
          <svg width="70" height="26" viewBox="0 0 70 26">
            <line
              x1="6"
              y1="13"
              x2="52"
              y2="13"
              stroke={arrow.color}
              strokeWidth={arrow.thickness === "thin" ? 1.5 : arrow.thickness === "thick" ? 4 : 2.5}
              strokeDasharray={arrow.lineStyle === "dashed" ? "7 5" : undefined}
              strokeLinecap="round"
            />
            {arrow.head !== "none" && arrow.ends !== "start" && arrow.ends !== "none" && (
              <polygon points="52,7 62,13 52,19" fill={arrow.color} />
            )}
            {arrow.head !== "none" && (arrow.ends === "both" || arrow.ends === "start") && (
              <polygon points="18,7 8,13 18,19" fill={arrow.color} />
            )}
          </svg>
          <div className="flex flex-col gap-1.5">
            <button
              className="btn-warn w-8 h-8 rounded-[6px] flex items-center justify-center"
              title="Удалить стрелку"
              onClick={() => {
                removeElement(arrowId);
                openPanel(null);
              }}
            >
              <Trash2 size={15} />
            </button>
            <button
              className="btn-check w-8 h-8 rounded-[6px] flex items-center justify-center"
              title="Готово"
              onClick={() => openPanel(null)}
            >
              <Check size={16} />
            </button>
          </div>
        </div>

        <div className="panel-row">
          <div className="w-[110px] flex flex-col">
            <span className="panel-label">Толщина</span>
            <select
              className="u-select"
              value={arrow.thickness}
              onChange={(e) => patch({ thickness: e.target.value as ArrowThickness })}
            >
              <option value="thin">Тонкая</option>
              <option value="normal">Обычная</option>
              <option value="thick">Толстая</option>
            </select>
          </div>
        </div>

        <div className="panel-row">
          <div className="w-[130px] flex flex-col">
            <span className="panel-label">Кончики стрелки</span>
            <select
              className="u-select"
              value={arrow.head}
              onChange={(e) => patch({ head: e.target.value as ArrowHead })}
            >
              <option value="triangle">Треугольник</option>
              <option value="line">Стрелка</option>
              <option value="none">Нет</option>
            </select>
          </div>
          <div className="w-[110px] flex flex-col">
            <span className="panel-label">Концы</span>
            <select
              className="u-select"
              value={arrow.ends}
              onChange={(e) => patch({ ends: e.target.value as ArrowEnds })}
            >
              <option value="both">Оба конца</option>
              <option value="end">В конец</option>
              <option value="start">В начало</option>
              <option value="none">Без концов</option>
            </select>
          </div>
        </div>

        <div className="panel-row items-center">
          <span className="panel-label">Цвет</span>
          <input
            type="color"
            value={arrow.color}
            onChange={(e) => patch({ color: e.target.value })}
            className="h-7 w-9 rounded border border-[var(--c-stroke)] bg-transparent cursor-pointer"
          />
          <input
            className="u-select flex-1"
            style={{ padding: "5px 8px" }}
            value={arrow.color}
            onChange={(e) => patch({ color: e.target.value })}
          />
        </div>
      </div>
    </div>,
    document.body
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
