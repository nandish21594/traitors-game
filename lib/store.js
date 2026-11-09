import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { initialState, applyCommand } from './game.js';
import { requireThat } from './errors.js';

export const digest = text => createHash('sha256').update(text).digest('hex');
export function hashPassword(password, salt = randomBytes(16).toString('hex')) { return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
export function verifyPassword(password, value) {
  const [salt, hash] = value.split(':');
  const candidate = scryptSync(password, salt, 64); const saved = Buffer.from(hash, 'hex');
  return saved.length === candidate.length && timingSafeEqual(saved, candidate);
}
export class Store {
  constructor(path, password, reducer = applyCommand) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.reducer = reducer;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, kind TEXT NOT NULL, player_id TEXT, expires INTEGER NOT NULL, last_seen INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS one_player_session ON sessions(player_id) WHERE kind='player';
      CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_time INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS requests (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, mime TEXT NOT NULL, name TEXT NOT NULL, data BLOB NOT NULL);`);
    if (!this.db.prepare('SELECT 1 FROM game').get()) this.db.prepare('INSERT INTO game VALUES(1,?)').run(JSON.stringify(initialState()));
    if (!this.db.prepare("SELECT value FROM settings WHERE key='password'").get()) {
      const secret = password || randomBytes(12).toString('base64url');
      requireThat(secret.length >= 12 && secret.length <= 256, 'HOST_PASSWORD must be 12–256 characters.');
      this.db.prepare('INSERT INTO settings VALUES(?,?)').run('password', hashPassword(secret));
      this.initialPassword = secret;
    }
  }
  get() { return JSON.parse(this.db.prepare('SELECT json FROM game WHERE id=1').get().json); }
  command(action, actor, expectedRevision, requestId) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const before = this.get();
      if (requestId && this.db.prepare('SELECT 1 FROM requests WHERE key=?').get(`${actor}:${requestId}`)) { this.db.exec('COMMIT'); return before; }
      requireThat(expectedRevision === undefined || expectedRevision === before.revision, 'State changed. Refresh and retry.', 409);
      const after = structuredClone(before);
      this.reducer(after, action);
      after.revision = before.revision + 1;
      const detail = action.type === 'photo' ? { type: action.type, playerId: action.playerId } : action;
      this.write(before, after, actor, action.type, detail);
      if (requestId) this.db.prepare('INSERT INTO requests VALUES(?,?)').run(`${actor}:${requestId}`, after.revision);
      if (action.type === 'regenerate_code') this.db.prepare('DELETE FROM sessions WHERE player_id=?').run(action.playerId);
      if (action.type === 'new_game') this.db.prepare("DELETE FROM sessions WHERE kind='player'").run();
      this.db.exec('COMMIT'); return after;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  write(before, after, actor, type, detail) {
    this.db.prepare('UPDATE game SET json=? WHERE id=1').run(JSON.stringify(after));
    this.db.prepare('INSERT INTO events(at,actor,type,detail,before_json,after_json) VALUES(?,?,?,?,?,?)').run(new Date().toISOString(), actor, type, JSON.stringify(detail), JSON.stringify(before), JSON.stringify(after));
  }
  audit() { return this.db.prepare('SELECT id,at,actor,type,detail FROM events ORDER BY id DESC LIMIT 200').all().map(e => ({ ...e, detail: JSON.parse(e.detail) })); }
  undo(reason) {
    requireThat(typeof reason === 'string' && reason.trim().length > 0 && reason.length <= 300, 'Record a reason for the correction.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const event = this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 1').get();
      requireThat(event && !['undo', 'restore'].includes(event.type), 'No further reversible correction.');
      const before = this.get(); const after = JSON.parse(event.before_json);
      for (const b of before.ballots) {
        const previous = after.ballots.find(old => old.id === b.id);
        requireThat(!b.revealed || (previous && previous.revealed >= b.revealed), 'Public votes cannot be taken back.');
      }
      for (const p of before.players) requireThat(!p.revealedRole || after.players.find(old => old.id === p.id)?.revealedRole === p.revealedRole, 'Public roles cannot be taken back.');
      for (const r of before.rounds) requireThat(!r.murderAnnounced || after.rounds.find(old => old.number === r.number)?.murderAnnounced, 'Public murders cannot be taken back.');
      requireThat(before.phase !== 'over' || after.phase === 'over', 'The final public result cannot be taken back.');
      after.revision = before.revision + 1;
      this.write(before, after, 'host', 'undo', { eventId: event.id, reason });
      this.db.prepare("DELETE FROM sessions WHERE kind='player'").run();
      this.db.exec('COMMIT'); return after;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  throttle(key, recordFailure = true) {
    const now = Date.now();
    const row = this.db.prepare('SELECT * FROM attempts WHERE key=?').get(key);
    requireThat(!row || row.until_time <= now || row.count < 8, 'Too many attempts. Wait 15 minutes.', 429);
    if (recordFailure) this.db.prepare('INSERT OR REPLACE INTO attempts VALUES(?,?,?)').run(key, row && row.until_time > now ? row.count + 1 : 1, row && row.until_time > now ? row.until_time : now + 900000);
  }
  session(kind, playerId = null) {
    const token = randomBytes(32).toString('base64url');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (playerId) this.db.prepare('DELETE FROM sessions WHERE player_id=?').run(playerId);
      this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(digest(token), kind, playerId, Date.now() + 18 * 3600000, Date.now());
      this.db.exec('COMMIT'); return token;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  authenticate(token, kind) {
    const row = token && this.db.prepare('SELECT * FROM sessions WHERE hash=? AND kind=? AND expires>?').get(digest(token), kind, Date.now());
    requireThat(row, 'Please sign in again. This session may have been replaced.', 401);
    this.db.prepare('UPDATE sessions SET last_seen=? WHERE hash=?').run(Date.now(), digest(token));
    return row;
  }
  close() { this.db.close(); }
}
