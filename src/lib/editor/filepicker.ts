"use client";

/* Мост между меню/действиями и скрытыми <input type=file> */

import type { Point } from "./types";

export type FilePickKind = "image" | "avatar" | "bg" | "open";

type PickRequest =
  | { kind: "image"; world: Point }
  | { kind: "avatar"; cardId: string }
  | { kind: "bg" }
  | { kind: "open" };

let handler: ((req: PickRequest) => void) | null = null;

export function registerFilePicker(fn: (req: PickRequest) => void): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

export function requestImageAt(world: Point): void {
  handler?.({ kind: "image", world });
}

export function requestAvatar(cardId: string): void {
  handler?.({ kind: "avatar", cardId });
}

export function requestBgImage(): void {
  handler?.({ kind: "bg" });
}

export function requestOpenFile(): void {
  handler?.({ kind: "open" });
}
