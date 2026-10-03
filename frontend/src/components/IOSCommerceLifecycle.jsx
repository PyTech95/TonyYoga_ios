import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { isIOSApp } from "@/lib/iosPlatform";
import { AppleCommerce, restoreApplePurchases, checkIOSExternalCheckout } from "@/lib/iosCommerce";

export default function IOSCommerceLifecycle() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!isIOSApp() || !user) return;
    let disposed = false;
    const handles = [];
    let running = false;
    const resume = async () => {
      if (running || disposed) return;
      running = true;
      try {
        await restoreApplePurchases(false);
        await checkIOSExternalCheckout();
        await refresh();
      } catch { /* No access is granted on network errors; allow an explicit retry. */ }
      finally { running = false; }
    };
    for (const name of ["appActive", "transactionUpdated"]) {
      AppleCommerce.addListener(name, resume).then(h => { if (disposed) h.remove(); else handles.push(h); }).catch(() => {});
    }
    const onVisibility = () => { if (document.visibilityState === "visible") resume(); };
    const onReturn = () => { navigate("/profile"); resume(); };
    window.addEventListener("tonyoga-checkout-return", onReturn);
    document.addEventListener("visibilitychange", onVisibility);
    resume();
    return () => { disposed = true; handles.forEach(h => h.remove()); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("tonyoga-checkout-return", onReturn); };
  }, [user?.id, refresh, navigate]);
  return null;
}
