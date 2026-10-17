"use client";

/* Карточка персонажа: свёрнутая и развёрнутая версии */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useEditor } from "@/lib/editor/store";
import {
  CardElement,
  CARD_COMPACT_MAX_WIDTH,
  CARD_EXPANDED_WIDTH,
  DEFAULT_STATUS_COLOR,
} from "@/lib/editor/types";
import { requestAvatar } from "@/lib/editor/filepicker";
import { DOUBLE_TAP_DELAY_MS } from "@/lib/editor/interactions";
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
  const updateElement = useEditor((state) => state.updateElement);
  const setRect = useEditor((state) => state.setRect);
  const exportMode = useEditor((state) => state.exportMode);
  const editing = useEditor((state) => state.editing);
  const selected = useEditor((state) => state.selectedIds.includes(card.id));
  const groupSelected = useEditor((state) =>
    Boolean(
      card.groupId &&
        state.selectedIds.some(
          (selectedId) => state.elements[selectedId]?.groupId === card.groupId
        )
    )
  );
  const select = useEditor((state) => state.select);
  const toggleSelection = useEditor((state) => state.toggleSelection);
  const openMenu = useEditor((state) => state.openMenu);
  const { onPointerDown, wasDrag } = useElementDrag("move");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const avatarTouch = useRef(false);
  const avatarTapTimer = useRef<number | null>(null);

  const collapsed = exportMode ? exportMode.mode === "mini" : card.collapsed;
  const cardEditing = editing?.id === card.id;

  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setRect(card.id, element.offsetWidth, element.offsetHeight);
    });
    observer.observe(element);
    setRect(card.id, element.offsetWidth, element.offsetHeight);
    return () => observer.disconnect();
  }, [card.id, collapsed, setRect]);

  useEffect(
    () => () => {
      if (avatarTapTimer.current) window.clearTimeout(avatarTapTimer.current);
    },
    []
  );

  const dragMove = useMemo(
    () => (dxWorld: number, dyWorld: number) => {
      const element = useEditor.getState().elements[card.id];
      if (element) {
        useEditor.getState().moveElement(card.id, element.x + dxWorld, element.y + dyWorld);
      }
    },
    [card.id]
  );

  const handlePointerDown = (event: React.PointerEvent) => {
    if (useEditor.getState().editing) return;
    if (event.shiftKey) {
      event.stopPropagation();
      toggleSelection(card.id);
      return;
    }
    if (!useEditor.getState().selectedIds.includes(card.id)) select(card.id);
    onPointerDown(event, dragMove);
  };

  const avatar = (
    <div
      className="card-avatar group/av relative flex shrink-0 cursor-pointer items-end justify-center overflow-hidden"
      title="Нажмите, чтобы загрузить аватар"
      onPointerDown={(event) => {
        avatarTouch.current = event.pointerType === "touch";
        if (event.pointerType !== "touch" && !event.shiftKey) event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.shiftKey || exportMode) return;
        if (!avatarTouch.current) {
          requestAvatar(card.id);
          return;
        }
        avatarTouch.current = false;
        if (avatarTapTimer.current) window.clearTimeout(avatarTapTimer.current);
        avatarTapTimer.current = window.setTimeout(() => {
          avatarTapTimer.current = null;
          if (!useEditor.getState().menu) requestAvatar(card.id);
        }, DOUBLE_TAP_DELAY_MS);
      }}
    >
      {card.avatar && (
        <img
          src={card.avatar}
          alt={`Аватар: ${card.name}`}
          className="h-full w-full object-cover"
          draggable={false}
        />
      )}
    </div>
  );

  const years = (
    <div className="card-years">
      <EditableText
        id={card.id}
        field="years"
        value={card.years}
        onChange={(value) => updateElement(card.id, { years: value })}
        rich
        placeholder="Годы…"
        className="block max-w-full whitespace-nowrap text-center"
      />
    </div>
  );

  const restoreMissingStatus = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const active = document.activeElement as HTMLElement | null;
    if (active?.isContentEditable) active.blur();
    const state = useEditor.getState();
    state.pushHistory();
    state.updateElement(card.id, {
      status: { text: "Статус", color: DEFAULT_STATUS_COLOR },
    });
    state.setEditing({ id: card.id, field: "statusText" });
  };

  const statusChip = card.status ? (
    <div
      data-status-card-id={card.id}
      className={`status-chip ${
        card.status.color === DEFAULT_STATUS_COLOR ? "status-chip--default" : ""
      } ${collapsed ? "status-chip--compact" : "status-chip--expanded"}`}
      style={
        card.status.color === DEFAULT_STATUS_COLOR
          ? undefined
          : { background: card.status.color }
      }
      onPointerDown={(event) => {
        if (event.pointerType !== "touch" && !event.shiftKey) event.stopPropagation();
      }}
      onContextMenu={(event) => {
        if (exportMode) return;
        event.preventDefault();
        event.stopPropagation();
        openMenu({
          type: "status",
          screen: { x: event.clientX, y: event.clientY },
          world: { x: 0, y: 0 },
          elementId: card.id,
        });
      }}
    >
      <EditableText
        id={card.id}
        field="statusText"
        value={card.status.text}
        onChange={(value) =>
          updateElement(card.id, { status: { ...card.status!, text: value } })
        }
        rich
        wrap
        className="block max-w-full text-center"
      />
    </div>
  ) : !exportMode && cardEditing ? (
    <button
      type="button"
      data-text-format-toolbar
      data-missing-status
      className={`status-chip status-chip--missing ${
        collapsed ? "status-chip--compact" : "status-chip--expanded"
      }`}
      onPointerDown={restoreMissingStatus}
      title="Восстановить статус"
    >
      (отсутствует)
    </button>
  ) : null;

  const outlined = !exportMode && (selected || groupSelected);

  return (
    <div
      ref={boxRef}
      data-element-id={card.id}
      data-card-variant={collapsed ? "compact" : "expanded"}
      data-card-editing={cardEditing || undefined}
      data-selected={selected || undefined}
      data-group-selected={groupSelected || undefined}
      className={`p-card ${collapsed ? "p-card--compact" : "p-card--expanded"} no-select absolute left-0 top-0 ${
        outlined ? "element-selection-outline" : ""
      }`}
      style={{
        width: collapsed ? CARD_COMPACT_MAX_WIDTH : CARD_EXPANDED_WIDTH,
        transform: `translate(${card.x}px, ${card.y}px)`,
      }}
      onPointerDown={handlePointerDown}
      onClickCapture={(event) => {
        if (!wasDrag()) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onContextMenu={(event) => {
        if (exportMode) return;
        event.preventDefault();
        event.stopPropagation();
        if (!useEditor.getState().selectedIds.includes(card.id)) select(card.id);
        openMenu({
          type: "card",
          screen: { x: event.clientX, y: event.clientY },
          world: { x: 0, y: 0 },
          elementId: card.id,
        });
      }}
    >
      {collapsed ? (
        <>
          {avatar}
          <EditableText
            id={card.id}
            field="name"
            value={card.name}
            onChange={(value) => updateElement(card.id, { name: value })}
            wrap
            className="card-name block max-w-full text-center"
            style={{ wordBreak: "break-word" }}
          />
          {years}
          {statusChip}
        </>
      ) : (
        <>
          <div className="card-left">
            {avatar}
            {years}
          </div>
          <div className="card-right">
            <div className="card-heading-row">
              <EditableText
                id={card.id}
                field="name"
                value={card.name}
                onChange={(value) => updateElement(card.id, { name: value })}
                wrap
                className="card-name block max-w-full"
                style={{ wordBreak: "break-word" }}
              />
              {statusChip}
            </div>
            <EditableText
              id={card.id}
              field="description"
              value={card.description}
              onChange={(value) => updateElement(card.id, { description: value })}
              multiline
              as="div"
              placeholder="Описание…"
              className="card-description"
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            />
          </div>
        </>
      )}
    </div>
  );
}
