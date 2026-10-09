/* Загрузка и сжатие изображений → WEBP data URL */

export type CompressedImage = {
  src: string; // data URL (webp, при отсутствии поддержки — jpeg)
  w: number;
  h: number;
};

function loadBitmap(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать изображение"));
    };
    img.src = url;
  });
}

function supportsWebp(canvas: HTMLCanvasElement): boolean {
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

/**
 * Сжимает изображение до maxDim по большей стороне и переводит в WEBP.
 * Малые изображения остаются без масштабирования, но всё равно конвертируются.
 */
export async function compressToWebp(
  file: File | Blob,
  maxDim: number,
  quality = 0.85
): Promise<CompressedImage> {
  const img = await loadBitmap(file);
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;

  const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
  const w = Math.max(1, Math.round(naturalW * scale));
  const h = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  const useWebp = supportsWebp(canvas);
  const mime = useWebp ? "image/webp" : "image/jpeg";
  const src = canvas.toDataURL(mime, quality);
  return { src, w, h };
}

/** Аватар: квадрат 256px, кроп по центру */
export async function compressAvatarWebp(file: File | Blob): Promise<CompressedImage> {
  const img = await loadBitmap(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    (img.naturalWidth - side) / 2,
    (img.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    256,
    256
  );
  const useWebp = supportsWebp(canvas);
  const src = canvas.toDataURL(useWebp ? "image/webp" : "image/jpeg", 0.82);
  return { src, w: 256, h: 256 };
}
