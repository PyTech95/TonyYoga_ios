import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Gift-card credit nudge — shows the logged-in shopper their available store
 * credit and reminds them it can be applied at checkout. Renders nothing when
 * there's no credit or for staff accounts.
 */
export default function CreditNudge({ className = "", testId = "credit-nudge" }) {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "instructor";
  const [credit, setCredit] = useState(0);

  useEffect(() => {
    if (!user || isStaff) { setCredit(0); return; }
    api.get("/me/store-credit")
      .then(({ data }) => setCredit(Number(data?.store_credit || 0)))
      .catch(() => setCredit(0));
  }, [user, isStaff]);

  if (!user || isStaff || credit <= 0) return null;

  return (
    <div
      data-testid={testId}
      className={`flex items-center gap-3 rounded-2xl border border-[#E0D3B8] bg-[#FBF6EC] px-4 py-3 ${className}`}
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#B25A45]/12 shrink-0">
        <Gift className="h-4 w-4 text-[#B25A45]" />
      </span>
      <div className="text-[13px] text-[#5C5346] leading-snug">
        You have <span className="font-bold text-[#1C221F]">€{credit.toFixed(2)}</span> gift-card credit
        <span className="text-[#6B7269]"> — apply it at checkout.</span>
      </div>
    </div>
  );
}
