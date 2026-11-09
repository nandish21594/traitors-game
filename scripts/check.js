import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : /\.(m?js)$/.test(e.name) ? [join(dir, e.name)] : []);
const files = ['server.js', ...['lib','public','scripts','tests'].flatMap(walk)];
for (const file of files) { const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }); if (result.status) { process.stderr.write(result.stderr); process.exit(1); } }
console.log(`Syntax checked ${files.length} JavaScript modules.`);
