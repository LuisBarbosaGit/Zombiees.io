import { Module } from '@nestjs/common';
import { GameModule } from './game/game.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [HealthModule, GameModule],
})
export class AppModule {}
