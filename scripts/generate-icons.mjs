// Rasterizes assets/icon.svg into the extension icons at public/icon/<size>.png.
// Usage: node scripts/generate-icons.mjs   (dev only; output is committed)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const SIZES = [16, 32, 48, 96, 128];
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'assets/icon.svg'), 'utf8');
const outDir = join(root, 'public/icon');

mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(join(outDir, `${size}.png`), png);
  process.stdout.write(`public/icon/${size}.png (${png.length} bytes)\n`);
}
