export function tokenFromLink(input: string): string {
  const text = input.trim();
  const fromLink = /[?&]token=([A-Za-z0-9_-]+)/.exec(text);
  if (fromLink) return fromLink[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : '';
}
