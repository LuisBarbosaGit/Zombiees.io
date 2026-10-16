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
        this.send(client, 'error', { code: 'JOIN_TIMEOUT', message: 'Não foi possível entrar. Tente novamente.' });
        client.close(1008, 'join timeout');
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
    const name = typeof body?.displayName === 'string'
      ? Array.from(body.displayName.replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 16).join('')
      : '';
    if (!name) {
      this.send(client, 'error', { code: 'INVALID_NAME', message: 'Informe um nome para jogar.' });
      client.close(1008, 'display name required');
      return;
    }

    let userId: string | null = null;
    if (body.token) {
      if (!this.jwks || !this.issuer) {
        this.send(client, 'error', { code: 'AUTH_UNAVAILABLE', message: 'Login indisponível; tente jogar sem conta.' });
        client.close(1011, 'auth is not configured');
        return;
      }
      try {
        const { payload } = await jwtVerify(body.token, this.jwks, { issuer: `${this.issuer}/auth/v1`, audience: 'authenticated' });
        if (payload.is_anonymous !== true) {
          if (!payload.sub) throw new Error('missing subject');
          userId = payload.sub;
        }
      } catch {
        this.send(client, 'error', { code: 'INVALID_TOKEN', message: 'Sua sessão expirou. Entre novamente ou jogue sem conta.' });
        client.close(1008, 'invalid authentication token');
        return;
      }
    }

    clearTimeout(this.authTimeouts.get(client));
    this.room.join(client, userId, name);
  }

  @SubscribeMessage('input')
  input(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown): void { this.room.submit(client, body); }

  private send(client: WebSocket, event: string, data: unknown): void {
    if (client.readyState === client.OPEN) client.send(JSON.stringify({ event, data }));
  }
}
