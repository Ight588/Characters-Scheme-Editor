"use client";

/* Бесконечный холст: панорама, Alt+колесо — зум, фоновые слои, элементы */

import React, { useCallback, useRef } from "react";
import { useEditor } from "@/lib/editor/store";
import {
  BgImageFit,
  CanvasElement,
  CardElement,
  ImageElement,
  TextElement,
} from "@/lib/editor/types";
import { CardView } from "./elements/CardElement";
import { ArrowLayer } from "./elements/ArrowLayer";
import { ImageView } from "./elements/ImageElement";
import { TextView } from "./elements/TextElement";
import { computeArrowLayouts, contentBBox } from "@/lib/editor/geometry";
import { designPixels } from "@/lib/editor/design";
import {
  DOUBLE_TAP_DELAY_MS,
  DOUBLE_TAP_DISTANCE,
  TAP_MOVE_TOLERANCE,
} from "@/lib/editor/interactions";

const BG_REPEAT: Record<BgImageFit, string> = {
  tile: "repeat",
  "tile-x": "repeat-x",
  "tile-y": "repeat-y",
  fill: "no-repeat",
};

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const basePath = configuredBasePath.endsWith("/")
  ? configuredBasePath.slice(0, -1)
  : configuredBasePath;
const EMPTY_CANVAS_TILE_URL = `${basePath}/empty-canvas-tile.png`;

export function Canvas() {
  const view = useEditor((s) => s.view);
  const order = useEditor((s) => s.order);
  const elements = useEditor((s) => s.elements);
  const rects = useEditor((s) => s.rects);
  const settings = useEditor((s) => s.settings);
  const exportMode = useEditor((s) => s.exportMode);
  const exportOffset = useEditor((s) => s.exportOffset);
  const panBy = useEditor((s) => s.panBy);
  const zoomAt = useEditor((s) => s.zoomAt);
  const select = useEditor((s) => s.select);
  const openMenu = useEditor((s) => s.openMenu);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panState = useRef<{ x: number; y: number } | null>(null);
  const touchPoints = useRef(new Map<number, { x: number; y: number }>());
  const pinchState = useRef<{
    distance: number;
    midpoint: { x: number; y: number };
  } | null>(null);
  const touchGestureConsumed = useRef(false);
  const longPress = useRef<{
    pointerId: number;
    start: { x: number; y: number };
    timer: number;
  } | null>(null);
  const tapCandidates = useRef(
    new Map<
      number,
      {
        target: Element;
        targetKey: string;
        start: { x: number; y: number };
      }
    >()
  );
  const lastTap = useRef<{
    targetKey: string;
    screen: { x: number; y: number };
    at: number;
  } | null>(null);
  const suppressClickUntil = useRef(0);
  const suppressDoubleClickUntil = useRef(0);

  const interactive = !exportMode;

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

  const cancelLongPress = () => {
    if (!longPress.current) return;
    window.clearTimeout(longPress.current.timer);
    longPress.current = null;
  };

  const touchMetrics = () => {
    const points = [...touchPoints.current.values()];
    if (points.length < 2) return null;
    const [first, second] = points;
    return {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      midpoint: {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      },
    };
  };

  const contextTargetKey = (target: Element): string => {
    const statusId = target
      .closest("[data-status-card-id]")
      ?.getAttribute("data-status-card-id");
    if (statusId) return `status:${statusId}`;

    const waypointTarget = target.closest("[data-waypoint-arrow-id]");
    const waypointArrowId = waypointTarget?.getAttribute("data-waypoint-arrow-id");
    const waypointIndex = Number(waypointTarget?.getAttribute("data-waypoint-index"));
    if (waypointArrowId && Number.isInteger(waypointIndex)) {
      return `waypoint:${waypointArrowId}:${waypointIndex}`;
    }

    const arrowTarget = target.closest("[data-arrow-id], [data-arrow-description]");
    const arrowId =
      arrowTarget?.getAttribute("data-arrow-id") ??
      arrowTarget?.getAttribute("data-arrow-description");
    if (arrowId) return `arrow:${arrowId}`;

    const elementId = target.closest("[data-element-id]")?.getAttribute("data-element-id");
    return elementId ? `element:${elementId}` : "canvas";
  };

  const openTouchContextMenu = (target: Element, clientX: number, clientY: number) => {
    const state = useEditor.getState();
    const screen = { x: clientX, y: clientY };
    const statusTarget = target.closest("[data-status-card-id]");
    const statusCardId = statusTarget?.getAttribute("data-status-card-id");
    if (statusCardId && state.elements[statusCardId]?.kind === "card") {
      if (!state.selectedIds.includes(statusCardId)) state.select(statusCardId);
      state.openMenu({
        type: "status",
        screen,
        world: { x: 0, y: 0 },
        elementId: statusCardId,
      });
      return;
    }

    const waypointTarget = target.closest("[data-waypoint-arrow-id]");
    const waypointArrowId = waypointTarget?.getAttribute("data-waypoint-arrow-id");
    const waypointIndex = Number(waypointTarget?.getAttribute("data-waypoint-index"));
    if (
      waypointArrowId &&
      state.elements[waypointArrowId]?.kind === "arrow" &&
      Number.isInteger(waypointIndex)
    ) {
      if (!state.selectedIds.includes(waypointArrowId)) state.select(waypointArrowId);
      state.setSelectedWaypoint({ arrowId: waypointArrowId, index: waypointIndex });
      state.openMenu({
        type: "arrow-waypoint",
        screen,
        world: screenToWorld(clientX, clientY),
        elementId: waypointArrowId,
        waypointIndex,
      });
      return;
    }

    const arrowTarget = target.closest("[data-arrow-id], [data-arrow-description]");
    const arrowId =
      arrowTarget?.getAttribute("data-arrow-id") ??
      arrowTarget?.getAttribute("data-arrow-description");
    if (arrowId && state.elements[arrowId]?.kind === "arrow") {
      if (!state.selectedIds.includes(arrowId)) state.select(arrowId);
      state.openMenu({
        type: "arrow",
        screen,
        world: screenToWorld(clientX, clientY),
        elementId: arrowId,
      });
      return;
    }

    const elementTarget = target.closest("[data-element-id]");
    const elementId = elementTarget?.getAttribute("data-element-id");
    const element = elementId ? state.elements[elementId] : undefined;
    if (element && element.kind !== "arrow") {
      if (!state.selectedIds.includes(element.id)) state.select(element.id);
      state.openMenu({
        type: element.kind,
        screen,
        world: { x: 0, y: 0 },
        elementId: element.id,
      });
      return;
    }

    state.select(null);
    state.openMenu({
      type: "canvas",
      screen,
      world: screenToWorld(clientX, clientY),
      sub: null,
    });
  };

  const onPointerDownCapture = (event: React.PointerEvent) => {
    if (!interactive || event.pointerType !== "touch") return;
    touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const target = event.target as Element;
    const blockedTarget = target.closest(
      "[data-transform-handle], [data-text-format-toolbar], input, textarea, select, button"
    );
    if (!blockedTarget) {
      tapCandidates.current.set(event.pointerId, {
        target,
        targetKey: contextTargetKey(target),
        start: { x: event.clientX, y: event.clientY },
      });
    } else {
      lastTap.current = null;
    }

    if (touchPoints.current.size > 1) {
      cancelLongPress();
      tapCandidates.current.clear();
      lastTap.current = null;
      touchGestureConsumed.current = true;
      pinchState.current = touchMetrics();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Внутри активного редактора дабл-тап остаётся доступен, но лонг-тап
    // не перехватывает выделение текста.
    if (blockedTarget || target.closest("[contenteditable='true']")) return;

    cancelLongPress();
    const pointerId = event.pointerId;
    const start = { x: event.clientX, y: event.clientY };
    const timer = window.setTimeout(() => {
      if (longPress.current?.pointerId !== pointerId || touchGestureConsumed.current) return;
      longPress.current = null;
      tapCandidates.current.delete(pointerId);
      lastTap.current = null;
      suppressClickUntil.current = Date.now() + 900;
      suppressDoubleClickUntil.current = Date.now() + 900;
      navigator.vibrate?.(10);
      openTouchContextMenu(target, start.x, start.y);
    }, 550);
    longPress.current = { pointerId, start, timer };
  };

  const onPointerMoveCapture = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch" || !touchPoints.current.has(event.pointerId)) return;
    touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const tap = tapCandidates.current.get(event.pointerId);
    if (
      tap &&
      Math.hypot(event.clientX - tap.start.x, event.clientY - tap.start.y) >
        TAP_MOVE_TOLERANCE
    ) {
      tapCandidates.current.delete(event.pointerId);
      lastTap.current = null;
    }

    const metrics = touchMetrics();
    if (pinchState.current && metrics) {
      const viewport = viewportRef.current?.getBoundingClientRect();
      if (viewport) {
        const factor = metrics.distance / pinchState.current.distance;
        panBy(
          metrics.midpoint.x - pinchState.current.midpoint.x,
          metrics.midpoint.y - pinchState.current.midpoint.y
        );
        zoomAt(
          {
            x: metrics.midpoint.x - viewport.left,
            y: metrics.midpoint.y - viewport.top,
          },
          { w: viewport.width, h: viewport.height },
          factor
        );
      }
      pinchState.current = metrics;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (touchGestureConsumed.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const press = longPress.current;
    if (
      press?.pointerId === event.pointerId &&
      Math.hypot(event.clientX - press.start.x, event.clientY - press.start.y) > 10
    ) {
      cancelLongPress();
    }
  };

  const finishTouchPointer = (event: React.PointerEvent, cancelled = false) => {
    if (event.pointerType !== "touch") return;
    if (longPress.current?.pointerId === event.pointerId) cancelLongPress();

    const candidate = tapCandidates.current.get(event.pointerId);
    tapCandidates.current.delete(event.pointerId);
    if (cancelled) lastTap.current = null;
    if (!cancelled && candidate && !touchGestureConsumed.current) {
      const now = Date.now();
      const previous = lastTap.current;
      const isDoubleTap =
        previous?.targetKey === candidate.targetKey &&
        now - previous.at <= DOUBLE_TAP_DELAY_MS &&
        Math.hypot(
          event.clientX - previous.screen.x,
          event.clientY - previous.screen.y
        ) <= DOUBLE_TAP_DISTANCE;

      if (isDoubleTap) {
        lastTap.current = null;
        suppressClickUntil.current = now + 900;
        suppressDoubleClickUntil.current = now + 900;
        const active = document.activeElement as HTMLElement | null;
        if (active?.isContentEditable) active.blur();
        useEditor.getState().setEditing(null);
        openTouchContextMenu(candidate.target, event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
      } else {
        lastTap.current = {
          targetKey: candidate.targetKey,
          screen: { x: event.clientX, y: event.clientY },
          at: now,
        };
      }
    }

    touchPoints.current.delete(event.pointerId);
    const metrics = touchMetrics();
    pinchState.current = metrics;
    if (!touchPoints.current.size) touchGestureConsumed.current = false;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    // панорамирование ЛКМ/СКМ по фону
    if (e.button === 0 || e.button === 1) {
      e.preventDefault();
      panState.current = { x: e.clientX, y: e.clientY };
      if (!e.shiftKey) select(null);
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

  // Начало мира закреплено в центре viewport через left/top: 50%. Так элементы
  // видны уже на первом кадре и не зависят от ResizeObserver.
  const worldTransform = exportMode
    ? "none"
    : `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;

  /* сдвиг содержимого для экспорта */
  const exportTransform = exportMode
    ? `translate(${exportOffset.x}px, ${exportOffset.y}px)`
    : undefined;

  const bgStyle: React.CSSProperties = settings.bgImage
    ? {
        backgroundImage: `url(${settings.bgImage})`,
        backgroundRepeat: BG_REPEAT[settings.bgFit],
        backgroundPosition: "center",
        backgroundSize: settings.bgFit === "fill" ? "cover" : undefined,
        opacity: Math.min(100, Math.max(0, settings.bgOpacity)) / 100,
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
      style={{
        cursor: interactive ? "default" : "wait",
        backgroundColor: settings.bgColor,
        touchAction: "none",
        overscrollBehavior: "none",
      }}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={(event) => finishTouchPointer(event)}
      onPointerCancelCapture={(event) => finishTouchPointer(event, true)}
      onClickCapture={(event) => {
        if (Date.now() >= suppressClickUntil.current) return;
        suppressClickUntil.current = 0;
        event.preventDefault();
        event.stopPropagation();
      }}
      onDoubleClickCapture={(event) => {
        if (Date.now() >= suppressDoubleClickUntil.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={onPointerDown}
      onWheel={onWheel}
      onContextMenuCapture={() => cancelLongPress()}
      onContextMenu={onContextMenu}
    >
      {/* В обычном режиме фон покрывает viewport и всегда остаётся видимым. */}
      {isEmpty && interactive && !settings.bgImage && (
        <div
          className="empty-canvas-background absolute inset-0 pointer-events-none"
          style={{ backgroundImage: `url("${EMPTY_CANVAS_TILE_URL}")` }}
        />
      )}
      {settings.bgImage && interactive && (
        <div className="absolute inset-0 pointer-events-none" style={bgStyle} />
      )}

      <div
        id="editor-world"
        className="absolute"
        style={{
          left: exportMode ? 0 : "50%",
          top: exportMode ? 0 : "50%",
          transform: worldTransform,
          transformOrigin: "0 0",
        }}
      >
        <div
          id="editor-world-content"
          className="absolute left-0 top-0"
          style={{ transform: exportTransform, width: 0, height: 0 }}
        >
          {/* фоновое изображение (в мировых координатах) */}
          {settings.bgImage && exportMode && (
            <div
              className="absolute pointer-events-none"
              style={{ ...bgStyle, ...exportBackgroundRect(elements, rects) }}
            />
          )}

          {/* Стрелки и их подписи всегда лежат ниже карточек. */}
          <ArrowLayer interactive={interactive} />

          {images.map((img) => (
            <ImageView key={img.id} image={img} interactive={interactive} />
          ))}
          {cards.map((card) => (
            <CardView key={card.id} card={card} />
          ))}
          {texts.map((text) => (
            <TextView key={text.id} text={text} interactive={interactive} />
          ))}
        </div>
      </div>

      {isEmpty && interactive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="empty-canvas-hint no-select">
            <span className="empty-canvas-hint--desktop">
              Нажмите правую кнопку мыши,
              <br />
              чтобы начать...
            </span>
            <span className="empty-canvas-hint--touch">
              Зажмите холст,
              <br />
              чтобы начать...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Фон экспорта точно покрывает bbox вместе с полями из exporters.ts. */
function exportBackgroundRect(
  elements: Record<string, CanvasElement>,
  rects: Record<string, { w: number; h: number }>
): React.CSSProperties {
  const layouts = computeArrowLayouts(elements, rects);
  const bbox = contentBBox(elements, rects, layouts);
  const exportPadding = designPixels("--p-20") * 2;
  return {
    left: bbox.x - exportPadding,
    top: bbox.y - exportPadding,
    width: Math.ceil(bbox.w) + exportPadding * 2,
    height: Math.ceil(bbox.h) + exportPadding * 2,
  };
}
