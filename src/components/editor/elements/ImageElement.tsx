"use client";

/* Изображение на холсте: перемещение, изменение размера, контекстное меню */

import React, { useEffect, useRef } from "react";
import { useEditor } from "@/lib/editor/store";
import { ImageElement } from "@/lib/editor/types";
import { useElementDrag } from "./CardElement";

export function ImageView({ image, interactive }: { image: ImageElement; interactive: boolean }) {
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const openMenu = useEditor((s) => s.openMenu);
  const exportMode = useEditor((s) => s.exportMode);
  const setRect = useEditor((s) => s.setRect);
  const { onPointerDown } = useElementDrag("move");
  const ref = useRef<HTMLDivElement | null>(null);
  const interactiveEl = interactive && !exportMode;

  useEffect(() => {
    setRect(image.id, image.width, image.height);
  }, [image.id, image.width, image.height, setRect]);

  const dragMove = (dxW: number, dyW: number) => {
    const cur = useEditor.getState().elements[image.id];
    if (cur) useEditor.getState().moveElement(image.id, cur.x + dxW, cur.y + dyW);
  };

  /* ресайз за угол с сохранением пропорций */
  const resizeState = useRef<{ pushed: boolean; startX: number; startY: number; w: number; h: number } | null>(null);

  const beginResize = (e: React.PointerEvent) => {
    if (!interactiveEl || e.button !== 0) return;
    e.stopPropagation();
    resizeState.current = {
      pushed: false,
      startX: e.clientX,
      startY: e.clientY,
      w: image.width,
      h: image.height,
    };
    const move = (ev: PointerEvent) => {
      const st = resizeState.current;
      if (!st) return;
      const view = useEditor.getState().view;
      const dx = (ev.clientX - st.startX) / view.scale;
      const dy = (ev.clientY - st.startY) / view.scale;
      if (!st.pushed && Math.hypot(dx, dy) > 3) {
        useEditor.getState().pushHistory();
        st.pushed = true;
      }
      if (!st.pushed) return;
      const ratio = st.h / st.w;
      const newW = Math.max(40, st.w + dx);
      useEditor.getState().updateElement(image.id, {
        width: Math.round(newW),
        height: Math.round(newW * ratio),
      });
    };
    const up = () => {
      resizeState.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={ref}
      data-element-id={image.id}
      className={`absolute top-0 left-0 no-select ${selectedId === image.id && interactiveEl ? "outline outline-[1.5px] outline-[#9a7c5e]/60" : ""}`}
      style={{ width: image.width, height: image.height, transform: `translate(${image.x}px, ${image.y}px)` }}
      onPointerDown={(e) => {
        if (!interactiveEl || e.button !== 0) return;
        e.stopPropagation();
        select(image.id);
        onPointerDown(e, dragMove);
      }}
      onContextMenu={(e) => {
        if (!interactiveEl) return;
        e.preventDefault();
        e.stopPropagation();
        select(image.id);
        openMenu({
          type: "image",
          screen: { x: e.clientX, y: e.clientY },
          world: { x: 0, y: 0 },
          elementId: image.id,
        });
      }}
    >
      { }
      <img
        src={image.src}
        alt="Изображение на холсте"
        className="w-full h-full object-cover rounded-[6px] shadow-[0_2px_10px_rgba(23,5,0,0.12)]"
        draggable={false}
      />
      {interactiveEl && (
        <div
          className="absolute -right-1.5 -bottom-1.5 w-4 h-4 rounded-full bg-[var(--c-menus-bg)] border-2 border-[#9a7c5e] cursor-nwse-resize"
          title="Изменить размер"
          onPointerDown={beginResize}
        />
      )}
    </div>
  );
}
