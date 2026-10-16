import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MapsModule } from '../maps/maps.module';
import { GameController } from './game.controller';
import { GameGateway } from './game.gateway';
import { GameRoomService } from './game-room.service';

@Module({
  imports: [DatabaseModule, MapsModule],
  controllers: [GameController],
  providers: [GameGateway, GameRoomService],
})
export class GameModule {}
