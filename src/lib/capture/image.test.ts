import { describe, expect, it } from 'vitest';
import { blobToDataUrl, compressScreenshot, dataUrlToBlob, type DecodedImage, type ImageOps } from './image';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';
const JPEG_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQ';

interface FakeCall {
  width: number;
  height: number;
  quality: number;
}

/** Fake ops: encoded size = width*height*quality*bytesPerPixel. */
function fakeOps(width: number, height: number, bytesPerPixel = 1) {
  const calls: FakeCall[] = [];
  let released = 0;
  const ops: ImageOps<string> = {
    decode: () => Promise.resolve<DecodedImage<string>>({ source: 'img', width, height }),
    encode: (_img, w, h, quality) => {
      calls.push({ width: w, height: h, quality });
      const size = Math.round(w * h * quality * bytesPerPixel);
      return Promise.resolve(new Blob([new Uint8Array(size)], { type: 'image/jpeg' }));
    },
    release: () => {
      released++;
    },
    toDataUrl: (blob) => Promise.resolve(`data:image/jpeg;base64,size-${blob.size}`),
  };
  return { ops, calls, released: () => released };
}

describe('dataUrlToBlob / blobToDataUrl', () => {
  it('round-trips base64', async () => {
    const blob = dataUrlToBlob(PNG_DATA_URL);
    expect(blob?.type).toBe('image/png');
    expect(blob?.size).toBe(8);
    if (!blob) throw new Error('blob');
    expect(await blobToDataUrl(blob)).toBe(PNG_DATA_URL);
  });

  it('handles percent-encoded payloads', async () => {
    const blob = dataUrlToBlob('data:text/plain;charset=utf-8,hello%20world');
    expect(blob?.type).toBe('text/plain');
    expect(await blob?.text()).toBe('hello world');
  });

  it('rejects malformed input', () => {
    expect(dataUrlToBlob('https://example.com/x.png')).toBeNull();
    expect(dataUrlToBlob('data:image/png;base64,***')).toBeNull();
  });
});

describe('compressScreenshot', () => {
  it('passes through a small JPEG untouched', async () => {
    const { ops, calls } = fakeOps(1200, 800);
    const result = await compressScreenshot(JPEG_DATA_URL, {}, ops);
    expect(result.ok && result.data).toMatchObject({ dataUrl: JPEG_DATA_URL, width: 1200, height: 800, reducedToFit: false });
    expect(calls).toEqual([]);
  });

  it('downscales wide screenshots to maxWidth', async () => {
    const { ops, calls, released } = fakeOps(3200, 2000, 0.1);
    const result = await compressScreenshot(JPEG_DATA_URL, { maxWidth: 1600 }, ops);
    expect(calls).toEqual([{ width: 1600, height: 1000, quality: 0.85 }]);
    expect(result.ok && result.data).toMatchObject({ width: 1600, height: 1000, reducedToFit: false });
    expect(released()).toBe(1);
  });

  it('lowers quality, then scales by 0.75 until under the limit', async () => {
    const { ops, calls } = fakeOps(1600, 1000);
    // 1600*1000*q bytes; limit forces quality to floor (0.5 → 800k) then scaling
    const result = await compressScreenshot(PNG_DATA_URL, { maxBytes: 400_000 }, ops);
    expect(calls.map((c) => c.quality)).toEqual([0.85, 0.75, 0.65, 0.55, 0.5, 0.5, 0.5]);
    expect(calls.slice(-3).map((c) => c.width)).toEqual([1600, 1200, 900]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.bytes).toBeLessThanOrEqual(400_000);
      expect(result.data.reducedToFit).toBe(true);
      expect(result.data.dataUrl).toBe(`data:image/jpeg;base64,size-${result.data.bytes}`);
    }
  });

  it('gives up with upload-too-large below minWidth', async () => {
    const { ops } = fakeOps(1600, 1000, 0.01);
    const result = await compressScreenshot(PNG_DATA_URL, { maxBytes: 100 }, ops);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('upload-too-large');
  });

  it('returns errors instead of throwing', async () => {
    const { ops } = fakeOps(10, 10);
    const failing: ImageOps<string> = { ...ops, decode: () => Promise.reject(new Error('boom')) };
    const r1 = await compressScreenshot(PNG_DATA_URL, {}, failing);
    expect(r1.ok).toBe(false);
    const r2 = await compressScreenshot('garbage', {}, ops);
    expect(r2.ok).toBe(false);
    const encodeFails: ImageOps<string> = { ...ops, encode: () => Promise.reject(new Error('no canvas')) };
    const r3 = await compressScreenshot(PNG_DATA_URL, {}, encodeFails);
    expect(!r3.ok && r3.error.detail).toBe('no canvas');
  });
});
