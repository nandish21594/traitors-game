export const $ = (selector, parent = document) => parent.querySelector(selector);
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const phaseNames = { lobby: 'The gathering', minigame: 'Mini-game', shields: 'Shield allocation', murder_ballot: 'Murder predictions', discussion: 'Ring of Doubt', banishment_ballot: 'Banishment ballot', vote_reveal: 'The votes are in', tie_break: 'A divided table', banishment_result: 'Banishment', murder_preview: 'An announcement awaits', murder_result: 'Murder announcement', interlude: 'Round interlude', finale_trust: 'Finale · Trust or Traitor', finale_result: 'The table has decided', over: 'The final reveal' };
export const statusNames = { active: 'At the table', murdered: 'Murdered', banished: 'Banished', left: 'Left Party', retired: 'Retired' };
export async function api(path, body) {
  const response = await fetch(path, { ...(body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Party-Request': '1' }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || 'Request failed.'); error.status = response.status; throw error; }
  return result;
}
let toastTimer;
export function toast(message, error = false) {
  const node = $('#toast'); node.textContent = message; node.className = error ? 'show error' : 'show'; clearTimeout(toastTimer); toastTimer = setTimeout(() => node.className = '', 6500);
}
export function avatar(p, size = '') {
  return `<div class="avatar ${size} hue-${(p.name.charCodeAt(0) + p.name.length) % 6}">${p.photo ? `<img src="/media/${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">` : `<span aria-hidden="true">${esc(p.name.split(/\s+/).map(n => n[0]).slice(0, 2).join(''))}</span>`}</div>`;
}
export function options(players, selected) { return players.map(p => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}${p.status && p.status !== 'active' ? ` · ${statusNames[p.status]}` : ''}</option>`).join(''); }
export function clockMarkup(timer) { return `<span class="timer" data-deadline="${timer.deadline || ''}" data-remaining="${timer.remaining || 0}">--:--</span>`; }
export function tick() {
  document.querySelectorAll('.timer').forEach(node => {
    const n = node.dataset.deadline ? Math.max(0, Math.ceil((Number(node.dataset.deadline) - Date.now()) / 1000)) : Number(node.dataset.remaining);
    node.textContent = `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;
    node.classList.toggle('expired', n === 0 && !!node.dataset.deadline);
  });
}
setInterval(tick, 500);
export async function encodeFile(file, compress = false) {
  if (compress && file.type.startsWith('image/')) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas'); const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    return { name: file.name.slice(0, 90) + '.jpg', mime: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.82).split(',')[1] };
  }
  const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
  return { name: file.name.slice(0, 100), mime: file.type, data };
}
export const idempotencyKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
