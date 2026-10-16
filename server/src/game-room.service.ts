import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Team } from '@zombies-io/game-core';
import { assignBalancedTeam, movePlayer, playersTouch, sanitizeInput, type InputFrame, type OnlinePlayer, type RoomSnapshot } from '@zombies-io/game-core';
import type { WebSocket } from 'ws';
import { DatabaseService } from './database.service';
import { WorldMapService } from './world-map.service';

const CAPACITY = 32;
const TICK_MS = 1000 / 30;
const SNAPSHOT_MS = 50;
const ROUND_MS = 5 * 60 * 1000;
const INTERMISSION_MS = 5000;

interface ConnectedPlayer {
  userId: string | null;
  socket: WebSocket;
  state: OnlinePlayer;
  input: InputFrame;
  lastSequence: number;
  joinedAt: number;
  lastInputAt: number;
  profileReady: Promise<void>;
}

@Injectable()
export class GameRoomService implements OnModuleDestroy {
  private readonly players = new Map<WebSocket, ConnectedPlayer>();
  private timer: ReturnType<typeof setInterval>;
  private lastTick = Date.now();
  private lastBroadcast = 0;
  private nextTie: Team = 'human';
  private tickNumber = 0;
  private round = 0;
  private roundStartedAt = 0;
  private intermissionUntil = 0;
  private status: RoomSnapshot['status'] = 'waiting';

  constructor(private readonly maps: WorldMapService, private readonly database: DatabaseService) {
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  getStatus() {
    return { id: 'main', mapId: this.maps.id, playerCount: this.players.size, capacity: CAPACITY, status: this.status, round: this.round };
  }

  isJoined(socket: WebSocket): boolean { return this.players.has(socket); }

  join(socket: WebSocket, userId: string | null, name: string): void {
    if (this.players.size >= CAPACITY) {
      this.send(socket, 'error', { code: 'ROOM_FULL', message: 'A sala está cheia. Tente novamente mais tarde.' });
      socket.close(1008, 'room full');
      return;
    }
    if (userId && [...this.players.values()].some((player) => player.userId === userId)) {
      this.send(socket, 'error', { code: 'ALREADY_CONNECTED', message: 'Esta conta já está na sala.' });
      socket.close(1008, 'already connected');
      return;
    }
    const assignment = assignBalancedTeam(this.countTeam('human'), this.countTeam('zombie'), this.nextTie);
    this.nextTie = assignment.nextTie;
    const occupied = [...this.players.values()].map(({ state }) => ({ x: state.x, y: state.y }));
    const spawn = this.maps.findSpawn(this.players.size, occupied);
    const player: ConnectedPlayer = {
      userId, socket,
      state: { id: randomUUID(), name, team: assignment.team, ...spawn, facing: { x: 1, y: 0 } },
      input: { moveX: 0, moveY: 0, faceX: 0, faceY: 0, sequence: 0 }, lastSequence: -1, joinedAt: Date.now(), lastInputAt: 0,
      profileReady: Promise.resolve()
    };
    this.players.set(socket, player);
    if (userId) {
      player.profileReady = this.database.query(
        `insert into public.profiles(user_id, display_name) values($1, $2)
         on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now()`, [userId, name]
      ).then(() => undefined).catch((error: unknown) => { console.error('profile persistence failed', error); });
      void player.profileReady.then(() => this.database.query(
        `insert into public.session_players(session_id, user_id, display_name, team)
         select id, $1, $2, $3 from public.game_sessions
         where room_id = 'main' and status = 'active' order by started_at desc limit 1
         on conflict (session_id, user_id) do nothing`, [userId, name, assignment.team]
      )).catch((error: unknown) => console.error('participant persistence failed', error));
    }
    if (this.status === 'waiting' && this.players.size >= 2) this.beginRound();
    this.send(socket, 'welcome', { ...this.snapshot(), ownPlayerId: player.state.id });
    this.broadcast('snapshot', this.snapshot());
  }

  submit(socket: WebSocket, payload: unknown): void {
    const player = this.players.get(socket);
    if (!player || Date.now() - player.lastInputAt < 20) return;
    const frame = sanitizeInput(payload);
    if (!frame || frame.sequence <= player.lastSequence) return;
    const raw = payload as Record<string, unknown>;
    if (typeof raw.faceX === 'number' && Number.isFinite(raw.faceX) && typeof raw.faceY === 'number' && Number.isFinite(raw.faceY)) {
      const length = Math.hypot(raw.faceX, raw.faceY);
      if (length > 0.001) player.state.facing = { x: raw.faceX / length, y: raw.faceY / length };
    }
    player.input = frame;
    player.lastSequence = frame.sequence;
    player.lastInputAt = Date.now();
  }

  leave(socket: WebSocket): void {
    const player = this.players.get(socket);
    if (!player) return;
    this.players.delete(socket);
    if (player.userId) void this.database.query(
      `update public.session_players set left_at = now() where user_id = $1 and left_at is null`, [player.userId]
    ).catch((error: unknown) => console.error('session leave persistence failed', error));
    if (this.players.size === 0) {
      this.cancelActiveRound();
      this.resetRoom();
    }
    else if (this.status === 'active' && this.players.size < 2) {
      this.cancelActiveRound();
      this.status = 'waiting';
      this.broadcast('snapshot', this.snapshot());
    }
    else if (this.status === 'active' && this.countTeam('human') === 0) this.finishRound('zombie');
    else if (this.status === 'active' && this.countTeam('zombie') === 0) this.finishRound('human');
    else this.broadcast('snapshot', this.snapshot());
  }

  private tick(): void {
    const now = Date.now();
    const dt = Math.min((now - this.lastTick) / 1000, 1 / 20);
    this.lastTick = now;
    this.tickNumber += 1;
    if (this.status === 'active') {
      for (const player of this.players.values()) {
        if (!player.lastInputAt || now - player.lastInputAt > 250) {
          player.input = { ...player.input, moveX: 0, moveY: 0 };
        }
        movePlayer(player.state, player.input, dt, (x, y) => this.maps.isBlocked(x, y));
      }
      this.infectTouchingHumans();
      if (this.countTeam('human') === 0) this.finishRound('zombie');
      else if (now - this.roundStartedAt >= ROUND_MS) this.finishRound('human');
    } else if (this.status === 'intermission' && now >= this.intermissionUntil) {
      if (this.players.size >= 2) this.beginRound();
      else this.status = 'waiting';
    }
    if (now - this.lastBroadcast >= SNAPSHOT_MS) {
      this.lastBroadcast = now;
      this.broadcast('snapshot', this.snapshot());
    }
  }

  private infectTouchingHumans(): void {
    const zombies = [...this.players.values()].filter(({ state }) => state.team === 'zombie');
    for (const human of this.players.values()) {
      if (human.state.team === 'human' && zombies.some(({ state }) => playersTouch(human.state, state))) {
        human.state.team = 'zombie';
        if (human.userId) void this.database.query(
          `update public.session_players set team = 'zombie', infected_at = now()
           where user_id = $1 and left_at is null`, [human.userId]
        ).catch((error: unknown) => console.error('infection persistence failed', error));
      }
    }
  }

  private beginRound(): void {
    this.round += 1;
    this.status = 'active';
    this.roundStartedAt = Date.now();
    const ordered = [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    let humans = 0;
    let zombies = 0;
    let tie: Team = 'human';
    const usedSpawns: Array<{ x: number; y: number }> = [];
    ordered.forEach((player, index) => {
      const assignment = assignBalancedTeam(humans, zombies, tie);
      player.state.team = assignment.team;
      tie = assignment.nextTie;
      if (assignment.team === 'human') humans += 1;
      else zombies += 1;
      const location = this.maps.findSpawn(index, usedSpawns);
      usedSpawns.push(location);
      player.state.x = location.x;
      player.state.y = location.y;
      player.input = { moveX: 0, moveY: 0, faceX: 0, faceY: 0, sequence: player.lastSequence };
    });
    this.nextTie = tie;
    void this.persistRound();
  }

  private finishRound(winner: Team): void {
    if (this.status !== 'active') return;
    this.status = 'intermission';
    this.intermissionUntil = Date.now() + INTERMISSION_MS;
    void this.database.query(
      `update public.game_sessions set status = 'finished', winner = $1, ended_at = now()
       where room_id = 'main' and status = 'active'`, [winner]
    ).catch((error: unknown) => console.error('round result persistence failed', error));
    void this.database.query(
      `update public.session_players set left_at = coalesce(left_at, now())
       where session_id = (select id from public.game_sessions where room_id = 'main' order by started_at desc limit 1)`
    ).catch((error: unknown) => console.error('participant result persistence failed', error));
    this.broadcast('roundEnd', { winner, nextRoundInMs: INTERMISSION_MS });
  }

  private cancelActiveRound(): void {
    if (this.status !== 'active') return;
    void this.database.query(
      `update public.game_sessions set status = 'cancelled', ended_at = now()
       where room_id = 'main' and status = 'active'`
    ).catch((error: unknown) => console.error('round cancellation persistence failed', error));
    void this.database.query(
      `update public.session_players set left_at = coalesce(left_at, now())
       where session_id = (select id from public.game_sessions where room_id = 'main' order by started_at desc limit 1)`
    ).catch((error: unknown) => console.error('participant cancellation persistence failed', error));
  }

  private async persistRound(): Promise<void> {
    if (!this.database.configured) return;
    try {
      const rows = await this.database.query<{ id: string }>(
        `insert into public.game_sessions(room_id, map_id, round_number, status, started_at)
         values('main', $1, $2, 'active', now()) returning id`, [this.maps.id, this.round]
      );
      const sessionId = rows[0]?.id;
      if (sessionId) for (const player of this.players.values()) {
        if (!player.userId) continue;
        await player.profileReady;
        await this.database.query(
          `insert into public.session_players(session_id, user_id, display_name, team)
           values($1, $2, $3, $4) on conflict do nothing`, [sessionId, player.userId, player.state.name, player.state.team]
        );
      }
    } catch (error) { console.error('round persistence failed', error); }
  }

  private snapshot(): RoomSnapshot {
    return {
      roomId: 'main', mapId: this.maps.id, mapVersion: this.maps.version, tick: this.tickNumber,
      round: this.round, roundRemainingMs: this.status === 'active' ? Math.max(0, ROUND_MS - (Date.now() - this.roundStartedAt)) : 0,
      status: this.status, capacity: CAPACITY,
      players: [...this.players.values()].map(({ state }) => ({ ...state, facing: { ...state.facing } }))
    };
  }

  private countTeam(team: Team): number { return [...this.players.values()].filter(({ state }) => state.team === team).length; }
  private broadcast(event: string, data: unknown): void { for (const { socket } of this.players.values()) this.send(socket, event, data); }
  private send(socket: WebSocket, event: string, data: unknown): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ event, data }));
  }
  private resetRoom(): void { this.status = 'waiting'; this.round = 0; this.nextTie = 'human'; this.intermissionUntil = 0; }
  onModuleDestroy(): void { clearInterval(this.timer); }
}

