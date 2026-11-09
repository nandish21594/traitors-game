import { $, esc, api, avatar, phaseNames, statusNames, clockMarkup, tick, toast } from './common.js';
import qrcode from './vendor/qrcode.mjs';
import { renderPdf } from './pdf-viewer.js';
let state, assets = [], revision = -1;
const app = $('#app');
const player = id => state.players.find(p => p.id === id);
function render() {
  const s = state;
  let body = `<section class="round-heading"><div><p class="eyebrow">${s.round ? `ROUND ${String(s.round).padStart(2, '0')} / THE GATHERING` : 'WELCOME TO THE GATHERING'}</p><h1>${esc(phaseNames[s.phase])}${s.paused ? ' <span class="paused-label">Paused</span>' : ''}</h1><p>${esc(s.title)}</p></div>${clockMarkup(s.timer)}</section>`;
  if (s.phase === 'over' && s.display !== 'leaderboard') {
    const leaders = [...s.players].sort((a,b) => b.totalPoints - a.totalPoints);
    const top = leaders.filter(p => p.totalPoints === leaders[0]?.totalPoints);
    body += `<section class="dramatic finale"><div class="ornament">✺</div><p class="eyebrow">THE SECRETS COME OUT</p><h2>${s.winner === 'innocents' ? 'Innocents' : 'Traitors'} win.</h2><p class="intro">${top.map(p => esc(p.name)).join(' & ')} ${top.length === 1 ? 'is' : 'are'} the offline games ${top.length === 1 ? 'champion' : 'champions'} · ${top[0]?.totalPoints || 0} points</p><div class="finale-roles">${s.players.filter(p => p.status === 'active').map(p => `<div>${avatar(p,'small')}<strong>${esc(p.name)}</strong><span class="role-pill ${p.revealedRole}">${esc(p.revealedRole)}</span></div>`).join('')}</div></section>`;
  } else if (s.phase === 'vote_reveal' || s.phase === 'tie_break') {
    const latest = s.reveal.at(-1); const tally = {};
    for (const v of s.reveal) if (v.target) tally[v.target] = (tally[v.target] || 0) + 1;
    body += `<section class="reveal-stage"><div class="reveal-focus">${latest ? `${avatar(player(latest.voter), 'hero')}<p class="eyebrow">${esc(player(latest.voter)?.name)} VOTED FOR</p><h2>${esc(latest.target ? player(latest.target)?.name : 'Abstention')}</h2><p class="muted">The host asks: “What led you to that decision?”</p>` : '<div class="ornament">✺</div><h2>Every vote.<br>Every reason.</h2><p>The host will reveal each decision.</p>'}<span class="badge">${s.reveal.length} / ${s.revealTotal} VOTES REVEALED</span></div><div class="vote-ledger"><p class="eyebrow">THE TABLE’S DECISIONS</p>${s.reveal.map((v,i) => `<div class="vote-line"><span class="muted">${String(i+1).padStart(2,'0')}</span><span>${esc(player(v.voter)?.name)}</span><span>→</span><strong>${esc(v.target ? player(v.target)?.name : 'Abstention')}</strong></div>`).join('') || '<p class="muted">Waiting for the first reveal…</p>'}<div class="tally">${Object.entries(tally).map(([id, n]) => `<span>${esc(player(id)?.name)} <b>${n}</b></span>`).join('')}</div></div></section>`;
  } else if (s.phase === 'banishment_result') {
    const p = player(s.banished);
    body += `<section class="dramatic">${p ? avatar(p, 'hero') : ''}<p class="eyebrow">THE TABLE HAS SPOKEN</p><h2>${esc(p?.name)} is banished.</h2><p class="role-reveal">${esc(p?.revealedRole === 'traitor' ? 'A Traitor stood among you.' : 'An Innocent leaves the table.')}</p></section>`;
  } else if (s.phase === 'murder_result') {
    const victim = player(s.murder?.target);
    body += `<section class="dramatic">${victim ? avatar(victim, 'hero') : '<div class="ornament">✺</div>'}<p class="eyebrow">ROUND ${s.round} / MURDER ANNOUNCEMENT</p><h2>${victim ? `${esc(victim.name)} was murdered.` : s.murder?.blocked ? 'A Shield stopped the murder.' : 'Everyone survives the round.'}</h2><p>${victim ? 'Still part of the celebration. Still playing for points.' : 'No one is murdered this round.'}</p></section>`;
  } else if (s.presentation.enabled && s.presentation.assets.length) {
    const id = s.presentation.assets[s.presentation.index]; const asset = assets.find(a => a.id === id);
    body += `<section class="presentation-stage">${asset?.mime === 'application/pdf' ? '<div id="pdf-stage" class="pdf-stage"></div>' : `<img src="/media/${id}" alt="${esc(asset?.name || 'Mini-game clue')}">`}${s.presentation.revealed ? `<div class="answer-reveal"><span class="eyebrow">THE ANSWER</span><h2>${esc(s.presentation.answer || 'Answer revealed by your host')}</h2></div>` : ''}</section><p class="small muted center">SLIDE ${s.presentation.index + 1} / ${s.presentation.assets.length}${asset?.mime === 'application/pdf' ? ` · PDF PAGE ${s.presentation.page}` : ''}</p>`;
  } else if (s.display === 'leaderboard') {
    body += `<section class="leaderboards">${['roundPoints','totalPoints'].map((field,i) => `<div class="panel"><p class="eyebrow">${i ? 'THE WHOLE CELEBRATION' : `ROUND ${s.round || '—'}`}</p><h2>${i ? 'Overall leaderboard' : 'Round leaderboard'}</h2>${[...s.players].sort((a,b) => b[field] - a[field] || a.name.localeCompare(b.name)).map((p,index) => `<div class="leaderboard-line"><span class="rank">${String(index+1).padStart(2,'0')}</span>${avatar(p,'tiny')}<span>${esc(p.name)}<small>${esc(statusNames[p.status])}</small></span><strong>${p[field]}</strong></div>`).join('')}</div>`).join('')}</section>`;
  } else {
    if (s.phase === 'lobby') body += `<section class="public-join"><div id="public-qr"></div><div><p class="eyebrow">YOUR PLACE AT THE TABLE</p><h2>Scan. Enter your code. Settle in.</h2><p>${esc(s.joinUrl)}</p></div><img src="/seal.svg" alt="" width="70" height="70"></section>`;
    body += `<div class="gallery-heading"><p class="eyebrow">FAMILIAR FACES. HIDDEN LOYALTIES.</p><span>${s.players.filter(p => p.status === 'active').length} AT THE TABLE <span class="separator">/</span> ${s.players.length} IN THE GATHERING</span></div><section class="player-gallery">${s.players.map(p => `<article class="portrait-card ${p.status !== 'active' ? 'eliminated' : ''}"><div class="portrait-art">${avatar(p)}${p.shield ? '<span class="shield-mark" title="Shield">♜</span>' : ''}<span class="portrait-status">${esc(statusNames[p.status])}</span></div><div class="portrait-caption"><h2>${esc(p.name)}</h2><div><strong>${p.roundPoints}</strong><span>ROUND</span><strong>${p.totalPoints}</strong><span>OVERALL</span></div></div>${p.revealedRole ? `<span class="known-role">${esc(p.revealedRole)}</span>` : ''}</article>`).join('') || '<div class="empty-gathering"><div class="ornament">✺</div><h2>The table is being set.</h2><p>Your host will welcome the players shortly.</p></div>'}</section>`;
  }
  body += '<footer class="projector-footer"><span>EVERY SEAT HOLDS A SECRET.</span><span>TRAITORS · THE GATHERING</span></footer>';
  app.innerHTML = body; tick();
  if ($('#pdf-stage')) renderPdf($('#pdf-stage'), s.presentation.assets[s.presentation.index], s.presentation.page);
  if ($('#public-qr')) { const qr = qrcode(0, 'M'); qr.addData(s.joinUrl); qr.make(); $('#public-qr').innerHTML = qr.createSvgTag({ cellSize: 3, margin: 12, scalable: true }); }
}
async function refresh() {
  try {
    const s = await api('/api/public'); $('#connection').textContent = 'LIVE FROM THE ROOM';
    if (revision !== s.revision) { assets = await api('/api/media'); state = s; revision = s.revision; render(); }
  } catch { $('#connection').textContent = 'RECONNECTING · DISPLAY PRESERVED'; }
}
$('#fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { toast('Use your browser’s fullscreen command.'); }
});
await refresh(); setInterval(refresh, 2000);
let resizeTimer;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if ($('#pdf-stage') && state) render(); }, 200); });
