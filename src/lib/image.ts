/**
 * Client-side image compression for receipt photos. Photos can be several MB
 * raw; downscaling + JPEG encoding keeps them small before storing.
 */

const DEFAULT_MAX_DIM = 1200;
const DEFAULT_QUALITY = 0.7;

/**
 * Reads any File and returns its raw data URL, unmodified. Used for receipt
 * types we don't (or can't) compress client-side, e.g. PDFs.
 */
export function fileToDataURL(file: File): Promise<string> {
  return readAsDataURL(file);
}

/**
 * Reads an image File and returns a downscaled, JPEG-compressed data URL.
 * Used in sandbox/local mode where images live in memory instead of storage.
 * Falls back to the raw data URL if canvas processing fails.
 */
export async function fileToCompressedDataURL(
  file: File,
  maxDim = DEFAULT_MAX_DIM,
  quality = DEFAULT_QUALITY
): Promise<string> {
  const dataUrl = await readAsDataURL(file);
  try {
    const canvas = await drawScaledCanvas(dataUrl, maxDim);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}

/**
 * Reads an image File and returns a downscaled, JPEG-compressed Blob,
 * suitable for uploading to Supabase Storage. Falls back to the original
 * file if canvas processing fails.
 */
export async function fileToCompressedBlob(
  file: File,
  maxDim = DEFAULT_MAX_DIM,
  quality = DEFAULT_QUALITY
): Promise<Blob> {
  try {
    const dataUrl = await readAsDataURL(file);
    const canvas = await drawScaledCanvas(dataUrl, maxDim);
    const blob = await canvasToBlob(canvas, quality);
    return blob ?? file;
  } catch {
    return file;
  }
}

async function drawScaledCanvas(
  dataUrl: string,
  maxDim: number
): Promise<HTMLCanvasElement> {
  const img = await loadImage(dataUrl);
  let { width, height } = img;

  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}
