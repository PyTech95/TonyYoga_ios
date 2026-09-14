import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";

// Curated books / mats / gear shown alongside a course or lesson.
export default function RelatedProducts({ products, title = "Shop for this practice" }) {
  if (!products || products.length === 0) return null;
  const cur = (c) => ((c || "eur").toLowerCase() === "usd" ? "$" : "€");
  return (
    <div data-testid="related-products">
      <div className="eyebrow mb-3 flex items-center gap-2">
        <ShoppingBag className="h-3.5 w-3.5 text-[#B25A45]" /> {title}
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {products.map((p) => (
          <li key={p.id}>
            <Link
              to={`/shop/${p.id}`}
              data-testid={`related-product-${p.id}`}
              className="block rounded-2xl bg-white border border-[#E5E6DF] overflow-hidden hover:border-[#B25A45] transition"
            >
              <div className="aspect-[4/3] bg-[#F2F2EC]">
                {p.images?.[0] && <img src={p.images[0]} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="p-3">
                <div className="text-[13px] font-semibold leading-tight truncate">{p.title}</div>
                <div className="mt-1 text-sm text-[#B25A45] font-semibold">
                  {cur(p.currency)}{Math.round(p.price)}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
