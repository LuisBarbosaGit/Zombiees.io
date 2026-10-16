export type Team = 'human' | 'zombie';
export type Point = { x: number; y: number };

export interface OnlinePlayer {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  facing: Point;
}

export interface InputFrame {
  moveX: number;
  moveY: number;
  faceX: number;
  faceY: number;
  sequence: number;
}

export interface RoomSnapshot {
  roomId: 'main';
  mapId: string;
  mapVersion: number;
  tick: number;
  round: number;
  roundRemainingMs: number;
  status: 'waiting' | 'active' | 'intermission';
  capacity: 32;
  players: OnlinePlayer[];
  ownPlayerId?: string;
}

export type TeamAssignment = { team: Team; nextTie: Team };

export function assignBalancedTeam(
  humans: number,
  zombies: number,
  tie: Team = 'human'
): TeamAssignment {
  const team = humans === 0 && zombies === 0
    ? 'human'
    : humans < zombies ? 'human'
      : zombies < humans ? 'zombie' : tie;
  return { team, nextTie: team === 'human' ? 'zombie' : 'human' };
}

export function sanitizeInput(input: unknown): InputFrame | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.moveX !== 'number' || !Number.isFinite(candidate.moveX)) return null;
  if (typeof candidate.moveY !== 'number' || !Number.isFinite(candidate.moveY)) return null;
  if (!Number.isInteger(candidate.sequence) || Number(candidate.sequence) < 0) return null;
  const length = Math.hypot(candidate.moveX, candidate.moveY);
  const scale = length > 1 ? 1 / length : 1;
  return {
    moveX: candidate.moveX * scale,
    moveY: candidate.moveY * scale,
    faceX: typeof candidate.faceX === 'number' && Number.isFinite(candidate.faceX) ? candidate.faceX : 0,
    faceY: typeof candidate.faceY === 'number' && Number.isFinite(candidate.faceY) ? candidate.faceY : 0,
    sequence: Number(candidate.sequence)
  };
}

export function movePlayer(
  player: OnlinePlayer,
  input: InputFrame,
  elapsedSeconds: number,
  isBlocked: (x: number, y: number) => boolean
): void {
  const dt = Math.min(Math.max(elapsedSeconds, 0), 1 / 20);
  const distance = Math.hypot(input.moveX, input.moveY);
  if (distance > 0.001) player.facing = { x: input.moveX / distance, y: input.moveY / distance };
  const faceLength = Math.hypot(input.faceX, input.faceY);
  if (faceLength > 0.001) player.facing = { x: input.faceX / faceLength, y: input.faceY / faceLength };
  const speed = 180;
  const tryAxis = (dx: number, dy: number): void => {
    const x = player.x + dx;
    const y = player.y + dy;
    if (!isBlocked(x, y)) {
      player.x = x;
      player.y = y;
    }
  };
  const xSpeed = input.moveX * speed * dt;
  const ySpeed = input.moveY * speed * dt;
  tryAxis(xSpeed, 0);
  tryAxis(0, ySpeed);
}

export function playersTouch(a: OnlinePlayer, b: OnlinePlayer, radius = 18): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= radius * 2;
}
