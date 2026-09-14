import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShoppingBag, Tag } from "lucide-react";
import { cart } from "@/lib/cart";

/** Shared "buy the mat + book together & save" upsell card.
 *  Used on both the course page and the shop product page. */
export default function BundleOffer({ programId, programTitle, products, pct = 15, currency = "eur" }) {
  const navigate = useNavigate();
  const list = (products || []).filter((x) => x && (x.type ? x.type === "physical" : true));
  if (list.length < 2) return null;

  const cur = (currency || "eur").toLowerCase() === "usd" ? "$" : "€";
  const full = list.reduce((n, x) => n + (Number(x.price) || 0), 0);
  const savings = Math.round((full * pct) / 100 * 100) / 100;
  const bundlePrice = Math.round((full - savings) * 100) / 100;
  const money = (n) => (Number.isInteger(n) ? `${n}` : n.toFixed(2));

  const addBundle = () => {
    list.forEach((x) => cart.add(x, null, 1));
    cart.setPromo({ program_id: programId, label: `${programTitle} bundle`, pct, product_ids: list.map((x) => x.id) });
    toast.success(`Bundle added — you save ${cur}${money(savings)}`);
    navigate("/cart");
  };

  return (
    <div data-testid="bundle-upsell" className="rounded-3xl bg-[#F7F2EC] border border-[#E7D9CB] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-[#B25A45] flex items-center justify-center shrink-0">
          <Tag className="h-4 w-4 text-white" />
        </div>
        <div>
          <div className="eyebrow text-[#B25A45]">Complete your practice</div>
          <div className="serif text-xl leading-tight">Add the mat + book &amp; save {pct}%</div>
        </div>
      </div>

      <ul className="flex items-center gap-2" data-testid="bundle-items">
        {list.map((x, i) => (
          <li key={x.id} className="flex items-center gap-2">
            <div className="h-16 w-16 rounded-xl overflow-hidden bg-white border border-[#E5E6DF] shrink-0">
              {x.images?.[0] && <img src={x.images[0]} alt={x.title} className="h-full w-full object-cover" />}
            </div>
            {i < list.length - 1 && <span className="text-[#B25A45] text-lg font-semibold">+</span>}
          </li>
        ))}
      </ul>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-[#6B7269] line-through">{cur}{money(full)}</div>
          <div className="serif text-3xl text-[#1C221F]" data-testid="bundle-price">{cur}{money(bundlePrice)}</div>
        </div>
        <div className="text-xs font-bold uppercase tracking-widest text-[#839682]">Save {cur}{money(savings)}</div>
      </div>

      <button onClick={addBundle} data-testid="bundle-add" className="pill pill-primary w-full">
        <ShoppingBag className="h-4 w-4" /> Add bundle to cart
      </button>
    </div>
  );
}
