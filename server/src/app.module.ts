import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { GameController } from './game.controller';
import { GameGateway } from './game.gateway';
import { GameRoomService } from './game-room.service';
import { WorldMapService } from './world-map.service';

@Module({ controllers: [GameController], providers: [DatabaseService, GameGateway, GameRoomService, WorldMapService] })
export class AppModule {}
