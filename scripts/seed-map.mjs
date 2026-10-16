import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Defina DATABASE_URL para copiar o mapa local para public.maps.map_data.');
  process.exitCode = 1;
} else {
  const mapPath = resolve(process.env.GAME_MAP_FILE ?? 'public/assets/maps/braains-classic-clean.tmj');
  const mapData = JSON.parse(await readFile(mapPath, 'utf8'));
  const client = new pg.Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true }
  });
  try {
    await client.connect();
    await client.query(
      `update public.maps set map_data = $1::jsonb, updated_at = now()
       where id = 'braains-classic' and version = 1`,
      [JSON.stringify(mapData)]
    );
    console.log(`Mapa ${mapData.width}×${mapData.height} sincronizado em public.maps.`);
  } finally {
    await client.end();
  }
}
