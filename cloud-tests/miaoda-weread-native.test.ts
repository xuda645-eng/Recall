import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createWereadRepository } from '../../Recall-miaoda-migration/server/modules/weread/weread.repository';
import type { WereadRepository } from '../server/weread';

const { drizzle } = createRequire(new URL('../../Recall-miaoda-migration/package.json', import.meta.url))('drizzle-orm/pg-proxy');

async function fixture() {
  const database = new PGlite();
  await database.exec('CREATE TYPE user_profile AS (user_id text); CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;');
  await database.exec(await readFile(new URL('../../Recall-miaoda-migration/server/database/recall-weread-create.sql', import.meta.url), 'utf8'));
  await database.exec(`INSERT INTO recall_weread_connections (owner_id, credential_name) VALUES ('123', 'personal'), ('456', 'personal');
    GRANT SELECT, INSERT, UPDATE ON recall_weread_connections, recall_weread_usage, recall_weread_cache TO authenticated;
    SET ROLE authenticated; SET app.user_id = '123';`);
  const repository: WereadRepository = Reflect.apply(createWereadRepository, undefined, [drizzle(async (query: string, parameters: unknown[]) => {
    const result = await database.query<Record<string, unknown>>(query, parameters);
    return { rows: result.rows.map(row => Object.values(row)) };
  })]);
  return { database, repository };
}
describe('native WeRead repository SQL and owner policies', { timeout: 15000 }, () => {
  it('keeps resource ownership and cache visibility isolated by current platform user', async () => {
    const { database, repository } = await fixture();
    try {
      expect(await repository.connected('123')).toBe(true);
      expect(await repository.connected('456')).toBe(false);
      await expect(database.exec("INSERT INTO recall_weread_connections (owner_id, credential_name) VALUES ('789', 'personal')")).rejects.toThrow();
      await expect(database.exec("UPDATE recall_weread_connections SET credential_name = 'personal' WHERE owner_id = '123' RETURNING owner_id")).resolves.toMatchObject([{ rows: [] }]);
      await repository.cache('123', 'a'.repeat(64), 'synthetic-cache', 1000);
      expect(await repository.cached('123', 'a'.repeat(64), 999)).toBe('synthetic-cache');
      expect(await repository.cached('123', 'a'.repeat(64), 1000)).toBeNull();
      expect(await repository.cached('456', 'a'.repeat(64), 999)).toBeNull();
      await expect(repository.cache('456', 'b'.repeat(64), 'not-allowed', 1000)).rejects.toThrow();
      await database.exec("SET app.user_id = '456';");
      expect(await repository.connected('456')).toBe(true);
      expect(await repository.cached('123', 'a'.repeat(64), 999)).toBeNull();
    } finally { await database.close(); }
  });
  it('atomically caps conflicting inserts/updates and preserves the exact counter across requests', async () => {
    const { database, repository } = await fixture();
    try {
      const results = await Promise.all(Array.from({ length: 30 }, () => repository.take('123', 'synthetic-limit', 0, 10)));
      expect(results.filter(Boolean)).toHaveLength(10);
      expect(await repository.attempts('123', 'synthetic-limit', 0)).toBe(10);
      expect(await repository.take('123', 'synthetic-limit', 0, 10)).toBe(false);
      expect(await repository.take('123', 'synthetic-limit', 1, 10)).toBe(true);
      expect(await repository.attempts('123', 'synthetic-limit', 0)).toBe(10);
      const audit = await database.query<{ owner: string }>('SELECT (_created_by).user_id AS owner FROM recall_weread_usage WHERE window_start = 0');
      expect(audit.rows).toEqual([{ owner: '123' }]);
    } finally { await database.close(); }
  });
});
