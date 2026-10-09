"use client";

/* Экспорт холста: PNG / PDF / рабочий файл JSON */

import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { useEditor, getPersistedSlice } from "./store";
import { computeArrowGeometries, contentBBox } from "./geometry";
import { downloadBlob, sanitizeFilename, serializeWorkingFile } from "./storage";

const PAD = 40;
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function getWorldContentEl(): HTMLElement | null {
  return document.getElementById("editor-world-content");
}

export async function exportCanvasAsImage(mode: "full" | "mini", format: "png" | "pdf"): Promise<void> {
  const store = useEditor.getState();
  if (Object.keys(store.elements).length === 0) {
    throw new Error("Холст пуст — нечего сохранять");
  }

  store.setExportMode({ mode });

  // даём React отрендерить экспортный режим и измерить карточки
  await raf();
  await raf();
  await delay(120);
  await raf();

  const s = useEditor.getState();
  const geometries = computeArrowGeometries(s.elements, s.rects);
  const bbox = contentBBox(s.elements, s.rects, geometries);
  const width = Math.ceil(bbox.w + PAD * 2);
  const height = Math.ceil(bbox.h + PAD * 2);

  s.setExportOffset({ x: -bbox.x + PAD, y: -bbox.y + PAD });
  await raf();
  await delay(60);

  const el = getWorldContentEl();
  if (!el) {
    useEditor.getState().setExportMode(null);
    throw new Error("Не удалось подготовить холст к экспорту");
  }

  try {
    const dataUrl = await toPng(el, {
      width,
      height,
      pixelRatio: 2,
      backgroundColor: s.settings.bgColor,
      cacheBust: true,
    });

    const name = sanitizeFilename(s.title, "Схема");
    if (format === "png") {
      const blob = await (await fetch(dataUrl)).blob();
      downloadBlob(blob, `${name}.png`);
    } else {
      const pdf = new jsPDF({
        orientation: width >= height ? "landscape" : "portrait",
        unit: "px",
        format: [width, height],
        compress: true,
      });
      pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
      pdf.save(`${name}.pdf`);
    }
  } finally {
    useEditor.getState().setExportMode(null);
    useEditor.getState().setExportOffset({ x: 0, y: 0 });
  }
}

export function exportWorkingFile(): void {
  const s = useEditor.getState();
  const json = serializeWorkingFile(getPersistedSlice(s));
  const blob = new Blob([json], { type: "application/json" });
  const name = sanitizeFilename(s.title, "Схема");
  downloadBlob(blob, `${name}.json`);
}
