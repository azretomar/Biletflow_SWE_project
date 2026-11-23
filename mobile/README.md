# BiletFlow Mobile

React Native (Expo SDK 58) + TypeScript app for attendees, organizers and event staff.
The platform admin portal stays on the website (SRS 2.1).

## Run on an iPhone

1. Start the backend from the repo root: `docker compose up -d --build db backend`
2. Install **Expo Go** from the App Store. Phone and laptop must be on the same Wi-Fi.
3. In `mobile/`:

```bash
npm install
cp .env.example .env    # set EXPO_PUBLIC_API_URL to http://<laptop Wi-Fi IP>:8080
npx expo start          # scan the QR code with the iPhone camera
```

On a phone `localhost` is the phone itself, so the API URL must use the laptop's IP (`ipconfig`, IPv4 Address).
The web build (`npm run web`) cannot call the API because the backend has no CORS; test on a phone.

## Structure

- `app/` screens (expo-router: one file = one route). `(app)/` is everything after login; tabs depend on the role.
- `lib/api.ts` the only way to call the backend: `api<T>('/path', { method, body })`.
- `lib/auth.tsx` `useAuth()`: `user`, `login`, `signup`, `logout`. The token is stored in the iOS Keychain.
- `lib/types.ts` backend response types.
- `i18n/` UI text in Kazakh, Russian and English. Never hard-code text: use `t('section.key')` and add the key to all three files.
- `components/ui.tsx` shared UI (Screen, Field, Button, ErrorText, Loading), `constants/theme.ts` colors.

## Before a pull request

```bash
npm run typecheck
```
