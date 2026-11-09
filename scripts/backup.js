import { existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { Store } from '../lib/store.js';
import { exportBackup } from '../lib/backup.js';
const args = process.argv.slice(2);
const arg = name => args[args.indexOf(name) + 1];
if (!args.includes('--out') || !arg('--out')) throw new Error('Usage: node scripts/backup.js --out E:/party.backup.json [--data ./data]');
const database = join(resolve(args.includes('--data') ? arg('--data') : process.env.DATA_DIR || 'data'), 'party.sqlite');
if (!existsSync(database)) throw new Error('Database not found; check --data.');
const target = resolve(arg('--out')); const store = new Store(database);
try {
  mkdirSync(dirname(target), { recursive: true });
  const snapshot = exportBackup(store);
  writeFileSync(target + '.partial', JSON.stringify(snapshot), { flag: 'w' }); renameSync(target + '.partial', target);
  console.log(`Snapshot exported at ${snapshot.exportedAt} to ${target}. Verify it on your backup device.`);
} finally { store.close(); }
