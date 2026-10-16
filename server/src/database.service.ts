import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true }, max: 5 })
    : null;

  get configured(): boolean { return this.pool !== null; }

  async query<T extends object = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
    if (!this.pool) return [];
    const result = await this.pool.query<T>(sql, values);
    return result.rows;
  }

  async onModuleDestroy(): Promise<void> { await this.pool?.end(); }
}
