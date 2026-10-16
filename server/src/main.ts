import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';

const localEnv = resolve(process.cwd(), '.env');
loadEnv({ path: existsSync(localEnv) ? localEnv : resolve(process.cwd(), '../.env') });

async function bootstrap(): Promise<void> {
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: (process.env.WEB_ORIGIN ?? 'http://127.0.0.1:5173').split(',') });
  app.useWebSocketAdapter(new WsAdapter(app));
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`Zombies.io API listening on :${port}`);
}

void bootstrap();
