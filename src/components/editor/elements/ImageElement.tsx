"use client";

/* Изображение на холсте: перемещение, масштабирование, поворот, контекстное меню */

import React, { useEffect, useRef } from "react";
import { useEditor } from "@/lib/editor/store";
import { ImageElement } from "@/lib/editor/types";
import { useElementDrag } from "./CardElement";
import { useElementRotation } from "./useElementRotation";

export function ImageView({ image, interactive }: { image: ImageElement; interactive: boolean }) {
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const openMenu = useEditor((s) => s.openMenu);
  const exportMode = useEditor((s) => s.exportMode);
  const setRect = useEditor((s) => s.setRect);
  const { onPointerDown } = useElementDrag("move");
  const ref = useRef<HTMLDivElement | null>(null);
  const interactiveEl = interactive && !exportMode;
  const selected = selectedId === image.id;
  const showControls = interactiveEl && selected;
  const beginRotate = useElementRotation(image.id, image.rotation, ref, showControls);

  useEffect(() => {
    setRect(image.id, image.width, image.height);
  }, [image.id, image.width, image.height, setRect]);

  const dragMove = (dxW: number, dyW: number) => {
    const cur = useEditor.getState().elements[image.id];
    if (cur) useEditor.getState().moveElement(image.id, cur.x + dxW, cur.y + dyW);
  };

  /* Масштабирование за угол с сохранением пропорций. */
  const resizeState = useRef<{
    pushed: boolean;
    startX: number;
    startY: number;
    w: number;
    h: number;
    rotation: number;
  } | null>(null);

  const beginResize = (event: React.PointerEvent) => {
    if (!showControls || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeState.current = {
      pushed: false,
      startX: event.clientX,
      startY: event.clientY,
      w: image.width,
      h: image.height,
      rotation: image.rotation,
    };

    const move = (moveEvent: PointerEvent) => {
      const state = resizeState.current;
      if (!state) return;
      const view = useEditor.getState().view;
      const screenDx = (moveEvent.clientX - state.startX) / view.scale;
      const screenDy = (moveEvent.clientY - state.startY) / view.scale;
      if (!state.pushed && Math.hypot(screenDx, screenDy) > 3) {
        useEditor.getState().pushHistory();
        state.pushed = true;
      }
      if (!state.pushed) return;

      // Проецируем движение указателя на локальную диагональ повёрнутого изображения.
      const angle = (-state.rotation * Math.PI) / 180;
      const localDx = screenDx * Math.cos(angle) - screenDy * Math.sin(angle);
      const localDy = screenDx * Math.sin(angle) + screenDy * Math.cos(angle);
      const diagonal = Math.hypot(state.w, state.h);
      const alongDiagonal = (localDx * state.w + localDy * state.h) / diagonal;
      const minScale = Math.max(40 / state.w, 40 / state.h);
      const scale = Math.max(minScale, 1 + alongDiagonal / diagonal);

      useEditor.getState().updateElement(image.id, {
        width: Math.round(state.w * scale),
        height: Math.round(state.h * scale),
      });
    };

    const end = () => {
      resizeState.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return (
    <div
      ref={ref}
      data-element-id={image.id}
      data-element-rotation={image.rotation}
      className={`absolute top-0 left-0 no-select ${selected && interactiveEl ? "outline outline-[1.5px] outline-[#9a7c5e]/60" : ""}`}
      style={{
        width: image.width,
        height: image.height,
        transform: `translate(${image.x}px, ${image.y}px) rotate(${image.rotation}deg)`,
        transformOrigin: "center",
      }}
      onPointerDown={(event) => {
        if (!interactiveEl || event.button !== 0) return;
        event.stopPropagation();
        select(image.id);
        onPointerDown(event, dragMove);
      }}
      onContextMenu={(event) => {
        if (!interactiveEl) return;
        event.preventDefault();
        event.stopPropagation();
        select(image.id);
        openMenu({
          type: "image",
          screen: { x: event.clientX, y: event.clientY },
          world: { x: 0, y: 0 },
          elementId: image.id,
        });
      }}
    >
      <img
        src={image.src}
        alt="Изображение на холсте"
        className="w-full h-full object-cover rounded-[6px] shadow-[0_2px_10px_rgba(23,5,0,0.12)]"
        draggable={false}
      />
      {showControls && (
        <>
          <div
            data-transform-handle="rotate"
            className="absolute left-1/2 -top-8 flex h-8 w-5 -translate-x-1/2 cursor-grab flex-col items-center active:cursor-grabbing"
            title="Повернуть"
            onPointerDown={beginRotate}
          >
            <span className="h-4 w-px bg-[#9a7c5e]" />
            <span className="h-4 w-4 rounded-full border-2 border-[#9a7c5e] bg-[var(--c-menus-bg)]" />
          </div>
          <div
            data-transform-handle="resize"
            className="absolute -right-1.5 -bottom-1.5 w-4 h-4 rounded-full bg-[var(--c-menus-bg)] border-2 border-[#9a7c5e] cursor-nwse-resize"
            title="Изменить размер"
            onPointerDown={beginResize}
          />
        </>
      )}
    </div>
  );
}
