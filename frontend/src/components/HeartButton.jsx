import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";

export default function HeartButton({ targetType, targetId, size = "md" }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !targetId) return;
    api.get("/wishlist/status", { params: { target_type: targetType, target_id: targetId } })
      .then(({ data }) => setOn(!!data.favorited))
      .catch(() => {});
  }, [user, targetType, targetId]);

  const toggle = async (e) => {
    e?.preventDefault(); e?.stopPropagation();
    if (!user) { toast("Sign in to save."); nav("/login"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/wishlist/toggle", { target_type: targetType, target_id: targetId });
      setOn(!!data.favorited);
      toast(data.favorited ? "Saved to wishlist." : "Removed from wishlist.");
    } catch { toast.error("Could not update"); }
    finally { setBusy(false); }
  };

  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const icon = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <button
      onClick={toggle}
      disabled={busy}
      data-testid={`heart-${targetType}-${targetId}`}
      aria-label={on ? "Remove from wishlist" : "Save to wishlist"}
      className={`${dim} rounded-full flex items-center justify-center border transition ${on ? "bg-[#B25A45] border-[#B25A45]" : "bg-white border-[#E5E6DF] hover:border-[#B25A45]"}`}
    >
      <Heart className={`${icon} ${on ? "text-white fill-white" : "text-[#B25A45]"}`} strokeWidth={1.8} />
    </button>
  );
}
