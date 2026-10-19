/**
 * Screenshot compression: downscale + JPEG re-encode until the image fits
 * Notion's single-part upload limit. Canvas work sits behind `ImageOps` so the
 * size/quality loop is unit-testable without a real canvas.
 */
import { err, ok, type Result } from '@/lib/errors';

/** Notion single-part upload limit is 5 MiB; keep headroom. */
export const DEFAULT_MAX_BYTES = 4.5 * 1024 * 1024;

export interface CompressOptions {
  /** Output never wider than this (px). Default 1600. */
  maxWidth?: number;
  /** Starting JPEG quality 0..1. Default 0.85. */
  quality?: number;
  /** Size ceiling in bytes. Default 4.5 MiB. */
  maxBytes?: number;
  /** Quality isn't lowered below this before scaling down. Default 0.5. */
  minQuality?: number;
  /** Give up below this width (px). Default 320. */
  minWidth?: number;
}

export interface CompressedImage {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  /** True when quality/size had to be reduced to fit `maxBytes`. */
  reducedToFit: boolean;
}

/** A decoded image the ops can re-encode. */
export interface DecodedImage<S = unknown> {
  source: S;
  width: number;
  height: number;
}

/** Injectable canvas operations. */
export interface ImageOps<S = unknown> {
  decode(blob: Blob): Promise<DecodedImage<S>>;
  encode(image: DecodedImage<S>, width: number, height: number, quality: number): Promise<Blob>;
  release?(image: DecodedImage<S>): void;
  toDataUrl(blob: Blob): Promise<string>;
}

/** Parses a `data:` URL into a Blob; null when malformed. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^,]*?)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = (m[1] ?? '').split(';')[0]?.trim() || 'application/octet-stream';
  const payload = m[3] ?? '';
  try {
    if (m[2] !== undefined) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(payload)], { type: mime });
  } catch {
    return null;
  }
}

/** Encodes a Blob as a base64 `data:` URL (works in workers; no FileReader). */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

/** Real implementation: createImageBitmap + OffscreenCanvas. */
export const browserImageOps: ImageOps<ImageBitmap> = {
  async decode(blob) {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  },
  async encode(image, width, height, quality) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image.source, 0, 0, width, height);
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  },
  release(image) {
    image.source.close();
  },
  toDataUrl: blobToDataUrl,
};

const TOO_LARGE_MESSAGE =
  "The screenshot is too large to upload to Notion even after shrinking it. Try a smaller browser window, or save without the screenshot.";

/**
 * Downscales to `maxWidth`, re-encodes as JPEG, then lowers quality (−0.1 per
 * step down to `minQuality`) and finally scales ×0.75 per step until the
 * result fits `maxBytes`. Returns the input unchanged when it's already a JPEG
 * within limits. Never throws.
 */
export async function compressScreenshot<S>(
  dataUrl: string,
  options: CompressOptions = {},
  ops: ImageOps<S> = browserImageOps as unknown as ImageOps<S>,
): Promise<Result<CompressedImage>> {
  const maxWidth = options.maxWidth ?? 1600;
  const startQuality = clamp(options.quality ?? 0.85, 0.05, 1);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const minQuality = Math.min(clamp(options.minQuality ?? 0.5, 0.05, 1), startQuality);
  const minWidth = options.minWidth ?? 320;

  const input = dataUrlToBlob(dataUrl);
  if (input === null) return err('unknown', "The screenshot couldn't be read.", { detail: 'Malformed data URL' });

  let image: DecodedImage<S>;
  try {
    image = await ops.decode(input);
  } catch (thrown) {
    return err('unknown', "The screenshot couldn't be processed.", { detail: errorDetail(thrown) });
  }

  try {
    if (input.type === 'image/jpeg' && image.width <= maxWidth && input.size <= maxBytes) {
      return ok({ blob: input, dataUrl, width: image.width, height: image.height, bytes: input.size, reducedToFit: false });
    }

    let scale = image.width > maxWidth ? maxWidth / image.width : 1;
    let quality = startQuality;
    let reducedToFit = false;

    for (;;) {
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const blob = await ops.encode(image, width, height, quality);
      if (blob.size <= maxBytes) {
        const out = await ops.toDataUrl(blob);
        return ok({ blob, dataUrl: out, width, height, bytes: blob.size, reducedToFit });
      }
      reducedToFit = true;
      if (quality - minQuality > 1e-9) {
        quality = Math.max(minQuality, round2(quality - 0.1));
      } else if (Math.round(image.width * scale * 0.75) >= minWidth) {
        scale *= 0.75;
      } else {
        return err('upload-too-large', TOO_LARGE_MESSAGE, { detail: `${blob.size} bytes at ${width}x${height}` });
      }
    }
  } catch (thrown) {
    return err('unknown', "The screenshot couldn't be processed.", { detail: errorDetail(thrown) });
  } finally {
    try {
      ops.release?.(image);
    } catch {
      // ignore
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorDetail(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}
