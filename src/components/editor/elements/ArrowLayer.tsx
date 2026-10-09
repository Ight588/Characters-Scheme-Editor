"use client";

/* Слой стрелок: SVG-линии + HTML-подписи, привязка к карточкам */

import React, { useMemo, useRef } from "react";
import { useEditor } from "@/lib/editor/store";
import {
  ARROW_THICKNESS_PX,
  ArrowElement,
  ArrowHead,
  CardElement,
  Point,
} from "@/lib/editor/types";
import { computeArrowGeometries, distToRect, getCardRect } from "@/lib/editor/geometry";
import { EditableText } from "../EditableText";
import { useElementDrag } from "./CardElement";

function headPolygons(
  tip: Point,
  other: Point,
  head: ArrowHead,
  size: number,
  color: string
): React.ReactNode | null {
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
        strokeWidth={Math.max(1.6, size * 0.28)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  const pts = `${tip.x},${tip.y} ${bx + px * halfW},${by + py * halfW} ${bx - px * halfW},${by - py * halfW}`;
  return <polygon points={pts} fill={color} />;
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
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const openMenu = useEditor((s) => s.openMenu);
  const pushHistory = useEditor((s) => s.pushHistory);
  const { onPointerDown } = useElementDrag("arrow-body");
  const selected = selectedId === arrow.id;

  const width = ARROW_THICKNESS_PX[arrow.thickness];
  const dashed = arrow.lineStyle === "dashed";
  const d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  const headSize = width * 3.4 + 4;

  const showStart = arrow.ends === "both" || arrow.ends === "start";
  const showEnd = arrow.ends === "both" || arrow.ends === "end";

  const dragState = useRef<{ moved: boolean; pushed: boolean } | null>(null);

  const beginBodyDrag = (e: React.PointerEvent) => {
    if (!interactive || e.button !== 0) return;
    e.stopPropagation();
    select(arrow.id);
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
    select(arrow.id);
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
      let bestDist = 28;
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
    <g className={`arrow-group ${selected ? "arrow-selected" : ""}`} data-arrow-id={arrow.id}>
      <path
        d={d}
        stroke="transparent"
        strokeWidth={Math.max(16, width + 12)}
        fill="none"
        style={{ pointerEvents: interactive ? "stroke" : "none", cursor: "pointer" }}
        onPointerDown={beginBodyDrag}
        onContextMenu={(e) => {
          if (!interactive) return;
          e.preventDefault();
          e.stopPropagation();
          select(arrow.id);
          openMenu({
            type: "arrow",
            screen: { x: e.clientX, y: e.clientY },
            world: { x: 0, y: 0 },
            elementId: arrow.id,
          });
        }}
      />
      <path
        d={d}
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
            r={6}
            className="arrow-handle"
            style={{ cursor: "grab" }}
            onPointerDown={(e) => beginEndDrag(e, "from")}
          />
          <circle
            cx={to.x}
            cy={to.y}
            r={6}
            className="arrow-handle"
            style={{ cursor: "grab" }}
            onPointerDown={(e) => beginEndDrag(e, "to")}
          />
        </g>
      )}
    </g>
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
        const g = geometries.get(arrow.id);
        if (!g || !arrow.label) return null;
        const mid = { x: (g.from.x + g.to.x) / 2, y: (g.from.y + g.to.y) / 2 };
        return (
          <div
            key={arrow.id}
            className="absolute"
            style={{
              left: mid.x,
              top: mid.y,
              transform: "translate(-50%, -130%)",
              width: "max-content",
              maxWidth: 220,
              pointerEvents: interactive ? "auto" : "none",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              if (!interactive) return;
              e.preventDefault();
              e.stopPropagation();
              useEditor.getState().select(arrow.id);
              useEditor.getState().openMenu({
                type: "arrow",
                screen: { x: e.clientX, y: e.clientY },
                world: { x: 0, y: 0 },
                elementId: arrow.id,
              });
            }}
          >
            <EditableText
              id={arrow.id}
              field="label"
              value={arrow.label}
              onChange={(v) => useEditor.getState().updateElement(arrow.id, { label: v })}
              className="text-[12px] font-semibold text-center"
              style={{ color: arrow.color, wordBreak: "break-word" }}
            />
          </div>
        );
      })}
    </>
  );
}
