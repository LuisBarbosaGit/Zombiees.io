import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RoomSnapshot } from '@zombies-io/game-core';

type StatusListener = (status: 'connecting' | 'joined' | 'disconnected' | 'error', message?: string) => void;

export class OnlineSession {
  private static supabase?: SupabaseClient;
  private socket?: WebSocket;
  private sequence = 0;
  private joined = false;
  playerId?: string;

  async connect(name: string, onStatus: StatusListener, onSnapshot: (state: RoomSnapshot) => void, onRoundEnd: (winner: string) => void): Promise<void> {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const wsUrl = import.meta.env.VITE_GAME_WS_URL || 'ws://127.0.0.1:3001/ws/game';
    const apiUrl = import.meta.env.VITE_GAME_API_URL || 'http://127.0.0.1:3001/api';
    if (!url || !key) {
      onStatus('error', 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para ativar o modo online.');
      return;
    }
    onStatus('connecting');
    try {
      OnlineSession.supabase ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      let { data: { session } } = await OnlineSession.supabase.auth.getSession();
      if (!session) {
        const { data, error } = await OnlineSession.supabase.auth.signInAnonymously();
        if (error || !data.session) throw error ?? new Error('Não foi possível iniciar como convidado.');
        session = data.session;
      }
      const roomResponse = await fetch(`${apiUrl}/rooms/main`);
      if (!roomResponse.ok) throw new Error('O servidor da partida está indisponível.');
      const room = await roomResponse.json() as { playerCount: number; capacity: number };
      if (room.playerCount >= room.capacity) throw new Error('A sala está cheia. Tente novamente mais tarde.');
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(wsUrl);
        this.socket = socket;
        const timeout = window.setTimeout(() => reject(new Error('Tempo esgotado ao conectar à sala.')), 8000);
        socket.addEventListener('open', () => socket.send(JSON.stringify({ event: 'join', data: { token: session!.access_token, displayName: name } })));
        socket.addEventListener('message', (event) => {
          let packet: { event?: string; data?: unknown };
          try { packet = JSON.parse(String(event.data)) as typeof packet; } catch { return; }
          if (packet.event === 'welcome' || packet.event === 'snapshot') {
            this.joined = true;
            window.clearTimeout(timeout);
            onStatus('joined');
            const snapshot = packet.data as RoomSnapshot;
            if (packet.event === 'welcome') this.playerId = snapshot.ownPlayerId;
            onSnapshot(snapshot);
            resolve();
          } else if (packet.event === 'roundEnd') {
            onRoundEnd((packet.data as { winner: string }).winner);
          } else if (packet.event === 'error') {
            const message = (packet.data as { message?: string }).message ?? 'Falha ao entrar na sala.';
            onStatus('error', message);
            if (!this.joined) { window.clearTimeout(timeout); reject(new Error(message)); }
          }
        });
        socket.addEventListener('error', () => {
          window.clearTimeout(timeout);
          reject(new Error('Falha de rede ao conectar à sala.'));
        }, { once: true });
        socket.addEventListener('close', () => {
          window.clearTimeout(timeout);
          this.joined = false;
          onStatus('disconnected', 'Conexão com a partida encerrada.');
        });
      });
    } catch (error) {
      this.socket?.close();
      this.socket = undefined;
      this.joined = false;
      onStatus('error', error instanceof Error ? error.message : 'Não foi possível conectar.');
    }
  }

  send(input: { moveX: number; moveY: number; faceX: number; faceY: number }): void {
    if (!this.joined || this.socket?.readyState !== WebSocket.OPEN) return;
    this.sequence += 1;
    this.socket.send(JSON.stringify({ event: 'input', data: { ...input, sequence: this.sequence } }));
  }

  close(): void {
    this.joined = false;
    this.socket?.close();
    this.socket = undefined;
  }
}
