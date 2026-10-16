import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { WorldMapService } from './world-map.service';

@Controller('maps')
export class MapsController {
  constructor(private readonly maps: WorldMapService) {}

  @Get('current')
  getCurrentMap(): ReturnType<WorldMapService['getDefinition']> {
    try {
      return this.maps.getDefinition();
    } catch {
      throw new ServiceUnavailableException('O mapa da partida não está disponível.');
    }
  }
}
