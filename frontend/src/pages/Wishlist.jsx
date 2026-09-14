import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import EmptyState from "@/components/EmptyState";

const ROUTE = {
  product: (id) => `/shop/${id}`,
  program: (id) => `/programs/${id}`,
  workshop: (id) => `/workshops/${id}`,
  video: (id) => `/library/${id}`,
};

function ItemCard({ target_type, item }) {
  const image = item.images?.[0] || item.cover_image;
  const price = item.price != null ? `${(item.currency || "eur").toString().toUpperCase() === "USD" ? "$" : "€"}${Math.round(item.price)}` : item.price_eur ? `€${Math.round(item.price_eur)}` : "";
  return (
    <Link
      to={ROUTE[target_type](item.id)}
      data-testid={`wishlist-item-${item.id}`}
      className="block rounded-2xl overflow-hidden bg-white border border-[#E5E6DF] hover:border-[#B25A45] transition"
    >
      {image && (
        <div className="aspect-[4/5] overflow-hidden bg-[#F2F2EC]">
          <img src={image} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="p-3">
        <div className="eyebrow !text-[10px]">{target_type}</div>
        <div className="text-[13px] font-semibold mt-1 leading-tight clamp-2">{item.title}</div>
        {price && <div className="text-sm text-[#B25A45] font-semibold mt-1">{price}</div>}
      </div>
    </Link>
  );
}

export default function Wishlist() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    api.get("/wishlist/mine").then(({ data }) => setRows(data)).catch(() => setRows([]));
  }, []);

  return (
    <div data-testid="wishlist-page">
      <PageHeader eyebrow="Saved" title="Your wishlist" back testId="wishlist-header" />
      <div className="mx-auto max-w-2xl px-5">
        {rows === null ? <Spinner /> : rows.length === 0 ? (
          <EmptyState
            title="Nothing saved yet."
            subtitle="Tap the heart on any product, program or retreat and it'll live here."
            action={<Link to="/shop" className="pill pill-primary inline-flex">Browse the shop</Link>}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3" data-testid="wishlist-list">
            {rows.map((r, i) => (
              <li key={`${r.target_type}-${r.item.id}-${i}`}>
                <ItemCard target_type={r.target_type} item={r.item} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
