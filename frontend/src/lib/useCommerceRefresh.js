import { useEffect, useRef } from "react";
import { COMMERCE_UPDATED } from "./iosCommerce";
// Keep the newest callback without repeatedly subscribing to events.
export function useCommerceRefresh(callback) {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    const update = () => { Promise.resolve(ref.current?.()).catch(() => {}); };
    window.addEventListener(COMMERCE_UPDATED, update);
    return () => window.removeEventListener(COMMERCE_UPDATED, update);
  }, []);
}
