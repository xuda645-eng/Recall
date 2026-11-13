import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PostgresDatabase } from '../server/postgres';
import type { PgPool } from '../server/postgres';

export async function postgresFixture() {
  const engine = new PGlite();
  await engine.exec('CREATE TYPE user_profile AS (user_id TEXT); CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;');
  await engine.exec(readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  let tail = Promise.resolve();
  const pool: PgPool = {
    async connect() {
      const previous = tail;
      let unlock: () => void = () => {};
      tail = new Promise<void>(resolve => { unlock = resolve; });
      await previous;
      return {
        async query(sql, values) {
          const result = await engine.query<Record<string, unknown>>(sql, values);
          return { rows: result.rows, fields: result.fields, rowCount: result.affectedRows ?? result.rows.length };
        },
        release() { unlock(); },
      };
    },
  };
  return { engine, pool, database: new PostgresDatabase(pool) };
}
