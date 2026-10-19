/* Модель данных редактора схем персонажей */

export type Point = { x: number; y: number };

export type ElementBase = {
  id: string;
  kind: "card" | "arrow" | "image" | "text";
  x: number;
  y: number;
  /** элементы одной группы выделяются и перетаскиваются вместе */
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

/** Грань карточки, к которой можно привязать конец стрелки. */
export type CardEdge = "top" | "bottom" | "left" | "right";

export const CARD_EDGES: CardEdge[] = ["top", "right", "bottom", "left"];

export function isCardEdge(value: unknown): value is CardEdge {
  return value === "top" || value === "bottom" || value === "left" || value === "right";
}

/**
 * Ручная привязка конца стрелки к грани карточки.
 * t ∈ [0, 1] — положение вдоль грани: 0 — начало (левый/верхний край),
 * 1 — конец, 0.5 — середина. Без привязки стрелка, как и раньше,
 * сама выбирает ближайшую грань и распределяется по ней.
 */
export type ArrowAnchor = {
  edge: CardEdge;
  t: number;
};

export function normalizeArrowAnchor(
  anchor?: Partial<ArrowAnchor> | null
): ArrowAnchor | undefined {
  if (!anchor || !isCardEdge(anchor.edge)) return undefined;
  const t = Number(anchor.t);
  return {
    edge: anchor.edge,
    t: Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0.5,
  };
}

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
  /** Ручная привязка начала к конкретной грани карточки (иначе — автоматически). */
  fromAnchor?: ArrowAnchor;
  /** Ручная привязка конца к конкретной грани карточки (иначе — автоматически). */
  toAnchor?: ArrowAnchor;
  /** Промежуточные точки поворота (относительно x,y). Пустой массив — прямая. */
  waypoints?: Point[];
  /**
   * Положение описания вдоль стрелки: 0 — начало, 1 — конец.
   * Если не задано — описание автоматически ставится в середину.
   */
  labelT?: number;
  /** Сторона описания относительно линии: 1 — «верхняя», -1 — нижняя. */
  labelSide?: 1 | -1;
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
  /** Поворот вокруг центра элемента, в градусах. */
  rotation: number;
};

/* ------------------------- Текст ------------------------- */

export type TextElement = ElementBase & {
  kind: "text";
  /** HTML из contentEditable (B/I/U/цвет/список) */
  html: string;
  width: number;
  fontSize: number;
  rotation: number;
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

/** Допустимый диапазон масштаба холста. */
export const MIN_VIEW_SCALE = 0.2;
export const MAX_VIEW_SCALE = 3;
export const DEFAULT_VIEW: View = { x: 0, y: 0, scale: 1 };

export function clampViewScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_VIEW.scale;
  return Math.min(MAX_VIEW_SCALE, Math.max(MIN_VIEW_SCALE, scale));
}

/**
 * Нормализует вид из IndexedDB/JSON. Старые или вручную изменённые файлы
 * не должны оставлять холст с scale=0/NaN, при котором элементы невидимы.
 */
export function normalizeView(view?: Partial<View> | null): View {
  return {
    x: Number.isFinite(view?.x) ? Number(view?.x) : DEFAULT_VIEW.x,
    y: Number.isFinite(view?.y) ? Number(view?.y) : DEFAULT_VIEW.y,
    scale: clampViewScale(Number(view?.scale)),
  };
}

export function normalizePoint(point?: Partial<Point> | null): Point {
  return {
    x: Number.isFinite(point?.x) ? Number(point?.x) : 0,
    y: Number.isFinite(point?.y) ? Number(point?.y) : 0,
  };
}

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

export const DEFAULT_CANVAS_COLOR = "#f2eeeb";
export const DEFAULT_TEXT_COLOR = "#161414";

export const DEFAULT_SETTINGS: CanvasSettings = {
  bgColor: DEFAULT_CANVAS_COLOR,
  bgFit: "tile",
  bgOpacity: 100,
};

const BG_IMAGE_FITS: BgImageFit[] = ["tile", "tile-x", "tile-y", "fill"];

export function normalizeCanvasSettings(
  settings?: Partial<CanvasSettings> | null
): CanvasSettings {
  const opacity = Number(settings?.bgOpacity);
  return {
    bgColor:
      typeof settings?.bgColor === "string" && settings.bgColor.trim()
        ? settings.bgColor
        : DEFAULT_SETTINGS.bgColor,
    ...(typeof settings?.bgImage === "string" && settings.bgImage
      ? { bgImage: settings.bgImage }
      : {}),
    bgFit: BG_IMAGE_FITS.includes(settings?.bgFit as BgImageFit)
      ? (settings?.bgFit as BgImageFit)
      : DEFAULT_SETTINGS.bgFit,
    bgOpacity: Number.isFinite(opacity)
      ? Math.min(100, Math.max(0, opacity))
      : DEFAULT_SETTINGS.bgOpacity,
  };
}

export const DEFAULT_ARROW_COLOR = "#9a7c5e";
export const DEFAULT_STATUS_COLOR = "#c6fd9d";

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
    fontSize: 14,
    rotation: 0,
    color: DEFAULT_TEXT_COLOR,
    ...patch,
  };
}

export const CARD_COMPACT_MAX_WIDTH = 80;
export const CARD_EXPANDED_WIDTH = 450;
