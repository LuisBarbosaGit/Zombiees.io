import { describe, expect, it } from 'vitest';
import { Simulation } from './Simulation';
import { isStaticBlocked, TILE_SIZE } from '../maps/townMap';

const idle = { moveX: 0, moveY: 0, interact: false, aim: null };

describe('Simulation', () => {
  it('starts with screenshot-mapped original furniture', () => {
    const simulation = new Simulation('Teste');
    expect(simulation.state.player.name).toBe('Teste');
    expect(simulation.state.furniture).toHaveLength(23);
    expect(simulation.state.furniture.some((item) => item.kind === 'blue-large')).toBe(true);
    expect(simulation.state.wave.status).toBe('preparing');
  });

  it('faces the desktop mouse aim independently of movement input', () => {
    const simulation = new Simulation();
    const { x, y } = simulation.state.player;
    simulation.step({ ...idle, moveX: 1, aim: { x, y: y + 100 } }, 0.05);
    expect(simulation.state.player.facing.x).toBeCloseTo(0);
    expect(simulation.state.player.facing.y).toBeCloseTo(1);
    expect(simulation.state.player.x).toBeGreaterThan(x);
  });

  it('places furniture without overlaps or wall/tree intersections', () => {
    const { furniture, player } = new Simulation().state;
    for (const item of furniture) {
      for (let row = Math.floor(item.y / TILE_SIZE); row <= Math.floor((item.y + item.height - 1) / TILE_SIZE); row += 1) {
        for (let column = Math.floor(item.x / TILE_SIZE); column <= Math.floor((item.x + item.width - 1) / TILE_SIZE); column += 1) {
          expect(isStaticBlocked(column, row), `${item.kind} intersects tile ${column},${row}`).toBe(false);
        }
      }
      expect(item.x + item.width <= player.x - player.radius || item.x >= player.x + player.radius || item.y + item.height <= player.y - player.radius || item.y >= player.y + player.radius).toBe(true);
    }
    for (let index = 0; index < furniture.length; index += 1) {
      for (let other = index + 1; other < furniture.length; other += 1) {
        const a = furniture[index];
        const b = furniture[other];
        expect(a.x + a.width <= b.x || a.x >= b.x + b.width || a.y + a.height <= b.y || a.y >= b.y + b.height).toBe(true);
      }
    }
  });

  it('accelerates to the updated desktop walking speed', () => {
    const simulation = new Simulation();
    for (let index = 0; index < 40; index += 1) simulation.step({ ...idle, moveX: 1 }, 0.05);
    expect(simulation.state.player.velocity.x).toBeCloseTo(180, 0);
  });

  it('starts waves and releases zombies after preparation', () => {
    const simulation = new Simulation();
    for (let index = 0; index < 80; index += 1) simulation.step(idle, 0.05);
    expect(simulation.state.wave.status).toBe('active');
    expect(simulation.state.zombies.length).toBeGreaterThan(0);
  });

  it('does not let the player leave the world', () => {
    const simulation = new Simulation();
    for (let index = 0; index < 700; index += 1) simulation.step({ ...idle, moveX: -1, moveY: -1 }, 0.05);
    expect(simulation.state.player.x).toBeGreaterThanOrEqual(simulation.state.player.radius);
    expect(simulation.state.player.y).toBeGreaterThanOrEqual(simulation.state.player.radius);
  });
});
