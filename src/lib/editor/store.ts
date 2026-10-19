"use client";

/* Zustand store редактора: состояние, история, действия */

import { create } from "zustand";
import {
  ArrowAnchor,
  ArrowElement,
  CanvasElement,
  CanvasSettings,
  CardElement,
  ImageElement,
  Point,
  SavedArrowStyle,
  SavedStatusItem,
  TextElement,
  View,
  DEFAULT_VIEW,
  DEFAULT_STATUS_COLOR,
  makeArrow,
  makeCard,
  makeText,
  normalizeArrowAnchor,
  normalizeCanvasSettings,
  normalizePoint,
  normalizeView,
  uid,
} from "./types";
import { computeArrowLayouts, suggestWaypointInsertion } from "./geometry";
import { clearStorage } from "./storage";

export type Snapshot = {
  title: string;
  elements: Record<string, CanvasElement>;
  order: string[];
  settings: CanvasSettings;
  savedStatuses: SavedStatusItem[];
  savedArrowStyles: SavedArrowStyle[];
};

export type MenuType = "canvas" | "card" | "arrow" | "arrow-waypoint" | "status" | "image" | "text" | "settings";

export type MenuState = {
  type: MenuType;
  screen: Point; // координаты курсора в окне
  world: Point; // точка в мировых координатах
  elementId?: string;
  waypointIndex?: number;
  sub?:
    | "cards"
    | "statuses"
    | "styles"
    | "link"
    | "group"
    | "unlink"
    | "status-color"
    | null;
  subTitle?: string;
};

export type PanelState =
  | { type: "arrow-style"; id: string; screen: Point }
  | { type: "canvas-bg"; screen: Point };

export type ExportMode = { mode: "full" | "mini" } | null;

type ClipboardPayload = {
  elements: CanvasElement[];
  anchor: Point;
};

export type FilePickKind = "image" | "avatar" | "bg" | "open";

type EditorState = {
  /* ---- персистимые ---- */
  hydrated: boolean;
  title: string;
  elements: Record<string, CanvasElement>;
  order: string[];
  settings: CanvasSettings;
  savedStatuses: SavedStatusItem[];
  savedArrowStyles: SavedArrowStyle[];
  view: View;

  /* ---- runtime ---- */
  rects: Record<string, { w: number; h: number }>;
  selectedId: string | null;
  selectedIds: string[];
  selectedWaypoint: { arrowId: string; index: number } | null;
  editing: { id: string; field: string } | null;
  menu: MenuState | null;
  panel: PanelState | null;
  shareOpen: boolean;
  clearAllConfirmOpen: boolean;
  clipboard: ClipboardPayload | null;
  exportMode: ExportMode;
  exportOffset: Point;
  uiHidden: boolean;
  past: Snapshot[];
  future: Snapshot[];

  /* ---- действия ---- */
  hydrate: (data: import("./types").PersistedState | null) => void;
  snapshot: () => Snapshot;
  pushHistory: () => void;
  applySnapshot: (s: Snapshot) => void;
  undo: () => void;
  redo: () => void;

  setTitle: (t: string) => void;

  addCardAt: (world: Point) => string;
  addArrowAt: (world: Point) => string;
  addTextAt: (world: Point) => string;
  addImageAt: (world: Point, src: string, w: number, h: number) => void;
  pasteAt: (world?: Point) => void;

  updateElement: (id: string, patch: Partial<CanvasElement>) => void;
  moveElement: (id: string, x: number, y: number) => void;
  removeElement: (id: string) => void;
  removeSelection: () => void;
  duplicateElement: (id: string) => void;
  copyCard: (id: string) => void;
  copySelection: () => void;
  groupSelection: () => void;
  ungroupSelection: () => void;

  linkCards: (fromId: string, toId: string) => void;
  unlinkCards: (aId: string, bId: string) => void;
  groupCards: (aId: string, bId: string) => void;
  ungroupCard: (id: string) => void;

  toggleCollapse: (id: string) => void;
  expandAllCards: () => void;
  collapseAllCards: () => void;

  setSettings: (patch: Partial<CanvasSettings>) => void;

  saveStatusFromCard: (cardId: string) => void;
  applySavedStatus: (cardId: string, statusId: string) => void;
  deleteSavedStatus: (statusId: string) => void;

  saveArrowStyleFrom: (arrowId: string) => void;
  applySavedArrowStyle: (arrowId: string, styleId: string) => void;
  deleteSavedArrowStyle: (styleId: string) => void;

  clearCanvas: () => void;
  clearAllData: () => void;
  loadFromFile: (data: import("./types").PersistedState) => void;

  setView: (v: View) => void;
  resetView: () => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (screen: Point, viewportSize: { w: number; h: number }, factor: number) => void;

  setRect: (id: string, w: number, h: number) => void;
  select: (id: string | null) => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  setEditing: (editing: { id: string; field: string } | null) => void;
  openMenu: (menu: MenuState | null) => void;
  openPanel: (panel: PanelState | null) => void;
  setShareOpen: (open: boolean) => void;
  setClearAllConfirmOpen: (open: boolean) => void;
  setExportMode: (mode: ExportMode) => void;
  setExportOffset: (p: Point) => void;
  toggleUiHidden: () => void;

  setSelectedWaypoint: (s: { arrowId: string; index: number } | null) => void;

  insertWaypointAt: (arrowId: string, world?: Point) => void;
  updateWaypoint: (arrowId: string, index: number, world: Point) => void;
  removeWaypoint: (arrowId: string, index: number) => void;
  resetArrowPosition: (arrowId: string) => void;
  setLabelPlacement: (arrowId: string, t: number, side: 1 | -1) => void;
  setArrowAnchor: (
    arrowId: string,
    end: "from" | "to",
    anchor: ArrowAnchor | null
  ) => void;
};

const MAX_HISTORY = 60;

function toSnapshot(s: EditorState): Snapshot {
  return {
    title: s.title,
    elements: { ...s.elements },
    order: [...s.order],
    settings: { ...s.settings },
    savedStatuses: s.savedStatuses.map((x) => ({ ...x })),
    savedArrowStyles: s.savedArrowStyles.map((x) => ({ ...x })),
  };
}

function normalizeRotation(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Number(value) % 360;
  return normalized > 180 ? normalized - 360 : normalized <= -180 ? normalized + 360 : normalized;
}

function normalizeCanvasElement(el: CanvasElement): CanvasElement {
  const base = { ...el, ...normalizePoint(el) } as CanvasElement;
  if (base.kind === "arrow") {
    const arrow = base as ArrowElement;
    const rawWaypoints = Array.isArray(arrow.waypoints) ? arrow.waypoints : [];
    const waypoints = rawWaypoints
      .filter(
        (point): point is Point =>
          Boolean(point) &&
          Number.isFinite(point?.x) &&
          Number.isFinite(point?.y)
      )
      .map((point) => ({ x: Number(point.x), y: Number(point.y) }));
    const labelT =
      typeof arrow.labelT === "number" && Number.isFinite(arrow.labelT)
        ? Math.max(0, Math.min(1, arrow.labelT))
        : undefined;
    const labelSide =
      arrow.labelSide === 1 || arrow.labelSide === -1 ? arrow.labelSide : undefined;
    const fromAnchor = normalizeArrowAnchor(arrow.fromAnchor);
    const toAnchor = normalizeArrowAnchor(arrow.toAnchor);
    return {
      ...base,
      fromPoint: normalizePoint(base.fromPoint),
      toPoint: normalizePoint(base.toPoint),
      fromAnchor,
      toAnchor,
      waypoints: waypoints.length ? waypoints : undefined,
      labelT,
      labelSide,
    } as CanvasElement;
  }
  if (base.kind === "image") {
    return {
      ...base,
      width: Number.isFinite(base.width) && base.width > 0 ? base.width : 1,
      height: Number.isFinite(base.height) && base.height > 0 ? base.height : 1,
      rotation: normalizeRotation(base.rotation),
    };
  }
  if (base.kind === "text") {
    return {
      ...base,
      width: Number.isFinite(base.width) && base.width > 0 ? base.width : 220,
      fontSize:
        Number.isFinite(base.fontSize) && base.fontSize > 0
          ? Math.min(240, Math.max(6, base.fontSize))
          : 14,
      rotation: normalizeRotation(base.rotation),
    };
  }
  return base;
}

function normalizeElements(
  list: CanvasElement[],
  preferredOrder: string[] = []
): {
  elements: Record<string, CanvasElement>;
  order: string[];
} {
  const elements: Record<string, CanvasElement> = {};
  const sourceOrder: string[] = [];
  for (const el of list) {
    if (!el || typeof el.id !== "string" || !el.kind) continue;
    const normalized = normalizeCanvasElement(el);
    elements[normalized.id] = normalized;
    if (!sourceOrder.includes(normalized.id)) sourceOrder.push(normalized.id);
  }

  // Сохраняем порядок слоёв из файла, но выкидываем удалённые/дублирующиеся id.
  const order: string[] = [];
  for (const id of [...preferredOrder, ...sourceOrder]) {
    if (elements[id] && !order.includes(id)) order.push(id);
  }
  return { elements, order };
}

function cloneCanvasElement(element: CanvasElement): CanvasElement {
  if (element.kind === "card") {
    return {
      ...element,
      status: element.status ? { ...element.status } : null,
    };
  }
  if (element.kind === "arrow") {
    return {
      ...element,
      fromPoint: { ...element.fromPoint },
      toPoint: { ...element.toPoint },
      ...(element.fromAnchor ? { fromAnchor: { ...element.fromAnchor } } : {}),
      ...(element.toAnchor ? { toAnchor: { ...element.toAnchor } } : {}),
      ...(element.waypoints ? { waypoints: element.waypoints.map((p) => ({ ...p })) } : {}),
      ...(element.labelT !== undefined ? { labelT: element.labelT } : {}),
      ...(element.labelSide !== undefined ? { labelSide: element.labelSide } : {}),
    } as CanvasElement;
  }
  return { ...element };
}

function clipboardAnchor(elements: CanvasElement[]): Point {
  if (!elements.length) return { x: 0, y: 0 };
  return {
    x: Math.min(...elements.map((element) => element.x)),
    y: Math.min(...elements.map((element) => element.y)),
  };
}

function activeSelection(state: EditorState): string[] {
  const selected = state.selectedIds.filter((id) => Boolean(state.elements[id]));
  if (selected.length) return [...new Set(selected)];
  return state.selectedId && state.elements[state.selectedId] ? [state.selectedId] : [];
}

export const useEditor = create<EditorState>((set, get) => ({
  hydrated: false,
  title: "",
  elements: {},
  order: [],
  settings: normalizeCanvasSettings(),
  savedStatuses: [],
  savedArrowStyles: [],
  view: { ...DEFAULT_VIEW },

  rects: {},
  selectedId: null,
  selectedIds: [],
  selectedWaypoint: null,
  editing: null,
  menu: null,
  panel: null,
  shareOpen: false,
  clearAllConfirmOpen: false,
  clipboard: null,
  exportMode: null,
  exportOffset: { x: 0, y: 0 },
  uiHidden: false,
  past: [],
  future: [],

  hydrate: (data) => {
    if (!data) {
      set({ hydrated: true });
      return;
    }
    const { elements, order } = normalizeElements(data.elements, data.order);
    set({
      hydrated: true,
      title: data.title ?? "",
      elements,
      order,
      settings: normalizeCanvasSettings(data.settings),
      savedStatuses: data.savedStatuses ?? [],
      savedArrowStyles: data.savedArrowStyles ?? [],
      view: normalizeView(data.view),
      selectedId: null,
      selectedIds: [],
      selectedWaypoint: null,
      editing: null,
      menu: null,
      panel: null,
      past: [],
      future: [],
    });
  },

  snapshot: () => toSnapshot(get()),

  pushHistory: () => {
    const s = get();
    const snap = toSnapshot(s);
    set({
      past: [...s.past.slice(-MAX_HISTORY + 1), snap],
      future: [],
    });
  },

  applySnapshot: (snap) => {
    set({
      title: snap.title,
      elements: { ...snap.elements },
      order: [...snap.order],
      settings: { ...snap.settings },
      savedStatuses: snap.savedStatuses.map((x) => ({ ...x })),
      savedArrowStyles: snap.savedArrowStyles.map((x) => ({ ...x })),
      selectedId: null,
      selectedIds: [],
      selectedWaypoint: null,
      editing: null,
    });
  },

  undo: () => {
    const s = get();
    if (!s.past.length) return;
    const prev = s.past[s.past.length - 1];
    const cur = toSnapshot(s);
    set({
      past: s.past.slice(0, -1),
      future: [...s.future.slice(-MAX_HISTORY + 1), cur],
      ...prev,
      elements: { ...prev.elements },
      order: [...prev.order],
      selectedId: null,
      selectedIds: [],
      selectedWaypoint: null,
      editing: null,
      menu: null,
      panel: null,
    });
  },

  redo: () => {
    const s = get();
    if (!s.future.length) return;
    const next = s.future[s.future.length - 1];
    const cur = toSnapshot(s);
    set({
      future: s.future.slice(0, -1),
      past: [...s.past.slice(-MAX_HISTORY + 1), cur],
      ...next,
      elements: { ...next.elements },
      order: [...next.order],
      selectedId: null,
      selectedIds: [],
      selectedWaypoint: null,
      editing: null,
      menu: null,
      panel: null,
    });
  },

  setTitle: (t) => {
    get().pushHistory();
    set({ title: t });
  },

  addCardAt: (world) => {
    get().pushHistory();
    const point = normalizePoint(world);
    const card = makeCard(point.x, point.y, {
      status: { text: "Статус", color: DEFAULT_STATUS_COLOR },
    });
    set((s) => ({
      elements: { ...s.elements, [card.id]: card },
      order: [...s.order, card.id],
      selectedId: card.id,
      selectedIds: [card.id],
      menu: null,
    }));
    return card.id;
  },

  addArrowAt: (world) => {
    get().pushHistory();
    const point = normalizePoint(world);
    const arrow = makeArrow(point.x, point.y);
    set((s) => ({
      elements: { ...s.elements, [arrow.id]: arrow },
      order: [...s.order, arrow.id],
      selectedId: arrow.id,
      selectedIds: [arrow.id],
      menu: null,
    }));
    return arrow.id;
  },

  addTextAt: (world) => {
    get().pushHistory();
    const point = normalizePoint(world);
    const text = makeText(point.x, point.y);
    set((s) => ({
      elements: { ...s.elements, [text.id]: text },
      order: [...s.order, text.id],
      selectedId: text.id,
      selectedIds: [text.id],
      editing: { id: text.id, field: "html" },
      menu: null,
    }));
    return text.id;
  },

  addImageAt: (world, src, w, h) => {
    get().pushHistory();
    const point = normalizePoint(world);
    const img: ImageElement = {
      id: uid("img"),
      kind: "image",
      x: point.x,
      y: point.y,
      src,
      width: Number.isFinite(w) && w > 0 ? w : 1,
      height: Number.isFinite(h) && h > 0 ? h : 1,
      rotation: 0,
    };
    set((s) => ({
      elements: { ...s.elements, [img.id]: img },
      order: [...s.order, img.id],
      selectedId: img.id,
      selectedIds: [img.id],
    }));
  },

  pasteAt: (world) => {
    const state = get();
    const source = state.clipboard?.elements ?? [];
    if (!source.length || !state.clipboard) return;
    state.pushHistory();

    const target = world
      ? normalizePoint(world)
      : { x: state.clipboard.anchor.x + 24, y: state.clipboard.anchor.y + 24 };
    const dx = target.x - state.clipboard.anchor.x;
    const dy = target.y - state.clipboard.anchor.y;
    const idMap = new Map(source.map((element) => [element.id, uid(element.kind)]));
    const groupCounts = new Map<string, number>();
    for (const element of source) {
      if (element.groupId) {
        groupCounts.set(element.groupId, (groupCounts.get(element.groupId) ?? 0) + 1);
      }
    }
    const groupMap = new Map<string, string>();
    const copies = source.map((sourceElement) => {
      const copy = cloneCanvasElement(sourceElement);
      copy.id = idMap.get(sourceElement.id)!;
      copy.x += dx;
      copy.y += dy;
      if (sourceElement.groupId && (groupCounts.get(sourceElement.groupId) ?? 0) > 1) {
        if (!groupMap.has(sourceElement.groupId)) groupMap.set(sourceElement.groupId, uid("grp"));
        copy.groupId = groupMap.get(sourceElement.groupId);
      } else {
        copy.groupId = undefined;
      }
      if (copy.kind === "arrow") {
        if (copy.fromCard && idMap.has(copy.fromCard)) copy.fromCard = idMap.get(copy.fromCard);
        if (copy.toCard && idMap.has(copy.toCard)) copy.toCard = idMap.get(copy.toCard);
      }
      return copy;
    });

    set((current) => {
      const elements = { ...current.elements };
      for (const copy of copies) elements[copy.id] = copy;
      const selectedIds = copies.map((copy) => copy.id);
      return {
        elements,
        order: [...current.order, ...selectedIds],
        selectedId: selectedIds[selectedIds.length - 1] ?? null,
        selectedIds,
        editing: null,
        menu: null,
        clipboard: {
          elements: copies.map(cloneCanvasElement),
          anchor: clipboardAnchor(copies),
        },
      };
    });
  },

  updateElement: (id, patch) => {
    set((s) => {
      const el = s.elements[id];
      if (!el) return s;
      const updated = { ...el, ...patch } as CanvasElement;
      return { elements: { ...s.elements, [id]: updated } };
    });
  },

  moveElement: (id, x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    set((state) => {
      const element = state.elements[id];
      if (!element) return state;
      const dx = x - element.x;
      const dy = y - element.y;
      if (dx === 0 && dy === 0) return state;

      const movingIds = new Set<string>();
      const selection = activeSelection(state);
      if (selection.length > 1 && selection.includes(id)) {
        for (const selectedId of selection) movingIds.add(selectedId);
      } else {
        movingIds.add(id);
      }

      // Любой участник группы перемещает всю группу; Set не даёт сдвинуть
      // элемент дважды, если группа и множественное выделение пересекаются.
      const selectedGroupIds = new Set(
        [...movingIds]
          .map((movingId) => state.elements[movingId]?.groupId)
          .filter((groupId): groupId is string => Boolean(groupId))
      );
      if (selectedGroupIds.size) {
        for (const candidate of Object.values(state.elements)) {
          if (candidate.groupId && selectedGroupIds.has(candidate.groupId)) {
            movingIds.add(candidate.id);
          }
        }
      }

      const elements = { ...state.elements };
      for (const movingId of movingIds) {
        const current = elements[movingId];
        if (!current) continue;
        elements[movingId] = {
          ...current,
          x: current.x + dx,
          y: current.y + dy,
        } as CanvasElement;
      }
      return { elements };
    });
  },

  removeElement: (id) => {
    const s = get();
    const el = s.elements[id];
    if (!el) return;
    s.pushHistory();

    const elements = { ...s.elements };
    const removedIds = new Set<string>([id]);
    delete elements[id];

    // Вместе с карточкой удаляем привязанные стрелки, в том числе из order/rects.
    if (el.kind === "card") {
      for (const other of Object.values(elements)) {
        if (other.kind === "arrow" && (other.fromCard === id || other.toCard === id)) {
          removedIds.add(other.id);
          delete elements[other.id];
        }
      }
    }

    const rects = { ...s.rects };
    for (const removedId of removedIds) delete rects[removedId];

    set((current) => {
      const selectedIds = current.selectedIds.filter(
        (selectedId) => !removedIds.has(selectedId)
      );
      return {
        elements,
        order: current.order.filter(
          (elementId) => !removedIds.has(elementId) && Boolean(elements[elementId])
        ),
        rects,
        selectedIds,
        selectedId:
          current.selectedId && removedIds.has(current.selectedId)
            ? selectedIds[selectedIds.length - 1] ?? null
            : current.selectedId,
        editing:
          current.editing && removedIds.has(current.editing.id) ? null : current.editing,
        menu: null,
        panel:
          current.panel?.type === "arrow-style" && removedIds.has(current.panel.id)
            ? null
            : current.panel,
      };
    });
  },

  removeSelection: () => {
    const state = get();
    const selectedIds = activeSelection(state);
    if (!selectedIds.length) return;
    state.pushHistory();

    const removedIds = new Set(selectedIds);
    for (const selectedId of selectedIds) {
      if (state.elements[selectedId]?.kind !== "card") continue;
      for (const element of Object.values(state.elements)) {
        if (
          element.kind === "arrow" &&
          (element.fromCard === selectedId || element.toCard === selectedId)
        ) {
          removedIds.add(element.id);
        }
      }
    }

    set((current) => {
      const elements = { ...current.elements };
      const rects = { ...current.rects };
      for (const removedId of removedIds) {
        delete elements[removedId];
        delete rects[removedId];
      }
      return {
        elements,
        order: current.order.filter((id) => !removedIds.has(id) && Boolean(elements[id])),
        rects,
        selectedId: null,
        selectedIds: [],
        editing:
          current.editing && removedIds.has(current.editing.id) ? null : current.editing,
        menu: null,
        panel:
          current.panel?.type === "arrow-style" && removedIds.has(current.panel.id)
            ? null
            : current.panel,
      };
    });
  },

  duplicateElement: (id) => {
    const s = get();
    const el = s.elements[id];
    if (!el) return;
    s.pushHistory();
    const copy = {
      ...el,
      id: uid(el.kind),
      x: el.x + 24,
      y: el.y + 24,
      groupId: undefined,
    } as CanvasElement;
    if (copy.kind === "arrow") {
      copy.fromCard = undefined;
      copy.toCard = undefined;
      copy.fromAnchor = undefined;
      copy.toAnchor = undefined;
      copy.fromPoint = { x: 0, y: 0 };
      copy.toPoint = { x: 200, y: 0 };
    }
    set((st) => ({
      elements: { ...st.elements, [copy.id]: copy },
      order: [...st.order, copy.id],
      selectedId: copy.id,
      selectedIds: [copy.id],
      menu: null,
    }));
  },

  copyCard: (id) => {
    const element = get().elements[id];
    if (!element || element.kind !== "card") return;
    const copy = cloneCanvasElement(element);
    set({ clipboard: { elements: [copy], anchor: { x: copy.x, y: copy.y } } });
  },

  copySelection: () => {
    const state = get();
    const elements = activeSelection(state)
      .map((id) => state.elements[id])
      .filter((element): element is CanvasElement => Boolean(element))
      .map(cloneCanvasElement);
    if (!elements.length) return;
    set({ clipboard: { elements, anchor: clipboardAnchor(elements) } });
  },

  groupSelection: () => {
    const state = get();
    const selectedIds = activeSelection(state);
    if (selectedIds.length < 2) return;
    state.pushHistory();
    const groupId = uid("grp");
    set((current) => {
      const elements = { ...current.elements };
      for (const selectedId of selectedIds) {
        const element = elements[selectedId];
        if (element) elements[selectedId] = { ...element, groupId } as CanvasElement;
      }
      return { elements, menu: null, panel: null };
    });
  },

  ungroupSelection: () => {
    const state = get();
    const groupIds = new Set(
      activeSelection(state)
        .map((id) => state.elements[id]?.groupId)
        .filter((groupId): groupId is string => Boolean(groupId))
    );
    if (!groupIds.size) return;
    state.pushHistory();
    set((current) => {
      const elements = { ...current.elements };
      for (const element of Object.values(elements)) {
        if (element.groupId && groupIds.has(element.groupId)) {
          elements[element.id] = { ...element, groupId: undefined } as CanvasElement;
        }
      }
      return { elements, menu: null, panel: null };
    });
  },

  linkCards: (fromId, toId) => {
    const s = get();
    if (fromId === toId) return;
    const from = s.elements[fromId];
    const to = s.elements[toId];
    if (!from || !to || from.kind !== "card" || to.kind !== "card") return;
    // если связь уже есть — не дублируем
    const exists = Object.values(s.elements).some(
      (el) => el.kind === "arrow" && el.fromCard === fromId && el.toCard === toId
    );
    if (exists) {
      set({ menu: null });
      return;
    }
    s.pushHistory();
    const fc = from as CardElement;
    const tc = to as CardElement;
    const arrow = makeArrow(0, 0, {
      fromCard: fromId,
      toCard: toId,
      fromPoint: { x: 0, y: 0 },
      toPoint: { x: 0, y: 0 },
    });
    arrow.x = (fc.x + tc.x) / 2;
    arrow.y = (fc.y + tc.y) / 2;
    set((st) => ({
      elements: { ...st.elements, [arrow.id]: arrow },
      order: [...st.order, arrow.id],
      selectedId: arrow.id,
      selectedIds: [arrow.id],
      menu: null,
    }));
  },

  unlinkCards: (aId, bId) => {
    const s = get();
    const linked = Object.values(s.elements).filter(
      (el) =>
        el.kind === "arrow" &&
        ((el.fromCard === aId && el.toCard === bId) || (el.fromCard === bId && el.toCard === aId))
    );
    if (!linked.length) {
      set({ menu: null });
      return;
    }
    s.pushHistory();
    const elements = { ...s.elements };
    for (const l of linked) delete elements[l.id];
    set((st) => ({
      elements,
      order: st.order.filter((x) => elements[x]),
      menu: null,
    }));
  },

  groupCards: (aId, bId) => {
    const s = get();
    const a = s.elements[aId];
    const b = s.elements[bId];
    if (!a || !b || a.kind !== "card" || b.kind !== "card") return;
    s.pushHistory();
    const gid = a.groupId ?? b.groupId ?? uid("grp");
    set((st) => {
      const elements = { ...st.elements };
      elements[aId] = { ...(elements[aId] as CardElement), groupId: gid };
      elements[bId] = { ...(elements[bId] as CardElement), groupId: gid };
      return { elements, menu: null };
    });
  },

  ungroupCard: (id) => {
    const s = get();
    const el = s.elements[id];
    if (!el || el.kind !== "card" || !el.groupId) return;
    s.pushHistory();
    set((st) => ({
      elements: {
        ...st.elements,
        [id]: { ...(st.elements[id] as CardElement), groupId: undefined },
      },
      menu: null,
    }));
  },

  toggleCollapse: (id) => {
    const s = get();
    const el = s.elements[id];
    if (!el || el.kind !== "card") return;
    s.pushHistory();
    set((st) => ({
      elements: {
        ...st.elements,
        [id]: { ...(st.elements[id] as CardElement), collapsed: !(st.elements[id] as CardElement).collapsed },
      },
      menu: null,
    }));
  },

  expandAllCards: () => {
    const s = get();
    s.pushHistory();
    set((st) => {
      const elements = { ...st.elements };
      for (const el of Object.values(elements)) {
        if (el.kind === "card") elements[el.id] = { ...el, collapsed: false };
      }
      return { elements, menu: null };
    });
  },

  collapseAllCards: () => {
    const s = get();
    s.pushHistory();
    set((st) => {
      const elements = { ...st.elements };
      for (const el of Object.values(elements)) {
        if (el.kind === "card") elements[el.id] = { ...el, collapsed: true };
      }
      return { elements, menu: null };
    });
  },

  setSettings: (patch) => {
    set((s) => ({ settings: normalizeCanvasSettings({ ...s.settings, ...patch }) }));
  },

  saveStatusFromCard: (cardId) => {
    const s = get();
    const card = s.elements[cardId];
    if (!card || card.kind !== "card" || !card.status) return;
    s.pushHistory();
    set((st) => ({
      savedStatuses: [
        ...st.savedStatuses,
        { id: uid("st"), text: card.status!.text, color: card.status!.color },
      ],
      menu: { ...(st.menu ?? { type: "status", screen: { x: 0, y: 0 }, world: { x: 0, y: 0 }, elementId: cardId })!, sub: "statuses", subTitle: "Список статусов" },
    }));
  },

  applySavedStatus: (cardId, statusId) => {
    const s = get();
    const item = s.savedStatuses.find((x) => x.id === statusId);
    const card = s.elements[cardId];
    if (!item || !card || card.kind !== "card") return;
    s.pushHistory();
    set((st) => ({
      elements: {
        ...st.elements,
        [cardId]: { ...(st.elements[cardId] as CardElement), status: { text: item.text, color: item.color } },
      },
      menu: null,
    }));
  },

  deleteSavedStatus: (statusId) => {
    const s = get();
    s.pushHistory();
    set((st) => ({
      savedStatuses: st.savedStatuses.filter((x) => x.id !== statusId),
    }));
  },

  saveArrowStyleFrom: (arrowId) => {
    const s = get();
    const arrow = s.elements[arrowId];
    if (!arrow || arrow.kind !== "arrow") return;
    s.pushHistory();
    set((st) => ({
      savedArrowStyles: [
        ...st.savedArrowStyles,
        {
          id: uid("style"),
          color: arrow.color,
          lineStyle: arrow.lineStyle,
          thickness: arrow.thickness,
          head: arrow.head,
          ends: arrow.ends,
        },
      ],
      menu: { ...(st.menu ?? { type: "arrow", screen: { x: 0, y: 0 }, world: { x: 0, y: 0 }, elementId: arrowId })!, sub: "styles", subTitle: "Список стилей" },
    }));
  },

  applySavedArrowStyle: (arrowId, styleId) => {
    const s = get();
    const item = s.savedArrowStyles.find((x) => x.id === styleId);
    const arrow = s.elements[arrowId];
    if (!item || !arrow || arrow.kind !== "arrow") return;
    s.pushHistory();
    set((st) => ({
      elements: {
        ...st.elements,
        [arrowId]: {
          ...(st.elements[arrowId] as ArrowElement),
          color: item.color,
          lineStyle: item.lineStyle,
          thickness: item.thickness,
          head: item.head,
          ends: item.ends,
        },
      },
      menu: null,
    }));
  },

  deleteSavedArrowStyle: (styleId) => {
    get().pushHistory();
    set((s) => ({ savedArrowStyles: s.savedArrowStyles.filter((x) => x.id !== styleId) }));
  },

  clearCanvas: () => {
    const s = get();
    if (!Object.keys(s.elements).length && !s.order.length && s.title === "") {
      set({
        menu: null,
        panel: null,
        selectedId: null,
        selectedIds: [],
        selectedWaypoint: null,
        editing: null,
        rects: {},
        clipboard: null,
        view: { ...DEFAULT_VIEW },
      });
      return;
    }
    s.pushHistory();
    set({
      elements: {},
      order: [],
      rects: {},
      selectedId: null,
      selectedIds: [],
      selectedWaypoint: null,
      editing: null,
      menu: null,
      panel: null,
      clipboard: null,
      title: "",
      view: { ...DEFAULT_VIEW },
    });
  },

  clearAllData: () => {
    set({
      hydrated: true,
      title: "",
      elements: {},
      order: [],
      settings: normalizeCanvasSettings(),
      savedStatuses: [],
      savedArrowStyles: [],
      view: { ...DEFAULT_VIEW },
      rects: {},
      selectedId: null,
      selectedIds: [],
      selectedWaypoint: null,
      editing: null,
      menu: null,
      panel: null,
      shareOpen: false,
      clearAllConfirmOpen: false,
      clipboard: null,
      exportMode: null,
      exportOffset: { x: 0, y: 0 },
      uiHidden: false,
      past: [],
      future: [],
    });
    void clearStorage().catch(() => {});
  },

  loadFromFile: (data) => {
    get().pushHistory();
    const { elements, order } = normalizeElements(data.elements, data.order);
    set({
      title: data.title ?? "",
      elements,
      order,
      settings: normalizeCanvasSettings(data.settings),
      savedStatuses: data.savedStatuses ?? [],
      savedArrowStyles: data.savedArrowStyles ?? [],
      view: normalizeView(data.view),
      selectedId: null,
      selectedIds: [],
      selectedWaypoint: null,
      editing: null,
      menu: null,
      panel: null,
      rects: {},
    });
  },

  setView: (v) => set({ view: normalizeView(v) }),

  resetView: () => set({ view: { ...DEFAULT_VIEW }, menu: null, panel: null }),

  panBy: (dx, dy) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    set((s) => {
      const view = normalizeView(s.view);
      return { view: { ...view, x: view.x + dx, y: view.y + dy } };
    });
  },

  zoomAt: (screen, viewportSize, factor) => {
    if (!Number.isFinite(factor) || factor <= 0) return;
    set((s) => {
      const view = normalizeView(s.view);
      const scale = normalizeView({ ...view, scale: view.scale * factor }).scale;
      const screenX = Number.isFinite(screen.x) ? screen.x : viewportSize.w / 2;
      const screenY = Number.isFinite(screen.y) ? screen.y : viewportSize.h / 2;
      const width = Number.isFinite(viewportSize.w) ? viewportSize.w : 0;
      const height = Number.isFinite(viewportSize.h) ? viewportSize.h : 0;

      // Мировая точка под курсором должна остаться под ним после масштабирования.
      const wx = (screenX - width / 2 - view.x) / view.scale;
      const wy = (screenY - height / 2 - view.y) / view.scale;
      const x = screenX - width / 2 - wx * scale;
      const y = screenY - height / 2 - wy * scale;
      return { view: normalizeView({ x, y, scale }) };
    });
  },

  setRect: (id, w, h) => {
    set((s) => {
      const cur = s.rects[id];
      if (cur && Math.abs(cur.w - w) < 0.5 && Math.abs(cur.h - h) < 0.5) return s;
      return { rects: { ...s.rects, [id]: { w, h } } };
    });
  },

  select: (id) =>
    set({
      selectedId: id,
      selectedIds: id ? [id] : [],
      selectedWaypoint: null,
    }),

  toggleSelection: (id) =>
    set((state) => {
      if (!state.elements[id]) return state;
      const alreadySelected = state.selectedIds.includes(id);
      const selectedIds = alreadySelected
        ? state.selectedIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedIds, id];
      return {
        selectedIds,
        selectedId: alreadySelected
          ? selectedIds[selectedIds.length - 1] ?? null
          : id,
        selectedWaypoint: null,
        menu: null,
        panel: null,
      };
    }),

  selectAll: () =>
    set((state) => {
      const selectedIds = [...new Set(state.order.filter((id) => Boolean(state.elements[id])))];
      return {
        selectedIds,
        selectedId: selectedIds[selectedIds.length - 1] ?? null,
        selectedWaypoint: null,
        editing: null,
        menu: null,
        panel: null,
      };
    }),

  setEditing: (editing) => set({ editing }),

  openMenu: (menu) => set({ menu, panel: null }),

  openPanel: (panel) => set({ panel, menu: null }),

  setShareOpen: (open) =>
    set({ shareOpen: open, clearAllConfirmOpen: false, menu: null }),

  setClearAllConfirmOpen: (open) =>
    set({ clearAllConfirmOpen: open, shareOpen: false, menu: null, panel: null }),

  setExportMode: (mode) =>
    set({
      exportMode: mode,
      shareOpen: false,
      clearAllConfirmOpen: false,
      menu: null,
      panel: null,
    }),

  setExportOffset: (p) => set({ exportOffset: p }),

  toggleUiHidden: () => set((s) => ({ uiHidden: !s.uiHidden })),

  setSelectedWaypoint: (s) => set({ selectedWaypoint: s }),

  insertWaypointAt: (arrowId, world) => {
    const state = get();
    const el = state.elements[arrowId];
    if (!el || el.kind !== "arrow") return;
    const arrow = el as ArrowElement;

    // Берём именно видимый маршрут: если стрелка была автоматически
    // искривлена, её изломы станут ручными точками поворота.
    const layout = computeArrowLayouts(state.elements, state.rects).get(arrowId);
    if (!layout) return;
    const base = layout.points;

    let click: Point;
    if (world && Number.isFinite(world.x) && Number.isFinite(world.y)) {
      click = world;
    } else {
      // без координат клика — середина самого длинного сегмента
      let bestIndex = 0;
      let bestLength = -1;
      for (let i = 0; i + 1 < base.length; i++) {
        const length = Math.hypot(
          base[i + 1].x - base[i].x,
          base[i + 1].y - base[i].y
        );
        if (length > bestLength) {
          bestLength = length;
          bestIndex = i;
        }
      }
      click = {
        x: (base[bestIndex].x + base[bestIndex + 1].x) / 2,
        y: (base[bestIndex].y + base[bestIndex + 1].y) / 2,
      };
    }

    const insertion = suggestWaypointInsertion(base, click);
    const existing = base.slice(1, -1).map((point) => ({
      x: point.x - arrow.x,
      y: point.y - arrow.y,
    }));
    const insertIndex = Math.max(0, Math.min(existing.length, insertion.index));
    state.pushHistory();

    const waypoints = [...existing];
    waypoints.splice(insertIndex, 0, {
      x: insertion.point.x - arrow.x,
      y: insertion.point.y - arrow.y,
    });

    set((s) => ({
      elements: {
        ...s.elements,
        [arrowId]: { ...(s.elements[arrowId] as ArrowElement), waypoints } as CanvasElement,
      },
      selectedWaypoint: { arrowId, index: insertIndex },
      selectedId: arrowId,
      selectedIds: [arrowId],
      menu: null,
    }));
  },

  updateWaypoint: (arrowId, index, world) => {
    if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return;
    set((s) => {
      const el = s.elements[arrowId];
      if (!el || el.kind !== "arrow") return s;
      const arrow = el as ArrowElement;
      if (!arrow.waypoints || index < 0 || index >= arrow.waypoints.length) return s;
      const waypoints = [...arrow.waypoints];
      waypoints[index] = { x: world.x - arrow.x, y: world.y - arrow.y };
      return {
        elements: { ...s.elements, [arrowId]: { ...arrow, waypoints } as CanvasElement },
      };
    });
  },

  removeWaypoint: (arrowId, index) => {
    const state = get();
    const el = state.elements[arrowId];
    if (!el || el.kind !== "arrow") return;
    const arrow = el as ArrowElement;
    if (!arrow.waypoints || index < 0 || index >= arrow.waypoints.length) return;

    state.pushHistory();
    const waypoints = [...arrow.waypoints];
    waypoints.splice(index, 1);

    set((s) => {
      const cur = s.elements[arrowId] as ArrowElement | undefined;
      if (!cur) return s;
      const updated: ArrowElement = {
        ...cur,
        waypoints: waypoints.length ? waypoints : undefined,
      };
      const selectedWaypoint =
        s.selectedWaypoint?.arrowId === arrowId && s.selectedWaypoint.index === index
          ? null
          : s.selectedWaypoint &&
              s.selectedWaypoint.arrowId === arrowId &&
              s.selectedWaypoint.index > index
            ? { arrowId, index: s.selectedWaypoint.index - 1 }
            : s.selectedWaypoint;
      const menu =
        s.menu?.type === "arrow-waypoint" &&
        s.menu.elementId === arrowId &&
        s.menu.waypointIndex === index
          ? null
          : s.menu;
      return {
        elements: { ...s.elements, [arrowId]: updated as CanvasElement },
        selectedWaypoint,
        menu,
      };
    });
  },

  resetArrowPosition: (arrowId) => {
    const state = get();
    const element = state.elements[arrowId];
    if (!element || element.kind !== "arrow") return;
    const arrow = element as ArrowElement;
    if (!arrow.waypoints?.length) return;

    state.pushHistory();
    set((current) => {
      const existing = current.elements[arrowId];
      if (!existing || existing.kind !== "arrow") return current;
      const updated = { ...existing, waypoints: undefined } as ArrowElement;
      return {
        elements: { ...current.elements, [arrowId]: updated as CanvasElement },
        selectedWaypoint:
          current.selectedWaypoint?.arrowId === arrowId ? null : current.selectedWaypoint,
      };
    });
  },

  setArrowAnchor: (arrowId, end, anchor) => {
    const state = get();
    const el = state.elements[arrowId];
    if (!el || el.kind !== "arrow") return;
    const arrow = el as ArrowElement;
    const cardId = end === "from" ? arrow.fromCard : arrow.toCard;
    if (!cardId) return;

    const normalized = anchor ? normalizeArrowAnchor(anchor) : undefined;
    const key = end === "from" ? "fromAnchor" : "toAnchor";
    const current = arrow[key];
    if (
      normalized &&
      current &&
      current.edge === normalized.edge &&
      Math.abs(current.t - normalized.t) < 0.0001
    ) {
      return;
    }
    if (!normalized && !current) return;

    state.pushHistory();
    set((s) => {
      const cur = s.elements[arrowId];
      if (!cur || cur.kind !== "arrow") return s;
      const updated = { ...cur, [key]: normalized } as ArrowElement;
      if (!normalized) delete updated[key];
      return { elements: { ...s.elements, [arrowId]: updated as CanvasElement } };
    });
  },

  setLabelPlacement: (arrowId, t, side) => {
    if (!Number.isFinite(t)) return;
    const labelT = Math.max(0, Math.min(1, t));
    const labelSide: 1 | -1 = side === -1 ? -1 : 1;
    set((s) => {
      const el = s.elements[arrowId];
      if (!el || el.kind !== "arrow") return s;
      if (el.labelT === labelT && (el.labelSide ?? 1) === labelSide) return s;
      return {
        elements: {
          ...s.elements,
          [arrowId]: { ...el, labelT, labelSide } as CanvasElement,
        },
      };
    });
  },
}));

/** Выборка сохраняемого среза для хранилища/файла */
export function getPersistedSlice(s: EditorState) {
  // JSON/IndexedDB получают только живые элементы в фактическом порядке слоёв.
  // Это не даёт удалённым id остаться в рабочем файле даже после старого/битого импорта.
  const order = [...new Set(s.order)].filter((id) => Boolean(s.elements[id]));
  return {
    title: s.title,
    elements: order.map((id) => s.elements[id]),
    order,
    settings: { ...s.settings },
    savedStatuses: s.savedStatuses.map((item) => ({ ...item })),
    savedArrowStyles: s.savedArrowStyles.map((item) => ({ ...item })),
    view: normalizeView(s.view),
  };
}
