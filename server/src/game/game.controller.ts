import { Controller, Get } from '@nestjs/common';
import { GameRoomService } from './game-room.service';

@Controller('rooms')
export class GameController {
  constructor(private readonly room: GameRoomService) {}

  @Get('main')
  roomStatus() {
    return this.room.getStatus();
  }
}
