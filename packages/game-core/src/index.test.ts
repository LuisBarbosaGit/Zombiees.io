import { describe, expect, it } from 'vitest';
import { assignBalancedTeam, movePlayer, playersTouch, sanitizeInput, type OnlinePlayer } from './index';

describe('shared online simulation core', () => {
  it('starts with a human and balances following players', () => {
    let humans = 0;
    let zombies = 0;
    let tie: 'human' | 'zombie' = 'human';
    const teams = Array.from({ length: 12 }, () => {
      const assignment = assignBalancedTeam(humans, zombies, tie);
      tie = assignment.nextTie;
      if (assignment.team === 'human') humans += 1;
      else zombies += 1;
      return assignment.team;
    });
    expect(teams[0]).toBe('human');
    expect(Math.abs(humans - zombies)).toBeLessThanOrEqual(1);
  });

  it('normalizes movement and rejects invalid sequences', () => {
    const normalized = sanitizeInput({ moveX: 2, moveY: 2, sequence: 4 });
    expect(normalized?.moveX).toBeCloseTo(Math.SQRT1_2);
    expect(normalized?.moveY).toBeCloseTo(Math.SQRT1_2);
    expect(normalized?.sequence).toBe(4);
    expect(sanitizeInput({ moveX: 0, moveY: 0, sequence: -1 })).toBeNull();
  });

  it('moves at the shared speed and stops at authoritative collision boundaries', () => {
    const player: OnlinePlayer = { id: 'p', name: 'P', team: 'human', x: 0, y: 0, facing: { x: 1, y: 0 } };
    movePlayer(player, { moveX: 1, moveY: 0, faceX: 0, faceY: 0, sequence: 1 }, 1 / 30, (x) => x > 5);
    expect(player.x).toBe(0);
    movePlayer(player, { moveX: 1, moveY: 0, faceX: 0, faceY: 0, sequence: 2 }, 1 / 30, () => false);
    expect(player.x).toBeCloseTo(6);
  });

  it('detects contact for infection rules', () => {
    const human: OnlinePlayer = { id: 'h', name: 'H', team: 'human', x: 0, y: 0, facing: { x: 1, y: 0 } };
    const zombie: OnlinePlayer = { id: 'z', name: 'Z', team: 'zombie', x: 35, y: 0, facing: { x: -1, y: 0 } };
    expect(playersTouch(human, zombie)).toBe(true);
    expect(playersTouch(human, { ...zombie, x: 37 })).toBe(false);
  });
});
