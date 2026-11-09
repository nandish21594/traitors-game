export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function requireThat(condition, message, status = 400) {
  if (!condition) throw new GameError(message, status);
}
export function cleanText(value, max = 100) {
  requireThat(typeof value === 'string', 'Text is required.');
  const text = value.trim();
  requireThat(text.length > 0 && text.length <= max, `Use 1–${max} characters.`);
  return text;
}
