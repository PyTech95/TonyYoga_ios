import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { ExternalLink, ShoppingBag, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { cart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import CartBadge from "@/components/CartBadge";
import HeartButton from "@/components/HeartButton";
import BundleOffer from "@/components/BundleOffer";
import CreditNudge from "@/components/CreditNudge";
import PaymentButtons from "@/components/PaymentButtons";

export default function ProductDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [p, setP] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [size, setSize] = useState(null);
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const touchX = useRef(null);
  const imgCount = p?.images?.length || 0;
  const nextImg = () => setActiveImg((i) => (imgCount ? (i + 1) % imgCount : 0));
  const prevImg = () => setActiveImg((i) => (imgCount ? (i - 1 + imgCount) % imgCount : 0));

  useEffect(() => {
    api.get(`/products/${id}`).then(({ data }) => {
      setP(data);
      if (data.variants?.length) setSize(data.variants[0].size);
    }).catch(() => setP(false));
    api.get(`/products/${id}/bundle`).then(({ data }) => setBundle(data?.bundle || null)).catch(() => setBundle(null));
  }, [id]);

  if (p === null) return <><PageHeader back /><Spinner /></>;
  if (p === false) return <><PageHeader back title="Not found" /></>;

  const stock = Math.max(0, p.stock_qty || 0);
  const outOfStock = stock === 0;
  const isBook = p.type === "book";       // physical book — sold on Amazon
  const isEbook = p.type === "ebook";     // digital download — sold here
  const isPhysical = !isBook && !isEbook;

  const addToCart = () => {
    if (outOfStock) return;
    cart.add(p, size, qty);
    toast.success(`Added ${p.title}${size ? ` (${size})` : ""} to cart`);
  };

  const buyNow = () => {
    if (outOfStock) return;
    cart.add(p, size, qty);
    nav("/cart");
  };

  return (
    <div data-testid="product-detail" className="pb-6">
      <PageHeader eyebrow={p.category} title={p.title} back testId="product-header" action={<div className="flex items-center gap-2"><HeartButton targetType="product" targetId={p.id} /><CartBadge /></div>} />

      <div className="mx-auto max-w-2xl px-5 space-y-6">
        {p.images?.length > 0 && (
          <div className="space-y-3" data-testid="product-gallery">
            <div
              className="relative rounded-3xl overflow-hidden aspect-[4/5] bg-[#F2F2EC] group"
              onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                if (touchX.current == null) return;
                const dx = e.changedTouches[0].clientX - touchX.current;
                if (Math.abs(dx) > 40) dx < 0 ? nextImg() : prevImg();
                touchX.current = null;
              }}
            >
              <img src={p.images[activeImg] || p.images[0]} alt={p.title} className="h-full w-full object-cover select-none" data-testid="product-gallery-main" />
              {p.images.length > 1 && (
                <>
                  <button onClick={prevImg} data-testid="product-gallery-prev" aria-label="Previous photo"
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/85 backdrop-blur flex items-center justify-center shadow-md hover:bg-white transition-colors">
                    <ChevronLeft className="h-5 w-5 text-[#1C221F]" />
                  </button>
                  <button onClick={nextImg} data-testid="product-gallery-next" aria-label="Next photo"
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/85 backdrop-blur flex items-center justify-center shadow-md hover:bg-white transition-colors">
                    <ChevronRight className="h-5 w-5 text-[#1C221F]" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {p.images.map((_, i) => (
                      <span key={i} className={`h-1.5 rounded-full transition-all ${i === activeImg ? "w-5 bg-[#B25A45]" : "w-1.5 bg-white/70"}`} />
                    ))}
                  </div>
                </>
              )}
            </div>
            {p.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {p.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    data-testid={`product-thumb-${i}`}
                    className={`shrink-0 h-16 w-16 rounded-xl overflow-hidden border-2 transition-colors ${i === activeImg ? "border-[#B25A45]" : "border-transparent opacity-70 hover:opacity-100"}`}
                  >
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-3">
            {p.price > 0
              ? <div className="serif text-4xl">€{p.price}</div>
              : <div className="serif text-2xl text-[#B25A45]">On Amazon</div>}
            {p.compare_at_price > p.price && (
              <>
                <div className="text-xl text-[#9AA096] line-through" data-testid="product-compare-price">€{p.compare_at_price}</div>
                <span className="rounded-full bg-[#B25A45] px-2.5 py-1 text-[10px] uppercase tracking-widest font-bold text-white" data-testid="product-sale-badge">
                  Save €{(p.compare_at_price - p.price).toFixed(0)}
                </span>
              </>
            )}
          </div>
          {isPhysical && (
            <div className={`text-xs font-semibold uppercase tracking-widest ${outOfStock ? "text-[#B25A45]" : "text-[#839682]"}`} data-testid="product-stock">
              {outOfStock ? "Sold out" : `${stock} in stock`}
            </div>
          )}
          {isEbook && (
            <div className="text-xs font-semibold uppercase tracking-widest text-[#839682]" data-testid="product-ebook-badge">Instant download</div>
          )}
        </div>
        {p.author && <div className="text-sm text-[#6B7269] -mt-3" data-testid="product-author">by {p.author}</div>}
        <p className="text-[15px] text-[#545E56] leading-relaxed">{p.description}</p>

        <CreditNudge testId="product-credit-nudge" />

        {isPhysical && p.variants?.length > 0 && (
          <div>
            <div className="eyebrow mb-2">Size</div>
            <div className="flex gap-2 flex-wrap" data-testid="product-sizes">
              {p.variants.map((v) => (
                <button
                  key={v.size}
                  onClick={() => setSize(v.size)}
                  data-testid={`product-size-${v.size}`}
                  className={`pill !py-2 !px-4 !text-[13px] ${size === v.size ? "pill-primary" : "pill-ghost"}`}
                >
                  {v.size}
                </button>
              ))}
            </div>
          </div>
        )}

        {isPhysical && !outOfStock && (
          <div className="flex items-center gap-3">
            <div className="eyebrow">Quantity</div>
            <div className="flex items-center gap-2">
              <button onClick={() => setQty(Math.max(1, qty - 1))} data-testid="product-qty-dec" className="h-8 w-8 rounded-full border border-[#E5E6DF] hover:border-[#B25A45]">−</button>
              <span className="w-8 text-center font-semibold" data-testid="product-qty">{qty}</span>
              <button onClick={() => setQty(Math.min(stock, qty + 1))} data-testid="product-qty-inc" className="h-8 w-8 rounded-full border border-[#E5E6DF] hover:border-[#B25A45]">+</button>
            </div>
          </div>
        )}

        {isPhysical && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={addToCart} disabled={outOfStock} data-testid="product-add" className="pill pill-ghost">
              <ShoppingBag className="h-4 w-4" /> Add to cart
            </button>
            <button onClick={buyNow} disabled={outOfStock} data-testid="product-buy" className="pill pill-primary">
              Buy now
            </button>
          </div>
        )}

        {isEbook && (
          <div className="space-y-2" data-testid="ebook-purchase">
            {user ? (
              <PaymentButtons itemType="product" itemId={p.id} stripeLabel={`Get the eBook · €${p.price}`} testIdPrefix="ebook-pay" size="lg" />
            ) : (
              <Link to={`/login?next=/shop/${p.id}`} data-testid="ebook-signin" className="pill pill-primary w-full !py-3.5">
                Sign in to get the eBook · €{p.price}
              </Link>
            )}
            <p className="text-xs text-[#6B7269] text-center">Instant PDF download after purchase — find it in Profile → My library.</p>
          </div>
        )}

        {isBook && (
          <a href={p.external_amazon_link || "#"} target="_blank" rel="noopener noreferrer" data-testid="product-amazon" className="pill pill-primary w-full !py-3.5">
            Buy on Amazon <ExternalLink className="h-4 w-4" />
          </a>
        )}

        {bundle && (
          <BundleOffer
            programId={bundle.program_id}
            programTitle={bundle.program_title}
            products={bundle.products}
            pct={bundle.discount_pct}
            currency={bundle.currency}
          />
        )}

        {!isBook && p.external_amazon_link && (
          <a
            href={p.external_amazon_link}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="product-amazon-alt"
            className="pill pill-ghost w-full"
          >
            {isEbook ? "Prefer print? Buy on Amazon" : "Buy on Amazon"} <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}
