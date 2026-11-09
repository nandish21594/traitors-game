import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyCommand, currentRound, currentBallot, activePlayers, publicState, playerState, resolveMurder, shieldCandidates } from '../lib/game.js';

function game(count = 14, traitors = 2) {
  const s = initialState(); applyCommand(s, { type: 'demo' }); s.players = s.players.slice(0, count); s.settings.traitors = traitors;
  applyCommand(s, { type: 'start', traitorIds: s.players.slice(0, traitors).map(p => p.id) }); return s;
}
const act = (s, type, extra = {}) => applyCommand(s, { type, ...extra });
function predictions(s) { act(s, 'next'); act(s, 'next', { reason: 'Rehearsal: no Shield' }); }
function submitAll(s, value) {
  const b = currentBallot(s);
  for (const id of b.electorate) act(s, 'vote', { playerId: id, ballotId: b.id, value: typeof value === 'function' ? value(id) : value });
}
function revealAll(s) { act(s, 'close_ballot'); const b = currentBallot(s); for (const id of b.electorate) act(s, 'reveal_next'); act(s, 'next'); }

test('identical role-free ballots; only active Traitor rankings affect murder; unavailable and shield fallback', () => {
  const s = game(); predictions(s);
  const [t1, t2, target, backup, innocent] = s.players;
  for (const p of s.players) {
    const view = playerState(s, p.id);
    assert.equal(view.ballot.kind, 'murder'); assert.equal(view.ballot.candidates.length, 13);
    assert(!JSON.stringify(view).includes('"role"')); assert(!JSON.stringify(view).includes('"code"'));
  }
  submitAll(s, id => [t1.id, t2.id].includes(id) ? [target.id, backup.id] : id === innocent.id ? [target.id] : [innocent.id]);
  act(s, 'close_ballot');
  assert.equal(resolveMurder(s).target, target.id);
  currentRound(s).shields.push(target.id);
  assert.equal(resolveMurder(s).target, backup.id);
  target.status = 'banished';
  assert.equal(resolveMurder(s).target, backup.id);
  const unchanged = JSON.stringify(publicState(s));
  currentBallot(s).votes[t1.id] = [innocent.id];
  assert.equal(JSON.stringify(publicState(s)), unchanged, 'Private murder rankings must never affect the public payload before announcement');
  t1.status = 'banished';
  assert.equal(resolveMurder(s).target, backup.id, 'Only surviving active Traitors determine murder');
});
test('rank-6 seeded ties are stable with three Traitors', () => {
  const s = game(14, 3); predictions(s); submitAll(s, []); act(s, 'close_ballot');
  const result = resolveMurder(s);
  assert.deepEqual(resolveMurder(structuredClone(s)), result);
  assert.equal(s.players.find(p => p.id === result.target).role, 'innocent');
});
test('each vote reveals including Traitors; duplicate, self and post-reveal mutations rejected', () => {
  const s = game(); predictions(s); submitAll(s, []); act(s, 'next'); act(s, 'next');
  const target = s.players[2]; const b = currentBallot(s);
  assert.throws(() => act(s, 'vote', { playerId: target.id, ballotId: b.id, value: target.id }), /eligible/);
  submitAll(s, id => id === target.id ? s.players[3].id : target.id);
  assert.throws(() => act(s, 'vote', { playerId: s.players[0].id, ballotId: b.id, value: target.id }), /locked/);
  act(s, 'close_ballot');
  assert.throws(() => act(s, 'next'), /every vote/);
  for (const id of b.electorate) act(s, 'reveal_next');
  assert.equal(publicState(s).reveal.length, 14);
  assert(publicState(s).reveal.some(v => v.voter === s.players[0].id));
  assert.throws(() => act(s, 'reset_vote', { reason: 'Cannot change a public vote' }), /unrevealed/);
  act(s, 'next'); assert.equal(target.status, 'banished'); assert.equal(target.revealedRole, 'innocent');
});
test('restricted tied-vote revote, persistent tie requires audited host decision', () => {
  const s = game(10); predictions(s); submitAll(s, []); act(s, 'next'); act(s, 'next');
  const [a, b] = s.players.slice(2, 4);
  const castTie = () => {
    const others = activePlayers(s).filter(p => ![a.id, b.id].includes(p.id));
    submitAll(s, id => id === a.id ? b.id : id === b.id ? a.id : others.findIndex(p => p.id === id) < 4 ? a.id : b.id);
    revealAll(s);
  };
  castTie(); assert.equal(currentBallot(s).revote, true); assert.deepEqual(currentBallot(s).candidates.sort(), [a.id, b.id].sort());
  castTie(); assert.equal(s.phase, 'tie_break');
  assert.throws(() => act(s, 'tie_break', { playerId: a.id }), /Text/);
  act(s, 'tie_break', { playerId: a.id, reason: 'Offline tie-break winner selected the loser' }); assert.equal(a.status, 'banished');
});
test('murdered Innocent scores and gifts Shield, banished and departed players cannot win it', () => {
  const s = game(); const [t, , ghost, recipient, banished, left] = s.players;
  ghost.status = 'murdered'; banished.status = 'banished'; left.status = 'left';
  for (const [p, points] of [[ghost, 30], [banished, 50], [left, 60]]) act(s, 'score', { round: 1, playerIds: [p.id], points, mode: 'set', reason: 'Final tally' });
  act(s, 'next'); assert.equal(shieldCandidates(s)[0].id, ghost.id);
  act(s, 'shield', { winnerId: ghost.id, recipientId: recipient.id });
  assert.deepEqual(currentRound(s).shields, [recipient.id]);
  act(s, 'next');
  assert.equal(playerState(s, ghost.id).ballot, null);
  assert.throws(() => act(s, 'vote', { playerId: ghost.id, ballotId: currentBallot(s).id, value: [t.id] }), /eligible/);
});
test('shield blocks a host-selected attempted murder without forcing an elimination', () => {
  const s = game(); const target = s.players[2]; predictions(s); submitAll(s, []); act(s, 'next');
  s.phase = 'murder_preview'; currentRound(s).shields.push(target.id);
  act(s, 'murder_override', { playerId: target.id, reason: 'Paper target correction' }); act(s, 'announce_murder');
  assert.equal(activePlayers(s).length, 14); assert.equal(currentRound(s).murderResult.blocked, true);
  assert(!currentRound(s).shields.includes(target.id));
});
test('normal Recruitment once, only surviving Traitor, no role signal on phone or projector', () => {
  const s = game(); predictions(s); submitAll(s, []); act(s, 'next'); act(s, 'next');
  const target = s.players[0]; submitAll(s, id => id === target.id ? s.players[3].id : target.id); revealAll(s);
  act(s, 'next'); act(s, 'murder_override', { playerId: null, reason: 'Controlled rehearsal' }); act(s, 'announce_murder'); act(s, 'next');
  const recruit = s.players[2]; const before = JSON.stringify(playerState(s, recruit.id));
  act(s, 'recruit', { playerId: recruit.id, confirm: true, reason: 'All players received folded cards' });
  assert.equal(recruit.role, 'traitor'); assert.equal(JSON.stringify(playerState(s, recruit.id)), before);
  assert.throws(() => act(s, 'recruit', { playerId: s.players[3].id, confirm: true, reason: 'Second attempt' }), /unavailable/);
});
test('both Traitors eliminated => immediate Innocents win; finale TRUST and continued banishment', () => {
  const s = game(); s.players[0].status = 'banished';
  predictions(s); submitAll(s, []); act(s, 'next'); act(s, 'next');
  const target = s.players[1]; submitAll(s, id => id === target.id ? s.players[3].id : target.id); revealAll(s);
  assert.equal(s.phase, 'over'); assert.equal(s.winner, 'innocents');
  const f = game(5); act(f, 'enter_finale', { reason: 'Host begins Finale' });
  submitAll(f, id => id === f.players[0].id ? 'TRAITOR' : 'TRUST'); act(f, 'next'); act(f, 'next');
  assert.equal(f.phase, 'banishment_ballot'); assert.equal(f.finale, true);
  assert.throws(() => act(f, 'recruit', { playerId: f.players[3].id, confirm: true, reason: 'Invalid' }), /unavailable/);
  const g = game(4); act(g, 'enter_finale', { reason: 'Final four' }); submitAll(g, 'TRUST'); act(g, 'next'); act(g, 'next');
  assert.equal(g.winner, 'traitors'); assert.equal(g.phase, 'over');
});
test('departure freezes ballots, retains cast votes by explicit decision, invalidates eligible targets; ordinary disconnect does nothing', () => {
  const s = game(); predictions(s); const target = s.players[2]; const b = currentBallot(s);
  act(s, 'disconnect', { playerId: target.id, disconnected: true }); assert.equal(target.status, 'active'); assert.equal(s.paused, false);
  act(s, 'vote', { playerId: target.id, ballotId: b.id, value: [s.players[3].id] });
  act(s, 'departure', { playerId: target.id, status: 'left', reason: 'Must leave the party' });
  assert.throws(() => act(s, 'next'), /paused/);
  act(s, 'resolve_departure', { policy: 'retain', reason: 'Keep submitted decisions; remove unavailable targets' });
  assert.equal(target.status, 'left'); assert(b.votes[target.id]); assert(!b.candidates.includes(target.id)); assert.equal(s.paused, true);
  act(s, 'pause');
  act(s, 'departure', { playerId: target.id, status: 'restore', reason: 'Returned after host review' });
  act(s, 'resolve_departure', { policy: 'restart', reason: 'Restart unrevealed ballot for returning player' });
  assert.equal(target.status, 'active'); assert.equal(b.superseded, true); assert.equal(Object.keys(currentBallot(s).votes).length, 0);
});
test('administrative replacement does not consume normal recruitment; scores set/add and group edits do not double count', () => {
  const s = game(); const departing = s.players[0]; const recruit = s.players[3];
  act(s, 'departure', { playerId: departing.id, status: 'left', reason: 'Family emergency' });
  act(s, 'resolve_departure', { policy: 'retain', reason: 'No ballot yet' });
  act(s, 'admin_replacement', { playerId: recruit.id, departedId: departing.id, reason: 'Replacement folded card', confirm: true });
  assert.equal(s.recruitmentUsed, false); assert.equal(recruit.role, 'traitor');
  const playerIds = s.players.slice(2, 5).map(p => p.id);
  act(s, 'score', { round: 1, playerIds, points: 10, mode: 'add', reason: 'Team score' });
  act(s, 'score', { round: 1, playerIds, points: 7, mode: 'set', reason: 'Correct pen-and-paper tally' });
  assert(playerIds.every(id => currentRound(s).scores[id] === 7));
});
test('manual Shield overrides never allow banished or departed winners', () => {
  const s = game(); act(s, 'next'); const [recipient, banned, left] = s.players;
  banned.status = 'banished'; left.status = 'left';
  for (const p of [banned, left]) assert.throws(() => act(s, 'shield', { winnerId: p.id, recipientId: recipient.id, manual: true, reason: 'Special-game override' }), /cannot win or gift/);
});
test('all protected targets block automatic murder; Shields expire on the next round', () => {
  const s = game(); predictions(s); submitAll(s, []); act(s, 'close_ballot');
  currentRound(s).shields = activePlayers(s).filter(p => p.role === 'innocent').map(p => p.id);
  assert.equal(resolveMurder(s).blocked, true); assert.equal(resolveMurder(s).target, null);
  s.phase = 'interlude'; act(s, 'next'); assert.deepEqual(currentRound(s).shields, []);
});
test('crossing Finale threshold after banishment skips the pending murder entirely', () => {
  const s = game(5); predictions(s); submitAll(s, []); act(s, 'next'); act(s, 'next');
  const target = s.players[2]; submitAll(s, id => id === target.id ? s.players[3].id : target.id); revealAll(s);
  act(s, 'next'); assert.equal(s.phase, 'finale_trust'); assert.equal(s.finale, true); assert.equal(currentRound(s).murderAnnounced, false);
});
test('Finale ends at two remaining players, and missing TRUST decisions cannot end unanimously', () => {
  const s = game(3, 1); act(s, 'enter_finale', { reason: 'Final three' });
  act(s, 'close_ballot', { force: true, reason: 'Host records missing votes' }); assert.equal(currentBallot(s).unanimous, false);
  act(s, 'next'); const target = s.players[2]; submitAll(s, id => id === target.id ? s.players[1].id : target.id); revealAll(s);
  act(s, 'next'); assert.equal(s.phase, 'over'); assert.equal(s.winner, 'traitors');
});
test('departure after a reveal preserves the full frozen vote record', () => {
  const s = game(); predictions(s); submitAll(s, []); act(s, 'next'); act(s, 'next');
  const target = s.players[3]; submitAll(s, id => id === target.id ? s.players[4].id : target.id); act(s, 'close_ballot'); act(s, 'reveal_next');
  const before = structuredClone(currentBallot(s));
  act(s, 'departure', { playerId: target.id, status: 'left', reason: 'Left during the reveal' });
  assert.throws(() => act(s, 'resolve_departure', { policy: 'restart', reason: 'Not permitted' }), /unrevealed/);
  act(s, 'resolve_departure', { policy: 'retain', reason: 'Preserve all decisions and skip unavailable target in outcome' });
  assert.deepEqual(currentBallot(s), before);
});
test('an unavailable override remains reviewable and cannot be publicly announced', () => {
  const s = game(); const p = s.players[3]; s.phase = 'murder_preview';
  act(s, 'murder_override', { playerId: p.id, reason: 'Paper correction' });
  act(s, 'departure', { playerId: p.id, status: 'left', reason: 'Emergency departure' });
  act(s, 'resolve_departure', { policy: 'retain', reason: 'Review override next' }); act(s, 'pause');
  assert.equal(resolveMurder(s).needsReview, true); assert.throws(() => act(s, 'announce_murder'), /override target/);
  act(s, 'murder_override', { playerId: null, reason: 'No murder after departure' }); act(s, 'announce_murder'); assert.equal(currentRound(s).murderResult.target, null);
});
test('private changes, including global revision, never alter public or phone revision tokens', () => {
  const s = game(); const id = s.players[4].id;
  const beforePublic = publicState(s), beforePhone = playerState(s, id);
  s.players[4].role = 'traitor'; s.revision += 42; s.recruitmentUsed = true;
  assert.deepEqual(publicState(s), beforePublic); assert.deepEqual(playerState(s, id), beforePhone);
  s.phase = 'over'; s.winner = 'traitors'; s.players[4].revealedRole = 'innocent';
  assert.equal(publicState(s).players.find(p => p.id === id).revealedRole, 'traitor', 'Final roles must reflect current roles after any reviewed correction');
});
