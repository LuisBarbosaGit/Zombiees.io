import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface TiledLayer { name: string; data?: number[]; }
interface TiledMap { width: number; height: number; tilewidth: number; tileheight: number; layers: TiledLayer[]; }

@Injectable()
export class WorldMapService {
  readonly id = 'braains-classic';
  readonly version = 1;
  readonly map: TiledMap;
  private readonly blocked: Uint8Array;

  constructor() {
    const candidates = process.env.GAME_MAP_FILE
      ? [resolve(process.env.GAME_MAP_FILE)]
      : [
          resolve(process.cwd(), 'public/assets/maps/braains-classic-clean.tmj'),
          resolve(process.cwd(), '../public/assets/maps/braains-classic-clean.tmj')
        ];
    const file = candidates.find((candidate) => {
      return existsSync(candidate);
    });
    if (!file) throw new Error(`Game map not found. Checked: ${candidates.join(', ')}`);
    this.map = JSON.parse(readFileSync(file, 'utf8')) as TiledMap;
    this.blocked = new Uint8Array(this.map.width * this.map.height);
    for (const layerName of ['walls', 'trees']) {
      const layer = this.map.layers.find((candidate) => candidate.name === layerName);
      layer?.data?.forEach((gid, index) => { if ((gid & 0x1fffffff) !== 0) this.blocked[index] = 1; });
    }
  }

  getDefinition(): { id: string; version: number; map: TiledMap } {
    return { id: this.id, version: this.version, map: this.map };
  }

  isBlocked(x: number, y: number, radius = 14): boolean {
    const points = [
      [x, y], [x - radius, y], [x + radius, y], [x, y - radius], [x, y + radius],
      [x - radius * 0.7, y - radius * 0.7], [x + radius * 0.7, y - radius * 0.7],
      [x - radius * 0.7, y + radius * 0.7], [x + radius * 0.7, y + radius * 0.7]
    ];
    return points.some(([px, py]) => {
      const column = Math.floor(px! / this.map.tilewidth);
      const row = Math.floor(py! / this.map.tileheight);
      if (column < 0 || row < 0 || column >= this.map.width || row >= this.map.height) return true;
      return this.blocked[row * this.map.width + column] === 1;
    });
  }

  findSpawn(index: number, occupied: Array<{ x: number; y: number }>): { x: number; y: number } {
    const centerX = 1120;
    const centerY = 1952;
    for (let radius = 0; radius < 1200; radius += 40) {
      const tries = radius === 0 ? 1 : Math.ceil((2 * Math.PI * radius) / 40);
      for (let step = 0; step < tries; step += 1) {
        const angle = ((step + index * 7) / tries) * Math.PI * 2;
        const x = Math.round(centerX + Math.cos(angle) * radius);
        const y = Math.round(centerY + Math.sin(angle) * radius);
        if (this.isBlocked(x, y)) continue;
        if (occupied.some((point) => Math.hypot(point.x - x, point.y - y) < 38)) continue;
        return { x, y };
      }
    }
    return { x: centerX, y: centerY };
  }
}
