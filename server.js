import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { Store, verifyPassword, digest } from './lib/store.js';
import { publicState, playerState, resolveMurder, shieldCandidates } from './lib/game.js';
import { GameError, requireThat } from './lib/errors.js';
import { randomUUID } from 'node:crypto';
import { inspectMedia } from './lib/media.js';
import { exportBackup, importBackup } from './lib/backup.js';

const root = fileURLToPath(new URL('.', import.meta.url));
function joinAddress(req) {
  if (process.env.JOIN_URL) return process.env.JOIN_URL;
  const host = req.headers.host || 'localhost:3000';
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
    const addresses = Object.values(networkInterfaces()).flat().filter(n => n?.family === 'IPv4' && !n.internal);
    const net = addresses.find(n => /^192\.168\./.test(n.address)) || addresses.find(n => /^(10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address));
    if (net) { const port = new URL(`http://${host}`).port; return `http://${net.address}${port ? ':' + port : ''}/join`; }
  }
  return `http://${host}/join`;
}
export async function createApp({ dataDir = process.env.DATA_DIR || join(root, 'data'), password = process.env.HOST_PASSWORD } = {}) {
  const store = new Store(join(dataDir, 'party.sqlite'), password);
  const json = (res, value, status = 200, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(value)); };
  const cookie = (req, name) => (req.headers.cookie || '').split(';').map(x => x.trim().split('=')).find(x => x[0] === name)?.[1];
  const auth = (req, kind) => store.authenticate(cookie(req, `dt_${kind}`), kind);
  const setCookie = (kind, token) => `dt_${kind}=${token}; HttpOnly; SameSite=Strict; Path=/api/${kind}; Max-Age=64800${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`;
  async function body(req) {
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; requireThat(size <= 64 * 1024 * 1024, 'Upload too large.', 413); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw new GameError('Invalid JSON.'); }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; font-src 'self' data: blob:; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'");
    try {
      const url = new URL(req.url, 'http://local');
      const path = url.pathname;
      if (req.method === 'POST') {
        requireThat(req.headers['x-party-request'] === '1', 'Missing request header.', 403);
        if (req.headers.origin) requireThat(new URL(req.headers.origin).host === req.headers.host, 'Cross-origin requests are refused.', 403);
      }
      if (req.method === 'GET' && path === '/api/public') return json(res, { ...publicState(store.get()), joinUrl: joinAddress(req) });
      if (req.method === 'GET' && path === '/api/host/state') {
        auth(req, 'host');
        const connections = store.db.prepare("SELECT player_id,last_seen FROM sessions WHERE kind='player'").all();
        const s = store.get();
        return json(res, { ...s, connections, audit: store.audit(), shieldCandidates: shieldCandidates(s), murderPreview: s.phase === 'murder_preview' ? resolveMurder(s) : null, joinUrl: joinAddress(req) });
      }
      if (req.method === 'GET' && path === '/api/player/state') return json(res, playerState(store.get(), auth(req, 'player').player_id));
      if (req.method === 'POST' && path === '/api/host/login') {
        store.throttle(`host:${req.socket.remoteAddress}`, false);
        const b = await body(req); requireThat(typeof b.password === 'string' && b.password.length <= 256, 'Invalid password.');
        if (!verifyPassword(b.password, store.db.prepare("SELECT value FROM settings WHERE key='password'").get().value)) {
          store.throttle(`host:${req.socket.remoteAddress}`); throw new GameError('Invalid password.', 401);
        }
        return json(res, { ok: true }, 200, { 'Set-Cookie': setCookie('host', store.session('host')) });
      }
      if (req.method === 'POST' && path === '/api/player/login') {
        store.throttle(`player:${req.socket.remoteAddress}`, false);
        const b = await body(req);
        const p = store.get().players.find(p => typeof b.code === 'string' && /^\d{6}$/.test(b.code) && p.code === b.code);
        if (!p) { store.throttle(`player:${req.socket.remoteAddress}`); throw new GameError('Code not recognized. Ask your host.', 401); }
        const existing = store.db.prepare("SELECT 1 FROM sessions WHERE player_id=? AND expires>?").get(p.id, Date.now());
        requireThat(!existing || b.takeover === true, 'This player has a current phone session. Confirm replacement to continue.', 409);
        return json(res, { ok: true }, 200, { 'Set-Cookie': setCookie('player', store.session('player', p.id)) });
      }
      if (req.method === 'POST' && /^\/api\/(host|player)\/logout$/.test(path)) {
        const kind = path.split('/')[2]; auth(req, kind);
        store.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(cookie(req, `dt_${kind}`)));
        return json(res, { ok: true }, 200, { 'Set-Cookie': `dt_${kind}=; HttpOnly; SameSite=Strict; Path=/api/${kind}; Max-Age=0` });
      }
      if (req.method === 'POST' && path === '/api/host/action') {
        auth(req, 'host'); const b = await body(req);
        requireThat(b.action && typeof b.action.type === 'string', 'Action is required.');
        requireThat(b.action.type !== 'photo', 'Use the upload endpoint.');
        const s = store.command(b.action, 'host', b.revision, b.requestId);
        return json(res, { revision: s.revision });
      }
      if (req.method === 'POST' && path === '/api/player/vote') {
        const session = auth(req, 'player'); const b = await body(req);
        const s = store.command({ type: 'vote', playerId: session.player_id, ballotId: b.ballotId, value: b.value }, `player:${session.player_id}`, undefined, b.requestId);
        return json(res, { revision: s.revision });
      }
      if (req.method === 'GET' && path === '/api/host/backup') {
        auth(req, 'host');
        return json(res, exportBackup(store), 200, { 'Content-Disposition': `attachment; filename="traitors-game-${new Date().toISOString().slice(0, 10)}.backup.json"` });
      }
      if (req.method === 'POST' && path === '/api/host/restore') {
        auth(req, 'host'); const b = await body(req); requireThat(b.confirm === true, 'Confirm replacing the current game.');
        const s = importBackup(store, b.backup, b.reason); return json(res, { revision: s.revision });
      }
      if (req.method === 'POST' && path === '/api/host/undo') {
        auth(req, 'host'); const b = await body(req); const s = store.undo(b.reason); return json(res, { revision: s.revision });
      }
      if (req.method === 'POST' && /^\/api\/(host|player)\/upload$/.test(path)) {
        const kind = path.split('/')[2]; const session = auth(req, kind); const b = await body(req);
        requireThat(typeof b.data === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(b.data) && typeof b.name === 'string' && b.name.length <= 100, 'Invalid upload.');
        const data = Buffer.from(b.data, 'base64'); inspectMedia(data, b.mime, kind === 'player');
        const sum = store.db.prepare('SELECT COALESCE(SUM(length(data)),0) AS bytes FROM media').get().bytes;
        requireThat(sum + data.length <= 32 * 1024 * 1024, 'Media storage limit is 32 MB. Use compressed photos/slides.');
        const id = randomUUID();
        store.db.exec('BEGIN IMMEDIATE');
        try {
          const before = store.get(); const after = structuredClone(before);
          const action = kind === 'player' ? { type: 'photo', playerId: session.player_id, assetId: id } : { type: 'presentation_asset', assetId: id };
          store.reducer(after, action); after.revision++;
          store.db.prepare('INSERT INTO media VALUES(?,?,?,?)').run(id, b.mime, b.name, data);
          store.write(before, after, kind === 'player' ? `player:${session.player_id}` : 'host', action.type, action);
          store.db.exec('COMMIT'); return json(res, { id, revision: after.revision });
        } catch (e) { store.db.exec('ROLLBACK'); throw e; }
      }
      if (req.method === 'GET' && /^\/media\/[0-9a-f-]{36}$/.test(path)) {
        const asset = store.db.prepare('SELECT * FROM media WHERE id=?').get(path.slice(7));
        requireThat(asset, 'Not found.', 404);
        // Files become public only when linked as a portrait or a presentation asset.
        const s = store.get(); requireThat(s.players.some(p => p.photo === asset.id) || s.presentation.assets.includes(asset.id), 'Not found.', 404);
        res.writeHead(200, { 'Content-Type': asset.mime, 'Content-Length': asset.data.length, 'Content-Disposition': 'inline' }); return res.end(Buffer.from(asset.data));
      }
      if (req.method === 'GET' && path === '/api/media') {
        const s = store.get(); const ids = new Set(s.presentation.assets);
        return json(res, store.db.prepare('SELECT id,mime,name FROM media').all().filter(a => ids.has(a.id)));
      }
      if (path.startsWith('/api/')) throw new GameError('Not found.', 404);
      if (req.method !== 'GET') throw new GameError('Not found.', 404);
      const pages = { '/': 'index.html', '/host': 'host.html', '/join': 'join.html', '/projector': 'projector.html' };
      const asset = pages[path] || path.slice(1);
      requireThat(/^[a-zA-Z0-9_./-]+$/.test(asset) && !asset.split('/').includes('..'), 'Not found.', 404);
      const file = resolve(root, 'public', asset);
      requireThat(file.startsWith(resolve(root, 'public') + '\\') || file.startsWith(resolve(root, 'public') + '/'), 'Not found.', 404);
      const data = await readFile(file).catch(() => { throw new GameError('Not found.', 404); });
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.wasm': 'application/wasm' }[extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` }); res.end(data);
    } catch (e) {
      if (!(e instanceof GameError)) console.error(e);
      if (!res.headersSent) json(res, { error: e instanceof GameError ? e.message : 'Server error. State was not changed.' }, e.status || 500);
      else res.end();
    }
  });
  return { server, store };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, store } = await createApp();
  const port = Number(process.env.PORT || 3000);
  server.listen(port, process.env.BIND_ADDRESS || '0.0.0.0', () => {
    const listeningPort = server.address().port;
    console.log(`Traitors\nLocal: http://localhost:${listeningPort}\nHost: http://localhost:${listeningPort}/host\nProjector: http://localhost:${listeningPort}/projector`);
    for (const nets of Object.values(networkInterfaces())) for (const net of nets || []) if (net.family === 'IPv4' && !net.internal) console.log(`LAN join: http://${net.address}:${listeningPort}/join`);
    if (store.initialPassword) console.log(`FIRST-RUN HOST PASSWORD (save privately): ${store.initialPassword}`);
  });
  const stop = () => server.close(() => { store.close(); process.exit(0); });
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
