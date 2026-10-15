import { mkdir, readFile, writeFile } from 'node:fs/promises';

const [source, destination = 'public/assets/original/braains-classic.tmj'] = process.argv.slice(2);
if (!source) throw new Error('Usage: node scripts/extract-original-map.mjs <captured-html> [destination]');

const text = await readFile(source, 'utf8');
const mapToken = '\\"map\\":';
const tokenOffset = text.indexOf(mapToken);
if (tokenOffset < 0) throw new Error('Embedded map not found in source.');
const start = text.indexOf('{', tokenOffset);
let depth = 0;
let end = -1;
for (let index = start; index < text.length; index += 1) {
  if (text[index] === '{') depth += 1;
  if (text[index] === '}') depth -= 1;
  if (depth === 0) { end = index; break; }
}
const map = JSON.parse(text.slice(start, end + 1).replaceAll('\\"', '"'));
// Keep the map tied to the exact original sheet named by the captured HTML.
// Its tile indices differ from the older `tilesheet.png` attachment.
map.tilesets[0].image = 'tilesheet-complete.png';
await mkdir(destination.slice(0, Math.max(destination.lastIndexOf('/'), destination.lastIndexOf('\\'))), { recursive: true });
await writeFile(destination, `${JSON.stringify(map, null, 2)}\n`);
