import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Store, hashPassword } from '../lib/store.js';
const password = process.env.NEW_HOST_PASSWORD;
if (!password || password.length < 12 || password.length > 256) throw new Error('Set NEW_HOST_PASSWORD to a new password of 12–256 characters.');
const path = join(resolve(process.env.DATA_DIR || 'data'), 'party.sqlite');
if (!existsSync(path)) throw new Error('Database not found; check DATA_DIR.');
const store = new Store(path);
try {
  store.db.exec('BEGIN IMMEDIATE');
  const before = store.get(); const after = structuredClone(before); after.revision++;
  store.db.prepare("UPDATE settings SET value=? WHERE key='password'").run(hashPassword(password));
  store.db.prepare("DELETE FROM sessions WHERE kind='host'").run();
  store.write(before, after, 'local-terminal', 'password_reset', { reason: 'Local host password recovery; previous host sessions revoked' });
  store.db.exec('COMMIT'); console.log('Host password replaced. Previous host sessions are revoked.');
} catch (e) { store.db.exec('ROLLBACK'); throw e; } finally { store.close(); }
