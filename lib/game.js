import { randomUUID, randomInt, createHash } from 'node:crypto';
import { requireThat, cleanText } from './errors.js';

export const PHASES = ['lobby', 'minigame', 'shields', 'murder_ballot', 'discussion', 'banishment_ballot', 'vote_reveal', 'tie_break', 'banishment_result', 'murder_preview', 'murder_result', 'interlude', 'finale_trust', 'finale_result', 'over'];
export const activePlayers = s => s.players.filter(p => p.status === 'active');
export const currentRound = s => s.rounds.find(r => r.number === s.round);
export function initialState() {
  return { schema: 1, id: randomUUID(), revision: 0, phase: 'lobby', round: 0, paused: false,
    seed: randomUUID(), display: 'gallery', players: [], rounds: [], ballots: [], currentBallotId: null,
    settings: { traitors: 2, finaleAt: 4, shields: 1, publicShields: true },
    recruitmentUsed: false, recruitmentEligible: false, pendingDeparture: null, winner: null, finale: false,
    timer: { deadline: null, remaining: 0 }, presentation: { enabled: false, assets: [], index: 0, page: 1, answer: '', revealed: false }, groups: [] };
}
export function makePlayer(s, name) {
  let code;
  do { code = String(randomInt(100000, 1000000)); } while (s.players.some(p => p.code === code));
  return { id: randomUUID(), name: cleanText(name, 40), code, role: 'innocent', status: 'active', photo: null, disconnected: false, revealedRole: null, previousStatus: null };
}
export function totalPoints(s, id) { return s.rounds.reduce((sum, r) => sum + (r.scores[id] || 0), 0); }
export function publicState(s) {
  const round = currentRound(s);
  const ballot = s.ballots.find(b => b.id === s.currentBallotId);
  const view = { phase: s.phase, round: s.round, paused: s.paused, winner: s.winner,
    title: round?.title || 'A gathering of trust & doubt', display: s.display || 'gallery', timer: { deadline: s.timer.deadline, remaining: s.timer.remaining },
    players: s.players.map(p => ({ id: p.id, name: p.name, status: p.status, photo: p.photo,
      roundPoints: round?.scores[p.id] || 0, totalPoints: totalPoints(s, p.id),
      shield: s.settings.publicShields && (round?.shields || []).includes(p.id),
      ...(p.revealedRole || s.phase === 'over' ? { revealedRole: s.phase === 'over' ? p.role : p.revealedRole } : {}) })),
    reveal: ballot?.kind === 'banishment' ? ballot.revealOrder.slice(0, ballot.revealed).map(id => ({ voter: id, target: ballot.votes[id] ?? null })) : [],
    revealTotal: ballot?.kind === 'banishment' && ballot.closed ? ballot.revealOrder.length : 0,
    murder: round?.murderAnnounced ? { target: round.murderResult.target, blocked: round.murderResult.blocked, blockedBy: round.murderResult.blockedBy || null } : null,
    banished: round?.banished || null,
    presentation: { enabled: s.presentation.enabled, assets: s.presentation.assets, index: s.presentation.index, page: s.presentation.page,
      revealed: s.presentation.revealed, answer: s.presentation.revealed ? s.presentation.answer : '' } };
  return { ...view, revision: createHash('sha256').update(JSON.stringify(view)).digest('hex').slice(0, 20) };
}
export function playerState(s, id) {
  const p = s.players.find(p => p.id === id);
  requireThat(p, 'Player no longer exists.', 401);
  const b = s.ballots.find(b => b.id === s.currentBallotId);
  const view = { ...publicState(s), me: { id: p.id, name: p.name, status: p.status, photo: p.photo },
    ballot: b && !b.closed && b.electorate.includes(id) && p.status === 'active' ? {
      id: b.id, kind: b.kind, submitted: Object.hasOwn(b.votes, id),
      candidates: b.candidates.filter(cid => cid !== id).map(cid => ({ id: cid, name: s.players.find(p => p.id === cid)?.name || 'Player' }))
    } : null };
  return { ...view, revision: createHash('sha256').update(JSON.stringify(view)).digest('hex').slice(0, 20) };
}
export function foundationCommand(s, action) {
  switch (action.type) {
    case 'new_game':
      requireThat(action.confirm === true && (s.phase === 'lobby' || s.phase === 'over' || s.paused), 'Pause and confirm before starting a fresh game.');
      cleanText(action.reason, 300); Object.assign(s, initialState()); return;
    case 'add_player':
      requireThat(s.phase === 'lobby', 'Register players before starting.');
      requireThat(s.players.length < 30, 'Maximum 30 players.');
      s.players.push(makePlayer(s, action.name)); return;
    case 'demo':
      requireThat(s.phase === 'lobby' && !s.players.length, 'Demo needs an empty lobby.');
      for (const name of ['Alex', 'Amara', 'Blair', 'Casey', 'Drew', 'Ellis', 'Hana', 'Jules', 'Kai', 'Morgan', 'Noor', 'Quinn', 'Reese', 'Sam']) s.players.push(makePlayer(s, name));
      return;
    case 'regenerate_code': {
      const p = s.players.find(p => p.id === action.playerId);
      requireThat(p, 'Unknown player.'); p.code = makePlayer(s, p.name).code;
      while (s.players.some(other => other !== p && other.code === p.code)) p.code = makePlayer(s, p.name).code;
      return;
    }
    case 'photo': {
      const p = s.players.find(p => p.id === action.playerId); requireThat(p, 'Unknown player.'); p.photo = action.assetId; return;
    }
    default: return false;
  }
  return true;
}
export function applyCommand(s, action) {
  if (foundationCommand(s, action) !== false) return;
  if (action.type === 'pause') { setPaused(s, !s.paused); return; }
  if (action.type === 'disconnect') {
    player(s, action.playerId).disconnected = !!action.disconnected; return;
  }
  if (action.type === 'departure') {
    requireThat(!s.pendingDeparture, 'Resolve the pending departure first.');
    const p = player(s, action.playerId);
    requireThat(['left', 'retired', 'restore'].includes(action.status), 'Invalid departure status.');
    const reason = cleanText(action.reason, 300);
    s.pendingDeparture = { playerId: p.id, status: action.status, reason, wasPaused: s.paused };
    setPaused(s, true); return;
  }
  if (action.type === 'resolve_departure') { resolveDeparture(s, action); return; }
  if (action.type === 'settings') {
    requireThat(s.phase === 'lobby' || s.paused, 'Pause before changing settings.');
    if (s.phase !== 'lobby') cleanText(action.reason, 300);
    const v = action.settings || {};
    for (const [key, min, max] of [['traitors', 1, 8], ['finaleAt', 2, 8], ['shields', 0, 5]]) {
      if (v[key] !== undefined) { requireThat(Number.isInteger(v[key]) && v[key] >= min && v[key] <= max, `Invalid ${key}.`); s.settings[key] = v[key]; }
    }
    if (v.publicShields !== undefined) { requireThat(typeof v.publicShields === 'boolean', 'Invalid visibility.'); s.settings.publicShields = v.publicShields; }
    return;
  }
  if (action.type === 'role' || action.type === 'admin_replacement') {
    requireThat(s.phase === 'lobby' || s.paused, 'Pause before changing roles.');
    requireThat(action.confirm === true, 'Confirm this private role change.');
    cleanText(action.reason, 300);
    const p = player(s, action.playerId);
    requireThat(p.status === 'active', 'Choose an active player.');
    requireThat(!s.finale && s.phase !== 'over', 'Roles cannot change in the Finale or after the result.');
    if (action.type === 'admin_replacement') {
      const departed = player(s, action.departedId);
      requireThat(['left', 'retired'].includes(departed.status) && departed.role === 'traitor' && !departed.replacedBy, 'Choose an unreplaced departed Traitor.');
      requireThat(p.role === 'innocent', 'Replacement must be an Innocent.');
      departed.replacedBy = p.id; p.role = 'traitor';
    } else {
      requireThat(['traitor', 'innocent'].includes(action.role), 'Invalid role.'); p.role = action.role;
    }
    if (s.phase !== 'lobby') {
      const b = currentBallot(s);
      requireThat(!b || b.closed || !Object.keys(b.votes).length, 'Reset/finish the open ballot before changing roles.');
    }
    return;
  }
  if (action.type === 'score') { score(s, action); return; }
  if (action.type === 'shield_correction') {
    requireThat(s.paused && currentRound(s) && !currentRound(s).murderAnnounced && !s.finale && s.phase !== 'over', 'Pause before correcting an unannounced round’s Shields.');
    cleanText(action.reason, 300);
    requireThat(Array.isArray(action.playerIds) && action.playerIds.length <= s.settings.shields && new Set(action.playerIds).size === action.playerIds.length, 'Choose at most the configured number of Shields.');
    requireThat(action.playerIds.every(id => player(s, id).status === 'active'), 'Shield recipients must be active.');
    currentRound(s).shields = action.playerIds; return;
  }
  if (action.type === 'display') {
    requireThat(['gallery', 'leaderboard'].includes(action.view), 'Choose gallery or leaderboard.'); s.display = action.view; s.presentation.enabled = false; return;
  }
  if (action.type === 'group') {
    const name = cleanText(action.name, 50);
    requireThat(Array.isArray(action.members) && action.members.length && new Set(action.members).size === action.members.length, 'Choose group members.');
    action.members.forEach(id => player(s, id));
    const group = { id: action.groupId || randomUUID(), name, members: action.members };
    s.groups = s.groups.filter(g => g.id !== group.id); s.groups.push(group); return;
  }
  if (action.type === 'title') { requireThat(currentRound(s), 'Start a round first.'); currentRound(s).title = cleanText(action.title, 100); return; }
  if (action.type === 'timer') {
    requireThat(Number.isInteger(action.seconds) && action.seconds >= 0 && action.seconds <= 14400, 'Timer must be 0–14400 seconds.');
    s.timer = { remaining: action.seconds, deadline: s.paused || !action.seconds ? null : Date.now() + action.seconds * 1000 }; return;
  }
  if (action.type === 'presentation') {
    const p = s.presentation;
    if (action.enabled !== undefined) p.enabled = !!action.enabled;
    if (action.assetId) { requireThat(p.assets.includes(action.assetId), 'Unknown presentation asset.'); p.index = p.assets.indexOf(action.assetId); p.page = 1; p.revealed = false; }
    if (action.step) { requireThat([-1, 1].includes(action.step), 'Invalid slide step.'); p.index = Math.max(0, Math.min(p.assets.length - 1, p.index + action.step)); p.page = 1; p.revealed = false; }
    if (action.page !== undefined) { requireThat(Number.isInteger(action.page) && action.page >= 1 && action.page <= 999, 'Invalid PDF page.'); p.page = action.page; p.revealed = false; }
    if (action.answer !== undefined) { requireThat(typeof action.answer === 'string' && action.answer.length <= 300, 'Answer too long.'); p.answer = action.answer; p.revealed = false; }
    if (action.revealed !== undefined) p.revealed = !!action.revealed;
    return;
  }
  if (action.type === 'presentation_asset') { s.presentation.assets.push(action.assetId); return; }
  requireThat(!s.paused, 'The gathering is paused. Resume to continue.', 409);
  requireThat(!s.pendingDeparture, 'Review the departure first.', 409);
  switch (action.type) {
    case 'start': {
      requireThat(s.phase === 'lobby', 'Already started.');
      requireThat(activePlayers(s).length >= 3, 'Register at least 3 players (10–14 recommended).');
      if (action.traitorIds) {
        requireThat(Array.isArray(action.traitorIds) && new Set(action.traitorIds).size === action.traitorIds.length, 'Invalid role list.');
        action.traitorIds.forEach(id => requireThat(player(s, id).status === 'active', 'Traitors must be active.'));
        s.players.forEach(p => { p.role = action.traitorIds.includes(p.id) ? 'traitor' : 'innocent'; });
      }
      if (!activePlayers(s).some(p => p.role === 'traitor')) {
        const shuffled = activePlayers(s).sort((a, b) => tieKey(s, a.id).localeCompare(tieKey(s, b.id)));
        shuffled.slice(0, s.settings.traitors).forEach(p => { p.role = 'traitor'; });
      }
      requireThat(activePlayers(s).filter(p => p.role === 'traitor').length === s.settings.traitors && s.settings.traitors < activePlayers(s).length, 'Role count must match the configured Traitor count.');
      newRound(s); return;
    }
    case 'next': return advance(s, action);
    case 'shield': return awardShield(s, action);
    case 'clear_shields':
      requireThat(s.phase === 'shields', 'Correct Shields during Shield allocation.'); cleanText(action.reason, 300);
      currentRound(s).shields = []; currentRound(s).shieldAwards = []; return;
    case 'vote': return vote(s, action);
    case 'close_ballot': return closeBallot(s, action);
    case 'reset_vote': {
      const b = currentBallot(s); requireThat(b && !b.closed && b.revealed === 0, 'Only an unrevealed open ballot can be corrected.');
      cleanText(action.reason, 300);
      if (action.playerId) delete b.votes[action.playerId]; else b.votes = {};
      return;
    }
    case 'reveal_next': {
      requireThat(s.phase === 'vote_reveal', 'No vote reveal in progress.');
      const b = currentBallot(s); requireThat(b.revealed < b.revealOrder.length, 'All votes are revealed.'); b.revealed++; return;
    }
    case 'tie_break': {
      requireThat(s.phase === 'tie_break', 'No persistent tie.'); cleanText(action.reason, 300);
      const b = currentBallot(s); requireThat(b.tied.includes(action.playerId), 'Choose a tied active candidate.'); banish(s, action.playerId); return;
    }
    case 'murder_override': {
      requireThat(s.phase === 'murder_preview', 'Preview the murder first.'); cleanText(action.reason, 300);
      if (action.playerId !== null) { const p = player(s, action.playerId); requireThat(p.status === 'active' && p.role === 'innocent', 'Choose an active Innocent or no murder.'); }
      currentRound(s).murderOverride = action.playerId; return;
    }
    case 'announce_murder': {
      requireThat(s.phase === 'murder_preview', 'Not ready for a murder announcement.');
      const r = currentRound(s); const result = resolveMurder(s);
      requireThat(!result.needsReview, 'The override target is unavailable. Review the private override before announcing.');
      r.murderResult = result; r.murderAnnounced = true;
      if (result.target) player(s, result.target).status = 'murdered';
      if (result.blockedBy) r.shields = r.shields.filter(id => id !== result.blockedBy);
      s.phase = 'murder_result'; return;
    }
    case 'recruit': {
      requireThat(s.phase === 'interlude' && s.recruitmentEligible && !s.recruitmentUsed && !s.finale, 'Normal Recruitment is unavailable.');
      requireThat(activePlayers(s).some(p => p.role === 'traitor'), 'No surviving Traitor can recruit.');
      requireThat(action.confirm === true, 'Confirm discreet paper distribution.'); cleanText(action.reason, 300);
      const p = player(s, action.playerId); requireThat(p.status === 'active' && p.role === 'innocent', 'Choose an active Innocent.');
      p.role = 'traitor'; s.recruitmentUsed = true; s.recruitmentEligible = false; return;
    }
    case 'enter_finale':
      requireThat(['minigame', 'discussion', 'interlude', 'tie_break', 'murder_preview', 'murder_result', 'banishment_result'].includes(s.phase) || (s.phase === 'vote_reveal' && currentBallot(s).revealed === currentBallot(s).revealOrder.length), 'Finish the open ballot and every public vote reveal before entering the Finale.');
      cleanText(action.reason, 300); beginFinale(s); return;
    default: requireThat(false, 'Unknown action.');
  }
}

export const currentBallot = s => s.ballots.find(b => b.id === s.currentBallotId);
const player = (s, id) => { const p = s.players.find(p => p.id === id); requireThat(p, 'Unknown player.'); return p; };
const tieKey = (s, id) => createHash('sha256').update(`${s.seed}:${s.round}:${id}`).digest('hex');
function setPaused(s, paused) {
  if (paused && s.timer.deadline) { s.timer.remaining = Math.max(0, Math.ceil((s.timer.deadline - Date.now()) / 1000)); s.timer.deadline = null; }
  if (!paused && s.paused && s.timer.remaining) s.timer.deadline = Date.now() + s.timer.remaining * 1000;
  s.paused = paused;
}
function newRound(s) {
  s.round++;
  s.rounds.push({ number: s.round, title: `Round ${s.round} mini-game`, scores: {}, shields: [], shieldAwards: [], banished: null, murderAnnounced: false });
  s.phase = 'minigame'; s.currentBallotId = null; s.recruitmentEligible = false;
}
function openBallot(s, kind, candidates = activePlayers(s).map(p => p.id), revote = false) {
  const ballot = { id: randomUUID(), round: s.round, kind, electorate: activePlayers(s).map(p => p.id), candidates,
    votes: {}, closed: false, revealOrder: [], revealed: 0, revote, finale: s.finale };
  s.ballots.push(ballot); s.currentBallotId = ballot.id;
  s.phase = kind === 'murder' ? 'murder_ballot' : kind === 'trust' ? 'finale_trust' : 'banishment_ballot';
}
function finish(s) {
  s.winner = activePlayers(s).some(p => p.role === 'traitor') ? 'traitors' : 'innocents'; s.phase = 'over'; s.currentBallotId = null; s.presentation.enabled = false;
}
function beginFinale(s) {
  s.finale = true; s.recruitmentEligible = false;
  if (activePlayers(s).length <= 2 || !activePlayers(s).some(p => p.role === 'traitor')) finish(s);
  else openBallot(s, 'trust');
}
function advance(s, action) {
  if (s.phase !== 'lobby' && !activePlayers(s).some(p => p.role === 'traitor')) { finish(s); return; }
  switch (s.phase) {
    case 'minigame': s.phase = 'shields'; return;
    case 'shields':
      requireThat(currentRound(s).shields.length >= s.settings.shields || (typeof action.reason === 'string' && action.reason.trim().length > 0), 'Allocate the configured Shields, or record why they are skipped.');
      openBallot(s, 'murder'); return;
    case 'discussion': openBallot(s, 'banishment'); return;
    case 'murder_ballot': case 'banishment_ballot': case 'finale_trust': return closeBallot(s, action);
    case 'vote_reveal': {
      const b = currentBallot(s); requireThat(b.revealed === b.revealOrder.length, 'Reveal every vote before proceeding.');
      const tally = {};
      for (const target of Object.values(b.votes)) if (target && player(s, target).status === 'active') tally[target] = (tally[target] || 0) + 1;
      const max = Math.max(0, ...Object.values(tally));
      const tied = max ? Object.keys(tally).filter(id => tally[id] === max) : b.candidates.filter(id => player(s, id).status === 'active');
      requireThat(tied.length, 'No eligible candidates. Review the departures and enter the Finale if needed.');
      if (tied.length === 1) banish(s, tied[0]);
      else if (!b.revote) openBallot(s, 'banishment', tied, true);
      else { b.tied = tied; s.phase = 'tie_break'; }
      return;
    }
    case 'banishment_result':
      if (s.finale || activePlayers(s).length <= s.settings.finaleAt) beginFinale(s);
      else s.phase = 'murder_preview';
      return;
    case 'murder_result':
      if (activePlayers(s).length <= s.settings.finaleAt) beginFinale(s); else s.phase = 'interlude';
      return;
    case 'interlude':
      if (activePlayers(s).length <= s.settings.finaleAt) beginFinale(s); else newRound(s);
      return;
    case 'finale_result':
      if (currentBallot(s).unanimous) finish(s); else openBallot(s, 'banishment');
      return;
    default: requireThat(false, 'Use the specific control for this phase.');
  }
}
function vote(s, a) {
  const b = currentBallot(s); const p = player(s, a.playerId);
  requireThat(b && b.id === a.ballotId && !b.closed, 'This ballot is closed.', 409);
  requireThat(p.status === 'active' && b.electorate.includes(p.id), 'You are not eligible for this ballot.', 403);
  requireThat(!Object.hasOwn(b.votes, p.id), 'Your ballot is already locked.', 409);
  if (b.kind === 'murder') {
    requireThat(Array.isArray(a.value) && a.value.length <= 5 && new Set(a.value).size === a.value.length, 'Rank up to five different players.');
    requireThat(a.value.every(id => id !== p.id && b.candidates.includes(id)), 'Choose eligible other players.');
  } else if (b.kind === 'banishment') requireThat(a.value !== p.id && b.candidates.includes(a.value), 'Choose an eligible other player.');
  else requireThat(['TRUST', 'TRAITOR'].includes(a.value), 'Choose TRUST or TRAITOR.');
  b.votes[p.id] = a.value;
}
function closeBallot(s, a) {
  const b = currentBallot(s); requireThat(b && !b.closed, 'No open ballot.');
  const missing = b.electorate.filter(id => !Object.hasOwn(b.votes, id));
  requireThat(!missing.length || a.force === true, `${missing.length} ballots are still missing.`);
  if (missing.length) {
    cleanText(a.reason, 300);
    for (const id of missing) b.votes[id] = b.kind === 'murder' ? [] : null;
    b.abstentions = missing;
  }
  b.closed = true;
  if (b.kind === 'murder') s.phase = 'discussion';
  else if (b.kind === 'trust') {
    b.unanimous = b.electorate.length > 0 && b.electorate.every(id => b.votes[id] === 'TRUST'); s.phase = 'finale_result';
  } else { b.revealOrder = [...b.electorate]; s.phase = 'vote_reveal'; }
}
function banish(s, id) {
  const p = player(s, id); requireThat(p.status === 'active', 'This player is unavailable.');
  p.status = 'banished'; p.revealedRole = p.role;
  currentRound(s).banished = p.id;
  currentRound(s).banishments ||= [];
  currentRound(s).banishments.push({ playerId: p.id, role: p.role, ballotId: s.currentBallotId });
  if (currentBallot(s)?.kind === 'banishment') currentBallot(s).result = { playerId: p.id, role: p.role };
  s.recruitmentEligible = !s.finale && !s.recruitmentUsed && p.role === 'traitor' && activePlayers(s).some(p => p.role === 'traitor');
  s.phase = 'banishment_result';
  if (!activePlayers(s).some(p => p.role === 'traitor')) finish(s);
}
export function resolveMurder(s) {
  const r = currentRound(s);
  const b = [...s.ballots].reverse().find(b => b.round === s.round && b.kind === 'murder' && b.closed);
  const traitors = activePlayers(s).filter(p => p.role === 'traitor');
  if (!traitors.length) return { target: null, blocked: false };
  if (Object.hasOwn(r, 'murderOverride')) {
    if (r.murderOverride === null) return { target: null, blocked: false };
    const p = player(s, r.murderOverride);
    if (p.status !== 'active' || p.role !== 'innocent') return { target: null, blocked: false, needsReview: true };
    return r.shields.includes(p.id) ? { target: null, blocked: true, blockedBy: p.id } : { target: p.id, blocked: false };
  }
  const candidates = activePlayers(s).filter(p => p.role === 'innocent').map(p => ({ id: p.id, rank: traitors.reduce((sum, t) => {
    const votes = b?.votes[t.id] || []; const index = votes.indexOf(p.id); return sum + (index < 0 ? 6 : index + 1);
  }, 0) })).sort((a, b) => a.rank - b.rank || tieKey(s, a.id).localeCompare(tieKey(s, b.id)));
  const target = candidates.find(p => !r.shields.includes(p.id));
  return target ? { target: target.id, blocked: false } : { target: null, blocked: candidates.length > 0, ...(candidates.length ? { blockedBy: candidates[0].id } : {}) };
}
export function shieldCandidates(s) {
  const r = currentRound(s); if (!r) return [];
  return s.players.filter(p => p.status === 'active' || (p.status === 'murdered' && p.role === 'innocent'))
    .filter(p => !r.shieldAwards.some(a => a.winnerId === p.id && r.shields.includes(a.recipientId)))
    .map(p => ({ id: p.id, points: r.scores[p.id] || 0 })).sort((a, b) => b.points - a.points);
}
function awardShield(s, a) {
  requireThat(s.phase === 'shields', 'Allocate Shields before opening predictions.');
  const r = currentRound(s); const p = player(s, a.winnerId); const recipient = player(s, a.recipientId);
  requireThat(p.status === 'active' || (p.status === 'murdered' && p.role === 'innocent'), 'Banished, retired and departed players cannot win or gift a Shield.');
  requireThat(recipient.status === 'active', 'Shield recipient must be active.');
  requireThat(r.shields.length < s.settings.shields, 'All configured Shields are allocated.');
  requireThat(!r.shields.includes(recipient.id), 'This player already has a Shield.');
  const candidates = shieldCandidates(s); const top = candidates[0]?.points;
  if (a.manual) cleanText(a.reason, 300);
  else {
    requireThat(candidates.some(c => c.id === p.id) && (r.scores[p.id] || 0) === top, 'Choose the highest eligible round scorer or record a manual override.');
    if (candidates.filter(c => c.points === top).length > 1) cleanText(a.reason, 300);
    requireThat(p.status === 'murdered' || p.id === recipient.id, 'An active winner receives their own Shield. Use a manual override for special games.');
  }
  r.shields.push(recipient.id); r.shieldAwards.push({ winnerId: p.id, recipientId: recipient.id, reason: a.reason || 'Highest eligible round scorer', manual: !!a.manual });
}
function score(s, a) {
  const r = s.rounds.find(r => r.number === a.round); requireThat(r, 'Choose an existing round.');
  requireThat(Array.isArray(a.playerIds) && a.playerIds.length > 0 && new Set(a.playerIds).size === a.playerIds.length, 'Choose players once each.');
  requireThat(['set', 'add'].includes(a.mode), 'Choose set or add.');
  requireThat(typeof a.points === 'number' && Number.isFinite(a.points) && Number.isInteger(a.points), 'Use whole-number points.');
  cleanText(a.reason, 300);
  for (const id of a.playerIds) {
    player(s, id); const value = a.mode === 'set' ? a.points : (r.scores[id] || 0) + a.points;
    requireThat(Math.abs(value) <= 1000000, 'Round score is out of range.'); r.scores[id] = value;
  }
}
function resolveDeparture(s, a) {
  const review = s.pendingDeparture; requireThat(review, 'No departure to review.');
  cleanText(a.reason, 300);
  requireThat(['cancel', 'retain', 'restart'].includes(a.policy), 'Choose cancel, retain, or restart.');
  if (a.policy === 'cancel') { s.pendingDeparture = null; setPaused(s, review.wasPaused); return; }
  const p = player(s, review.playerId); const b = currentBallot(s);
  if (a.policy === 'restart') requireThat(b && !b.closed && b.revealed === 0, 'Only an open unrevealed ballot can restart.');
  if (review.status === 'restore') {
    requireThat(['left', 'retired', 'murdered', 'banished'].includes(p.status), 'Player is already active.');
    p.status = p.previousStatus || 'active'; p.previousStatus = null;
  } else { p.previousStatus = p.status; p.status = review.status; }
  if (p.status !== 'active' && currentRound(s)) currentRound(s).shields = currentRound(s).shields.filter(id => id !== p.id);
  if (b && !b.closed) {
    if (a.policy === 'restart') {
      b.closed = true; b.superseded = true;
      openBallot(s, b.kind, b.candidates.filter(id => player(s, id).status === 'active'), b.revote);
    } else {
      // Keep submitted decisions; absent unsubmitted voters are removed. Closed/revealed ballots never change.
      b.electorate = b.electorate.filter(id => player(s, id).status === 'active' || Object.hasOwn(b.votes, id));
      b.candidates = b.candidates.filter(id => player(s, id).status === 'active');
    }
  }
  s.pendingDeparture = null;
  // Keep paused so the host can replace a departed Traitor and review Shields before resuming.
}
