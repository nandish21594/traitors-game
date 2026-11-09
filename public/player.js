import { $, esc, api, toast, avatar, options, phaseNames, statusNames, clockMarkup, tick, encodeFile, idempotencyKey } from './common.js';
let state, ranking = [], ballotId, takeover = false, busy = false, renderedRevision = -1;
const app = $('#app');
function login() {
  app.innerHTML = `<div class="phone-ornament" aria-hidden="true">✺</div><p class="eyebrow">YOUR INVITATION AWAITS</p><h1>Take your<br><em>place.</em></h1><p class="muted">Enter the six-digit code from your host.<br>Your place stays yours if you reconnect.</p><form id="join-form" class="stack"><label>Your player code<input class="code-input" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="off" placeholder="000000"></label><div id="takeover" class="notice" ${takeover ? '' : 'hidden'}>This code already has a phone session.<label class="check"><input type="checkbox" name="replace"> Replace that session with this phone</label></div><button class="primary large">Join the gathering ↗</button></form><p class="small muted">Keep this code private. Folded cards carry your role; your phone is only for decisions.</p>`;
}
function render() {
  const s = state, p = s.me;
  renderedRevision = s.revision;
  if (s.ballot?.id !== ballotId) { ranking = []; ballotId = s.ballot?.id; }
  const eligible = p.status === 'active';
  let content = `<div class="player-greeting">${avatar(p, 'small')}<div><p class="eyebrow">WELCOME BACK</p><h2>${esc(p.name)}</h2></div><button class="text-button" data-action="logout">Sign out</button></div><div class="phase-ticket"><span class="eyebrow">${s.round ? `ROUND ${s.round.toString().padStart(2, '0')}` : 'BEFORE WE BEGIN'}</span>${clockMarkup(s.timer)}<h1>${esc(phaseNames[s.phase])}</h1><p>${esc(s.title)}</p></div>`;
  if (s.paused) content += `<div class="notice">The gathering is paused. Your submitted decisions are safe. Follow your host’s instructions.</div>`;
  if (!eligible) content += `<section class="panel"><span class="badge">${esc(statusNames[p.status])}</span><h2>Your story continues.</h2><p>${p.status === 'murdered' ? 'Keep playing the offline mini-games for points. Please sit out role discussion and private decisions. If you win a Shield, gift it through your host.' : 'Keep following the gathering. Only active players take part in private decisions.'}</p></section>`;
  const b = s.ballot;
  if (eligible && b && !s.paused) {
    if (b.submitted) content += `<section class="panel locked"><div class="seal">✓</div><h2>Decision sealed.</h2><p>Your ballot is locked. Put your phone down and enjoy the room.</p></section>`;
    else if (b.kind === 'murder') {
      ranking = ranking.filter(id => b.candidates.some(p => p.id === id));
      content += `<section class="panel"><p class="eyebrow">PRIVATE DECISION</p><h2>Predict Round ${s.round}’s Murder</h2><p>Rank up to five other players, most likely first. Everyone uses this same ballot.</p><ol class="ranking">${ranking.map((id, i) => `<li><span>${i + 1}</span>${esc(b.candidates.find(p => p.id === id)?.name)}<button class="icon-button" data-remove="${esc(id)}" aria-label="Remove rank ${i + 1}">×</button></li>`).join('')}</ol><div class="candidate-grid">${b.candidates.map(p => `<button class="candidate ${ranking.includes(p.id) ? 'selected' : ''}" data-rank="${esc(p.id)}" ${ranking.includes(p.id) || ranking.length >= 5 ? 'disabled' : ''}>${esc(p.name)} <span>+</span></button>`).join('')}</div><button class="primary wide" data-action="vote-murder">Seal ${ranking.length ? 'my predictions' : 'an empty prediction'}</button></section>`;
    } else if (b.kind === 'banishment') content += `<section class="panel"><p class="eyebrow">RING OF DOUBT</p><h2>Who has your vote?</h2><p>Choose one player. Every person’s vote will be revealed to the room. Your host will ask for your reasoning.</p><form id="banish-form" class="stack"><label>Your banishment vote<select name="target" required><option value="">Choose a player…</option>${options(b.candidates)}</select></label><button class="primary">Seal my vote</button></form></section>`;
    else content += `<section class="panel"><p class="eyebrow">FINALE</p><h2>Trust the table?</h2><p>Unanimous TRUST ends the game. Any TRAITOR choice calls for another banishment.</p><div class="trust-buttons"><button class="primary" data-trust="TRUST">TRUST<span>End the game</span></button><button class="secondary" data-trust="TRAITOR">TRAITOR<span>Keep banishing</span></button></div></section>`;
  } else if (eligible && s.phase !== 'over') content += `<section class="panel quiet"><div class="seal">✺</div><h2>Be here. Be observant.</h2><p>Your host will guide the next step. Private decisions appear here when it is time.</p></section>`;
  if (s.phase === 'over') content += `<section class="panel"><p class="eyebrow">THE FINAL REVEAL</p><h2>${s.winner === 'innocents' ? 'Innocents' : 'Traitors'} win.</h2><p>The offline games have their own champion. See the public leaderboard.</p></section>`;
  content += `<details class="panel profile"><summary>Your portrait & points</summary><div class="score-pair"><div><strong>${s.players.find(x => x.id === p.id)?.roundPoints || 0}</strong><span>ROUND POINTS</span></div><div><strong>${s.players.find(x => x.id === p.id)?.totalPoints || 0}</strong><span>OVERALL POINTS</span></div></div><label>Upload a selfie or an existing photo<input type="file" id="photo" accept="image/jpeg,image/png,image/webp"></label><p class="small muted">Optional. Your portrait appears on the projector. File upload works on LAN HTTP; direct camera access may require HTTPS.</p></details><footer class="phone-footer">EVERY SEAT HOLDS A SECRET.</footer>`;
  app.innerHTML = content; tick();
}
async function refresh(force = false) {
  try {
    const next = await api('/api/player/state'); const changed = renderedRevision !== next.revision; state = next;
    if ((changed || force) && !['INPUT','SELECT'].includes(document.activeElement.tagName)) render();
  } catch (e) { if (e.status === 401) { state = null; if (!$('#join-form')) login(); } else toast('Connection interrupted. Retrying; your place is saved.', true); }
}
async function submit(value) {
  if (busy) return; busy = true;
  try { await api('/api/player/vote', { ballotId, value, requestId: idempotencyKey() }); await refresh(true); }
  catch (e) { toast(e.message, true); await refresh(); } finally { busy = false; }
}
app.addEventListener('submit', async e => {
  e.preventDefault(); if (busy) return;
  const form = e.target; const data = new FormData(form);
  if (form.id === 'join-form') {
    busy = true;
    try { await api('/api/player/login', { code: data.get('code'), takeover: data.get('replace') === 'on' }); document.activeElement.blur(); await refresh(true); }
    catch (e) { if (e.status === 409) { takeover = true; $('#takeover').hidden = false; } toast(e.message, true); }
    finally { busy = false; }
  } else if (form.id === 'banish-form') { document.activeElement.blur(); await submit(data.get('target')); }
});
app.addEventListener('click', async e => {
  const node = e.target.closest('button'); if (!node) return;
  if (node.dataset.rank) { ranking.push(node.dataset.rank); render(); }
  if (node.dataset.remove) { ranking = ranking.filter(id => id !== node.dataset.remove); render(); }
  if (node.dataset.action === 'vote-murder') await submit([...ranking]);
  if (node.dataset.trust) await submit(node.dataset.trust);
  if (node.dataset.action === 'logout') { try { await api('/api/player/logout', {}); state = null; takeover = false; login(); } catch(e) { toast(e.message, true); } }
});
app.addEventListener('change', async e => {
  if (e.target.id !== 'photo' || !e.target.files[0]) return;
  try { toast('Preparing your portrait…'); await api('/api/player/upload', await encodeFile(e.target.files[0], true)); document.activeElement.blur(); await refresh(true); toast('Portrait saved.'); } catch (e) { toast(e.message, true); }
});
await refresh(true); setInterval(refresh, 2000);
