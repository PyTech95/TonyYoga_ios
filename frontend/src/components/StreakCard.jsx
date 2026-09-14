import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flame } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function StreakCard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [s, setS] = useState(null);

  useEffect(() => {
    if (!user) return;
    api.get("/practice/streak").then(({ data }) => setS(data)).catch(() => setS(null));
  }, [user]);

  if (!user || !s) return null;

  return (
    <Link
      to="/streak"
      data-testid="streak-card"
      className="block rounded-3xl bg-white border border-[#E5E6DF] p-5 hover:border-[#B25A45] transition"
    >
      <div className="flex items-center gap-4">
        <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${s.current_streak > 0 ? "bg-[#1C221F]" : "bg-[#F2F2EC]"}`}>
          <Flame className={`h-6 w-6 ${s.current_streak > 0 ? "text-[#B25A45]" : "text-[#839682]"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{t("streak.label")}</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="serif text-3xl leading-none" data-testid="streak-card-count">{s.current_streak}</span>
            <span className="text-xs text-[#6B7269]">{s.current_streak === 1 ? t("streak.day") : t("streak.days")}</span>
          </div>
          {s.next_milestone ? (
            <div className="text-[11px] text-[#6B7269] mt-1">
              {s.next_milestone - s.current_streak} {t("streak.more_to")} {s.next_milestone === 7 ? t("streak.one_week") : s.next_milestone === 30 ? t("streak.one_month") : `${s.next_milestone} ${t("streak.days")}`}
            </div>
          ) : (
            <div className="text-[11px] text-[#B25A45] mt-1">{t("streak.all_unlocked")}</div>
          )}
        </div>
        {!s.practiced_today && (
          <div className="text-xs font-semibold text-[#B25A45] shrink-0">{t("streak.log")}</div>
        )}
      </div>
    </Link>
  );
}
