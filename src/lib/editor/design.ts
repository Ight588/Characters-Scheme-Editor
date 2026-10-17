/* Чтение числовых дизайн-токенов из единственного источника src/app/variables.css. */

export type DesignLengthToken =
  | "--cards-rel-stroke"
  | "--cards-age"
  | "--cards-dec-width"
  | "--comp-pad-vert"
  | "--comp-pad-hor"
  | "--menus-stroke"
  | "--menus-radius"
  | "--menus-padding"
  | "--p-4"
  | "--p-6"
  | "--p-8"
  | "--p-12"
  | "--p-16"
  | "--p-20"
  | "--p-24";

export function designPixels(token: DesignLengthToken): number {
  if (typeof window === "undefined") return 0;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token);
  const pixels = Number.parseFloat(value);
  return Number.isFinite(pixels) ? pixels : 0;
}
