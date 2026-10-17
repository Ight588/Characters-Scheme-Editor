"use client";

/* Изображение на холсте: перемещение, масштабирование, поворот, контекстное меню */

import React, { useEffect, useRef } from "react";
import { useEditor } from "@/lib/editor/store";
import { designPixels } from "@/lib/editor/design";
import { ImageElement } from "@/lib/editor/types";
import { useElementDrag } from "./CardElement";
import { useElementRotation } from "./useElementRotation";

export function ImageView({ image, interactive }: { image: ImageElement; interactive: boolean }) {
  const selectedId = useEditor((s) => s.selectedId);
  const selected = useEditor((s) => s.selectedIds.includes(image.id));
  const selectedCount = useEditor((s) => s.selectedIds.length);
  const groupSelected = useEditor((s) =>
    Boolean(
      image.groupId &&
        s.selectedIds.some((selectedElementId) =>
          s.elements[selectedElementId]?.groupId === image.groupId
        )
    )
  );
  const select = useEditor((s) => s.select);
  const toggleSelection = useEditor((s) => s.toggleSelection);
  const openMenu = useEditor((s) => s.openMenu);
  const exportMode = useEditor((s) => s.exportMode);
  const setRect = useEditor((s) => s.setRect);
  const { onPointerDown } = useElementDrag("move");
  const ref = useRef<HTMLDivElement | null>(null);
  const interactiveEl = interactive && !exportMode;
  const outlined = selected || groupSelected;
  const showControls = interactiveEl && selectedId === image.id && selectedCount === 1;
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
      const minimumSize = designPixels("--p-20") * 2;
      const minScale = Math.max(minimumSize / state.w, minimumSize / state.h);
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
      data-selected={selected || undefined}
      className={`absolute top-0 left-0 no-select ${
        outlined && interactiveEl ? "element-selection-outline" : ""
      }`}
      style={{
        width: image.width,
        height: image.height,
        transform: `translate(${image.x}px, ${image.y}px) rotate(${image.rotation}deg)`,
        transformOrigin: "center",
      }}
      onPointerDown={(event) => {
        if (!interactiveEl || event.button !== 0) return;
        event.stopPropagation();
        if (event.shiftKey) {
          toggleSelection(image.id);
          return;
        }
        if (!useEditor.getState().selectedIds.includes(image.id)) select(image.id);
        onPointerDown(event, dragMove);
      }}
      onContextMenu={(event) => {
        if (!interactiveEl) return;
        event.preventDefault();
        event.stopPropagation();
        if (!useEditor.getState().selectedIds.includes(image.id)) select(image.id);
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
        className="canvas-image"
        draggable={false}
      />
      {showControls && (
        <>
          <div
            data-transform-handle="rotate"
            className="transform-rotate"
            title="Повернуть"
            onPointerDown={beginRotate}
          >
            <span className="transform-stem" />
            <span className="transform-knob" />
          </div>
          <div
            data-transform-handle="resize"
            className="transform-resize"
            title="Изменить размер"
            onPointerDown={beginResize}
          />
        </>
      )}
    </div>
  );
}
