import {
  ArrowElement,
  CanvasElement,
  CardElement,
  ImageElement,
  Point,
  TextElement,
  CARD_COMPACT_MAX_WIDTH,
  CARD_EXPANDED_WIDTH,
} from "./types";

export type Size = { w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Edge = "top" | "bottom" | "left" | "right";

/** Зазор между границей карточки и привязанным концом стрелки. */
export const CARD_ARROW_GAP = 12;
/** Зазор между линией стрелки и её описанием. */
export const ARROW_DESCRIPTION_GAP = 8;

/** Axis-aligned рамка прямоугольника, повёрнутого вокруг своего центра. */
export function rotatedBoundingRect(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0
): Rect {
  const angle = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const w = width * cos + height * sin;
  const h = width * sin + height * cos;
  return {
    x: x + (width - w) / 2,
    y: y + (height - h) / 2,
    w,
    h,
  };
}

/** Угол подписи вдоль стрелки; текст не переворачивается вверх ногами. */
export function getArrowDescriptionRotation(from: Point, to: Point): number {
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return angle > 90 ? angle - 180 : angle < -90 ? angle + 180 : angle;
}

/**
 * Axis-aligned рамка повёрнутого описания. Текст идёт параллельно стрелке,
 * поэтому расстояние по нормали равно половине его высоты плюс ровно 8 px.
 */
export function getArrowDescriptionRect(from: Point, to: Point, size: Size): Rect {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  let nx = length > 0.001 ? -dy / length : 0;
  let ny = length > 0.001 ? dx / length : -1;
  if (ny > 0 || (Math.abs(ny) < 0.001 && nx > 0)) {
    nx *= -1;
    ny *= -1;
  }
  const distance = ARROW_DESCRIPTION_GAP + size.h / 2;
  const centerX = (from.x + to.x) / 2 + nx * distance;
  const centerY = (from.y + to.y) / 2 + ny * distance;
  return rotatedBoundingRect(
    centerX - size.w / 2,
    centerY - size.h / 2,
    size.w,
    size.h,
    getArrowDescriptionRotation(from, to)
  );
}

/**
 * Прямоугольник карточки. Реальная высота и ширина компактной версии поступают
 * от ResizeObserver; fallback используется только до первого измерения DOM.
 */
export function getCardRect(card: CardElement, rects: Record<string, Size>): Rect {
  const fallback: Size = card.collapsed
    ? { w: CARD_COMPACT_MAX_WIDTH, h: 161 }
    : { w: CARD_EXPANDED_WIDTH, h: 168 };
  const s = rects[card.id] ?? fallback;
  return { x: card.x, y: card.y, w: s.w, h: s.h };
}

export function getImageRect(img: ImageElement): Rect {
  return rotatedBoundingRect(img.x, img.y, img.width, img.height, img.rotation);
}

export function getTextBox(el: TextElement, rects: Record<string, Size>): Rect {
  const h = rects[el.id]?.h ?? Math.max(20, el.fontSize * 1.45);
  return rotatedBoundingRect(el.x, el.y, el.width, h, el.rotation);
}

export function getElementRect(el: CanvasElement, rects: Record<string, Size>): Rect | null {
  switch (el.kind) {
    case "card":
      return getCardRect(el, rects);
    case "image":
      return getImageRect(el);
    case "text":
      return getTextBox(el, rects);
    default:
      return null;
  }
}

/** Выбор ближайшей к цели грани прямоугольника */
export function pickEdge(rect: Rect, target: Point): Edge {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  // нормируем по размерам: насколько «выход» направлен к горизонтали
  const horizScore = Math.abs(dx) / Math.max(rect.w / 2, 1);
  const vertScore = Math.abs(dy) / Math.max(rect.h / 2, 1);
  if (horizScore >= vertScore) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
}

/** Точка на грани; t∈[0,1] — положение вдоль грани (0.5 — центр) */
export function edgeAnchor(rect: Rect, edge: Edge, t: number): Point {
  const tt = Math.min(1, Math.max(0, t));
  switch (edge) {
    case "top":
      return { x: rect.x + rect.w * tt, y: rect.y };
    case "bottom":
      return { x: rect.x + rect.w * tt, y: rect.y + rect.h };
    case "left":
      return { x: rect.x, y: rect.y + rect.h * tt };
    case "right":
      return { x: rect.x + rect.w, y: rect.y + rect.h * tt };
  }
}

export function offsetFromEdge(point: Point, edge: Edge, gap = CARD_ARROW_GAP): Point {
  switch (edge) {
    case "top":
      return { x: point.x, y: point.y - gap };
    case "bottom":
      return { x: point.x, y: point.y + gap };
    case "left":
      return { x: point.x - gap, y: point.y };
    case "right":
      return { x: point.x + gap, y: point.y };
  }
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export type ArrowGeometry = { from: Point; to: Point };

/**
 * Вычисляет фактические точки стрелок.
 * Конец, привязанный к карточке, располагается у ближайшей грани с зазором 12 px;
 * несколько связей на одной грани распределяются равномерно.
 */
export function computeArrowGeometries(
  elements: Record<string, CanvasElement>,
  rects: Record<string, Size>
): Map<string, ArrowGeometry> {
  const arrows = Object.values(elements).filter(
    (el): el is ArrowElement => el.kind === "arrow"
  );

  // грубые точки (центры карточек / свободные точки)
  const rough = new Map<string, { from: Point; to: Point }>();
  for (const a of arrows) {
    const fromCard = a.fromCard ? (elements[a.fromCard] as CardElement | undefined) : undefined;
    const toCard = a.toCard ? (elements[a.toCard] as CardElement | undefined) : undefined;
    const from: Point = fromCard
      ? rectCenter(getCardRect(fromCard, rects))
      : { x: a.x + a.fromPoint.x, y: a.y + a.fromPoint.y };
    const to: Point = toCard
      ? rectCenter(getCardRect(toCard, rects))
      : { x: a.x + a.toPoint.x, y: a.y + a.toPoint.y };
    rough.set(a.id, { from, to });
  }

  // заявки на привязку: cardId → список {arrowId, end, target}
  const requests = new Map<string, { arrowId: string; end: "from" | "to"; target: Point }[]>();
  for (const a of arrows) {
    const r = rough.get(a.id)!;
    if (a.fromCard && elements[a.fromCard]) {
      const list = requests.get(a.fromCard) ?? [];
      list.push({ arrowId: a.id, end: "from", target: r.to });
      requests.set(a.fromCard, list);
    }
    if (a.toCard && elements[a.toCard]) {
      const list = requests.get(a.toCard) ?? [];
      list.push({ arrowId: a.id, end: "to", target: r.from });
      requests.set(a.toCard, list);
    }
  }

  // точки привязки
  const anchors = new Map<string, { from?: Point; to?: Point }>();

  for (const [cardId, list] of requests) {
    const card = elements[cardId] as CardElement | undefined;
    if (!card) continue;
    const rect = getCardRect(card, rects);

    // группируем по грани
    const byEdge = new Map<Edge, { arrowId: string; end: "from" | "to"; target: Point }[]>();
    for (const req of list) {
      const edge = pickEdge(rect, req.target);
      const arr = byEdge.get(edge) ?? [];
      arr.push(req);
      byEdge.set(edge, arr);
    }

    for (const [edge, arr] of byEdge) {
      // сортировка вдоль грани, чтобы связи не пересекались
      const horizontal = edge === "top" || edge === "bottom";
      const sorted = [...arr].sort((p, q) =>
        horizontal ? p.target.x - q.target.x : p.target.y - q.target.y
      );
      sorted.forEach((req, i) => {
        const t = (i + 1) / (sorted.length + 1);
        const edgePoint = edgeAnchor(rect, edge, t);
        const point = offsetFromEdge(edgePoint, edge);
        const rec = anchors.get(req.arrowId) ?? {};
        rec[req.end] = point;
        anchors.set(req.arrowId, rec);
      });
    }
  }

  const result = new Map<string, ArrowGeometry>();
  for (const a of arrows) {
    const r = rough.get(a.id)!;
    const an = anchors.get(a.id);
    result.set(a.id, {
      from: an?.from ?? r.from,
      to: an?.to ?? r.to,
    });
  }
  return result;
}

/** Габаритная рамка всего содержимого холста */
export function contentBBox(
  elements: Record<string, CanvasElement>,
  rects: Record<string, Size>,
  geometries: Map<string, ArrowGeometry>
): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number, w: number, h: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };

  for (const el of Object.values(elements)) {
    if (el.kind === "arrow") {
      const g = geometries.get(el.id);
      if (g) {
        add(Math.min(g.from.x, g.to.x) - 8, Math.min(g.from.y, g.to.y) - 22, 16, 30);
        add(Math.max(g.from.x, g.to.x) - 8, Math.max(g.from.y, g.to.y) - 8, 16, 24);
        if (el.label) {
          const descriptionSize = rects[el.id] ?? {
            w: Math.min(220, Math.max(24, el.label.length * 6)),
            h: 12,
          };
          const description = getArrowDescriptionRect(g.from, g.to, descriptionSize);
          add(description.x, description.y, description.w, description.h);
        }
      }
      continue;
    }
    const rect = getElementRect(el, rects);
    if (rect) add(rect.x, rect.y, rect.w, rect.h);
  }

  if (!isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) };
}

/** Расстояние от точки до отрезка (для привязки конца стрелки к карточке) */
export function distToRect(point: Point, rect: Rect): number {
  const cx = Math.max(rect.x, Math.min(point.x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(point.y, rect.y + rect.h));
  return Math.hypot(point.x - cx, point.y - cy);
}
