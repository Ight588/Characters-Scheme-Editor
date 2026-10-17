"use client";

import { useCallback, useRef, type RefObject } from "react";
import { useEditor } from "@/lib/editor/store";

function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized > 180 ? normalized - 360 : normalized <= -180 ? normalized + 360 : normalized;
}

/** Общий жест поворота изображений и текстовых блоков вокруг их центра. */
export function useElementRotation(
  id: string,
  rotation: number,
  elementRef: RefObject<HTMLElement | null>,
  enabled: boolean
) {
  const gesture = useRef<{
    centerX: number;
    centerY: number;
    pointerX: number;
    pointerY: number;
    startAngle: number;
    startRotation: number;
    pushed: boolean;
  } | null>(null);

  return useCallback(
    (event: React.PointerEvent) => {
      if (!enabled || event.button !== 0 || !elementRef.current) return;
      event.preventDefault();
      event.stopPropagation();

      const bounds = elementRef.current.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      gesture.current = {
        centerX,
        centerY,
        pointerX: event.clientX,
        pointerY: event.clientY,
        startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
        startRotation: rotation,
        pushed: false,
      };

      const move = (moveEvent: PointerEvent) => {
        const current = gesture.current;
        if (!current) return;
        if (
          !current.pushed &&
          Math.hypot(
            moveEvent.clientX - current.pointerX,
            moveEvent.clientY - current.pointerY
          ) > 3
        ) {
          useEditor.getState().pushHistory();
          current.pushed = true;
        }
        if (!current.pushed) return;

        const angle = Math.atan2(
          moveEvent.clientY - current.centerY,
          moveEvent.clientX - current.centerX
        );
        let delta = angle - current.startAngle;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        useEditor.getState().updateElement(id, {
          rotation: normalizeDegrees(current.startRotation + (delta * 180) / Math.PI),
        });
      };

      const end = () => {
        gesture.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [elementRef, enabled, id, rotation]
  );
}
