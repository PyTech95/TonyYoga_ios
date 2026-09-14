import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";

export default function CartBadge() {
  const { count } = useCart();
  return (
    <Link to="/cart" data-testid="cart-badge" className="relative rounded-full h-10 w-10 flex items-center justify-center bg-white border border-[#E5E6DF] hover:border-[#B25A45] transition">
      <ShoppingBag className="h-4 w-4" strokeWidth={1.8} />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-[#B25A45] text-white text-[10px] font-bold flex items-center justify-center" data-testid="cart-badge-count">
          {count}
        </span>
      )}
    </Link>
  );
}
