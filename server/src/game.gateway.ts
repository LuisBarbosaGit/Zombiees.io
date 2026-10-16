import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway
} from '@nestjs/websockets';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { WebSocket } from 'ws';
import { GameRoomService } from './game-room.service';

interface JoinPayload { token?: string; displayName?: string; }

@WebSocketGateway({ path: '/ws/game', maxPayload: 4096 })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly issuer = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  private readonly jwks = this.issuer ? createRemoteJWKSet(new URL(`${this.issuer}/auth/v1/.well-known/jwks.json`)) : null;
  private readonly authTimeouts = new WeakMap<WebSocket, ReturnType<typeof setTimeout>>();

  constructor(private readonly room: GameRoomService) {}

  handleConnection(client: WebSocket): void {
    const timeout = setTimeout(() => {
      if (!this.room.isJoined(client)) {
        this.send(client, 'error', { code: 'AUTH_TIMEOUT', message: 'Entre novamente para jogar.' });
        client.close(1008, 'authentication required');
      }
    }, 5000);
    this.authTimeouts.set(client, timeout);
  }

  handleDisconnect(client: WebSocket): void {
    clearTimeout(this.authTimeouts.get(client));
    this.room.leave(client);
  }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() client: WebSocket, @MessageBody() body: JoinPayload): Promise<void> {
    if (!this.jwks || !this.issuer || !body?.token) {
      this.send(client, 'error', { code: 'AUTH_UNAVAILABLE', message: 'Autenticação online ainda não configurada.' });
      client.close(1011, 'online auth is not configured');
      return;
    }
    try {
      const { payload } = await jwtVerify(body.token, this.jwks, { issuer: `${this.issuer}/auth/v1`, audience: 'authenticated' });
      const userId = payload.sub;
      if (!userId) throw new Error('missing subject');
      clearTimeout(this.authTimeouts.get(client));
      const name = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 16) : '';
      this.room.join(client, userId, name || 'Sobrevivente');
    } catch {
      this.send(client, 'error', { code: 'INVALID_TOKEN', message: 'Sessão expirada; conecte novamente.' });
      client.close(1008, 'invalid authentication token');
    }
  }

  @SubscribeMessage('input')
  input(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown): void { this.room.submit(client, body); }

  private send(client: WebSocket, event: string, data: unknown): void {
    if (client.readyState === client.OPEN) client.send(JSON.stringify({ event, data }));
  }
}
