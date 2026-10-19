"use client";

/* Слой стрелок: SVG-линии + HTML-подписи, привязка к карточкам */

import React, { useEffect, useMemo, useRef } from "react";
import { useEditor } from "@/lib/editor/store";
import {
  ArrowElement,
  ArrowHead,
  ArrowThickness,
  CardElement,
  Point,
} from "@/lib/editor/types";
import { designPixels } from "@/lib/editor/design";
import {
  ANCHOR_DETACH_DISTANCE,
  ArrowLayout,
  Rect,
  anchorFromPoint,
  closestPointOnPolyline,
  computeArrowLayouts,
  distToRect,
  getCardRect,
  getSegmentNormal,
} from "@/lib/editor/geometry";
import { EditableText } from "../EditableText";
import { useElementDrag } from "./CardElement";

function arrowThickness(thickness: ArrowThickness): number {
  const relationStroke = designPixels("--cards-rel-stroke");
  const menuStroke = designPixels("--menus-stroke");
  if (thickness === "thin") return relationStroke * 0.75;
  if (thickness === "thick") return relationStroke * 2 + menuStroke / 2;
  return relationStroke + menuStroke / 2;
}

function headPolygons(
  tip: Point,
  other: Point,
  head: ArrowHead,
  size: number,
  color: string
): React.ReactNode | null {
  if (head === "none") return null;

  const angle = Math.atan2(tip.y - other.y, tip.x - other.x);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // центр основания наконечника
  const bx = tip.x - dx * size;
  const by = tip.y - dy * size;
  // перпендикуляр
  const px = -dy;
  const py = dx;
  const halfW = size * 0.45;
  if (head === "line") {
    const p1 = `${bx + px * halfW * 1.25},${by + py * halfW * 1.25}`;
    const p2 = `${bx - px * halfW * 1.25},${by - py * halfW * 1.25}`;
    return (
      <polyline
        points={`${p1} ${tip.x},${tip.y} ${p2}`}
        fill="none"
        stroke={color}
        strokeWidth={Math.max(designPixels("--cards-rel-stroke"), size * 0.28)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  const pts = `${tip.x},${tip.y} ${bx + px * halfW},${by + py * halfW} ${bx - px * halfW},${by - py * halfW}`;
  return <polygon points={pts} fill={color} />;
}

const WAYPOINT_SNAP_ANGLES = [
  0, 30, 45, 60, 90, 120, 135, 150,
  180, 210, 225, 240, 270, 300, 315, 330,
].map((degrees) => (degrees * Math.PI) / 180);
const WAYPOINT_SNAP_CAPTURE = (5 * Math.PI) / 180;
const WAYPOINT_SNAP_RELEASE = (9 * Math.PI) / 180;

function snapWaypointToAngle(
  point: Point,
  origin: Point,
  snappedAngle: number | null
): { point: Point; angle: number | null } {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) return { point, angle: null };
  const angle = Math.atan2(dy, dx);
  const angleDifference = (a: number, b: number) =>
    Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

  if (snappedAngle !== null && angleDifference(angle, snappedAngle) <= WAYPOINT_SNAP_RELEASE) {
    return {
      point: {
        x: origin.x + Math.cos(snappedAngle) * distance,
        y: origin.y + Math.sin(snappedAngle) * distance,
      },
      angle: snappedAngle,
    };
  }

  let nearestAngle = WAYPOINT_SNAP_ANGLES[0];
  let nearestDifference = angleDifference(angle, nearestAngle);
  for (const candidate of WAYPOINT_SNAP_ANGLES.slice(1)) {
    const difference = angleDifference(angle, candidate);
    if (difference < nearestDifference) {
      nearestAngle = candidate;
      nearestDifference = difference;
    }
  }
  if (nearestDifference > WAYPOINT_SNAP_CAPTURE) return { point, angle: null };
  return {
    point: {
      x: origin.x + Math.cos(nearestAngle) * distance,
      y: origin.y + Math.sin(nearestAngle) * distance,
    },
    angle: nearestAngle,
  };
}

function shaftInset(head: ArrowHead, headSize: number, width: number): number {
  if (head === "triangle") {
    // Учитываем круглый strokeLinecap: видимая линия заканчивается ровно у основания.
    return headSize + width / 2;
  }
  if (head === "line") {
    return Math.max(designPixels("--cards-rel-stroke"), width * 1.25);
  }
  return 0;
}

/** Укоротить крайние сегменты ломаной, чтобы стержень не выходил из наконечника. */
function insetPolyline(points: Point[], startInset: number, endInset: number): Point[] {
  if (points.length < 2) return points;
  const out = points.map((p) => ({ ...p }));

  if (startInset > 0) {
    const from = out[0];
    const to = out[1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      const inset = Math.min(startInset, len - 0.01);
      out[0] = { x: from.x + (dx / len) * inset, y: from.y + (dy / len) * inset };
    }
  }
  if (endInset > 0) {
    const n = out.length;
    const from = out[n - 2];
    const to = out[n - 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      const inset = Math.min(endInset, len - 0.01);
      out[n - 1] = { x: to.x - (dx / len) * inset, y: to.y - (dy / len) * inset };
    }
  }
  return out;
}

function buildPath(points: Point[]): string {
  if (!points.length) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
}

function worldFromEvent(ev: PointerEvent | React.PointerEvent | React.MouseEvent): Point {
  const viewport = document.getElementById("editor-viewport");
  if (!viewport) return { x: 0, y: 0 };
  const rect = viewport.getBoundingClientRect();
  const view = useEditor.getState().view;
  return {
    x: (ev.clientX - rect.left - (rect.width / 2 + view.x)) / view.scale,
    y: (ev.clientY - rect.top - (rect.height / 2 + view.y)) / view.scale,
  };
}

function ArrowShape({
  arrow,
  layout,
  interactive,
}: {
  arrow: ArrowElement;
  layout: ArrowLayout;
  interactive: boolean;
}) {
  const selected = useEditor((s) => s.selectedIds.includes(arrow.id));
  const selectedWaypoint = useEditor((s) => s.selectedWaypoint);
  const groupSelected = useEditor((s) =>
    Boolean(
      arrow.groupId &&
        s.selectedIds.some((selectedElementId) =>
          s.elements[selectedElementId]?.groupId === arrow.groupId
        )
    )
  );
  const select = useEditor((s) => s.select);
  const toggleSelection = useEditor((s) => s.toggleSelection);
  const openMenu = useEditor((s) => s.openMenu);
  const pushHistory = useEditor((s) => s.pushHistory);
  const setSelectedWaypoint = useEditor((s) => s.setSelectedWaypoint);
  const insertWaypointAt = useEditor((s) => s.insertWaypointAt);
  const { onPointerDown } = useElementDrag("arrow-body");
  const outlined = selected || groupSelected;

  const points = layout.points;
  const first = points[0];
  const last = points[points.length - 1];

  const width = arrowThickness(arrow.thickness);
  const dashed = arrow.lineStyle === "dashed";
  const headSize = width * 3.4 + designPixels("--p-4");

  const showStart = arrow.ends === "both" || arrow.ends === "start";
  const showEnd = arrow.ends === "both" || arrow.ends === "end";
  const inset = shaftInset(arrow.head, headSize, width);
  const shaft = insetPolyline(points, showStart ? inset : 0, showEnd ? inset : 0);

  const hitPath = buildPath(points);
  const shaftPath = buildPath(shaft);

  const dragState = useRef<{ moved: boolean; pushed: boolean } | null>(null);

  const beginBodyDrag = (e: React.PointerEvent) => {
    if (!interactive || e.button !== 0) return;
    e.stopPropagation();
    if (e.shiftKey) {
      toggleSelection(arrow.id);
      return;
    }
    if (!useEditor.getState().selectedIds.includes(arrow.id)) select(arrow.id);
    if (arrow.fromCard || arrow.toCard) return; // привязанную двигаем за концы
    onPointerDown(e, (dxW, dyW) => {
      const cur = useEditor.getState().elements[arrow.id] as ArrowElement | undefined;
      if (!cur) return;
      useEditor.getState().moveElement(arrow.id, cur.x + dxW, cur.y + dyW);
    });
  };

  const beginEndDrag = (e: React.PointerEvent, end: "from" | "to") => {
    if (!interactive || e.button !== 0) return;
    e.stopPropagation();
    if (!useEditor.getState().selectedIds.includes(arrow.id)) select(arrow.id);
    dragState.current = { moved: false, pushed: false };

    const attachedCardId = end === "from" ? arrow.fromCard : arrow.toCard;
    let attached = Boolean(
      attachedCardId && useEditor.getState().elements[attachedCardId]?.kind === "card"
    );

    const move = (ev: PointerEvent) => {
      const st = dragState.current;
      if (!st) return;
      const world = worldFromEvent(ev);
      if (!st.pushed) {
        pushHistory();
        st.pushed = true;
        st.moved = true;
      }
      const state = useEditor.getState();
      const cur = state.elements[arrow.id] as ArrowElement | undefined;
      if (!cur) return;

      // Привязанный кончик скользит по грани карточки, пока его не увели
      // достаточно далеко — тогда он отвязывается, как и раньше.
      const cardElement = attachedCardId ? state.elements[attachedCardId] : undefined;
      const cardRect =
        cardElement?.kind === "card" ? getCardRect(cardElement, state.rects) : null;
      if (attached && cardRect) {
        if (distToRect(world, cardRect) <= ANCHOR_DETACH_DISTANCE) {
          const currentAnchor = end === "from" ? cur.fromAnchor : cur.toAnchor;
          const anchor = anchorFromPoint(cardRect, world, currentAnchor?.edge);
          state.updateElement(
            arrow.id,
            (end === "from" ? { fromAnchor: anchor } : { toAnchor: anchor }) as Partial<ArrowElement>
          );
          return;
        }
        attached = false;
        state.updateElement(
          arrow.id,
          (end === "from"
            ? { fromCard: undefined, fromAnchor: undefined }
            : { toCard: undefined, toAnchor: undefined }) as Partial<ArrowElement>
        );
      }

      const free = useEditor.getState().elements[arrow.id] as ArrowElement | undefined;
      if (!free) return;
      const patch: Partial<ArrowElement> =
        end === "from"
          ? {
              fromCard: undefined,
              fromAnchor: undefined,
              fromPoint: { x: world.x - free.x, y: world.y - free.y },
            }
          : {
              toCard: undefined,
              toAnchor: undefined,
              toPoint: { x: world.x - free.x, y: world.y - free.y },
            };
      useEditor.getState().updateElement(arrow.id, patch);
    };

    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };

    const up = (ev: PointerEvent) => {
      const st = dragState.current;
      dragState.current = null;
      finish();
      if (!st?.moved) return;

      // Кончик остался на своей карточке — привязка уже обновлена при движении.
      if (attached && attachedCardId) return;

      const world = worldFromEvent(ev);
      const state = useEditor.getState();
      let bestId: string | null = null;
      let bestRect: Rect | null = null;
      let bestDist = designPixels("--p-24") + designPixels("--p-4");
      for (const el of Object.values(state.elements)) {
        if (el.kind !== "card") continue;
        const rect = getCardRect(el as CardElement, state.rects);
        const dist = distToRect(world, rect);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = el.id;
          bestRect = rect;
        }
      }
      if (bestId) {
        const anchor = bestRect ? anchorFromPoint(bestRect, world) : undefined;
        useEditor
          .getState()
          .updateElement(
            arrow.id,
            (end === "from"
              ? { fromCard: bestId, fromAnchor: anchor }
              : { toCard: bestId, toAnchor: anchor }) as Partial<ArrowElement>
          );
      }
    };

    const cancel = () => {
      dragState.current = null;
      finish();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  const beginWaypointDrag = (e: React.PointerEvent, index: number) => {
    if (!interactive || e.button !== 0) return;
    e.stopPropagation();
    if (!useEditor.getState().selectedIds.includes(arrow.id)) select(arrow.id);
    setSelectedWaypoint({ arrowId: arrow.id, index });

    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    let snappedAngle: number | null = null;
    // Берём соседнюю точку перед перетаскиваемым изломом: именно угол
    // входящего сегмента привязывается к стандартным направлениям.
    const snapOrigin = layout.points[index] ?? {
      x: arrow.x + (arrow.waypoints?.[index - 1]?.x ?? arrow.fromPoint.x),
      y: arrow.y + (arrow.waypoints?.[index - 1]?.y ?? arrow.fromPoint.y),
    };
    const move = (ev: PointerEvent) => {
      if (!moved) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return;
        moved = true;
        pushHistory();
      }
      const candidate = worldFromEvent(ev);
      const snapped = snapWaypointToAngle(candidate, snapOrigin, snappedAngle);
      snappedAngle = snapped.angle;
      useEditor.getState().updateWaypoint(arrow.id, index, snapped.point);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!interactive) return;
    e.preventDefault();
    e.stopPropagation();
    if (!useEditor.getState().selectedIds.includes(arrow.id)) select(arrow.id);
    insertWaypointAt(arrow.id, worldFromEvent(e));
  };

  const openArrowMenu = (e: React.MouseEvent) => {
    if (!interactive) return;
    e.preventDefault();
    e.stopPropagation();
    if (!useEditor.getState().selectedIds.includes(arrow.id)) select(arrow.id);
    setSelectedWaypoint(null);
    openMenu({
      type: "arrow",
      screen: { x: e.clientX, y: e.clientY },
      world: worldFromEvent(e),
      elementId: arrow.id,
    });
  };

  const waypointWorldPoints = (arrow.waypoints ?? []).map((wp) => ({
    x: arrow.x + wp.x,
    y: arrow.y + wp.y,
  }));

  return (
    <g
      className={`arrow-group ${outlined ? "arrow-selected" : ""}`}
      data-arrow-id={arrow.id}
      data-selected={selected || undefined}
    >
      <path
        d={hitPath}
        stroke="transparent"
        strokeWidth={Math.max(designPixels("--p-16"), width + designPixels("--p-12"))}
        fill="none"
        style={{ pointerEvents: interactive ? "stroke" : "none", cursor: "pointer" }}
        onPointerDown={beginBodyDrag}
        onDoubleClick={handleDoubleClick}
        onContextMenu={openArrowMenu}
      />
      <path
        d={shaftPath}
        stroke={arrow.color}
        strokeWidth={width}
        strokeDasharray={dashed ? `${width * 2.6} ${width * 2}` : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={{ pointerEvents: "none" }}
      />
      {showStart && points.length >= 2 && headPolygons(first, points[1], arrow.head, headSize, arrow.color)}
      {showEnd &&
        points.length >= 2 &&
        headPolygons(last, points[points.length - 2], arrow.head, headSize, arrow.color)}
      {interactive && (
        <g className="arrow-handles">
          <circle
            cx={first.x}
            cy={first.y}
            r={designPixels("--p-6")}
            className="arrow-handle"
            style={{ cursor: "grab" }}
            onPointerDown={(e) => beginEndDrag(e, "from")}
            onContextMenu={openArrowMenu}
          >
            <title>Потяните вдоль грани карточки или отвяжите конец</title>
          </circle>
          <circle
            cx={last.x}
            cy={last.y}
            r={designPixels("--p-6")}
            className="arrow-handle"
            style={{ cursor: "grab" }}
            onPointerDown={(e) => beginEndDrag(e, "to")}
            onContextMenu={openArrowMenu}
          >
            <title>Потяните вдоль грани карточки или отвяжите конец</title>
          </circle>
          {waypointWorldPoints.map((point, index) => {
            const isSelected =
              selectedWaypoint?.arrowId === arrow.id && selectedWaypoint.index === index;
            return (
              <circle
                key={`wp-${index}`}
                cx={point.x}
                cy={point.y}
                r={designPixels("--p-6")}
                data-waypoint-arrow-id={arrow.id}
                data-waypoint-index={index}
                className={`arrow-handle arrow-handle--waypoint ${
                  isSelected ? "arrow-handle--selected" : ""
                }`}
                style={{ cursor: "grab" }}
                onPointerDown={(e) => beginWaypointDrag(e, index)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!useEditor.getState().selectedIds.includes(arrow.id)) select(arrow.id);
                  setSelectedWaypoint({ arrowId: arrow.id, index });
                }}
                onContextMenu={(e) => {
                  if (!interactive) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (!useEditor.getState().selectedIds.includes(arrow.id)) select(arrow.id);
                  setSelectedWaypoint({ arrowId: arrow.id, index });
                  openMenu({
                    type: "arrow-waypoint",
                    screen: { x: e.clientX, y: e.clientY },
                    world: worldFromEvent(e),
                    elementId: arrow.id,
                    waypointIndex: index,
                  });
                }}
              />
            );
          })}
        </g>
      )}
    </g>
  );
}

function ArrowDescription({
  arrow,
  layout,
  interactive,
}: {
  arrow: ArrowElement;
  layout: ArrowLayout;
  interactive: boolean;
}) {
  const editing = useEditor((state) => state.editing);
  const setRect = useEditor((state) => state.setRect);
  const pushHistory = useEditor((state) => state.pushHistory);
  const ref = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef(layout);
  const suppressClickUntil = useRef(0);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  const isEditing = editing?.id === arrow.id && editing.field === "label";
  const visible = Boolean(arrow.label) || isEditing;

  useEffect(() => {
    const element = ref.current;
    if (!visible || !element) return;
    const measure = () => setRect(arrow.id, element.offsetWidth, element.offsetHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [arrow.id, setRect, visible]);

  if (!visible) return null;

  const maxWidth =
    designPixels("--cards-dec-width") -
    designPixels("--comp-pad-hor") * 2 -
    designPixels("--comp-pad-vert");
  const fallbackWidth = arrow.label
    ? Math.min(
        maxWidth,
        Math.max(designPixels("--p-24"), arrow.label.length * designPixels("--p-6"))
      )
    : designPixels("--comp-pad-hor") * 2 + designPixels("--comp-pad-vert");

  const labelLayout =
    layout.label ??
    (() => {
      // fallback до первого измерения: середина текущего пути
      const points = layout.points;
      const a = points[Math.max(0, Math.floor(points.length / 2) - 1)];
      const b = points[Math.floor(points.length / 2)] ?? a;
      const rotation = a && b ? (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI : 0;
      return {
        t: 0.5,
        side: 1 as const,
        center: a ? { x: a.x, y: a.y } : { x: 0, y: 0 },
        rect: { x: -fallbackWidth / 2, y: 0, w: fallbackWidth, h: designPixels("--p-12") },
        rotation,
      };
    })();

  const beginLabelDrag = (e: React.PointerEvent) => {
    if (!interactive || e.button !== 0) return;
    if (e.shiftKey) return;
    const target = e.target as HTMLElement;
    if (target.closest("[contenteditable='true']")) return;
    if (useEditor.getState().editing?.id === arrow.id) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    let pushed = false;

    const move = (ev: PointerEvent) => {
      if (!moved) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return;
        moved = true;
      }
      if (!pushed) {
        pushHistory();
        pushed = true;
        if (!useEditor.getState().selectedIds.includes(arrow.id)) {
          useEditor.getState().select(arrow.id);
        }
      }
      const points = layoutRef.current.points;
      if (points.length < 2) return;
      const world = worldFromEvent(ev);
      const closest = closestPointOnPolyline(world, points);
      const index = closest.segmentIndex;
      const a = points[index];
      if (!a) return;
      const normal = getSegmentNormal(points, index, 1);
      const side: 1 | -1 =
        (world.x - a.x) * normal.x + (world.y - a.y) * normal.y >= 0 ? 1 : -1;
      useEditor.getState().setLabelPlacement(arrow.id, closest.t, side);
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (moved) suppressClickUntil.current = Date.now() + 400;
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div
      ref={ref}
      data-arrow-description={arrow.id}
      data-arrow-description-rotation={labelLayout.rotation}
      className="absolute font-[var(--font-weight-bold-small)]"
      style={{
        left: labelLayout.center.x,
        top: labelLayout.center.y,
        transform: `translate(-50%, -50%) rotate(${labelLayout.rotation}deg)`,
        transformOrigin: "center",
        width: "max-content",
        minWidth: isEditing
          ? designPixels("--comp-pad-hor") * 2 + designPixels("--comp-pad-vert")
          : undefined,
        maxWidth,
        fontSize: "var(--cards-age)",
        lineHeight: "var(--p-12)",
        pointerEvents: interactive ? "auto" : "none",
        cursor: interactive && !isEditing ? "grab" : undefined,
        userSelect: isEditing ? "text" : "none",
        WebkitUserSelect: isEditing ? "text" : "none",
      }}
      onPointerDownCapture={beginLabelDrag}
      onClickCapture={(event) => {
        if (Date.now() >= suppressClickUntil.current) return;
        suppressClickUntil.current = 0;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (interactive && event.shiftKey) {
          useEditor.getState().toggleSelection(arrow.id);
        }
      }}
      onContextMenu={(event) => {
        if (!interactive) return;
        event.preventDefault();
        event.stopPropagation();
        if (!useEditor.getState().selectedIds.includes(arrow.id)) {
          useEditor.getState().select(arrow.id);
        }
        useEditor.getState().openMenu({
          type: "arrow",
          screen: { x: event.clientX, y: event.clientY },
          world: worldFromEvent(event),
          elementId: arrow.id,
        });
      }}
    >
      <EditableText
        id={arrow.id}
        field="label"
        value={arrow.label}
        onChange={(value) => useEditor.getState().updateElement(arrow.id, { label: value })}
        title="Нажмите, чтобы редактировать; перетащите, чтобы переместить"
        className="text-center"
        style={{
          color: arrow.color,
          display: "inline-block",
          minWidth: isEditing
            ? designPixels("--comp-pad-hor") * 2 + designPixels("--comp-pad-vert")
            : undefined,
          maxWidth,
          wordBreak: "break-word",
          cursor: interactive && !isEditing ? "grab" : "text",
        }}
      />
    </div>
  );
}

const SVG_PAD = 5000;
const SVG_SPAN = 10000;

export function ArrowLayer({ interactive }: { interactive: boolean }) {
  const elements = useEditor((s) => s.elements);
  const rects = useEditor((s) => s.rects);
  const order = useEditor((s) => s.order);

  const layouts = useMemo(() => computeArrowLayouts(elements, rects), [elements, rects]);
  const arrows = useMemo(
    () =>
      order
        .map((id) => elements[id])
        .filter((el): el is ArrowElement => el?.kind === "arrow"),
    [elements, order]
  );

  return (
    <>
      <svg
        className="absolute pointer-events-none"
        style={{
          left: -SVG_PAD,
          top: -SVG_PAD,
          width: SVG_SPAN,
          height: SVG_SPAN,
          overflow: "visible",
        }}
      >
        <g transform={`translate(${SVG_PAD}, ${SVG_PAD})`}>
          {arrows.map((arrow) => {
            const layout = layouts.get(arrow.id);
            if (!layout) return null;
            return (
              <ArrowShape
                key={arrow.id}
                arrow={arrow}
                layout={layout}
                interactive={interactive}
              />
            );
          })}
        </g>
      </svg>
      {arrows.map((arrow) => {
        const layout = layouts.get(arrow.id);
        if (!layout) return null;
        return (
          <ArrowDescription
            key={arrow.id}
            arrow={arrow}
            layout={layout}
            interactive={interactive}
          />
        );
      })}
    </>
  );
}
