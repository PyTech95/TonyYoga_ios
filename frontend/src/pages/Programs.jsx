import { isIOSApp } from "@/lib/iosPlatform";
import IOSPrice from "@/components/IOSPrice";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Package } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import PaymentButtons from "@/components/PaymentButtons";
import { AccessTermSummary } from "@/components/AccessTerm";
import { usePageSeo, SITE_URL } from "@/lib/seo";
import { courseJsonLd } from "@/seo/seoData.mjs";

export default function Programs() {
  const [rows, setRows] = useState(null);
  const [bundles, setBundles] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    api.get("/programs").then(({ data }) => setRows(Array.isArray(data) ? data : (data?.programs || data?.data || data?.items || []))).catch(() => setRows([]));
    api.get("/bundles").then(({ data }) => setBundles(data || [])).catch(() => setBundles([]));
  }, []);

  usePageSeo("/programs", {
    ready: !!(rows && rows.length),
    jsonLd: rows && rows.length ? {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: rows.map((p, i) => { const c = courseJsonLd(p, SITE_URL); delete c["@context"]; return { "@type": "ListItem", position: i + 1, item: c }; }),
    } : null,
  });

  return (
    <div data-testid="programs-page">
      <PageHeader eyebrow="On demand" title="The Core Series" testId="programs-header"
        action={user?.role === "admin" ? (
          <Link to="/admin?tab=courses" data-testid="programs-admin-manage" className="pill pill-primary !py-1.5 !px-3 !text-xs"><Pencil className="h-3.5 w-3.5" /> Manage</Link>
        ) : null}
      />

      <div className="mx-auto max-w-2xl px-5 space-y-6">
        {/* Discounted bundles */}
        {bundles.filter((b) => (b.programs || []).length > 0).map((b) => (
          <div key={b.id} data-testid={`bundle-card-${b.id}`} className="rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-6">
            <div className="flex items-center gap-2 text-[#E7B9AC]"><Package className="h-4 w-4" /><span className="eyebrow !text-[11px] !text-[#E7B9AC]">Bundle{!isIOSApp() && ` · save €${Math.round(b.savings || 0)}`}</span></div>
            <div className="serif text-2xl mt-1.5">{b.title}</div>
            <p className="text-sm text-white/70 mt-2 leading-relaxed">{b.description}</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="serif text-3xl"><IOSPrice itemType="bundle" itemId={b.id} fallback={<>€{Math.round(b.price)}</>} /></span>
              {!isIOSApp() && <span className="text-sm text-white/50 line-through">€{Math.round(b.individual_total || 0)}</span>}
              <span className="text-xs text-white/70">· {(b.programs || []).length} courses</span>
            </div>
            <div className="mt-4">
              <div className="mb-4 space-y-2">{(b.programs || []).map((p) => <div key={p.id} data-testid={`bundle-term-${b.id}-${p.id}`}><p className="text-xs font-semibold">{p.title}</p><AccessTermSummary term={p.access_term} prefix={`bundle-${b.id}-${p.id}`} /></div>)}</div>
              {b.viewer?.owns_all ? (
                <div data-testid={`bundle-owned-${b.id}`} className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-white/80">You own every course in this bundle.</div>
              ) : user ? (
                <PaymentButtons itemType="bundle" itemId={b.id} testIdPrefix={`bundle-buy-${b.id}`} stripeLabel={`Get the bundle · €${Math.round(b.price)}`} />
              ) : (
                <Link to="/login" data-testid={`bundle-login-${b.id}`} className="pill pill-primary w-full !bg-[#B25A45]">Log in to get the bundle →</Link>
              )}
            </div>
          </div>
        ))}

        {rows === null ? <Spinner /> : (
          <ul className="space-y-4" data-testid="programs-list">
            {rows.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/programs/${p.id}`}
                  data-testid={`program-${p.id}`}
                  className="block rounded-3xl overflow-hidden bg-white border border-[#E5E6DF] hover:border-[#B25A45] transition"
                >
                  {p.cover_image && (
                    <div className="aspect-[16/10] overflow-hidden bg-[#F2F2EC]">
                      <img src={p.cover_image} alt="" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="p-6">
                    <div className="eyebrow">{p.level} · {p.duration_weeks} weeks</div>
                    <div className="serif text-2xl mt-1">{p.title}</div>
                    <p className="text-sm text-[#6B7269] mt-2 clamp-3 leading-relaxed">{p.description}</p>
                    <div className="mt-4 flex items-center justify-between">
                      <div data-testid={`program-price-${p.id}`} className="text-[#1C221F] font-semibold"><IOSPrice itemType="program" itemId={p.id} fallback={new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency || "usd" }).format(p.price)} /></div>
                      <span className="text-sm text-[#B25A45] font-semibold">View program →</span>
                    </div>
                    {["subscription", "one_time"].includes(p.price_model) && <div className="mt-3 text-[#6B7269]"><AccessTermSummary term={p.access_term} prefix={`program-${p.id}`} /></div>}
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
