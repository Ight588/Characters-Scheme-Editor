/* Хранилище браузера (IndexedDB) + рабочий файл JSON */

import { del, get, set } from "idb-keyval";
import {
  CanvasElement,
  CanvasSettings,
  CURRENT_FILE_VERSION,
  PersistedState,
  SavedArrowStyle,
  SavedStatusItem,
  View,
} from "./types";

const STORAGE_KEY = "char-scheme-editor-v1";

export async function saveToStorage(state: {
  title: string;
  elements: CanvasElement[];
  order: string[];
  settings: CanvasSettings;
  savedStatuses: SavedStatusItem[];
  savedArrowStyles: SavedArrowStyle[];
  view: View;
}): Promise<void> {
  const payload: PersistedState = { version: CURRENT_FILE_VERSION, ...state };
  await set(STORAGE_KEY, payload);
}

export async function loadFromStorage(): Promise<PersistedState | null> {
  try {
    const data = await get<PersistedState>(STORAGE_KEY);
    return data ?? null;
  } catch {
    return null;
  }
}

export async function clearStorage(): Promise<void> {
  await del(STORAGE_KEY);
}

/* ------------- Рабочий файл (JSON) ------------- */

export function serializeWorkingFile(state: {
  title: string;
  elements: CanvasElement[];
  order: string[];
  settings: CanvasSettings;
  savedStatuses: SavedStatusItem[];
  savedArrowStyles: SavedArrowStyle[];
  view: View;
}): string {
  const payload: PersistedState = { version: CURRENT_FILE_VERSION, ...state };
  return JSON.stringify(payload, null, 2);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function sanitizeFilename(name: string, fallback: string): string {
  const cleaned = (name || "").trim().replace(/[\\/:*?"<>|]+/g, "_");
  return cleaned.length ? cleaned : fallback;
}

/** Читает и валидирует рабочий файл; бросает ошибку с понятным сообщением */
export function parseWorkingFile(text: string): PersistedState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Файл не является корректным JSON");
  }
  const data = raw as Partial<PersistedState>;
  if (!data || typeof data !== "object") throw new Error("Пустой файл");
  if (!Array.isArray(data.elements) || !Array.isArray(data.order)) {
    throw new Error("В файле нет элементов холста");
  }
  return {
    version: typeof data.version === "number" ? data.version : CURRENT_FILE_VERSION,
    title: typeof data.title === "string" ? data.title : "",
    elements: data.elements as CanvasElement[],
    order: data.order as string[],
    settings:
      data.settings && typeof data.settings === "object"
        ? (data.settings as CanvasSettings)
        : { bgColor: "#f2eeeb", bgFit: "tile", bgOpacity: 100 },
    savedStatuses: Array.isArray(data.savedStatuses) ? data.savedStatuses : [],
    savedArrowStyles: Array.isArray(data.savedArrowStyles) ? data.savedArrowStyles : [],
    view:
      data.view && typeof data.view === "object"
        ? (data.view as View)
        : { x: 0, y: 0, scale: 1 },
  };
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsText(file);
  });
}
