import { useEffect, useState, useCallback } from "react";
import { api } from "./api";

let cache = null;
const listeners = new Set();

async function loadProviders() {
  try {
    const { data } = await api.get("/checkout/providers");
    cache = data;
    listeners.forEach((fn) => fn(data));
    return data;
  } catch {
    cache = { stripe: true, paypal: false };
    return cache;
  }
}

/** Hook returning {stripe: bool, paypal: bool, ready: bool}. */
export function usePaymentProviders() {
  const [state, setState] = useState(cache || { stripe: true, paypal: false, ready: !!cache });

  useEffect(() => {
    if (cache) { setState({ ...cache, ready: true }); return; }
    let live = true;
    loadProviders().then((d) => { if (live) setState({ ...d, ready: true }); });
    const sub = (d) => setState({ ...d, ready: true });
    listeners.add(sub);
    return () => { live = false; listeners.delete(sub); };
  }, []);

  return state;
}
