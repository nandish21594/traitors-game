import { digest } from './store.js';
import { PHASES } from './game.js';
import { requireThat } from './errors.js';
import { inspectMedia } from './media.js';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const integer = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
function validateState(s, assets) {
  const valid = condition => requireThat(condition, 'Backup has an invalid game state.');
  valid(s && s.schema === 1 && uuid(s.id) && uuid(s.seed) && PHASES.includes(s.phase) && integer(s.revision, 0, 1e9) && integer(s.round, 0, 1000));
  valid(typeof s.paused === 'boolean' && typeof s.finale === 'boolean' && typeof s.recruitmentUsed === 'boolean' && typeof s.recruitmentEligible === 'boolean');
  valid(Array.isArray(s.players) && s.players.length <= 30 && new Set(s.players.map(p => p.id)).size === s.players.length && new Set(s.players.map(p => p.code)).size === s.players.length);
  const ids = new Set(s.players.map(p => p.id)); const hasId = id => ids.has(id);
  for (const p of s.players) {
    valid(uuid(p.id) && typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 40 && /^\d{6}$/.test(p.code));
    valid(['innocent', 'traitor'].includes(p.role) && ['active','murdered','banished','left','retired'].includes(p.status));
    valid(p.photo === null || assets.has(p.photo)); valid(!p.revealedRole || ['innocent','traitor'].includes(p.revealedRole));
    valid(!p.previousStatus || ['active','murdered','banished','left','retired'].includes(p.previousStatus));
    valid(!p.replacedBy || hasId(p.replacedBy));
  }
  valid(s.settings && integer(s.settings.traitors, 1, 8) && integer(s.settings.finaleAt, 2, 8) && integer(s.settings.shields, 0, 5) && typeof s.settings.publicShields === 'boolean');
  valid(s.winner === null || (s.phase === 'over' && ['traitors','innocents'].includes(s.winner)));
  valid(Array.isArray(s.rounds) && s.rounds.length === s.round);
  for (const [index, r] of s.rounds.entries()) {
    valid(r.number === index + 1 && typeof r.title === 'string' && r.title.length <= 100 && r.scores && typeof r.scores === 'object');
    for (const [id, points] of Object.entries(r.scores)) valid(hasId(id) && integer(points, -1e6, 1e6));
    valid(Array.isArray(r.shields) && r.shields.every(hasId) && Array.isArray(r.shieldAwards));
    for (const a of r.shieldAwards) valid(hasId(a.winnerId) && hasId(a.recipientId));
    valid(r.banished === null || hasId(r.banished));
    valid(typeof r.murderAnnounced === 'boolean');
    if (r.murderAnnounced) valid(r.murderResult && (r.murderResult.target === null || hasId(r.murderResult.target)) && typeof r.murderResult.blocked === 'boolean');
    if (Object.hasOwn(r, 'murderOverride')) valid(r.murderOverride === null || hasId(r.murderOverride));
  }
  valid(Array.isArray(s.ballots) && s.ballots.length < 10000 && new Set(s.ballots.map(b => b.id)).size === s.ballots.length);
  for (const b of s.ballots) {
    valid(uuid(b.id) && ['murder','banishment','trust'].includes(b.kind) && integer(b.round, 1, s.round));
    for (const list of [b.electorate, b.candidates, b.revealOrder]) valid(Array.isArray(list) && list.every(hasId) && new Set(list).size === list.length);
    valid(typeof b.closed === 'boolean' && integer(b.revealed, 0, b.revealOrder.length) && b.votes && typeof b.votes === 'object');
    for (const [id, value] of Object.entries(b.votes)) {
      valid(b.electorate.includes(id));
      valid(b.kind === 'murder' ? Array.isArray(value) && value.length <= 5 && value.every(hasId) && new Set(value).size === value.length : b.kind === 'trust' ? value === null || ['TRUST','TRAITOR'].includes(value) : value === null || hasId(value));
    }
  }
  valid(s.currentBallotId === null || s.ballots.some(b => b.id === s.currentBallotId));
  const current = s.ballots.find(b => b.id === s.currentBallotId);
  if (['murder_ballot','banishment_ballot','finale_trust'].includes(s.phase)) valid(current && !current.closed && current.kind === ({ murder_ballot: 'murder', banishment_ballot: 'banishment', finale_trust: 'trust' })[s.phase]);
  if (['vote_reveal','tie_break'].includes(s.phase)) valid(current && current.closed && current.kind === 'banishment');
  if (s.phase === 'tie_break') valid(Array.isArray(current.tied) && current.tied.every(hasId));
  if (s.phase === 'finale_result') valid(current && current.closed && current.kind === 'trust');
  if (s.phase === 'lobby') valid(s.round === 0 && s.currentBallotId === null);
  if (s.phase === 'over') valid(['traitors','innocents'].includes(s.winner) && s.currentBallotId === null);
  valid(s.timer && (s.timer.deadline === null || Number.isFinite(s.timer.deadline)) && Number.isFinite(s.timer.remaining) && s.timer.remaining >= 0);
  const p = s.presentation;
  valid(p && typeof p.enabled === 'boolean' && Array.isArray(p.assets) && p.assets.every(id => assets.has(id)) && integer(p.index, 0, Math.max(0, p.assets.length - 1)) && integer(p.page, 1, 999) && typeof p.answer === 'string' && p.answer.length <= 300 && typeof p.revealed === 'boolean');
  valid(Array.isArray(s.groups) && s.groups.every(g => uuid(g.id) && typeof g.name === 'string' && Array.isArray(g.members) && g.members.every(hasId)));
  if (s.pendingDeparture) valid(hasId(s.pendingDeparture.playerId) && ['left','retired','restore'].includes(s.pendingDeparture.status) && typeof s.pendingDeparture.wasPaused === 'boolean');
}
export function exportBackup(store) {
  store.db.exec('BEGIN');
  try {
    const payload = { state: store.get(), assets: store.db.prepare('SELECT * FROM media').all().map(a => ({ ...a, data: Buffer.from(a.data).toString('base64') })),
      audit: store.db.prepare('SELECT at,actor,type,detail FROM events ORDER BY id').all() };
    const result = { format: 'traitors-game', version: 1, exportedAt: new Date().toISOString(), payload, checksum: digest(JSON.stringify(payload)) };
    store.db.exec('COMMIT'); return result;
  } catch (e) { store.db.exec('ROLLBACK'); throw e; }
}
export function importBackup(store, backup, reason) {
  requireThat(typeof reason === 'string' && reason.trim().length > 0 && reason.length <= 300, 'Record a restore reason.');
  // The original brand's snapshots use the same version-1 payload.
  requireThat(backup && ['traitors-game', 'diwali-traitors'].includes(backup.format) && backup.version === 1 && backup.payload && backup.checksum === digest(JSON.stringify(backup.payload)), 'Backup checksum or format is invalid.');
  const payload = backup.payload;
  requireThat(Array.isArray(payload.assets) && payload.assets.length <= 1000 && Array.isArray(payload.audit) && payload.audit.length < 20000, 'Invalid backup contents.');
  let bytes = 0; const mediaIds = new Set();
  for (const a of payload.assets) {
    requireThat(uuid(a.id) && !mediaIds.has(a.id) && typeof a.name === 'string' && a.name.length <= 100 && typeof a.data === 'string', 'Invalid backup media.');
    const data = Buffer.from(a.data, 'base64'); inspectMedia(data, a.mime); bytes += data.length; mediaIds.add(a.id);
  }
  requireThat(bytes <= 32 * 1024 * 1024, 'Backup media exceeds 32 MB.');
  validateState(payload.state, mediaIds);
  for (const e of payload.audit) requireThat(typeof e.at === 'string' && typeof e.actor === 'string' && typeof e.type === 'string' && typeof e.detail === 'string', 'Invalid backup audit.');
  const before = store.get(); const after = structuredClone(payload.state);
  after.revision = before.revision + 1;
  if (after.timer.deadline) after.timer.remaining = Math.max(0, Math.ceil((after.timer.deadline - Date.parse(backup.exportedAt)) / 1000));
  after.timer.deadline = null; after.paused = true;
  store.db.exec('BEGIN IMMEDIATE');
  try {
    store.db.prepare('DELETE FROM media').run();
    for (const a of payload.assets) store.db.prepare('INSERT INTO media VALUES(?,?,?,?)').run(a.id, a.mime, a.name, Buffer.from(a.data, 'base64'));
    // Import audit as a nested archive event: preserve both the destination history and source history.
    store.write(before, after, 'host', 'restore', { reason, exportedAt: backup.exportedAt, sourceGame: after.id, sourceAudit: payload.audit });
    store.db.prepare("DELETE FROM sessions WHERE kind='player'").run(); store.db.prepare('DELETE FROM requests').run();
    store.db.exec('COMMIT'); return after;
  } catch (e) { store.db.exec('ROLLBACK'); throw e; }
}
