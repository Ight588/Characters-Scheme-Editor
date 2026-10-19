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

const EPS = 0.001;

/* ------------------------- Базовые фигуры ------------------------- */

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

/** Расстояние от точки до прямоугольника. */
export function distToRect(point: Point, rect: Rect): number {
  const cx = Math.max(rect.x, Math.min(point.x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(point.y, rect.y + rect.h));
  return Math.hypot(point.x - cx, point.y - cy);
}

/* --------------------- Геометрия привязки стрелок --------------------- */

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

/* ------------------------- Полилинии ------------------------- */

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return total;
}

export function pointAtPolylineT(
  points: Point[],
  t: number
): { point: Point; segmentIndex: number; segmentT: number } {
  if (!points.length) return { point: { x: 0, y: 0 }, segmentIndex: 0, segmentT: 0 };
  if (points.length === 1) return { point: { ...points[0] }, segmentIndex: 0, segmentT: 0 };
  const total = polylineLength(points);
  const target = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0.5)) * total;
  if (total < EPS) return { point: { ...points[0] }, segmentIndex: 0, segmentT: 0 };
  let acc = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + len >= target - EPS || i === points.length - 2) {
      const f = len > EPS ? Math.max(0, Math.min(1, (target - acc) / len)) : 0;
      return {
        point: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
        segmentIndex: i,
        segmentT: f,
      };
    }
    acc += len;
  }
  const last = points[points.length - 1];
  return { point: { ...last }, segmentIndex: points.length - 2, segmentT: 1 };
}

export function closestPointOnSegment(
  p: Point,
  a: Point,
  b: Point
): { point: Point; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS * EPS) return { point: { ...a }, t: 0 };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { point: { x: a.x + dx * t, y: a.y + dy * t }, t };
}

export function closestPointOnPolyline(
  p: Point,
  points: Point[]
): { point: Point; distance: number; t: number; segmentIndex: number; segmentT: number } {
  if (!points.length) {
    return { point: { ...p }, distance: Infinity, t: 0, segmentIndex: 0, segmentT: 0 };
  }
  if (points.length === 1) {
    return {
      point: { ...points[0] },
      distance: Math.hypot(p.x - points[0].x, p.y - points[0].y),
      t: 0,
      segmentIndex: 0,
      segmentT: 0,
    };
  }

  const total = polylineLength(points);
  let prefix = 0;
  let best = {
    point: { ...points[0] },
    distance: Infinity,
    t: 0,
    segmentIndex: 0,
    segmentT: 0,
  };

  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const proj = closestPointOnSegment(p, a, b);
    const distance = Math.hypot(p.x - proj.point.x, p.y - proj.point.y);
    if (distance < best.distance) {
      best = {
        point: proj.point,
        distance,
        t: total > EPS ? Math.max(0, Math.min(1, (prefix + proj.t * len) / total)) : 0,
        segmentIndex: i,
        segmentT: proj.t,
      };
    }
    prefix += len;
  }
  return best;
}

/** Направление нормали к сегменту. side=1 — «верхняя» сторона на экране. */
export function getSegmentNormal(points: Point[], index: number, side: 1 | -1): Point {
  const a = points[index];
  const b = points[index + 1];
  if (!a || !b) return { x: 0, y: -1 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return { x: 0, y: -1 };
  let nx = -dy / len;
  let ny = dx / len;
  const wantUp = side === 1;
  if (wantUp) {
    if (ny > EPS || (Math.abs(ny) <= EPS && nx > 0)) {
      nx = -nx;
      ny = -ny;
    }
  } else if (ny < -EPS || (Math.abs(ny) <= EPS && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

export function rectsIntersect(a: Rect, b: Rect, shrink = 0): boolean {
  const aw = a.w - shrink * 2;
  const ah = a.h - shrink * 2;
  if (aw <= 0 || ah <= 0) return false;
  const ax = a.x + shrink;
  const ay = a.y + shrink;
  return !(ax + aw < b.x || b.x + b.w < ax || ay + ah < b.y || b.y + b.h < ay);
}

export function pointInRect(p: Point, rect: Rect): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const orient = (p: Point, q: Point, r: Point) =>
    (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  const onSegment = (p: Point, q: Point, r: Point) =>
    q.x <= Math.max(p.x, r.x) &&
    q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) &&
    q.y >= Math.min(p.y, r.y);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (Math.abs(o1) < EPS && onSegment(a, c, b)) return true;
  if (Math.abs(o2) < EPS && onSegment(a, d, b)) return true;
  if (Math.abs(o3) < EPS && onSegment(c, a, d)) return true;
  if (Math.abs(o4) < EPS && onSegment(c, b, d)) return true;
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function segmentIntersectsRect(p1: Point, p2: Point, rect: Rect): boolean {
  if (pointInRect(p1, rect) || pointInRect(p2, rect)) return true;
  const x2 = rect.x + rect.w;
  const y2 = rect.y + rect.h;
  return (
    segmentsIntersect(p1, p2, { x: rect.x, y: rect.y }, { x: x2, y: rect.y }) ||
    segmentsIntersect(p1, p2, { x: x2, y: rect.y }, { x: x2, y: y2 }) ||
    segmentsIntersect(p1, p2, { x: x2, y: y2 }, { x: rect.x, y: y2 }) ||
    segmentsIntersect(p1, p2, { x: rect.x, y: y2 }, { x: rect.x, y: rect.y })
  );
}

export function polylineIntersectsRect(points: Point[], rect: Rect, shrink = 0): boolean {
  const r: Rect = {
    x: rect.x + shrink,
    y: rect.y + shrink,
    w: Math.max(0.01, rect.w - shrink * 2),
    h: Math.max(0.01, rect.h - shrink * 2),
  };
  for (let i = 0; i + 1 < points.length; i++) {
    if (segmentIntersectsRect(points[i], points[i + 1], r)) return true;
  }
  return false;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const proj = closestPointOnSegment(p, a, b);
  return Math.hypot(p.x - proj.point.x, p.y - proj.point.y);
}

/** Мировые точки ломаной стрелки с учётом ручных точек поворота. */
export function getArrowWorldPoints(
  arrow: ArrowElement,
  fromWorld: Point,
  toWorld: Point
): Point[] {
  const points: Point[] = [{ ...fromWorld }];
  for (const wp of arrow.waypoints ?? []) {
    points.push({ x: arrow.x + wp.x, y: arrow.y + wp.y });
  }
  points.push({ ...toWorld });
  return points;
}

/* --------------------- Предпочтительные углы --------------------- */

/** 90°, 45° и 30° (и кратные им), приоритет — именно в этом порядке. */
const PREFERRED_ANGLES = [
  // 90° → 45° → 30°: порядок важен для перебора кандидатов маршрута.
  0, 90, 180, 270, 45, 135, 225, 315, 30, 60, 120, 150, 210, 240, 300, 330,
];

function normalizeAngle(deg: number): number {
  const n = deg % 360;
  return n < 0 ? n + 360 : n;
}

function preferredPriority(angle: number): number {
  if (angle % 90 === 0) return 0;
  if (angle % 45 === 0) return 2;
  return 4;
}

/** Отклонение направления от ближайшего «красивого» угла (в градусах). */
export function angleDeviation(deg: number): number {
  const a = normalizeAngle(deg);
  let best = Infinity;
  for (const allowed of PREFERRED_ANGLES) {
    let delta = Math.abs(a - allowed);
    if (delta > 180) delta = 360 - delta;
    best = Math.min(best, delta + preferredPriority(allowed));
  }
  return best;
}

function segmentAngleDeviation(a: Point, b: Point): number {
  return angleDeviation((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
}

/** Отклонение без учёта приоритета (только ближайший угол). */
function baseAngleDeviation(deg: number): number {
  const a = normalizeAngle(deg);
  let best = Infinity;
  for (const allowed of PREFERRED_ANGLES) {
    let delta = Math.abs(a - allowed);
    if (delta > 180) delta = 360 - delta;
    best = Math.min(best, delta);
  }
  return best;
}

function segmentBaseDeviation(a: Point, b: Point): number {
  return baseAngleDeviation((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
}

/** Насколько заметен излом в точке: 0 — прямая, 180 — разворот. */
function bendAngle(prev: Point, corner: Point, next: Point): number {
  const a1 = Math.atan2(corner.y - prev.y, corner.x - prev.x);
  const a2 = Math.atan2(next.y - corner.y, next.x - corner.x);
  let deg = (Math.abs(a1 - a2) * 180) / Math.PI;
  if (deg > 180) deg = 360 - deg;
  return deg;
}

/**
 * Куда поставить новую точку поворота при двойном клике: рядом с кликом,
 * но с предпочтением углов 90/45/30. Если красивый угол недостижим —
 * допускается произвольный.
 */
export function suggestWaypoint(prev: Point, next: Point, click: Point): Point {
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { ...click };

  const ux = dx / len;
  const uy = dy / len;
  // нормаль к сегменту
  const nx = -uy;
  const ny = ux;
  const relX = click.x - prev.x;
  const relY = click.y - prev.y;
  const along = relX * ux + relY * uy;
  const t = Math.max(0.12, Math.min(0.88, along / len));
  const proj = { x: prev.x + ux * t * len, y: prev.y + uy * t * len };
  const offset = relX * nx + relY * ny;
  const clickSide: 1 | -1 = offset >= 0 ? 1 : -1;

  const distances = new Set<number>();
  for (const deg of [30, 45, 60]) {
    const tan = Math.tan((deg * Math.PI) / 180);
    distances.add(t * len * tan);
    distances.add((1 - t) * len * tan);
    distances.add((len / 2) * tan);
  }
  for (const d of [16, 24, 32, 48, 64, 88, 120, 160]) distances.add(d);

  type Candidate = { point: Point; score: number };
  const candidates: Candidate[] = [];

  const bendPreference = [30, 45, 60, 90, 120, 135, 150, 180];
  const bendScore = (corner: Point) => {
    const bend = bendAngle(prev, corner, next);
    const shallow = bend < 18 ? (18 - bend) * 6 : 0;
    let nearest = Infinity;
    for (const angle of bendPreference) {
      nearest = Math.min(nearest, Math.abs(bend - angle));
    }
    return shallow + nearest * 0.6;
  };

  // клик как есть (если он уже даёт красивый излом)
  const clickAngle = segmentBaseDeviation(prev, click) + segmentBaseDeviation(click, next);
  candidates.push({
    point: { ...click },
    score:
      clickAngle * 1.6 +
      (Math.abs(offset) < 6 ? 40 : 0) +
      bendScore(click),
  });

  const maxOffset = Math.max(
    24,
    Math.min(220, Math.min(t * len, (1 - t) * len) * 0.9)
  );
  for (const rawD of distances) {
    const d = Math.min(Math.max(rawD, 8), maxOffset);
    for (const side of [1, -1] as const) {
      const point: Point = {
        x: proj.x + nx * d * side,
        y: proj.y + ny * d * side,
      };
      const angleScore = segmentBaseDeviation(prev, point) + segmentBaseDeviation(point, next);
      const distance = Math.hypot(point.x - click.x, point.y - click.y);
      const sidePenalty =
        side === clickSide ? 0 : Math.abs(offset) > 4 ? 14 : 2;
      candidates.push({
        point,
        score:
          angleScore * 1.6 +
          distance * 0.2 +
          d * 0.03 +
          sidePenalty +
          bendScore(point),
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0].point;
}

/**
 * Где вставить точку поворота и в какую позицию её поставить.
 * index — индекс в массиве waypoints (сегмент basePoints[index]..basePoints[index+1]).
 */
export function suggestWaypointInsertion(
  basePoints: Point[],
  click: Point
): { index: number; point: Point } {
  if (basePoints.length < 2) return { index: 0, point: { ...click } };
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i + 1 < basePoints.length; i++) {
    const d = distanceToSegment(click, basePoints[i], basePoints[i + 1]);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }
  return {
    index: bestIndex,
    point: suggestWaypoint(basePoints[bestIndex], basePoints[bestIndex + 1], click),
  };
}

/* ------------------------- Описание стрелки ------------------------- */

export type LabelPlacement = { t: number; side: 1 | -1 };

export type LabelLayout = {
  t: number;
  side: 1 | -1;
  center: Point;
  rect: Rect;
  rotation: number;
};

export function getLabelLayout(
  points: Point[],
  size: Size,
  placement: LabelPlacement
): LabelLayout | null {
  if (points.length < 2) return null;
  const t = Math.max(0, Math.min(1, Number.isFinite(placement.t) ? placement.t : 0.5));
  const side: 1 | -1 = placement.side === -1 ? -1 : 1;
  const info = pointAtPolylineT(points, t);
  const normal = getSegmentNormal(points, info.segmentIndex, side);
  const offset = ARROW_DESCRIPTION_GAP + size.h / 2;
  const center = {
    x: info.point.x + normal.x * offset,
    y: info.point.y + normal.y * offset,
  };
  const a = points[info.segmentIndex];
  const b = points[info.segmentIndex + 1];
  const rotation = getArrowDescriptionRotation(a, b);
  const rect = rotatedBoundingRect(
    center.x - size.w / 2,
    center.y - size.h / 2,
    size.w,
    size.h,
    rotation
  );
  return { t, side, center, rect, rotation };
}

/* ------------------------- Автомаршрутизация ------------------------- */

export type ArrowLayout = {
  points: Point[];
  label: LabelLayout | null;
};

type Obstacle = { id: string; rect: Rect };

const LABEL_COLLISION_WEIGHT = 10000;
const PATH_OBSTACLE_WEIGHT = 2500;

function cleanPolyline(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.5) continue;
    out.push({ x: p.x, y: p.y });
  }
  // убираем точки на прямой линии — они не создают поворота
  for (let i = 1; i < out.length - 1; ) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 0.5) out.splice(i, 1);
    else i += 1;
  }
  return out;
}

function routeScore(points: Point[]): number {
  let score = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    score += length * 0.012;
    score += segmentAngleDeviation(a, b) * 0.8;
  }
  score += Math.max(0, points.length - 2) * 3;
  return score;
}

function intersectRays(a: Point, angleA: number, b: Point, angleB: number): Point | null {
  const radA = (angleA * Math.PI) / 180;
  const radB = (angleB * Math.PI) / 180;
  const d1 = { x: Math.cos(radA), y: Math.sin(radA) };
  const d2 = { x: Math.cos(radB), y: Math.sin(radB) };
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-6) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = (dx * d2.y - dy * d2.x) / den;
  const s = (dx * d1.y - dy * d1.x) / den;
  if (t <= 1 || s <= 1) return null;
  return { x: a.x + d1.x * t, y: a.y + d1.y * t };
}

/**
 * Кандидатные пути между двумя точками: прямые, Г-образные, Z-образные,
 * под 45° и с симметричным выносом. Предпочтение — 90°, 45°, 30°.
 */
function generateRouteCandidates(from: Point, to: Point): Point[][] {
  const candidates: Point[][] = [];
  const seen = new Set<string>();
  const push = (points: Point[]) => {
    const cleaned = cleanPolyline(points);
    if (cleaned.length < 2) return;
    const key = cleaned
      .map((p) => `${Math.round(p.x * 2)},${Math.round(p.y * 2)}`)
      .join("|");
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(cleaned);
  };

  push([from, to]);

  // Г-образные (90°)
  push([from, { x: to.x, y: from.y }, to]);
  push([from, { x: from.x, y: to.y }, to]);

  // Z-образные (90°)
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const shifts = [0, 32, -32, 64, -64, 110, -110, 170, -170, 240, -240];
  for (const shift of shifts) {
    const y = midY + shift;
    push([from, { x: from.x, y }, { x: to.x, y }, to]);
    const x = midX + shift;
    push([from, { x, y: from.y }, { x, y: to.y }, to]);
  }

  // 45° Z-образные
  const diagonalShift = [30, 60, 100, 150, 220];
  const horizontalMids: number[] = [];
  const verticalMids: number[] = [];
  for (const k of diagonalShift) {
    horizontalMids.push(from.y + k, from.y - k, to.y + k, to.y - k, midY + k, midY - k);
    verticalMids.push(from.x + k, from.x - k, to.x + k, to.x - k, midX + k, midX - k);
  }
  for (const y of horizontalMids) {
    const d1 = y - from.y;
    const d2 = y - to.y;
    // первая точка — под ±45° от from, вторая — под ∓45° к to
    for (const sign of [1, -1] as const) {
      const p1 = { x: from.x + sign * d1, y };
      const p2 = { x: to.x - sign * d2, y };
      push([from, p1, p2, to]);
    }
  }
  for (const x of verticalMids) {
    const d1 = x - from.x;
    const d2 = x - to.x;
    for (const sign of [1, -1] as const) {
      const p1 = { x, y: from.y + sign * d1 };
      const p2 = { x, y: to.y - sign * d2 };
      push([from, p1, p2, to]);
    }
  }

  // Два сегмента под предпочтительными углами (пересечение лучей)
  const direct = Math.hypot(to.x - from.x, to.y - from.y);
  const maxSegment = Math.max(400, direct * 3 + 200);
  for (const angleA of PREFERRED_ANGLES) {
    for (const angleB of PREFERRED_ANGLES) {
      const corner = intersectRays(from, angleA, to, angleB);
      if (!corner) continue;
      if (Math.hypot(corner.x - from.x, corner.y - from.y) > maxSegment) continue;
      if (Math.hypot(corner.x - to.x, corner.y - to.y) > maxSegment) continue;
      // слишком «прямой» угол не создаёт заметного поворота
      const turn = Math.abs(
        normalizeAngle(
          ((Math.atan2(to.y - corner.y, to.x - corner.x) -
            Math.atan2(corner.y - from.y, corner.x - from.x)) *
            180) /
            Math.PI
        )
      );
      if (turn < 8 || turn > 352) continue;
      push([from, corner, to]);
    }
  }

  // Симметричный вынос середины (произвольный угол — запасной вариант)
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length > 1) {
    const nx = -dy / length;
    const ny = dx / length;
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    for (const offset of [24, 40, 64, 96, 140, 200, 280]) {
      for (const side of [1, -1] as const) {
        push([
          from,
          { x: mx + nx * offset * side, y: my + ny * offset * side },
          to,
        ]);
      }
    }
  }

  return candidates;
}

function fallbackLabelSize(label: string): Size {
  return {
    w: Math.min(220, Math.max(24, label.trim().length * 6)),
    h: 12,
  };
}

function countLabelCollisions(
  labelRect: Rect,
  arrowId: string,
  obstacles: Obstacle[],
  paths: Map<string, Point[]>,
  labelRects: Map<string, Rect>
): number {
  const rect = {
    x: labelRect.x + 1,
    y: labelRect.y + 1,
    w: Math.max(0, labelRect.w - 2),
    h: Math.max(0, labelRect.h - 2),
  };
  if (rect.w <= 0 || rect.h <= 0) return 0;

  let count = 0;
  for (const obstacle of obstacles) {
    if (rectsIntersect(rect, obstacle.rect)) count += 1;
  }
  for (const [id, points] of paths) {
    if (id === arrowId) continue;
    if (polylineIntersectsRect(points, rect)) count += 1;
  }
  for (const [id, other] of labelRects) {
    if (id === arrowId) continue;
    if (rectsIntersect(rect, other)) count += 1;
  }
  return count;
}

function countPathObstacleCrossings(points: Point[], obstacles: Obstacle[]): number {
  let count = 0;
  for (const obstacle of obstacles) {
    if (polylineIntersectsRect(points, obstacle.rect, 2)) count += 1;
  }
  return count;
}

/** Порядок позиций описания вдоль стрелки: сначала центр, затем соседние. */
const LABEL_T_ORDER = [
  0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8, 0.15, 0.85, 0.1, 0.9,
];

/**
 * Итоговая раскладка всех стрелок: маршрут (ломаная), положение описания и
 * рамка описания. Пересчитывается при изменении элементов или их размеров.
 */
export function computeArrowLayouts(
  elements: Record<string, CanvasElement>,
  rects: Record<string, Size>
): Map<string, ArrowLayout> {
  const arrows = Object.values(elements).filter(
    (el): el is ArrowElement => el.kind === "arrow"
  );
  const geometries = computeArrowGeometries(elements, rects);

  const basePaths = new Map<string, Point[]>();
  for (const arrow of arrows) {
    const geometry = geometries.get(arrow.id);
    if (!geometry) continue;
    basePaths.set(arrow.id, getArrowWorldPoints(arrow, geometry.from, geometry.to));
  }

  const obstacles: Obstacle[] = [];
  for (const el of Object.values(elements)) {
    if (el.kind === "arrow") continue;
    const rect = getElementRect(el, rects);
    if (rect) obstacles.push({ id: el.id, rect });
  }

  const paths = new Map(basePaths);
  const labelRects = new Map<string, Rect>();
  const placements = new Map<string, LabelPlacement>();

  const labelSize = (arrow: ArrowElement): Size =>
    rects[arrow.id] ?? fallbackLabelSize(arrow.label);

  const hasLabel = (arrow: ArrowElement) => arrow.label.trim().length > 0;

  const explicitPlacement = (arrow: ArrowElement): LabelPlacement | null =>
    Number.isFinite(arrow.labelT)
      ? {
          t: Math.max(0, Math.min(1, Number(arrow.labelT))),
          side: arrow.labelSide === -1 ? -1 : 1,
        }
      : null;

  const makeLabel = (arrow: ArrowElement, points: Point[], placement: LabelPlacement) =>
    getLabelLayout(points, labelSize(arrow), placement);

  const labelCollisionCount = (
    arrow: ArrowElement,
    label: LabelLayout | null
  ): number =>
    label && hasLabel(arrow)
      ? countLabelCollisions(label.rect, arrow.id, obstacles, paths, labelRects)
      : 0;

  /**
   * Подбирает положение описания вдоль пути: сначала центр, затем ближайшие
   * варианты. Используется, когда маршрут уже выбран, а описание всё ещё
   * пересекает объект.
   */
  const chooseLabelPlacement = (
    arrow: ArrowElement,
    points: Point[],
    preferred: LabelPlacement | null
  ): { placement: LabelPlacement; label: LabelLayout | null; collisions: number } => {
    const size = labelSize(arrow);
    const candidates: LabelPlacement[] = [];
    if (preferred) candidates.push(preferred);
    for (const t of LABEL_T_ORDER) {
      for (const side of [1, -1] as const) {
        candidates.push({ t, side });
      }
    }

    let best: { placement: LabelPlacement; label: LabelLayout | null; collisions: number } | null =
      null;
    for (const placement of candidates) {
      const label = getLabelLayout(points, size, placement);
      if (!label) continue;
      const collisions = labelCollisionCount(arrow, label);
      if (
        !best ||
        collisions < best.collisions ||
        (collisions === best.collisions &&
          Math.abs(placement.t - 0.5) < Math.abs(best.placement.t - 0.5))
      ) {
        best = { placement, label, collisions };
      }
      if (collisions === 0) return best;
    }
    return (
      best ?? {
        placement: { t: 0.5, side: 1 },
        label: getLabelLayout(points, size, { t: 0.5, side: 1 }),
        collisions: 0,
      }
    );
  };

  // Два прохода: второй учитывает пути, изменённые на первом проходе.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const arrow of arrows) {
      const currentPath = paths.get(arrow.id);
      if (!currentPath) continue;

      const preferred = explicitPlacement(arrow);
      const basePlacement =
        preferred ?? placements.get(arrow.id) ?? { t: 0.5, side: 1 as const };
      const baseLabel = makeLabel(arrow, currentPath, basePlacement);
      const baseCollisions = labelCollisionCount(arrow, baseLabel);

      // На втором проходе сохраняем уже найденное положение описания, если
      // оно не конфликтует с новыми путями соседних стрелок.
      if (pass > 0 && placements.has(arrow.id) && baseCollisions === 0) {
        continue;
      }

      // Ручные точки поворота: путь пользователя неприкосновенен — двигаем
      // только описание вдоль стрелки.
      if (arrow.waypoints?.length) {
        const chosen = chooseLabelPlacement(arrow, currentPath, basePlacement);
        placements.set(arrow.id, chosen.placement);
        if (chosen.label && hasLabel(arrow)) labelRects.set(arrow.id, chosen.label.rect);
        else labelRects.delete(arrow.id);
        continue;
      }

      // Если описание свободно — оставляем прямой/текущий путь.
      if (baseCollisions === 0) {
        placements.set(arrow.id, basePlacement);
        if (baseLabel && hasLabel(arrow)) labelRects.set(arrow.id, baseLabel.rect);
        else labelRects.delete(arrow.id);
        continue;
      }

      // Нужен другой маршрут.
      const geometry = geometries.get(arrow.id);
      if (!geometry) continue;

      const candidates = generateRouteCandidates(geometry.from, geometry.to);
      // текущий путь тоже рассматриваем как кандидата (актуально для 2-го прохода)
      const routeCandidates: Point[][] = [];
      const seenRoutes = new Set<string>();
      for (const route of [currentPath, ...candidates]) {
        const key = route
          .map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)
          .join("|");
        if (seenRoutes.has(key)) continue;
        seenRoutes.add(key);
        routeCandidates.push(route);
      }

      let best: {
        points: Point[];
        placement: LabelPlacement;
        label: LabelLayout | null;
        collisions: number;
        score: number;
      } | null = null;

      for (const points of routeCandidates) {
        const label = makeLabel(arrow, points, basePlacement);
        const collisions = labelCollisionCount(arrow, label);
        const isDirect = points.length === 2;

        // Считаем пересечения с карточками только для маршрутов, где описание
        // уже свободно: для остальных важнее найти свободное описание.
        const obstacleCrossings =
          collisions === 0 ? countPathObstacleCrossings(points, obstacles) : 0;

        // Кандидаты перебираются в порядке предпочтения (90° → 45° → 30°):
        // первый чистый маршрут и есть лучший.
        if (collisions === 0 && obstacleCrossings === 0 && !isDirect) {
          best = {
            points,
            placement: basePlacement,
            label,
            collisions,
            score: routeScore(points),
          };
          break;
        }

        let score =
          collisions * LABEL_COLLISION_WEIGHT +
          obstacleCrossings * PATH_OBSTACLE_WEIGHT +
          routeScore(points);

        // Прямой путь, который уже конфликтует, не должен побеждать
        // только за счёт минимальной длины.
        if (isDirect && collisions > 0) score += LABEL_COLLISION_WEIGHT / 2;

        if (!best || score < best.score) {
          best = { points, placement: basePlacement, label, collisions, score };
        }
      }

      if (!best) continue;

      // Если на выбранном маршруте описание всё ещё конфликтует — пробуем
      // сдвинуть его вдоль стрелки (это дешевле, чем ещё один изгиб).
      if (!preferred && best.collisions > 0) {
        const chosen = chooseLabelPlacement(arrow, best.points, null);
        if (chosen.collisions < best.collisions) {
          best.placement = chosen.placement;
          best.label = chosen.label;
          best.collisions = chosen.collisions;
        }
      }

      // Если у пользователя было явное положение описания — уважаем его,
      // но при конфликте всё же ищем свободное место.
      if (preferred && best.collisions > 0) {
        const chosen = chooseLabelPlacement(arrow, best.points, preferred);
        best.placement = chosen.placement;
        best.label = chosen.label;
        best.collisions = chosen.collisions;
      }

      paths.set(arrow.id, best.points);
      placements.set(arrow.id, best.placement);
      if (best.label && hasLabel(arrow)) labelRects.set(arrow.id, best.label.rect);
      else labelRects.delete(arrow.id);
    }
  }

  const result = new Map<string, ArrowLayout>();
  for (const arrow of arrows) {
    const points = paths.get(arrow.id);
    if (!points) continue;
    const placement = placements.get(arrow.id) ?? { t: 0.5, side: 1 };
    const label = makeLabel(arrow, points, placement);
    result.set(arrow.id, { points, label });
  }
  return result;
}

/** Габаритная рамка всего содержимого холста. */
export function contentBBox(
  elements: Record<string, CanvasElement>,
  rects: Record<string, Size>,
  layouts: Map<string, ArrowLayout>
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
      const layout = layouts.get(el.id);
      if (!layout) continue;
      for (let i = 0; i + 1 < layout.points.length; i++) {
        const a = layout.points[i];
        const b = layout.points[i + 1];
        add(Math.min(a.x, b.x) - 10, Math.min(a.y, b.y) - 10, Math.abs(b.x - a.x) + 20, Math.abs(b.y - a.y) + 20);
      }
      if (layout.label && el.label.trim()) {
        add(layout.label.rect.x, layout.label.rect.y, layout.label.rect.w, layout.label.rect.h);
      }
      continue;
    }
    const rect = getElementRect(el, rects);
    if (rect) add(rect.x, rect.y, rect.w, rect.h);
  }

  if (!isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) };
}
