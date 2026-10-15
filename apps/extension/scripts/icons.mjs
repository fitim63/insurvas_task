// Renders scripts/icon.svg into the PNG sizes Chrome expects (public/icon/<size>.png).
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const here = new URL('.', import.meta.url);
mkdirSync(new URL('../public/icon/', import.meta.url), { recursive: true });
for (const size of [16, 32, 48, 96, 128]) {
  await sharp(new URL('icon.svg', here).pathname.replace(/^\/([A-Z]:)/, '$1'), { density: 384 })
    .resize(size, size)
    .png()
    .toFile(new URL(`../public/icon/${size}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
}
console.log('icons written');
