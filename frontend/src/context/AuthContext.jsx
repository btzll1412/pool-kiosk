import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { login as apiLogin, logout as apiLogout, isAuthenticated } from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authed, setAuthed] = useState(isAuthenticated);

  const login = useCallback(async (username, password) => {
    await apiLogin(username, password);
    setAuthed(true);
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setAuthed(false);
  }, []);

  // Called after successful setup - tokens are already stored by setupAdmin
  const setAuthedFromSetup = useCallback(() => {
    setAuthed(true);
  }, []);

  const value = useMemo(
    () => ({ authed, login, logout, setAuthedFromSetup }),
    [authed, login, logout, setAuthedFromSetup]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
