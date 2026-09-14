import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Trash2, ShoppingBag, Minus, Plus } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import PaymentButtons from "@/components/PaymentButtons";
import CreditNudge from "@/components/CreditNudge";

export default function Cart() {
  const { items, subtotal, promo, discount, total, updateQty, remove } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState("cart");
  const [orderId, setOrderId] = useState(null);
  const [addr, setAddr] = useState({
    name: user?.name || "", line1: "", line2: "", city: "",
    state: "", postal_code: "", country: "United States", phone: "",
  });

  if (items.length === 0) {
    return (
      <div data-testid="cart-page">
        <PageHeader eyebrow="Your bag" title="Cart" back testId="cart-header" />
        <EmptyState
          title="Empty for now."
          subtitle="Browse the shop and add a few tools for your practice."
          action={<Link to="/shop" className="pill pill-primary inline-flex">Go to shop</Link>}
        />
      </div>
    );
  }

  const beforeCheckout = async () => {
    if (!user) { toast("Sign in to check out."); nav("/login"); return false; }
    if (!addr.name || !addr.line1 || !addr.city || !addr.postal_code || !addr.country) {
      toast.error("Please complete the shipping address");
      return false;
    }
    let currentOrderId = orderId;
    if (!currentOrderId) {
      try {
        const { data: order } = await api.post("/orders/create", {
          items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, variant: i.variant })),
          shipping_address: addr,
          bundle_program_id: discount > 0 ? promo?.program_id : null,
        });
        currentOrderId = order.id;
        setOrderId(currentOrderId);
      } catch (e) {
        toast.error(e?.response?.data?.detail || "Could not create order");
        return false;
      }
    }
    return true;
  };

  return (
    <div data-testid="cart-page" className="pb-6">
      <PageHeader eyebrow="Your bag" title={step === "cart" ? "Cart" : "Shipping"} back testId="cart-header" />

      <div className="mx-auto max-w-2xl px-5 space-y-5">
        {step === "cart" && (
          <>
            <ul className="space-y-3" data-testid="cart-items">
              {items.map((it) => (
                <li key={it.key} className="rounded-2xl bg-white border border-[#E5E6DF] p-3 flex gap-3">
                  {it.image && (
                    <div className="h-20 w-20 shrink-0 rounded-xl bg-[#F2F2EC] overflow-hidden">
                      <img src={it.image} alt="" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold clamp-2 leading-tight">{it.title}</div>
                    {it.variant && <div className="text-xs text-[#6B7269] mt-0.5">Size {it.variant}</div>}
                    <div className="text-sm text-[#B25A45] font-semibold mt-1">€{it.price}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => updateQty(it.key, it.quantity - 1)} data-testid={`cart-dec-${it.key}`} className="h-7 w-7 rounded-full border border-[#E5E6DF] hover:border-[#B25A45] flex items-center justify-center">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm font-semibold w-6 text-center">{it.quantity}</span>
                      <button onClick={() => updateQty(it.key, it.quantity + 1)} data-testid={`cart-inc-${it.key}`} className="h-7 w-7 rounded-full border border-[#E5E6DF] hover:border-[#B25A45] flex items-center justify-center">
                        <Plus className="h-3 w-3" />
                      </button>
                      <button onClick={() => remove(it.key)} data-testid={`cart-remove-${it.key}`} className="ml-auto text-[#B25A45] hover:opacity-70">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="rounded-2xl bg-[#F2F2EC] p-5 space-y-2">
              {discount > 0 && (
                <>
                  <div className="flex items-center justify-between text-sm text-[#6B7269]">
                    <span>Subtotal</span>
                    <span data-testid="cart-subtotal-raw">€{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-[#839682] font-semibold" data-testid="cart-discount-row">
                    <span>{promo?.pct}% bundle discount</span>
                    <span>−€{discount.toFixed(2)}</span>
                  </div>
                  <div className="h-px bg-[#E0E1D8]" />
                </>
              )}
              <div className="flex items-center justify-between">
                <div className="eyebrow">Total</div>
                <div className="serif text-2xl" data-testid="cart-subtotal">€{total.toFixed(2)}</div>
              </div>
            </div>

            <button onClick={() => setStep("shipping")} data-testid="cart-continue" className="pill pill-primary w-full">
              <ShoppingBag className="h-4 w-4" /> Continue to shipping
            </button>
            <CreditNudge testId="cart-credit-nudge" />
          </>
        )}

        {step === "shipping" && (
          <div className="space-y-3" data-testid="cart-shipping-form">
            <div className="rounded-2xl bg-[#F2F2EC] p-4 text-xs text-[#6B7269]">
              Ships within 3-5 business days. Total: <span className="font-semibold text-[#1C221F]">€{total.toFixed(2)}</span>
              {discount > 0 && <span className="text-[#839682] font-semibold"> · {promo?.pct}% bundle saving applied</span>}
            </div>
            <input required data-testid="ship-name" value={addr.name} onChange={(e) => setAddr({ ...addr, name: e.target.value })} placeholder="Full name" className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
            <input required data-testid="ship-line1" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} placeholder="Street address" className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
            <input data-testid="ship-line2" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} placeholder="Apt / Suite (optional)" className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
            <div className="grid grid-cols-2 gap-3">
              <input required data-testid="ship-city" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} placeholder="City" className="rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
              <input data-testid="ship-state" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} placeholder="State" className="rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
              <input required data-testid="ship-postal" value={addr.postal_code} onChange={(e) => setAddr({ ...addr, postal_code: e.target.value })} placeholder="ZIP / Postal" className="rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
              <input required data-testid="ship-country" value={addr.country} onChange={(e) => setAddr({ ...addr, country: e.target.value })} placeholder="Country" className="rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
            </div>
            <input data-testid="ship-phone" value={addr.phone} onChange={(e) => setAddr({ ...addr, phone: e.target.value })} placeholder="Phone (optional)" className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />

            <PaymentButtons
              itemType="cart"
              itemId={orderId || "pending"}
              stripeLabel={`Pay €${total.toFixed(2)}`}
              onBeforeCheckout={beforeCheckout}
              testIdPrefix="cart-pay"
              size="lg"
            />
            <button type="button" onClick={() => setStep("cart")} className="text-center w-full text-sm text-[#6B7269] py-2">← Back to cart</button>
          </div>
        )}
      </div>
    </div>
  );
}
