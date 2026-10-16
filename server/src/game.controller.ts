import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { GameRoomService } from './game-room.service';
import { WorldMapService } from './world-map.service';

@Controller()
export class GameController {
  constructor(private readonly room: GameRoomService, private readonly maps: WorldMapService) {}

  @Get('health') health(): { status: string } { return { status: 'ok' }; }
  @Get('rooms/main') roomStatus() { return this.room.getStatus(); }
  @Get('maps/current') map(): ReturnType<WorldMapService['getDefinition']> {
    try { return this.maps.getDefinition(); }
    catch { throw new ServiceUnavailableException('O mapa da partida não está disponível.'); }
  }
}
