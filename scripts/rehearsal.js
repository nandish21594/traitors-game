import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixturePng, fixturePdf } from './fixtures.js';

const output = resolve('test-output', 'rehearsal', new Date().toISOString().replaceAll(':','-').replaceAll('.','-'));
mkdirSync(output, { recursive: true });
const checks = []; const children = new Set(); const phones = new Map(); let hostCookie, base;
function check(description) { checks.push(description); console.log(`PASS ${description}`); }
async function launch(dir) {
  const child = spawn(process.execPath, ['server.js'], { cwd: resolve('.'), env: { ...process.env, PORT: '0', BIND_ADDRESS: '127.0.0.1', DATA_DIR: dir, HOST_PASSWORD: 'rehearsal-private-password' }, stdio: ['ignore','pipe','pipe'], windowsHide: true });
  children.add(child); child.once('exit', () => children.delete(child));
  let text = ''; let errors = '';
  child.stderr.on('data', data => { errors += data; });
  const url = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${errors}`)), 12000);
    child.stdout.on('data', data => { text += data; const match = /Local: http:\/\/localhost:(\d+)/.exec(text); if (match) { clearTimeout(timeout); resolveUrl(`http://127.0.0.1:${match[1]}`); } });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${errors}`)); });
  });
  return { child, url };
}
async function stop(child) { if (child.exitCode !== null) return; await new Promise(resolveStop => { child.once('exit', resolveStop); child.kill('SIGKILL'); }); }
async function request(path, value, cookie, expected = 200) {
  const response = await fetch(base + path, { ...(value !== undefined ? { method: 'POST', body: JSON.stringify(value) } : {}), headers: { 'Content-Type': 'application/json', 'X-Party-Request': '1', ...(cookie ? { Cookie: cookie } : {}) } });
  const body = await response.json(); assert.equal(response.status, expected, `${path}: ${JSON.stringify(body)}`); return { body, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const getState = async () => (await request('/api/host/state', undefined, hostCookie)).body;
const publicView = async () => (await request('/api/public')).body;
async function host(action) { const s = await getState(); await request('/api/host/action', { action, revision: s.revision, requestId: randomUUID() }, hostCookie); return getState(); }
async function loginHost() { hostCookie = (await request('/api/host/login', { password: 'rehearsal-private-password' })).cookie; }
async function loginPhones(s) { for (const p of s.players) phones.set(p.id, (await request('/api/player/login', { code: p.code, takeover: true })).cookie); }
async function allVote(value) {
  const s = await getState(); const b = s.ballots.find(b => b.id === s.currentBallotId);
  await Promise.all(b.electorate.filter(id => !Object.hasOwn(b.votes,id)).map(id => request('/api/player/vote', { ballotId: b.id, value: typeof value === 'function' ? value(id, s) : value, requestId: randomUUID() }, phones.get(id))));
  return getState();
}
async function banish(target) {
  const s = await getState(); const other = s.players.find(p => p.status === 'active' && p.id !== target).id;
  await allVote(id => id === target ? other : target); await host({ type: 'close_ballot' });
  const b = (await getState()).ballots.at(-1);
  for (let i = 0; i < b.electorate.length; i++) { await host({ type: 'reveal_next' }); assert.equal((await publicView()).reveal.length, i + 1); }
  await host({ type: 'next' });
}
async function assertPrivacy() {
  const s = await getState(); const view = await publicView(); const text = JSON.stringify(view);
  for (const p of s.players) assert(!text.includes(p.code), 'Public code leakage');
  for (const key of ['seed','votes','murderOverride','recruitmentEligible','recruitmentUsed','audit','connections','code','role']) assert(!Object.hasOwn(view,key), `Public ${key} leakage`);
  for (const p of view.players) assert(!Object.hasOwn(p,'role'));
  for (const p of s.players.filter(p => p.status === 'active')) {
    const phone = (await request('/api/player/state', undefined, phones.get(p.id))).body;
    assert(!Object.hasOwn(phone.me, 'role')); assert(!Object.hasOwn(phone.me, 'code'));
    assert(!Object.hasOwn(phone, 'seed')); assert(!Object.hasOwn(phone, 'votes'));
  }
}
try {
  const sourceDir = join(output, 'source-machine'); let process1 = await launch(sourceDir); base = process1.url;
  await loginHost(); let s = await host({ type: 'demo' }); const players = s.players; const id = n => players[n].id;
  await loginPhones(s); check('14 permanent identities can join simultaneously from one simulated network');
  await host({ type: 'start', traitorIds: [id(0),id(1)] });
  await host({ type: 'title', title: 'Movie Mystery' });
  const award = { type: 'score', round: 1, playerIds: [id(2),id(3)], mode: 'add', points: 10, reason: 'Pair award' };
  s = await getState(); const key = randomUUID();
  await request('/api/host/action', { action: award, revision: s.revision, requestId: key }, hostCookie);
  await request('/api/host/action', { action: award, revision: s.revision, requestId: key }, hostCookie);
  await host({ type: 'score', round: 1, playerIds: [id(2)], mode: 'set', points: 20, reason: 'Final round tally' });
  assert.equal((await getState()).rounds[0].scores[id(3)], 10); check('Live/group awards, corrections and HTTP retries do not double-count');
  const photo = fixturePng(); const pdf = fixturePdf();
  writeFileSync(join(output,'clue.png'), photo); writeFileSync(join(output,'clues.pdf'), pdf);
  const photoAsset = (await request('/api/player/upload', { name: 'portrait.png', mime: 'image/png', data: photo.toString('base64') }, phones.get(id(3)))).body.id;
  const imageAsset = (await request('/api/host/upload', { name: 'clue.png', mime: 'image/png', data: photo.toString('base64') }, hostCookie)).body.id;
  const pdfAsset = (await request('/api/host/upload', { name: 'clues.pdf', mime: 'application/pdf', data: pdf.toString('base64') }, hostCookie)).body.id;
  await host({ type: 'presentation', enabled: true, assetId: pdfAsset, page: 2, answer: 'PRIVATE-REHEARSAL-ANSWER' });
  assert.equal((await publicView()).presentation.page, 2); assert.equal((await publicView()).presentation.answer, '');
  await host({ type: 'presentation', revealed: true }); assert.equal((await publicView()).presentation.answer, 'PRIVATE-REHEARSAL-ANSWER');
  await host({ type: 'display', view: 'gallery' }); check('Portrait, PDF/image presentation, page controls and hidden answer state persist');
  await host({ type: 'next' }); await host({ type: 'shield', winnerId: id(2), recipientId: id(2) }); await host({ type: 'next' });
  await allVote(idValue => [id(0),id(1)].includes(idValue) ? [id(3),id(6)] : idValue === id(4) ? [id(2)] : [id(4)]);
  await request('/api/player/vote', { ballotId: (await getState()).currentBallotId, value: [] }, phones.get(id(0)), 409);
  await assertPrivacy(); check('Identical player ballots protect roles and hidden rankings; duplicate vote rejected');
  await host({ type: 'close_ballot' }); await host({ type: 'next' }); await banish(id(4));
  await host({ type: 'next' }); assert.equal((await getState()).murderPreview.target, id(3)); await host({ type: 'announce_murder' });
  assert.equal((await getState()).players[3].status, 'murdered'); check('Every one of 14 banishment votes reveals in order, followed by role and murder');
  await host({ type: 'next' }); await host({ type: 'next' });
  await host({ type: 'score', round: 2, playerIds: [id(3)], mode: 'set', points: 30, reason: 'Murdered Innocent wins offline game' });
  await host({ type: 'score', round: 2, playerIds: [id(4)], mode: 'set', points: 90, reason: 'Banished scorer remains in overall leaderboard' });
  await host({ type: 'next' }); await host({ type: 'shield', winnerId: id(3), recipientId: id(5) }); await host({ type: 'next' });
  assert.equal((await request('/api/player/state', undefined, phones.get(id(3)))).body.ballot, null);
  await allVote(idValue => [id(0),id(1)].includes(idValue) ? [id(5),id(6)] : idValue === id(9) ? [id(2)] : [id(9)]);
  await host({ type: 'close_ballot' }); await host({ type: 'next' }); await banish(id(0)); await host({ type: 'next' });
  assert.equal((await getState()).murderPreview.target, id(6)); await host({ type: 'announce_murder' }); await host({ type: 'next' });
  check('Murdered Innocent wins and gifts Shield; Shield target is skipped; banned voters stay ineligible');
  const beforeRecruit = await publicView();
  await host({ type: 'recruit', playerId: id(8), confirm: true, reason: 'Same folded cards for every participant' });
  const afterRecruit = await publicView(); assert.deepEqual(afterRecruit, beforeRecruit);
  assert.equal((await getState()).players[8].role, 'traitor'); check('One-time Recruitment changes the private role without public or phone role signals');
  await host({ type: 'next' }); await host({ type: 'next' }); await host({ type: 'next', reason: 'No Shield this rehearsal round' });
  await request('/api/player/vote', { ballotId: (await getState()).currentBallotId, value: [id(9)] }, phones.get(id(2)));
  await host({ type: 'departure', playerId: id(1), status: 'left', reason: 'Traitor leaves the party' });
  await request('/api/player/vote', { ballotId: (await getState()).currentBallotId, value: [] }, phones.get(id(5)), 409);
  await host({ type: 'resolve_departure', policy: 'restart', reason: 'Archive and restart unrevealed ballot' });
  await host({ type: 'admin_replacement', playerId: id(9), departedId: id(1), confirm: true, reason: 'Administrative replacement card' });
  assert.equal((await getState()).recruitmentUsed, true); await host({ type: 'pause' });
  check('Departure freezes submissions; reviewed restart and administrative replacement preserve Recruitment history');
  const oldCookie = phones.get(id(3));
  phones.set(id(3), (await request('/api/player/login', { code: players[3].code, takeover: true })).cookie);
  await request('/api/player/state', undefined, oldCookie, 401);
  const returned = (await request('/api/player/state', undefined, phones.get(id(3)))).body;
  assert.equal(returned.me.status, 'murdered'); assert.equal(returned.me.id, id(3)); check('Replacement phone retains permanent identity, portrait, elimination and scores; old phone is revoked');
  const pendingBallot = (await getState()).currentBallotId;
  await request('/api/player/vote', { ballotId: pendingBallot, value: [id(5)] }, phones.get(id(2)));
  await request('/api/player/vote', { ballotId: pendingBallot, value: [] }, phones.get(id(5)));
  await host({ type: 'timer', seconds: 500 });
  const beforeRestart = (await request('/api/host/backup', undefined, hostCookie)).body;
  await stop(process1.child); process1 = await launch(sourceDir); base = process1.url;
  const restarted = (await request('/api/host/backup', undefined, hostCookie)).body;
  assert.deepEqual(restarted.payload.state, beforeRestart.payload.state);
  await request('/api/player/state', undefined, phones.get(id(3))); check('Abrupt real server-process restart recovers exact committed state and valid sessions');
  const snapshot = (await request('/api/host/backup', undefined, hostCookie)).body;
  mkdirSync(join(output,'transfer'), { recursive: true }); writeFileSync(join(output,'transfer','party.backup.json'), JSON.stringify(snapshot));
  const process2 = await launch(join(output,'destination-machine')); base = process2.url; await loginHost();
  await request('/api/host/restore', { backup: snapshot, reason: 'Fresh database and server restore rehearsal', confirm: true }, hostCookie);
  s = await getState(); assert.equal(s.id, snapshot.payload.state.id); assert.deepEqual(s.players, snapshot.payload.state.players); assert.deepEqual(s.rounds, snapshot.payload.state.rounds); assert.deepEqual(s.ballots, snapshot.payload.state.ballots); assert.equal(s.paused, true);
  await loginPhones(s);
  for (const [assetId, bytes] of [[photoAsset, photo], [imageAsset, photo], [pdfAsset, pdf]]) { const response = await fetch(base + '/media/' + assetId); assert.equal(response.status, 200); assert(Buffer.from(await response.arrayBuffer()).equals(bytes)); }
  check('Fresh server and database import recover roles, statuses, ballots, scores, images, PDF and source audit');
  const bad = structuredClone(snapshot); bad.checksum = 'bad'; await request('/api/host/restore', { backup: bad, reason: 'Corrupt snapshot rejection', confirm: true }, hostCookie, 400);
  await host({ type: 'pause' }); await allVote([]); await host({ type: 'close_ballot' }); await host({ type: 'enter_finale', reason: 'Exercise Finale with the remaining simulated party' });
  await allVote(idValue => idValue === id(9) ? 'TRAITOR' : 'TRUST'); await host({ type: 'close_ballot' }); await host({ type: 'next' }); await banish(id(8)); await host({ type: 'next' });
  await allVote('TRUST'); await host({ type: 'close_ballot' }); await host({ type: 'next' });
  const final = await publicView(); assert.equal(final.phase, 'over'); assert.equal(final.winner, 'traitors'); assert(final.players.every(p => p.revealedRole));
  assert.equal([...final.players].sort((a,b) => b.totalPoints - a.totalPoints)[0].id, id(4));
  check('Finale repeats after TRAITOR, ends on unanimous TRUST, reveals roles and retains independent points champion');
  const report = { at: new Date().toISOString(), players: 14, checks, passed: true, abruptProcessRestart: true, freshDatabaseRestore: true,
    secondPhysicalMachineVerified: false, physicalDeviceNote: 'Both real server processes ran on the same laptop. A USB/second physical computer and 14 actual phones require the documented host rehearsal.' };
  writeFileSync(join(output,'report.json'), JSON.stringify(report,null,2));
  console.log(`\n${checks.length} rehearsal checks passed. Report: ${join(output,'report.json')}`);
} finally { for (const child of children) await stop(child); }
