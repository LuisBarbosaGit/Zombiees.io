import { Module } from '@nestjs/common';
import { MapsController } from './maps.controller';
import { WorldMapService } from './world-map.service';

@Module({
  controllers: [MapsController],
  providers: [WorldMapService],
  exports: [WorldMapService],
})
export class MapsModule {}
