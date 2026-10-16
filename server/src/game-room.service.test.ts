import { afterEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { GameRoomService } from './game-room.service';
import { WorldMapService } from './world-map.service';

const services: GameRoomService[] = [];

function makeSocket(): WebSocket & { packets: Array<{ event: string; data: any }> } {
  return {
    OPEN: 1,
    readyState: 1,
    packets: [],
    send(data: string) { this.packets.push(JSON.parse(data)); },
    close() { this.readyState = 3; }
  } as unknown as WebSocket & { packets: Array<{ event: string; data: any }> };
}

function createRoom(): GameRoomService {
  const database = { configured: false, query: async () => [] } as never;
  const room = new GameRoomService(new WorldMapService(), database);
  services.push(room);
  return room;
}

afterEach(() => {
  for (const service of services.splice(0)) service.onModuleDestroy();
});

describe('authoritative public room', () => {
  it('starts the round with a human and a balanced zombie team on distinct map spawns', () => {
    const room = createRoom();
    const human = makeSocket();
    const zombie = makeSocket();
    room.join(human, 'user-1', 'Humana');
    expect(room.getStatus()).toMatchObject({ playerCount: 1, status: 'waiting' });
    room.join(zombie, 'user-2', 'Zumbi');

    const snapshot = zombie.packets.find((packet) => packet.event === 'welcome')?.data;
    expect(room.getStatus()).toMatchObject({ playerCount: 2, status: 'active', round: 1 });
    expect(snapshot.players.map((player: { team: string }) => player.team).sort()).toEqual(['human', 'zombie']);
    expect(snapshot.players[0]).not.toMatchObject({ x: snapshot.players[1].x, y: snapshot.players[1].y });
  });

  it('allows a name-only guest into the room without saving profile or participation data', () => {
    const writes: string[] = [];
    const database = {
      configured: true,
      query: async (sql: string) => { writes.push(sql); return []; }
    } as never;
    const room = new GameRoomService(new WorldMapService(), database);
    services.push(room);
    const guest = makeSocket();

    room.join(guest, null, 'Visitante');
    expect(guest.packets.some((packet) => packet.event === 'welcome')).toBe(true);
    room.leave(guest);

    expect(writes).toEqual([]);
  });

  it('returns to waiting when a round loses its second connected player', () => {
    const room = createRoom();
    const first = makeSocket();
    const second = makeSocket();
    room.join(first, 'user-1', 'A');
    room.join(second, 'user-2', 'B');
    room.leave(second);
    expect(room.getStatus()).toMatchObject({ playerCount: 1, status: 'waiting' });
  });
});

