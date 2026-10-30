import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, tokenStore } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [networkError, setNetworkError] = useState(false);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setUser(null); setReady(true); return; }
    setNetworkError(false);
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (error) {
      if ([401, 403].includes(error?.response?.status)) { tokenStore.clear(); setUser(null); }
      else setNetworkError(true);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password, remember = true) => {
    const { data } = await api.post("/auth/login", { email, password, remember });
    tokenStore.set(data.token, remember);
    setUser(data.user);
    return data.user;
  };

  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    tokenStore.set(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    tokenStore.clear();
    try {
      sessionStorage.removeItem("tonyoga_pending_checkout");
      sessionStorage.removeItem("tonyoga_ai_consent_v1");
      // The assistant conversation may hold this account's details: never show it to the next person.
      ["ty_assistant_session", "ty_assistant_messages", "ty_assistant_owner"].forEach((k) => sessionStorage.removeItem(k));
    } catch {}
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, ready, networkError, login, register, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
