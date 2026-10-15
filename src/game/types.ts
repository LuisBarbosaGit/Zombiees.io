export type Point = { x: number; y: number };

export interface Player {
  id: 'player';
  name: string;
  x: number;
  y: number;
  radius: number;
  health: number;
  maxHealth: number;
  facing: Point;
  velocity: Point;
}

export type FurnitureKind =
  | 'sofa-green' | 'sofa-orange' | 'sofa-gray' | 'chair-green' | 'chair-orange' | 'chair-blue'
  | 'stool-wood' | 'round-table' | 'crate-large' | 'crate-small' | 'cabinet-01' | 'cabinet-02'
  | 'cabinet-03' | 'counter-large' | 'counter-wide' | 'appliance-01' | 'appliance-02'
  | 'appliance-03' | 'appliance-04' | 'sink-or-cooker-01' | 'storage-01' | 'storage-02' | 'storage-03'
  | 'blue-large' | 'green-large';

export interface Furniture {
  id: string;
  kind: FurnitureKind;
  x: number;
  y: number;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  mass: number;
}

export interface Zombie {
  id: string;
  x: number;
  y: number;
  radius: number;
  health: number;
  speed: number;
  damageCooldown: number;
  path: Point[];
  pathRefresh: number;
}

export interface Wave {
  number: number;
  pending: number;
  spawnCooldown: number;
  breakRemaining: number;
  status: 'preparing' | 'active' | 'cleared';
}

export interface InputFrame {
  moveX: number;
  moveY: number;
  interact: boolean;
  aim: Point | null;
}

export interface WorldState {
  elapsed: number;
  player: Player;
  zombies: Zombie[];
  furniture: Furniture[];
  wave: Wave;
  defeated: boolean;
}
