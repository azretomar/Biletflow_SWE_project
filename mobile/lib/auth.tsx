import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, setApiToken, setUnauthorizedHandler } from './api';
import { getItem, removeItem, setItem } from './storage';
import type { AuthResponse, Role, User } from './types';

const TOKEN_KEY = 'bf_token';

type AuthState = {
  user: User | null;
  // true until the saved token has been checked on app start
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (fullName: string, email: string, password: string, role: 'attendee' | 'organizer') => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    setApiToken(null);
    setUser(null);
    await removeItem(TOKEN_KEY);
  }, []);

  // Restore the session: a saved token is kept only if /api/me still accepts it.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void logout();
    });
    (async () => {
      const saved = await getItem(TOKEN_KEY);
      if (saved) {
        setApiToken(saved);
        try {
          setUser(await api<User>('/me'));
        } catch {
          await logout();
        }
      }
      setLoading(false);
    })();
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const startSession = useCallback(async ({ token, user }: AuthResponse) => {
    setApiToken(token);
    await setItem(TOKEN_KEY, token);
    setUser(user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      await startSession(await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }));
    },
    [startSession],
  );

  const signup = useCallback(
    async (fullName: string, email: string, password: string, role: 'attendee' | 'organizer') => {
      await startSession(
        await api<AuthResponse>('/auth/signup', {
          method: 'POST',
          body: { full_name: fullName, email, password, role },
        }),
      );
    },
    [startSession],
  );

  const value = useMemo(() => ({ user, loading, login, signup, logout }), [user, loading, login, signup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

// Which parts of the app each role sees (SRS 2.3).
export const canBrowseEvents = (role: Role) => role !== 'platform_admin';
export const canManageEvents = (role: Role) => role === 'organizer';
export const canCheckIn = (role: Role) => role === 'organizer' || role === 'event_admin';

// First tab after login.
export function startTab(role: Role): 'scanner' | 'manage' | 'profile' | 'events' {
  if (role === 'event_admin') return 'scanner';
  if (role === 'organizer') return 'manage';
  if (role === 'platform_admin') return 'profile';
  return 'events';
}
