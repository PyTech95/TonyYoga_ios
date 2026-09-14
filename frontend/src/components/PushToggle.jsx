import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";
import { getPushState, subscribePush, unsubscribePush, pushSupported } from "@/lib/push";

export default function PushToggle() {
  const [state, setState] = useState({ supported: false });
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try { setState(await getPushState()); } catch { setState({ supported: false }); }
  };

  useEffect(() => { refresh(); }, []);

  if (!pushSupported()) {
    return (
      <div className="rounded-2xl bg-[#F2F2EC] p-4 text-xs text-[#6B7269]">
        Push notifications aren't supported on this browser. Install the app to your home screen to enable them.
      </div>
    );
  }

  const toggle = async () => {
    setBusy(true);
    try {
      if (state.subscribed) {
        await unsubscribePush();
        toast.success("Reminders off.");
      } else {
        await subscribePush();
        toast.success("Reminders on — we'll ping you 30 min before class.");
      }
      await refresh();
    } catch (e) {
      toast.error(e.message || "Could not update reminders");
    } finally { setBusy(false); }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy || state.permission === "denied"}
      data-testid="push-toggle"
      className="w-full rounded-2xl bg-white border border-[#E5E6DF] p-4 flex items-center gap-3 hover:border-[#B25A45] transition text-left disabled:opacity-60"
    >
      <div className="h-10 w-10 rounded-full bg-[#F2F2EC] flex items-center justify-center shrink-0">
        {state.subscribed ? <Bell className="h-4 w-4 text-[#B25A45]" /> : <BellOff className="h-4 w-4 text-[#839682]" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">Class reminders</div>
        <div className="text-xs text-[#6B7269] mt-0.5">
          {state.permission === "denied"
            ? "Blocked in browser settings"
            : state.subscribed
            ? "On — 30 min before each class"
            : "Off — turn on to get a ping before class"}
        </div>
      </div>
      <div className="text-xs font-semibold text-[#B25A45] shrink-0">{state.subscribed ? "On" : "Enable"}</div>
    </button>
  );
}
