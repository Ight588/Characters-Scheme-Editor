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
  computeArrowGeometries,
  distToRect,
  getArrowDescriptionRect,
  getArrowDescriptionRotation,
  getCardRect,
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

function shaftInset(head: ArrowHead, headSize: number, width: number): number {
  if (head === "triangle") {
    // Учитываем круглый strokeLinecap: видимая линия заканчивается ровно у основания.
    return headSize + width / 2;
  }
  if (head === "line") {
    // Убираем стержень из вершины открытого наконечника, сохраняя визуальное соединение.
    return Math.max(designPixels("--cards-rel-stroke"), width * 1.25);
  }
  return 0;
}

function insetSegment(
  from: Point,
  to: Point,
  startInset: number,
  endInset: number
): { from: Point; to: Point } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return { from, to };

  // Короткая стрелка не должна инвертировать направление стержня.
  const requested = startInset + endInset;
  const factor = requested > length ? Math.max(0, length - 0.01) / requested : 1;
  const ux = dx / length;
  const uy = dy / length;
  const safeStart = startInset * factor;
  const safeEnd = endInset * factor;
  return {
    from: { x: from.x + ux * safeStart, y: from.y + uy * safeStart },
    to: { x: to.x - ux * safeEnd, y: to.y - uy * safeEnd },
  };
}

function ArrowShape({
  arrow,
  from,
  to,
  interactive,
}: {
  arrow: ArrowElement;
  from: Point;
  to: Point;
  interactive: boolean;
}) {
  const selected = useEditor((s) => s.selectedIds.includes(arrow.id));
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
  const { onPointerDown } = useElementDrag("arrow-body");
  const outlined = selected || groupSelected;

  const width = arrowThickness(arrow.thickness);
  const dashed = arrow.lineStyle === "dashed";
  const headSize = width * 3.4 + designPixels("--p-4");

  const showStart = arrow.ends === "both" || arrow.ends === "start";
  const showEnd = arrow.ends === "both" || arrow.ends === "end";
  const inset = shaftInset(arrow.head, headSize, width);
  const shaft = insetSegment(from, to, showStart ? inset : 0, showEnd ? inset : 0);
  const hitPath = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  const shaftPath = `M ${shaft.from.x} ${shaft.from.y} L ${shaft.to.x} ${shaft.to.y}`;

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

  const worldFromEvent = (ev: PointerEvent | React.PointerEvent): Point => {
    const viewport = document.getElementById("editor-viewport");
    if (!viewport) return { x: 0, y: 0 };
    const rect = viewport.getBoundingClientRect();
    const view = useEditor.getState().view;
    return {
      x: (ev.clientX - rect.left - (rect.width / 2 + view.x)) / view.scale,
      y: (ev.clientY - rect.top - (rect.height / 2 + view.y)) / view.scale,
    };
  };

  const beginEndDrag = (e: React.PointerEvent, end: "from" | "to") => {
    if (!interactive || e.button !== 0) return;
    e.stopPropagation();
    if (!useEditor.getState().selectedIds.includes(arrow.id)) select(arrow.id);
    dragState.current = { moved: false, pushed: false };

    const move = (ev: PointerEvent) => {
      const st = dragState.current;
      if (!st) return;
      const world = worldFromEvent(ev);
      if (!st.pushed) {
        pushHistory();
        st.pushed = true;
        st.moved = true;
      }
      const cur = useEditor.getState().elements[arrow.id] as ArrowElement | undefined;
      if (!cur) return;
      const patch: Partial<ArrowElement> =
        end === "from"
          ? { fromCard: undefined, fromPoint: { x: world.x - cur.x, y: world.y - cur.y } }
          : { toCard: undefined, toPoint: { x: world.x - cur.x, y: world.y - cur.y } };
      useEditor.getState().updateElement(arrow.id, patch);
    };

    const up = (ev: PointerEvent) => {
      const st = dragState.current;
      dragState.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!st?.moved) return;
      const world = worldFromEvent(ev);
      const state = useEditor.getState();
      let bestId: string | null = null;
      let bestDist = designPixels("--p-24") + designPixels("--p-4");
      for (const el of Object.values(state.elements)) {
        if (el.kind !== "card") continue;
        const dist = distToRect(world, getCardRect(el as CardElement, state.rects));
        if (dist < bestDist) {
          bestDist = dist;
          bestId = el.id;
        }
      }
      if (bestId && bestId !== arrow.id) {
        useEditor
          .getState()
          .updateElement(arrow.id, end === "from" ? { fromCard: bestId } : { toCard: bestId });
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <g
      className={`arrow-group ${outlined ? "arrow-selected" : ""}`}
      data-arrow-id={arrow.id}
      data-selected={selected || undefined}
    >
      <path
        d={hitPath}
        stroke="transparent"
        strokeWidth={Math.max(
          designPixels("--p-16"),
          width + designPixels("--p-12")
        )}
        fill="none"
        style={{ pointerEvents: interactive ? "stroke" : "none", cursor: "pointer" }}
        onPointerDown={beginBodyDrag}
        onContextMenu={(e) => {
          if (!interactive) return;
          e.preventDefault();
          e.stopPropagation();
          if (!useEditor.getState().selectedIds.includes(arrow.id)) select(arrow.id);
          openMenu({
            type: "arrow",
            screen: { x: e.clientX, y: e.clientY },
            world: { x: 0, y: 0 },
            elementId: arrow.id,
          });
        }}
      />
      <path
        d={shaftPath}
        stroke={arrow.color}
        strokeWidth={width}
        strokeDasharray={dashed ? `${width * 2.6} ${width * 2}` : undefined}
        strokeLinecap="round"
        fill="none"
        style={{ pointerEvents: "none" }}
      />
      {showStart && headPolygons(from, to, arrow.head, headSize, arrow.color)}
      {showEnd && headPolygons(to, from, arrow.head, headSize, arrow.color)}
      {interactive && (
        <g className="arrow-handles">
          <circle
            cx={from.x}
            cy={from.y}
            r={designPixels("--p-6")}
            className="arrow-handle"
            style={{ cursor: "grab" }}
            onPointerDown={(e) => beginEndDrag(e, "from")}
          />
          <circle
            cx={to.x}
            cy={to.y}
            r={designPixels("--p-6")}
            className="arrow-handle"
            style={{ cursor: "grab" }}
            onPointerDown={(e) => beginEndDrag(e, "to")}
          />
        </g>
      )}
    </g>
  );
}

function ArrowDescription({
  arrow,
  from,
  to,
  interactive,
}: {
  arrow: ArrowElement;
  from: Point;
  to: Point;
  interactive: boolean;
}) {
  const editing = useEditor((state) => state.editing);
  const measured = useEditor((state) => state.rects[arrow.id]);
  const setRect = useEditor((state) => state.setRect);
  const ref = useRef<HTMLDivElement | null>(null);
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
  const bounds = getArrowDescriptionRect(
    from,
    to,
    measured ?? { w: fallbackWidth, h: designPixels("--p-12") }
  );
  const rotation = getArrowDescriptionRotation(from, to);

  return (
    <div
      ref={ref}
      data-arrow-description={arrow.id}
      data-arrow-description-rotation={rotation}
      className="absolute font-[var(--font-weight-bold-small)]"
      style={{
        left: bounds.x + bounds.w / 2,
        top: bounds.y + bounds.h / 2,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        transformOrigin: "center",
        width: "max-content",
        minWidth: isEditing
          ? designPixels("--comp-pad-hor") * 2 + designPixels("--comp-pad-vert")
          : undefined,
        maxWidth,
        fontSize: "var(--cards-age)",
        lineHeight: "var(--p-12)",
        pointerEvents: interactive ? "auto" : "none",
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
          world: { x: 0, y: 0 },
          elementId: arrow.id,
        });
      }}
    >
      <EditableText
        id={arrow.id}
        field="label"
        value={arrow.label}
        onChange={(value) => useEditor.getState().updateElement(arrow.id, { label: value })}
        className="text-center"
        style={{
          color: arrow.color,
          display: "inline-block",
          minWidth: isEditing
            ? designPixels("--comp-pad-hor") * 2 + designPixels("--comp-pad-vert")
            : undefined,
          maxWidth,
          wordBreak: "break-word",
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

  const arrows = useMemo(
    () => Object.values(elements).filter((el): el is ArrowElement => el.kind === "arrow"),
    [elements]
  );
  const geometries = useMemo(() => computeArrowGeometries(elements, rects), [elements, rects]);

  return (
    <>
      <svg
        className="absolute pointer-events-none"
        style={{ left: -SVG_PAD, top: -SVG_PAD, width: SVG_SPAN, height: SVG_SPAN, overflow: "visible" }}
      >
        <g transform={`translate(${SVG_PAD}, ${SVG_PAD})`}>
          {arrows.map((arrow) => {
            const g = geometries.get(arrow.id);
            if (!g) return null;
            return (
              <ArrowShape
                key={arrow.id}
                arrow={arrow}
                from={g.from}
                to={g.to}
                interactive={interactive}
              />
            );
          })}
        </g>
      </svg>
      {arrows.map((arrow) => {
        const geometry = geometries.get(arrow.id);
        if (!geometry) return null;
        return (
          <ArrowDescription
            key={arrow.id}
            arrow={arrow}
            from={geometry.from}
            to={geometry.to}
            interactive={interactive}
          />
        );
      })}
    </>
  );
}
