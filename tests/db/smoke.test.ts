import { it, expect } from 'vitest';
import { freshDb } from './harness';
it('migrations apply', async () => {
  const db = await freshDb();
  const r = await db.rows(`select count(*)::int n from information_schema.tables where table_schema='public'`);
  expect(r[0].n).toBeGreaterThan(25);
});
