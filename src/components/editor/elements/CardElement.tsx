"use client";

/* Карточка персонажа: свёрнутая и развёрнутая версии */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { CircleUserRound } from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import {
  CardElement,
  CARD_COMPACT_MAX_WIDTH,
  CARD_EXPANDED_WIDTH,
} from "@/lib/editor/types";
import { requestAvatar } from "@/lib/editor/filepicker";
import { EditableText } from "../EditableText";

export function useElementDrag(kind: "move" | "arrow-body" | "arrow-end") {
  const pushHistory = useEditor((s) => s.pushHistory);
  const view = useEditor((s) => s.view);

  const start = useRef<{
    originX: number;
    originY: number;
    lastX: number;
    lastY: number;
    pushed: boolean;
  } | null>(null);
  const moved = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, onMove: (dxWorld: number, dyWorld: number, e: PointerEvent) => void) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        // Некоторые touch-браузеры уже отдают capture другому жесту (например, pinch).
      }
      start.current = {
        originX: e.clientX,
        originY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        pushed: false,
      };
      moved.current = false;

      const move = (ev: PointerEvent) => {
        const drag = start.current;
        if (!drag) return;

        const totalDx = ev.clientX - drag.originX;
        const totalDy = ev.clientY - drag.originY;
        if (!drag.pushed && Math.hypot(totalDx, totalDy) > 3) {
          pushHistory();
          drag.pushed = true;
          moved.current = true;
        }
        if (!drag.pushed) return;

        // Передаём приращение с прошлого pointermove, а не полный путь от точки
        // старта: обработчики прибавляют delta к текущей позиции элемента.
        const dxScreen = ev.clientX - drag.lastX;
        const dyScreen = ev.clientY - drag.lastY;
        drag.lastX = ev.clientX;
        drag.lastY = ev.clientY;
        onMove(dxScreen / view.scale, dyScreen / view.scale, ev);
      };
      const up = () => {
        start.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [pushHistory, view.scale]
  );

  return { onPointerDown, wasDrag: () => moved.current };
}

export function CardView({ card }: { card: CardElement }) {
  const updateElement = useEditor((s) => s.updateElement);
  const setRect = useEditor((s) => s.setRect);
  const exportMode = useEditor((s) => s.exportMode);
  const selected = useEditor((s) => s.selectedIds.includes(card.id));
  const groupSelected = useEditor((s) =>
    Boolean(
      card.groupId &&
        s.selectedIds.some((selectedId) => s.elements[selectedId]?.groupId === card.groupId)
    )
  );
  const select = useEditor((s) => s.select);
  const toggleSelection = useEditor((s) => s.toggleSelection);
  const openMenu = useEditor((s) => s.openMenu);
  const setEditing = useEditor((s) => s.setEditing);
  const { onPointerDown, wasDrag } = useElementDrag("move");
  const boxRef = useRef<HTMLDivElement | null>(null);

  const collapsed = exportMode
    ? exportMode.mode === "mini"
    : card.collapsed;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setRect(card.id, el.offsetWidth, el.offsetHeight);
    });
    ro.observe(el);
    setRect(card.id, el.offsetWidth, el.offsetHeight);
    return () => ro.disconnect();
  }, [card.id, collapsed, setRect]);

  const dragMove = useMemo(
    () => (dxW: number, dyW: number) => {
      const el = useEditor.getState().elements[card.id];
      if (el) useEditor.getState().moveElement(card.id, el.x + dxW, el.y + dyW);
    },
    [card.id]
  );

  const handlePointerDown = (event: React.PointerEvent) => {
    if (useEditor.getState().editing) return; // не таскаем во время редактирования текста
    if (event.shiftKey) {
      event.stopPropagation();
      toggleSelection(card.id);
      return;
    }
    if (!useEditor.getState().selectedIds.includes(card.id)) select(card.id);
    onPointerDown(event, dragMove);
  };

  const statusStyle: React.CSSProperties | undefined = card.status
    ? {
        background: card.status.color,
        color: "#161414",
        ...(collapsed
          ? { maxWidth: "100%", whiteSpace: "normal", overflowWrap: "anywhere" }
          : {}),
      }
    : undefined;

  const avatar = (
    <div
      className="shrink-0 rounded-full overflow-hidden bg-[#d9c9be] flex items-end justify-center cursor-pointer group/av relative"
      style={{ width: collapsed ? 64 : 72, height: collapsed ? 64 : 72 }}
      title="Нажмите, чтобы загрузить аватар"
      onPointerDown={(event) => {
        if (event.pointerType !== "touch" && !event.shiftKey) event.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.shiftKey || exportMode) return;
        requestAvatar(card.id);
      }}
    >
      {card.avatar ? (
         
        <img src={card.avatar} alt={`Аватар: ${card.name}`} className="w-full h-full object-cover" draggable={false} />
      ) : (
        <CircleUserRound size={collapsed ? 58 : 64} strokeWidth={0.8} className="text-[#c2ada0] -mb-0.5" />
      )}
    </div>
  );

  const years = (
    <EditableText
      id={card.id}
      field="years"
      value={card.years}
      onChange={(v) => updateElement(card.id, { years: v })}
      wrap={collapsed}
      className={`text-center text-[var(--cards-age)] ${collapsed ? "max-w-full break-all" : ""} ${card.years ? "opacity-70" : "opacity-40"}`}
      placeholder="Годы…"
    />
  );

  const outlined = !exportMode && (selected || groupSelected);

  const statusChip = card.status && (
    <span
      data-status-card-id={card.id}
      className="status-chip"
      style={statusStyle}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch" && !event.shiftKey) event.stopPropagation();
      }}
      onContextMenu={(e) => {
        if (exportMode) return;
        e.preventDefault();
        e.stopPropagation();
        openMenu({
          type: "status",
          screen: { x: e.clientX, y: e.clientY },
          world: { x: 0, y: 0 },
          elementId: card.id,
        });
      }}
    >
      <EditableText
        id={card.id}
        field="statusText"
        value={card.status.text}
        onChange={(v) =>
          updateElement(card.id, { status: { ...card.status!, text: v } })
        }
        wrap={collapsed}
        style={{
          display: "inline-block",
          minWidth: 24,
          maxWidth: "100%",
          overflowWrap: "anywhere",
          textAlign: "center",
        }}
      />
    </span>
  );

  return (
    <div
      ref={boxRef}
      data-element-id={card.id}
      data-card-variant={collapsed ? "compact" : "expanded"}
      data-selected={selected || undefined}
      data-group-selected={groupSelected || undefined}
      className={`p-card no-select absolute top-0 left-0 ${collapsed ? "w-max" : ""} ${outlined ? "outline outline-[1.5px] outline-[#9a7c5e]/60" : ""}`}
      style={{
        width: collapsed ? undefined : CARD_EXPANDED_WIDTH,
        maxWidth: collapsed ? CARD_COMPACT_MAX_WIDTH : undefined,
        transform: `translate(${card.x}px, ${card.y}px)`,
      }}
      onPointerDown={handlePointerDown}
      onClickCapture={(event) => {
        if (!wasDrag()) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onContextMenu={(e) => {
        if (exportMode) return;
        e.preventDefault();
        e.stopPropagation();
        if (!useEditor.getState().selectedIds.includes(card.id)) select(card.id);
        openMenu({
          type: "card",
          screen: { x: e.clientX, y: e.clientY },
          world: { x: 0, y: 0 },
          elementId: card.id,
        });
      }}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-1.5 px-3 py-4">
          {avatar}
          {years}
          <EditableText
            id={card.id}
            field="name"
            value={card.name}
            onChange={(v) => updateElement(card.id, { name: v })}
            wrap
            className="font-semibold text-[14px] leading-tight text-center max-w-full"
            style={{ wordBreak: "break-word" }}
          />
          {statusChip}
        </div>
      ) : (
        <div className="flex gap-3" style={{ padding: "var(--p-16)" }}>
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            {avatar}
            {years}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-2 flex-wrap">
              <EditableText
                id={card.id}
                field="name"
                value={card.name}
                onChange={(v) => updateElement(card.id, { name: v })}
                className="font-semibold text-[15px] leading-snug"
              />
              {statusChip}
            </div>
            <EditableText
              id={card.id}
              field="description"
              value={card.description}
              onChange={(v) => updateElement(card.id, { description: v })}
              multiline
              placeholder="Описание…"
              className="text-[12px] leading-[1.45] text-[var(--c-cards-text)] flex-1"
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
