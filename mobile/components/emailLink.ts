// The verify-email and reset-password emails contain a website link like
// https://.../reset-password?token=XXXX. On the phone the user pastes that link (or just the
// token) into the app; this takes the token out of it. Returns "" when nothing fits.
export function tokenFromLink(input: string): string {
  const text = input.trim();
  const fromLink = /[?&]token=([A-Za-z0-9_-]+)/.exec(text);
  if (fromLink) return fromLink[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : '';
}
