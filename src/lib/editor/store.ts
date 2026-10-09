"use client";

/* Zustand store редактора: состояние, история, действия */

import { create } from "zustand";
import {
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
  makeArrow,
  makeCard,
  makeText,
  uid,
} from "./types";

export type Snapshot = {
  title: string;
  elements: Record<string, CanvasElement>;
  order: string[];
  settings: CanvasSettings;
  savedStatuses: SavedStatusItem[];
  savedArrowStyles: SavedArrowStyle[];
};

export type MenuType = "canvas" | "card" | "arrow" | "status" | "image" | "text" | "settings";

export type MenuState = {
  type: MenuType;
  screen: Point; // координаты курсора в окне
  world: Point; // точка в мировых координатах
  elementId?: string;
  sub?: "cards" | "statuses" | "styles" | "link" | "group" | "unlink" | "status-color" | null;
  subTitle?: string;
};

export type PanelState =
  | { type: "arrow-style"; id: string; screen: Point }
  | { type: "canvas-bg"; screen: Point };

export type ExportMode = { mode: "full" | "mini" } | null;

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
  editing: { id: string; field: string } | null;
  menu: MenuState | null;
  panel: PanelState | null;
  shareOpen: boolean;
  clipboard: CardElement | null;
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
  pasteAt: (world: Point) => void;

  updateElement: (id: string, patch: Partial<CanvasElement>) => void;
  moveElement: (id: string, x: number, y: number) => void;
  removeElement: (id: string) => void;
  duplicateElement: (id: string) => void;
  copyCard: (id: string) => void;

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
  loadFromFile: (data: import("./types").PersistedState) => void;

  setView: (v: View) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (screen: Point, viewportSize: { w: number; h: number }, factor: number) => void;

  setRect: (id: string, w: number, h: number) => void;
  select: (id: string | null) => void;
  setEditing: (editing: { id: string; field: string } | null) => void;
  openMenu: (menu: MenuState | null) => void;
  openPanel: (panel: PanelState | null) => void;
  setShareOpen: (open: boolean) => void;
  setExportMode: (mode: ExportMode) => void;
  setExportOffset: (p: Point) => void;
  toggleUiHidden: () => void;
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

function normalizeElements(list: CanvasElement[]): {
  elements: Record<string, CanvasElement>;
  order: string[];
} {
  const elements: Record<string, CanvasElement> = {};
  const order: string[] = [];
  for (const el of list) {
    if (!el || typeof el.id !== "string" || !el.kind) continue;
    elements[el.id] = el;
    if (!order.includes(el.id)) order.push(el.id);
  }
  return { elements, order };
}

export const useEditor = create<EditorState>((set, get) => ({
  hydrated: false,
  title: "",
  elements: {},
  order: [],
  settings: { bgColor: "#f2eeeb", bgFit: "tile", bgOpacity: 100 },
  savedStatuses: [],
  savedArrowStyles: [],
  view: { x: 0, y: 0, scale: 1 },

  rects: {},
  selectedId: null,
  editing: null,
  menu: null,
  panel: null,
  shareOpen: false,
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
    const { elements, order } = normalizeElements(data.elements);
    set({
      hydrated: true,
      title: data.title ?? "",
      elements,
      order,
      settings: data.settings ?? { bgColor: "#f2eeeb", bgFit: "tile", bgOpacity: 100 },
      savedStatuses: data.savedStatuses ?? [],
      savedArrowStyles: data.savedArrowStyles ?? [],
      view: data.view ?? { x: 0, y: 0, scale: 1 },
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
    const card = makeCard(world.x, world.y, {
      status: { text: "Статус", color: "#f6ecb5" },
    });
    set((s) => ({
      elements: { ...s.elements, [card.id]: card },
      order: [...s.order, card.id],
      selectedId: card.id,
      menu: null,
    }));
    return card.id;
  },

  addArrowAt: (world) => {
    get().pushHistory();
    const arrow = makeArrow(world.x, world.y);
    set((s) => ({
      elements: { ...s.elements, [arrow.id]: arrow },
      order: [...s.order, arrow.id],
      selectedId: arrow.id,
      menu: null,
    }));
    return arrow.id;
  },

  addTextAt: (world) => {
    get().pushHistory();
    const text = makeText(world.x, world.y);
    set((s) => ({
      elements: { ...s.elements, [text.id]: text },
      order: [...s.order, text.id],
      selectedId: text.id,
      editing: { id: text.id, field: "html" },
      menu: null,
    }));
    return text.id;
  },

  addImageAt: (world, src, w, h) => {
    get().pushHistory();
    const img: ImageElement = {
      id: uid("img"),
      kind: "image",
      x: world.x,
      y: world.y,
      src,
      width: w,
      height: h,
    };
    set((s) => ({
      elements: { ...s.elements, [img.id]: img },
      order: [...s.order, img.id],
      selectedId: img.id,
    }));
  },

  pasteAt: (world) => {
    const s = get();
    if (!s.clipboard) return;
    s.pushHistory();
    const copy: CardElement = {
      ...s.clipboard,
      id: uid("card"),
      x: world.x,
      y: world.y,
      groupId: undefined,
    };
    set((st) => ({
      elements: { ...st.elements, [copy.id]: copy },
      order: [...st.order, copy.id],
      selectedId: copy.id,
      menu: null,
    }));
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
    set((s) => {
      const el = s.elements[id];
      if (!el) return s;
      const groupId = el.groupId;
      const elements = { ...s.elements };
      elements[id] = { ...el, x, y } as CanvasElement;
      if (groupId) {
        for (const other of Object.values(elements)) {
          if (other.kind === "card" && other.groupId === groupId && other.id !== id) {
            const dx = x - el.x;
            const dy = y - el.y;
            elements[other.id] = { ...other, x: other.x + dx, y: other.y + dy } as CanvasElement;
          }
        }
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
    delete elements[id];
    // удаляем стрелки, связанные с карточкой
    if (el.kind === "card") {
      for (const other of Object.values(elements)) {
        if (other.kind === "arrow" && (other.fromCard === id || other.toCard === id)) {
          delete elements[other.id];
        }
      }
    }
    set((st) => ({
      elements,
      order: st.order.filter((x) => elements[x]),
      selectedId: st.selectedId === id ? null : st.selectedId,
      editing: st.editing?.id === id ? null : st.editing,
      menu: null,
    }));
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
      copy.fromPoint = { x: 0, y: 0 };
      copy.toPoint = { x: 200, y: 0 };
    }
    set((st) => ({
      elements: { ...st.elements, [copy.id]: copy },
      order: [...st.order, copy.id],
      selectedId: copy.id,
      menu: null,
    }));
  },

  copyCard: (id) => {
    const el = get().elements[id];
    if (el && el.kind === "card") set({ clipboard: { ...el } });
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
    set((s) => ({ settings: { ...s.settings, ...patch } }));
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
    if (!s.order.length && s.title === "") return;
    s.pushHistory();
    set({
      elements: {},
      order: [],
      selectedId: null,
      editing: null,
      menu: null,
      panel: null,
      title: "",
    });
  },

  loadFromFile: (data) => {
    get().pushHistory();
    const { elements, order } = normalizeElements(data.elements);
    set({
      title: data.title ?? "",
      elements,
      order,
      settings: data.settings,
      savedStatuses: data.savedStatuses ?? [],
      savedArrowStyles: data.savedArrowStyles ?? [],
      view: data.view ?? { x: 0, y: 0, scale: 1 },
      selectedId: null,
      editing: null,
      menu: null,
      panel: null,
      rects: {},
    });
  },

  setView: (v) => set({ view: v }),

  panBy: (dx, dy) =>
    set((s) => ({ view: { ...s.view, x: s.view.x + dx, y: s.view.y + dy } })),

  zoomAt: (screen, viewportSize, factor) => {
    set((s) => {
      const scale = Math.min(3, Math.max(0.2, s.view.scale * factor));
      const realFactor = scale / s.view.scale;
      // точка мира под курсором
      const wx = (screen.x - viewportSize.w / 2 - s.view.x) / s.view.scale;
      const wy = (screen.y - viewportSize.h / 2 - s.view.y) / s.view.scale;
      // новая трансляция, чтобы точка осталась под курсором
      const x = screen.x - viewportSize.w / 2 - wx * realFactor;
      const y = screen.y - viewportSize.h / 2 - wy * realFactor;
      return { view: { x, y, scale } };
    });
  },

  setRect: (id, w, h) => {
    set((s) => {
      const cur = s.rects[id];
      if (cur && Math.abs(cur.w - w) < 0.5 && Math.abs(cur.h - h) < 0.5) return s;
      return { rects: { ...s.rects, [id]: { w, h } } };
    });
  },

  select: (id) => set({ selectedId: id }),

  setEditing: (editing) => set({ editing }),

  openMenu: (menu) => set({ menu, panel: null }),

  openPanel: (panel) => set({ panel, menu: null }),

  setShareOpen: (open) => set({ shareOpen: open, menu: null }),

  setExportMode: (mode) => set({ exportMode: mode, shareOpen: false, menu: null, panel: null }),

  setExportOffset: (p) => set({ exportOffset: p }),

  toggleUiHidden: () => set((s) => ({ uiHidden: !s.uiHidden })),
}));

/** Выборка сохраняемого среза для хранилища/файла */
export function getPersistedSlice(s: EditorState) {
  return {
    title: s.title,
    elements: s.order.map((id) => s.elements[id]).filter(Boolean),
    order: s.order,
    settings: s.settings,
    savedStatuses: s.savedStatuses,
    savedArrowStyles: s.savedArrowStyles,
    view: s.view,
  };
}
