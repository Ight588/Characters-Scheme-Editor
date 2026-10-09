"use client";

/* Бесконечный холст: панорама, Alt+колесо — зум, фоновые слои, элементы */

import React, { useCallback, useMemo, useRef } from "react";
import { useEditor } from "@/lib/editor/store";
import { BgImageFit, CardElement, ImageElement, TextElement } from "@/lib/editor/types";
import { CardView } from "./elements/CardElement";
import { ArrowLayer } from "./elements/ArrowLayer";
import { ImageView } from "./elements/ImageElement";
import { TextView } from "./elements/TextElement";
import { contentBBox, computeArrowGeometries } from "@/lib/editor/geometry";

const BG_WORLD_SPAN = 40000;

const BG_REPEAT: Record<BgImageFit, string> = {
  tile: "repeat",
  "tile-x": "repeat-x",
  "tile-y": "repeat-y",
  fill: "no-repeat",
};

export function Canvas() {
  const view = useEditor((s) => s.view);
  const order = useEditor((s) => s.order);
  const elements = useEditor((s) => s.elements);
  const settings = useEditor((s) => s.settings);
  const exportMode = useEditor((s) => s.exportMode);
  const exportOffset = useEditor((s) => s.exportOffset);
  const panBy = useEditor((s) => s.panBy);
  const zoomAt = useEditor((s) => s.zoomAt);
  const select = useEditor((s) => s.select);
  const openMenu = useEditor((s) => s.openMenu);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panState = useRef<{ x: number; y: number } | null>(null);
  const [viewportSize, setViewportSize] = React.useState({ w: 0, h: 0 });

  const interactive = !exportMode;

  /* следим за размером вьюпорта */
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const v = useEditor.getState().view;
      return {
        x: (clientX - rect.left - (rect.width / 2 + v.x)) / v.scale,
        y: (clientY - rect.top - (rect.height / 2 + v.y)) / v.scale,
      };
    },
    []
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    // панорамирование ЛКМ/СКМ по фону
    if (e.button === 0 || e.button === 1) {
      e.preventDefault();
      panState.current = { x: e.clientX, y: e.clientY };
      select(null);
      const move = (ev: PointerEvent) => {
        if (!panState.current) return;
        panBy(ev.clientX - panState.current.x, ev.clientY - panState.current.y);
        panState.current = { x: ev.clientX, y: ev.clientY };
      };
      const up = () => {
        panState.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!interactive) return;
    e.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (e.altKey) {
      // зум вокруг курсора
      const factor = Math.exp(-e.deltaY * 0.0022);
      zoomAt(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        { w: rect.width, h: rect.height },
        factor
      );
    } else {
      panBy(-e.deltaX, -e.deltaY);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    if (!interactive) return;
    e.preventDefault();
    const target = e.target as HTMLElement;
    if (target.closest("[data-element-id]") || target.closest("[data-arrow-id]")) return;
    openMenu({
      type: "canvas",
      screen: { x: e.clientX, y: e.clientY },
      world: screenToWorld(e.clientX, e.clientY),
      sub: null,
    });
  };

  const worldTransform = useMemo(() => {
    if (exportMode) return undefined;
    if (viewportSize.w === 0 || viewportSize.h === 0) return "translate(-10000px, -10000px)";
    return `translate(${viewportSize.w / 2 + view.x}px, ${viewportSize.h / 2 + view.y}px) scale(${view.scale})`;
  }, [view, exportMode, viewportSize]);

  /* сдвиг содержимого для экспорта */
  const exportTransform = exportMode
    ? `translate(${exportOffset.x}px, ${exportOffset.y}px)`
    : undefined;

  const bgStyle: React.CSSProperties = settings.bgImage
    ? {
        backgroundImage: `url(${settings.bgImage})`,
        backgroundRepeat: BG_REPEAT[settings.bgFit],
        backgroundSize: settings.bgFit === "fill" ? "100% 100%" : undefined,
        opacity: settings.bgOpacity / 100,
      }
    : {};

  const cards = order
    .map((id) => elements[id])
    .filter((el): el is CardElement => el?.kind === "card");
  const images = order
    .map((id) => elements[id])
    .filter((el): el is ImageElement => el?.kind === "image");
  const texts = order
    .map((id) => elements[id])
    .filter((el): el is TextElement => el?.kind === "text");

  const isEmpty = order.length === 0;

  return (
    <div
      id="editor-viewport"
      ref={viewportRef}
      className="editor-dots absolute inset-0 overflow-hidden"
      style={{ cursor: interactive ? "default" : "wait" }}
      onPointerDown={onPointerDown}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
    >
      <div
        id="editor-world"
        className="absolute left-0 top-0"
        style={{ transform: worldTransform ?? "none", transformOrigin: "0 0" }}
      >
        <div
          id="editor-world-content"
          className="absolute left-0 top-0"
          style={{ transform: exportTransform, width: 0, height: 0 }}
        >
          {/* фоновое изображение (в мировых координатах) */}
          {settings.bgImage && (
            <div
              className="absolute pointer-events-none"
              style={
                exportMode
                  ? {
                      ...bgStyle,
                      left: 0,
                      top: 0,
                      width: exportBBoxW(),
                      height: exportBBoxH(),
                    }
                  : {
                      ...bgStyle,
                      left: -BG_WORLD_SPAN / 2,
                      top: -BG_WORLD_SPAN / 2,
                      width: BG_WORLD_SPAN,
                      height: BG_WORLD_SPAN,
                    }
              }
            />
          )}

          {images.map((img) => (
            <ImageView key={img.id} image={img} interactive={interactive} />
          ))}
          {cards.map((card) => (
            <CardView key={card.id} card={card} />
          ))}
          {texts.map((text) => (
            <TextView key={text.id} text={text} interactive={interactive} />
          ))}

          {/* стрелки поверх карточек, чтобы наконечники были видны у граней */}
          <ArrowLayer interactive={interactive} />
        </div>
      </div>

      {isEmpty && interactive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center font-bold text-[22px] leading-snug text-[#b3a89f] no-select">
            Нажмите правую кнопку мыши,
            <br />
            чтобы начать...
          </div>
        </div>
      )}
    </div>
  );
}

/* размеры экспортной области считаются из текущего состояния */
function exportBBoxW(): number {
  const s = useEditor.getState();
  const g = computeArrowGeometries(s.elements, s.rects);
  return Math.ceil(contentBBox(s.elements, s.rects, g).w) + 80;
}
function exportBBoxH(): number {
  const s = useEditor.getState();
  const g = computeArrowGeometries(s.elements, s.rects);
  return Math.ceil(contentBBox(s.elements, s.rects, g).h) + 80;
}
