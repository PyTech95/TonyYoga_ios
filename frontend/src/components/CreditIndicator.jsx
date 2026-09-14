import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Subtle top-nav reminder that gift-card credit is waiting. Links to the shop.
 * Renders nothing for guests, staff, or members with no credit.
 */
export default function CreditIndicator() {
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
    <Link
      to="/shop"
      data-testid="nav-credit-indicator"
      title="Gift-card credit — apply it at checkout"
      className="inline-flex items-center gap-1.5 rounded-full border border-[#E0D3B8] bg-[#FBF6EC] pl-2 pr-3 py-1.5 text-[12px] font-semibold text-[#5C5346] shadow-sm hover:bg-[#F5EDDD] transition-colors"
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#B25A45]/12">
        <Gift className="h-3 w-3 text-[#B25A45]" />
      </span>
      €{credit.toFixed(2)}
    </Link>
  );
}
