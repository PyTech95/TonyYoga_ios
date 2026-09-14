import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";

export default function InstallPrompt() {
  const [evt, setEvt] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setEvt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    // Persist dismissal for 3 days
    const flag = sessionStorage.getItem("ty_install_dismissed");
    if (flag) setDismissed(true);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!evt || dismissed) return null;

  const install = async () => {
    evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome !== "dismissed") setDismissed(true);
    setEvt(null);
  };

  const close = () => {
    sessionStorage.setItem("ty_install_dismissed", "1");
    setDismissed(true);
  };

  return (
    <div
      data-testid="install-prompt"
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md rounded-2xl bg-[#1C221F] text-[#FAFAF7] shadow-xl px-4 py-3 flex items-center gap-3 animate-fade-up"
    >
      <div className="h-9 w-9 rounded-full overflow-hidden shrink-0 bg-white">
        <img src="/brand/logo.png" alt="" className="h-full w-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">Install Tony Yoga</div>
        <div className="text-[11px] text-white/60">Add to home screen — practice anywhere.</div>
      </div>
      <button
        onClick={install}
        data-testid="install-prompt-install"
        className="text-xs font-semibold bg-[#B25A45] hover:bg-[#8F4535] px-3 py-1.5 rounded-full transition"
      >
        Install
      </button>
      <button onClick={close} data-testid="install-prompt-close" aria-label="Close" className="text-white/60 hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
