/* Модель данных редактора схем персонажей */

export type Point = { x: number; y: number };

export type ElementBase = {
  id: string;
  kind: "card" | "arrow" | "image" | "text";
  x: number;
  y: number;
  /** группировка карточек: перетаскиваются вместе */
  groupId?: string;
};

/* ------------------------- Карточка ------------------------- */

export type CardStatus = {
  text: string;
  color: string; // фон чипа
};

export type CardElement = ElementBase & {
  kind: "card";
  name: string;
  years: string;
  description: string;
  status: CardStatus | null;
  /** аватар — data URL (WEBP) */
  avatar?: string;
  collapsed: boolean;
};

/* ------------------------- Стрелка ------------------------- */

export type ArrowHead = "triangle" | "line" | "none";
export type ArrowEnds = "both" | "end" | "start" | "none";
export type ArrowThickness = "thin" | "normal" | "thick";

export type ArrowElement = ElementBase & {
  kind: "arrow";
  /** id связанной карточки в начале, если есть */
  fromCard?: string;
  /** id связанной карточки в конце, если есть */
  toCard?: string;
  /** свободная точка начала (когда не привязана к карточке) */
  fromPoint: Point;
  /** свободная точка конца */
  toPoint: Point;
  label: string;
  color: string;
  lineStyle: "solid" | "dashed";
  thickness: ArrowThickness;
  head: ArrowHead;
  ends: ArrowEnds;
};

/* ------------------------- Изображение ------------------------- */

export type ImageElement = ElementBase & {
  kind: "image";
  /** data URL (WEBP) */
  src: string;
  width: number;
  height: number;
};

/* ------------------------- Текст ------------------------- */

export type TextElement = ElementBase & {
  kind: "text";
  /** HTML из contentEditable (B/I/U/цвет/список) */
  html: string;
  width: number;
  color: string;
};

export type CanvasElement = CardElement | ArrowElement | ImageElement | TextElement;

/* --------------------- Настройки холста --------------------- */

export type BgImageFit = "tile" | "tile-x" | "tile-y" | "fill";

export type CanvasSettings = {
  bgColor: string;
  bgImage?: string; // data URL (WEBP)
  bgFit: BgImageFit;
  bgOpacity: number; // 0..100
};

/* --------------------- Сохранённые стили -------------------- */

export type SavedStatusItem = { id: string; text: string; color: string };
export type SavedArrowStyle = {
  id: string;
  color: string;
  lineStyle: "solid" | "dashed";
  thickness: ArrowThickness;
  head: ArrowHead;
  ends: ArrowEnds;
};

/* ------------------------- Вид / UI ------------------------- */

export type View = { x: number; y: number; scale: number };

export type PersistedState = {
  version: number;
  title: string;
  elements: CanvasElement[];
  order: string[];
  settings: CanvasSettings;
  savedStatuses: SavedStatusItem[];
  savedArrowStyles: SavedArrowStyle[];
  view: View;
};

export const CURRENT_FILE_VERSION = 1;

export const DEFAULT_SETTINGS: CanvasSettings = {
  bgColor: "#f2eeeb",
  bgFit: "tile",
  bgOpacity: 100,
};

export const DEFAULT_ARROW_COLOR = "#b3574f";
export const STATUS_COLORS = [
  "#f6ecb5",
  "#c6fd9d",
  "#b8e3f5",
  "#f3c6d9",
  "#e4d4f7",
  "#f8d8b8",
  "#d9e8cf",
  "#e8e6e3",
  "#f3aaaa",
  "#9a7c5e",
];

export const DEFAULT_STATUS_COLOR = "#f6ecb5";

/* ---------- Фабрики элементов ---------- */

let idCounter = 0;
export function uid(prefix = "el"): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export function makeCard(x: number, y: number, patch: Partial<CardElement> = {}): CardElement {
  return {
    id: uid("card"),
    kind: "card",
    x,
    y,
    name: "Имя",
    years: "",
    description: "",
    status: null,
    collapsed: false,
    ...patch,
  };
}

export function makeArrow(x: number, y: number, patch: Partial<ArrowElement> = {}): ArrowElement {
  return {
    id: uid("arrow"),
    kind: "arrow",
    x,
    y,
    // точки хранятся относительно (x, y)
    fromPoint: { x: -100, y: 0 },
    toPoint: { x: 100, y: 0 },
    label: "",
    color: DEFAULT_ARROW_COLOR,
    lineStyle: "solid",
    thickness: "normal",
    head: "triangle",
    ends: "both",
    ...patch,
  };
}

export function makeText(x: number, y: number, patch: Partial<TextElement> = {}): TextElement {
  return {
    id: uid("text"),
    kind: "text",
    x,
    y,
    html: "Текст",
    width: 220,
    color: "#161414",
    ...patch,
  };
}

export const ARROW_THICKNESS_PX: Record<ArrowThickness, number> = {
  thin: 1.5,
  normal: 2.5,
  thick: 4.5,
};

export const CARD_COLLAPSED_WIDTH = 140;
export const CARD_EXPANDED_WIDTH = 300; // Colors/Cards/DecWidth
