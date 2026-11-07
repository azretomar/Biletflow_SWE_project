import { createContext, useContext, useState } from "react";
import { api, getToken, setToken, clearToken } from "./api";

const USER_KEY = "bf_user";
const AuthContext = createContext(null);

function readUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (getToken() ? readUser() : null));

  function save(data) {
    setToken(data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  async function login(email, password) {
    const data = await api("/auth/login", { method: "POST", body: { email, password } });
    return save(data);
  }

  async function signup(fullName, email, password, role) {
    const data = await api("/auth/signup", {
      method: "POST",
      body: { full_name: fullName, email, password, role },
    });
    return save(data);
  }

  function logout() {
    clearToken();
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}