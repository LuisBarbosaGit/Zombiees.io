import { isStaticBlocked, MAP_HEIGHT, MAP_WIDTH, TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from '../maps/townMap';
import type { Furniture, FurnitureKind, InputFrame, Point, WorldState, Zombie } from './types';

const PLAYER_START = { x: 1120, y: 1952 };
const EPSILON = 0.0001;

const EMPTY_INPUT: InputFrame = { moveX: 0, moveY: 0, interact: false, aim: null };

export class Simulation {
  readonly state: WorldState;
  private zombieSequence = 0;

  constructor(name = 'Sobrevivente') {
    this.state = {
      elapsed: 0,
      player: {
        id: 'player', name, x: PLAYER_START.x, y: PLAYER_START.y, radius: 15,
        health: 50, maxHealth: 50, facing: { x: 1, y: 0 }, velocity: { x: 0, y: 0 }
      },
      furniture: createFurniture(),
      zombies: [],
      wave: { number: 1, pending: 4, spawnCooldown: 0.6, breakRemaining: 2.5, status: 'preparing' },
      defeated: false
    };
  }

  step(input: InputFrame = EMPTY_INPUT, rawDelta: number): void {
    const dt = Math.min(Math.max(rawDelta, 0), 0.05);
    if (this.state.defeated || dt === 0) return;
    this.state.elapsed += dt;
    const movementLength = Math.hypot(input.moveX, input.moveY);
    if (input.aim) {
      const aimX = input.aim.x - this.state.player.x;
      const aimY = input.aim.y - this.state.player.y;
      const aimLength = Math.hypot(aimX, aimY);
      if (aimLength > EPSILON) this.state.player.facing = { x: aimX / aimLength, y: aimY / aimLength };
    } else if (movementLength > EPSILON) {
      this.state.player.facing = { x: input.moveX / movementLength, y: input.moveY / movementLength };
    }
    if (input.interact) this.rotateNearestFurniture();
    this.movePlayer(input.moveX, input.moveY, dt);
    this.updateWave(dt);
    this.updateZombies(dt);
    this.removeDestroyed();
  }

  private movePlayer(moveX: number, moveY: number, dt: number): void {
    const length = Math.hypot(moveX, moveY);
    const speed = 180;
    const targetX = length < EPSILON ? 0 : (moveX / length) * speed;
    const targetY = length < EPSILON ? 0 : (moveY / length) * speed;
    // A short velocity response gives the original movement a gentle, controlled slide.
    const response = length < EPSILON ? 7 : 11;
    const blend = 1 - Math.exp(-response * dt);
    const player = this.state.player;
    player.velocity.x += (targetX - player.velocity.x) * blend;
    player.velocity.y += (targetY - player.velocity.y) * blend;
    const dx = player.velocity.x * dt;
    const dy = player.velocity.y * dt;
    this.tryMovePlayer(dx, 0);
    this.tryMovePlayer(0, dy);
  }

  private tryMovePlayer(dx: number, dy: number): void {
    const player = this.state.player;
    const next = { x: player.x + dx, y: player.y + dy };
    if (this.isCircleStaticBlocked(next.x, next.y, player.radius)) { if (dx) player.velocity.x = 0; if (dy) player.velocity.y = 0; return; }
    const touched = this.state.furniture.find((item) => circleOverlapsRectangle(next.x, next.y, player.radius, item));
    if (touched) {
      // The prop must travel at least as far as the player's attempted step;
      // otherwise their collision shapes overlap and the player can clip through.
      const pushFactor = 1 + 0.55 / touched.mass;
      if (!this.tryPushFurniture(touched, dx * pushFactor, dy * pushFactor)) { if (dx) player.velocity.x = 0; if (dy) player.velocity.y = 0; return; }
    }
    player.x = next.x;
    player.y = next.y;
  }

  private tryPushFurniture(item: Furniture, dx: number, dy: number): boolean {
    const next = { ...item, x: item.x + dx, y: item.y + dy };
    if (this.isRectangleStaticBlocked(next)) return false;
    if (this.state.furniture.some((other) => other.id !== item.id && rectanglesOverlap(next, other))) return false;
    item.x = next.x;
    item.y = next.y;
    return true;
  }

  private rotateNearestFurniture(): void {
    const player = this.state.player;
    const item = this.state.furniture
      .filter((candidate) => distanceToRectangle(player.x, player.y, candidate) < 76)
      .sort((a, b) => distanceToRectangle(player.x, player.y, a) - distanceToRectangle(player.x, player.y, b))[0];
    if (!item || Math.abs(item.width - item.height) < 2) return;
    const rotated: Furniture = {
      ...item,
      x: item.x + (item.width - item.height) / 2,
      y: item.y + (item.height - item.width) / 2,
      width: item.height,
      height: item.width
    };
    if (this.isRectangleStaticBlocked(rotated)) return;
    if (this.state.furniture.some((other) => other.id !== item.id && rectanglesOverlap(rotated, other))) return;
    item.x = rotated.x;
    item.y = rotated.y;
    item.width = rotated.width;
    item.height = rotated.height;
  }

  private updateWave(dt: number): void {
    const wave = this.state.wave;
    if (wave.status === 'preparing') {
      wave.breakRemaining -= dt;
      if (wave.breakRemaining <= 0) wave.status = 'active';
      return;
    }
    if (wave.status === 'active') {
      wave.spawnCooldown -= dt;
      if (wave.pending > 0 && wave.spawnCooldown <= 0) {
        this.state.zombies.push(this.createZombie());
        wave.pending -= 1;
        wave.spawnCooldown = 0.85;
      }
      if (wave.pending === 0 && this.state.zombies.length === 0) {
        wave.status = 'cleared';
        wave.breakRemaining = 3;
      }
      return;
    }
    wave.breakRemaining -= dt;
    if (wave.breakRemaining <= 0) {
      wave.number += 1;
      wave.pending = 3 + wave.number * 2;
      wave.spawnCooldown = 0.4;
      wave.status = 'preparing';
      wave.breakRemaining = 2.5;
    }
  }

  private updateZombies(dt: number): void {
    const player = this.state.player;
    for (const zombie of this.state.zombies) {
      zombie.damageCooldown = Math.max(0, zombie.damageCooldown - dt);
      zombie.pathRefresh -= dt;
      if (zombie.pathRefresh <= 0) {
        zombie.path = this.findPath({ x: zombie.x, y: zombie.y }, { x: player.x, y: player.y });
        zombie.pathRefresh = 0.45;
      }
      const nearbyFurniture = this.state.furniture.find((item) => distanceToRectangle(zombie.x, zombie.y, item) < zombie.radius + 16);
      if (nearbyFurniture) {
        this.damageFurniture(zombie, nearbyFurniture);
        continue;
      }
      const distance = Math.hypot(player.x - zombie.x, player.y - zombie.y);
      if (distance < zombie.radius + player.radius + 10) {
        if (zombie.damageCooldown <= 0) {
          player.health = Math.max(0, player.health - 8);
          zombie.damageCooldown = 0.75;
          if (player.health <= 0) this.state.defeated = true;
        }
        continue;
      }
      const target = zombie.path[0] ?? player;
      const dx = target.x - zombie.x;
      const dy = target.y - zombie.y;
      const length = Math.hypot(dx, dy);
      if (length > 3) this.moveZombie(zombie, (dx / length) * zombie.speed * dt, (dy / length) * zombie.speed * dt);
      if (zombie.path.length > 0 && Math.hypot(target.x - zombie.x, target.y - zombie.y) < 10) zombie.path.shift();
    }
  }

  private damageFurniture(zombie: Zombie, item: Furniture): void {
    if (zombie.damageCooldown > 0) return;
    item.health -= 9;
    zombie.damageCooldown = 0.72;
  }

  private moveZombie(zombie: Zombie, dx: number, dy: number): void {
    const next = { x: zombie.x + dx, y: zombie.y + dy };
    if (this.isCircleStaticBlocked(next.x, next.y, zombie.radius)) return;
    if (this.state.furniture.some((item) => circleOverlapsRectangle(next.x, next.y, zombie.radius, item))) return;
    zombie.x = next.x;
    zombie.y = next.y;
  }

  private createZombie(): Zombie {
    const locations = [
      { x: 96, y: 96 }, { x: WORLD_WIDTH - 96, y: 96 },
      { x: 96, y: WORLD_HEIGHT - 96 }, { x: WORLD_WIDTH - 96, y: WORLD_HEIGHT - 96 },
      { x: 352, y: WORLD_HEIGHT - 160 }, { x: WORLD_WIDTH - 352, y: 160 }
    ].filter((point) => !this.isCircleStaticBlocked(point.x, point.y, 14));
    const point = locations[this.zombieSequence % locations.length] ?? { x: 96, y: 96 };
    this.zombieSequence += 1;
    return {
      id: `z-${this.zombieSequence}`, x: point.x, y: point.y, radius: 14, health: 84,
      speed: 62 + this.state.wave.number * 4, damageCooldown: 0, path: [], pathRefresh: 0
    };
  }

  private removeDestroyed(): void {
    this.state.furniture = this.state.furniture.filter((item) => item.health > 0);
  }

  private isCircleStaticBlocked(x: number, y: number, radius: number): boolean {
    if (x - radius < 0 || y - radius < 0 || x + radius >= WORLD_WIDTH || y + radius >= WORLD_HEIGHT) return true;
    const startColumn = Math.floor((x - radius) / TILE_SIZE);
    const endColumn = Math.floor((x + radius) / TILE_SIZE);
    const startRow = Math.floor((y - radius) / TILE_SIZE);
    const endRow = Math.floor((y + radius) / TILE_SIZE);
    for (let row = startRow; row <= endRow; row += 1) {
      for (let column = startColumn; column <= endColumn; column += 1) {
        if (!isStaticBlocked(column, row)) continue;
        const left = column * TILE_SIZE;
        const top = row * TILE_SIZE;
        if (circleOverlapsRectangle(x, y, radius, { x: left, y: top, width: TILE_SIZE, height: TILE_SIZE })) return true;
      }
    }
    return false;
  }

  private isRectangleStaticBlocked(rectangle: Furniture): boolean {
    if (rectangle.x < 0 || rectangle.y < 0 || rectangle.x + rectangle.width > WORLD_WIDTH || rectangle.y + rectangle.height > WORLD_HEIGHT) return true;
    const startColumn = Math.floor(rectangle.x / TILE_SIZE);
    const endColumn = Math.floor((rectangle.x + rectangle.width - 1) / TILE_SIZE);
    const startRow = Math.floor(rectangle.y / TILE_SIZE);
    const endRow = Math.floor((rectangle.y + rectangle.height - 1) / TILE_SIZE);
    for (let row = startRow; row <= endRow; row += 1) {
      for (let column = startColumn; column <= endColumn; column += 1) if (isStaticBlocked(column, row)) return true;
    }
    return false;
  }

  private findPath(start: Point, destination: Point): Point[] {
    const source = toCell(start);
    const target = toCell(destination);
    const cellKey = (column: number, row: number) => `${column}:${row}`;
    const queue = [source];
    const previous = new Map<string, Point>();
    const visited = new Set([cellKey(source.x, source.y)]);
    const furnitureBlocked = new Set<string>();
    for (const item of this.state.furniture) {
      const left = Math.floor(item.x / TILE_SIZE);
      const right = Math.floor((item.x + item.width - 1) / TILE_SIZE);
      const top = Math.floor(item.y / TILE_SIZE);
      const bottom = Math.floor((item.y + item.height - 1) / TILE_SIZE);
      for (let row = top; row <= bottom; row += 1) for (let column = left; column <= right; column += 1) furnitureBlocked.add(cellKey(column, row));
    }
    let found = false;
    while (queue.length > 0 && visited.size < 900) {
      const cell = queue.shift()!;
      if (cell.x === target.x && cell.y === target.y) { found = true; break; }
      for (const neighbor of [{ x: cell.x + 1, y: cell.y }, { x: cell.x - 1, y: cell.y }, { x: cell.x, y: cell.y + 1 }, { x: cell.x, y: cell.y - 1 }]) {
        const key = cellKey(neighbor.x, neighbor.y);
        if (visited.has(key) || isStaticBlocked(neighbor.x, neighbor.y) || furnitureBlocked.has(key)) continue;
        visited.add(key);
        previous.set(key, cell);
        queue.push(neighbor);
      }
    }
    if (!found) return [];
    const reverse: Point[] = [];
    let current = target;
    while (current.x !== source.x || current.y !== source.y) {
      reverse.push({ x: current.x * TILE_SIZE + TILE_SIZE / 2, y: current.y * TILE_SIZE + TILE_SIZE / 2 });
      current = previous.get(cellKey(current.x, current.y))!;
    }
    return reverse.reverse();
  }
}

function createFurniture(): Furniture[] {
  // Screenshot-calibrated positions; the supplied Tiled map has no object layer.
  const placements: Array<[FurnitureKind, number, number, number, number, number]> = [
    // Upper screenshot: west storage nook, kitchen, bathroom, living room, south room.
    ['crate-small', 640, 562, 41, 41, 1.1],
    ['storage-01', 1720, 344, 60, 60, 1.2],
    ['cabinet-01', 1632, 422, 188, 60, 2.2],
    ['storage-02', 1920, 424, 60, 60, 1.2],
    ['sink-or-cooker-01', 1584, 724, 60, 60, 1.5],
    ['appliance-01', 1536, 812, 64, 37, 1.4],
    ['blue-large', 1607, 1134, 188, 188, 2.8],
    ['green-large', 1154, 1098, 188, 188, 2.4],
    ['sofa-orange', 1140, 1548, 188, 60, 2.2],
    ['storage-03', 1038, 1578, 60, 40, 1.1],
    ['crate-large', 1462, 1710, 62, 62, 1.8],
    // Lower screenshot: entry counter, bedroom, storage nook, living room, kitchen.
    ['counter-wide', 850, 2418, 188, 60, 2.2],
    ['counter-large', 1152, 2560, 188, 188, 3.0],
    ['round-table', 1464, 2496, 60, 60, 1.2],
    ['crate-large', 1920, 2496, 62, 62, 1.8],
    ['crate-small', 2048, 2496, 41, 41, 1.1],
    ['green-large', 480, 2688, 188, 188, 2.4],
    ['chair-green', 728, 2740, 55, 50, 0.9],
    ['cabinet-02', 1160, 2880, 188, 60, 2.0],
    ['round-table', 1344, 2816, 60, 60, 1.2],
    ['appliance-03', 856, 3118, 64, 43, 1.5],
    ['appliance-04', 960, 3120, 64, 43, 1.5],
    ['blue-large', 1472, 3008, 188, 188, 2.8]
  ];
  return placements.map(([kind, x, y, width, height, mass], index) => ({
    id: `f-${index + 1}`, kind, x, y, width, height, health: 100, maxHealth: 100, mass
  }));
}

function toCell(point: Point): Point {
  return {
    x: Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(point.x / TILE_SIZE))),
    y: Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(point.y / TILE_SIZE)))
  };
}

function circleOverlapsRectangle(x: number, y: number, radius: number, rectangle: Pick<Furniture, 'x' | 'y' | 'width' | 'height'>): boolean {
  const closestX = Math.max(rectangle.x, Math.min(x, rectangle.x + rectangle.width));
  const closestY = Math.max(rectangle.y, Math.min(y, rectangle.y + rectangle.height));
  return (x - closestX) ** 2 + (y - closestY) ** 2 < radius ** 2;
}

function distanceToRectangle(x: number, y: number, rectangle: Furniture): number {
  const closestX = Math.max(rectangle.x, Math.min(x, rectangle.x + rectangle.width));
  const closestY = Math.max(rectangle.y, Math.min(y, rectangle.y + rectangle.height));
  return Math.hypot(x - closestX, y - closestY);
}

function rectanglesOverlap(a: Furniture, b: Furniture): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
