import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../lib/store.js';
import { publicState, playerState } from '../lib/game.js';
import { createApp } from '../server.js';

test('transactional identity, public boundary, idempotency and restart', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'traitors-foundation-')), 'party.sqlite');
  let db = new Store(path, 'a-long-test-password');
  const s = db.command({ type: 'demo' }, 'host', 0, 'demo-once');
  assert.equal(s.players.length, 14);
  assert.equal(new Set(s.players.map(p => p.code)).size, 14);
  assert.equal(db.command({ type: 'demo' }, 'host', 0, 'demo-once').revision, 1);
  assert.throws(() => db.command({ type: 'add_player', name: '' }, 'host'), /characters/);
  assert.equal(db.get().revision, 1);
  for (const view of [publicState(s), playerState(s, s.players[0].id)]) {
    const json = JSON.stringify(view);
    assert(!json.includes('"role"')); assert(!json.includes('"code"')); assert(!json.includes('seed'));
  }
  const token = db.session('player', s.players[0].id);
  db.close(); db = new Store(path);
  assert.deepEqual(db.get(), s);
  assert.equal(db.authenticate(token, 'player').player_id, s.players[0].id);
  db.session('player', s.players[0].id);
  assert.throws(() => db.authenticate(token, 'player'), /sign in/);
  db.close();
});

test('HTTP authentication, deliberate session replacement, throttling, private routes', async t => {
  const { server, store } = await createApp({ dataDir: mkdtempSync(join(tmpdir(), 'traitors-http-')), password: 'a-long-test-password' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data, cookie) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Party-Request': '1', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data) });
  assert.equal((await fetch(base + '/api/host/state')).status, 401);
  const login = await post('/api/host/login', { password: 'a-long-test-password' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/host/action', { action: { type: 'demo' } }, cookie)).status, 200);
  const p = store.get().players[0];
  const phone = await post('/api/player/login', { code: p.code });
  const oldCookie = phone.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/player/login', { code: p.code })).status, 409);
  assert.equal((await post('/api/player/login', { code: p.code, takeover: true })).status, 200);
  assert.equal((await fetch(base + '/api/player/state', { headers: { Cookie: oldCookie } })).status, 401);
  for (let i = 0; i < 9; i++) await post('/api/player/login', { code: 'wrong' });
  assert.equal((await post('/api/player/login', { code: p.code, takeover: true })).status, 429);
  assert.equal((await fetch(base + '/lib/store.js')).status, 404);
  assert.equal((await fetch(base + '/api/host/action', { method: 'POST', body: '{}' })).status, 403);
});
