import { mkdir, writeFile } from 'node:fs/promises';

const tile = 64;
const columns = 27;
const rows = 20;
const frames = {};

function addFrame(name, x, y, w, h) {
  frames[name] = {
    frame: { x, y, w, h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w, h },
    sourceSize: { w, h }
  };
}

// Canonical 64px grid: the original map's Tiled GID n maps to tile-n-1.
for (let row = 0; row < rows; row += 1) {
  for (let column = 0; column < columns; column += 1) {
    const index = row * columns + column;
    addFrame(`tile-${index}`, column * tile, row * tile, tile, tile);
  }
}

// Full alpha bounds measured directly from the unmodified original image.
// Names describe only placement/category when visually unambiguous.
[
  ['furniture.sofa.green', 904, 1026, 176, 59],
  ['furniture.sofa.orange', 898, 1090, 188, 60],
  ['furniture.sofa.gray', 902, 1163, 180, 43],
  ['furniture.chair.green', 1092, 1031, 55, 50],
  ['furniture.chair.orange', 1092, 1094, 56, 52],
  ['furniture.chair.blue', 1160, 1034, 48, 43],
  ['furniture.stool.wood', 1222, 1040, 50, 32],
  ['furniture.table.round', 1218, 1154, 60, 60],
  ['furniture.large-01', 1282, 1026, 188, 60],
  ['furniture.large-02', 1282, 1090, 188, 60],
  ['furniture.large-03', 1282, 1164, 188, 40],
  ['furniture.large-04', 1538, 770, 188, 188],
  ['furniture.large-05', 1538, 962, 188, 60],
  ['furniture.green-large', 1354, 834, 188, 188],
  ['furniture.blue-large', 1414, 1026, 188, 188],
  ['prop.tree.green', 1163, 395, 107, 106],
  ['prop.tree.orange', 1355, 395, 107, 106],
  ['prop.crate.large', 1281, 321, 62, 62],
  ['prop.crate.small', 1356, 332, 41, 41]
].forEach(([name, x, y, w, h]) => addFrame(name, x, y, w, h));

const atlas = {
  frames,
  meta: {
    app: 'Cerco Zero atlas extractor',
    version: '1.0',
    image: 'tilesheet.png',
    format: 'RGBA8888',
    size: { w: 1728, h: 1280 },
    scale: '1',
    source: 'User-provided original tilesheet; image intentionally unmodified.'
  }
};

await mkdir('public/assets/original', { recursive: true });
await writeFile('public/assets/original/tilesheet.atlas.json', `${JSON.stringify(atlas, null, 2)}\n`);
