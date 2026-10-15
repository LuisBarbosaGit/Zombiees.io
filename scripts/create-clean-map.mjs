import { mkdir, readFile, writeFile } from 'node:fs/promises';

const source = process.argv[2] ?? 'public/assets/original/braains-classic.tmj';
const destination = 'public/assets/maps/braains-classic-clean.tmj';
const map = JSON.parse(await readFile(source, 'utf8'));

// `floor` is the base terrain and `floor2` adds details such as rugs. Keep both
// exact, then restore the source tree layer so its art matches the existing collision map.
const roadRows = [30, 31, 32, 33, 34];
const roadBaseGids = [37, 178, 57, 30, 86];
const floor = map.layers.find((layer) => layer.name === 'floor');
if (!floor?.data) throw new Error('Original floor layer is missing.');
for (let index = 0; index < roadRows.length; index += 1) {
  const row = roadRows[index];
  const gid = roadBaseGids[index];
  const start = row * map.width;
  for (let column = 0; column < map.width; column += 1) {
    if (floor.data[start + column] === 0) floor.data[start + column] = gid;
  }
}
map.layers = map.layers.filter((layer) =>
  layer.name === 'floor' || layer.name === 'floor2' || layer.name === 'walls' || layer.name === 'trees'
);
map.properties = [...(map.properties ?? []), {
  name: 'cleanVariant', type: 'bool', value: true
}, {
  name: 'preservesOriginalFloorLayers', type: 'bool', value: true
}];

await mkdir('public/assets/maps', { recursive: true });
await writeFile(destination, `${JSON.stringify(map, null, 2)}\n`);
