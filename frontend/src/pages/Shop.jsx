import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Flower2, Star } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import CartBadge from "@/components/CartBadge";

export default function Shop() {
  const [rows, setRows] = useState(null);
  const [cat, setCat] = useState("all");

  useEffect(() => {
    api.get("/products").then(({ data }) => setRows(data)).catch(() => setRows([]));
  }, []);

  const cats = useMemo(() => {
    if (!rows) return ["all"];
    return ["all", ...Array.from(new Set(rows.map((r) => r.category)))];
  }, [rows]);

  const visible = useMemo(() => (rows || []).filter((r) => cat === "all" || r.category === cat), [rows, cat]);

  return (
    <div data-testid="shop-page">
      <PageHeader eyebrow="Objects for practice" title="Shop" testId="shop-header" action={<CartBadge />} />

      <div className="mx-auto max-w-2xl px-5">
        <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar" data-testid="shop-filters">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              data-testid={`shop-filter-${c}`}
              className={`pill !py-2 !px-4 !text-[13px] shrink-0 ${cat === c ? "pill-primary" : "pill-ghost"}`}
            >
              {c[0].toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>

        {rows === null ? <Spinner /> : (
          <ul className="grid grid-cols-2 gap-4" data-testid="shop-list">
            {visible.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/shop/${p.id}`}
                  data-testid={`shop-item-${p.id}`}
                  className="block rounded-2xl overflow-hidden bg-white border border-[#E5E6DF] hover:border-[#B25A45] transition"
                >
                  <div className="relative aspect-square bg-[#F2F2EC] overflow-hidden">
                    {p.featured && (
                      <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-[#1C221F]/85 backdrop-blur px-2.5 py-1 text-[10px] uppercase tracking-widest font-bold text-[#E0A38F]" data-testid={`shop-featured-${p.id}`}>
                        <Star className="h-3 w-3 fill-[#E0A38F]" /> Featured
                      </span>
                    )}
                    {p.compare_at_price > p.price && (
                      <span className="absolute top-2 right-2 z-10 rounded-full bg-[#B25A45] px-2.5 py-1 text-[10px] uppercase tracking-widest font-bold text-white" data-testid={`shop-sale-${p.id}`}>
                        Sale
                      </span>
                    )}
                    {p.type === "ebook" && (
                      <span className="absolute bottom-2 left-2 z-10 rounded-full bg-[#1C221F]/85 backdrop-blur px-2.5 py-1 text-[10px] uppercase tracking-widest font-bold text-[#E0A38F]" data-testid={`shop-ebook-${p.id}`}>
                        eBook
                      </span>
                    )}
                    {p.type === "book" && (
                      <span className="absolute bottom-2 left-2 z-10 rounded-full bg-[#1C221F]/85 backdrop-blur px-2.5 py-1 text-[10px] uppercase tracking-widest font-bold text-[#E0A38F]" data-testid={`shop-book-${p.id}`}>
                        Book
                      </span>
                    )}
                    {p.images?.[0] ? (
                      <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#F2F2EC] to-[#E8E4DA] text-[#9AA096]" data-testid="product-placeholder">
                        <Flower2 className="h-8 w-8 text-[#B25A45]/60" />
                        <span className="text-[10px] uppercase tracking-widest font-bold">Membership</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-[13px] font-semibold leading-tight clamp-2">{p.title}</div>
                    {p.author && <div className="text-[11px] text-[#9AA096] mt-0.5">by {p.author}</div>}
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-sm text-[#B25A45] font-semibold">{p.price > 0 ? `€${p.price}` : "On Amazon"}</span>
                      {p.compare_at_price > p.price && <span className="text-xs text-[#9AA096] line-through">€{p.compare_at_price}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
