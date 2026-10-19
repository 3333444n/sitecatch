import { firstMeta, toHttpUrl } from '../util';
import type { ImageValue } from '../types';
import { defineExtractor } from './define';

const IMAGE_KEYS = ['og:image', 'og:image:secure_url', 'og:image:url', 'twitter:image', 'twitter:image:src'];

function positiveInt(value: string | null): number | undefined {
  if (value === null) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export const ogImage = defineExtractor({
  id: 'ogImage',
  label: 'Preview image',
  description: 'The image shown in link previews (og:image, then twitter:image).',
  output: 'image',
  extract: (raw) => {
    for (const key of IMAGE_KEYS) {
      const url = toHttpUrl(firstMeta(raw, [key]), raw.url);
      if (url === null) continue;
      const value: ImageValue = { kind: 'image', url };
      if (key.startsWith('og:')) {
        const width = positiveInt(firstMeta(raw, ['og:image:width']));
        const height = positiveInt(firstMeta(raw, ['og:image:height']));
        if (width !== undefined) value.width = width;
        if (height !== undefined) value.height = height;
        const type = firstMeta(raw, ['og:image:type']);
        if (type?.startsWith('image/')) value.mimeType = type;
      }
      return value;
    }
    return null;
  },
});
