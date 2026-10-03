import axios from "axios";
import { isIOSApp } from "./iosPlatform";
import { isLegacyPaymentRequest } from "./commercePolicy";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "https://tonyoga.com").replace(/\/+$/, "");
export const API_BASE = `${BACKEND_URL}/api`;

const TOKEN_KEY = "ty_auth_token";

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  // remember=true -> persist across browser restarts (localStorage);
  // remember=false -> current session only (sessionStorage).
  set: (t, remember = true) => {
    try {
      if (remember) { localStorage.setItem(TOKEN_KEY, t); sessionStorage.removeItem(TOKEN_KEY); }
      else { sessionStorage.setItem(TOKEN_KEY, t); localStorage.removeItem(TOKEN_KEY); }
    } catch {}
  },
  clear: () => {
    try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch {}
  },
};

export const api = axios.create({ baseURL: API_BASE, timeout: 20000 });

api.interceptors.request.use((cfg) => {
  if (isIOSApp() && isLegacyPaymentRequest(cfg.url)) {
    return Promise.reject(new Error("Use the iOS checkout shown on the product page. This payment route is not available in the iPhone/iPad app."));
  }
  const t = tokenStore.get();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
