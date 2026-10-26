import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { isNativeApp } from "@/lib/platform";
import { useSeo, SITE_URL } from "@/lib/seo";
import { breadcrumbJsonLd, faqJsonLd } from "@/seo/seoData.mjs";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import PageBlocks, { pageFaqs } from "@/components/PageBlocks";
import { plainText } from "@/components/RichText";
import { contentImageUrl } from "@/components/ContentImageInput";

const absUrl = (u) => {
  const v = contentImageUrl(u) || "";
  return !v ? "" : /^https?:\/\//.test(v) ? v : `${SITE_URL}${v.startsWith("/") ? "" : "/"}${v}`;
};

export function pageSeo(page) {
  const path = `/${page.slug}`;
  const firstText = (page.blocks || []).find((b) => b.type === "text")?.text || "";
  const title = page.seo_title || `${page.title} | Tony Yoga`;
  const description = page.seo_description || plainText(page.intro || firstText, 300);
  const image = absUrl(page.seo_image || page.cover_image);
  const faqs = pageFaqs(page.blocks);
  const url = `${SITE_URL}${path}`;
  return {
    title, description, image: image || null, noindex: !!page.noindex,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": page.slug === "about" || page.slug === "about-us" ? "AboutPage" : "WebPage",
          "@id": url, url, name: title, description,
          isPartOf: { "@id": `${SITE_URL}/#website` },
          ...(page.slug.startsWith("about") ? { about: { "@id": `${SITE_URL}/#organization` } } : {}),
          ...(image ? { primaryImageOfPage: { "@type": "ImageObject", url: image } } : {}),
          ...(page.updated_at ? { dateModified: page.updated_at } : {}),
        },
        breadcrumbJsonLd(SITE_URL, [{ name: "Home", path: "/" }, { name: page.menu_label || page.title, path }]),
        ...(faqs.length ? [faqJsonLd(faqs)] : []),
      ],
    },
  };
}

/** A page written in Admin → Custom pages (About us, Services, …), at /{slug}. */
export default function CustomPage() {
  const { slug } = useParams();
  const native = isNativeApp();
  const [page, setPage] = useState(undefined); // undefined = loading, null = not found

  useEffect(() => {
    let alive = true;
    setPage(undefined);
    api.get(`/pages/${encodeURIComponent(slug)}`)
      .then(({ data }) => { if (alive) setPage(data); })
      .catch(() => { if (alive) setPage(null); });
    return () => { alive = false; };
  }, [slug]);

  useSeo(page ? pageSeo(page) : null);

  if (page === null) return <Navigate to="/" replace />;

  const cover = page && contentImageUrl(page.cover_image);

  if (native) {
    return (
      <div data-testid="custom-page" className="pb-10">
        <PageHeader back eyebrow={page?.eyebrow} title={page?.title} testId="custom-page-header" />
        {page === undefined ? <Spinner /> : (
          <div className="mx-auto max-w-2xl px-5 space-y-6">
            {page.intro && <p className="text-[16px] leading-relaxed text-[#545E56]">{page.intro}</p>}
            {cover && <img src={cover} alt="" className="w-full aspect-[4/3] object-cover object-[center_25%] rounded-2xl bg-[#F2F2EC]" />}
            <PageBlocks blocks={page.blocks} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7]" data-testid="custom-page">
      <SiteHeader />
      {page === undefined ? <div className="py-24"><Spinner /></div> : (
        <main>
          <header className={`mx-auto max-w-6xl px-4 sm:px-6 pt-10 sm:pt-16 pb-8 sm:pb-12 ${cover ? "grid md:grid-cols-[1.15fr,0.85fr] gap-8 md:gap-12 items-center" : ""}`}>
            <div className="min-w-0">
              {page.eyebrow && <div className="eyebrow mb-3">{page.eyebrow}</div>}
              <h1 className="serif text-[2.2rem] leading-[1.05] sm:text-5xl lg:text-6xl font-medium" data-testid="custom-page-title">{page.title}</h1>
              {page.intro && <p className="mt-5 max-w-2xl text-[15px] sm:text-lg leading-relaxed text-[#545E56]">{page.intro}</p>}
            </div>
            {cover && (
              <div className="overflow-hidden rounded-3xl bg-[#F2F2EC] aspect-[4/3] md:aspect-[4/5]">
                <img src={cover} alt={page.title} className="h-full w-full object-cover object-[center_25%]" />
              </div>
            )}
          </header>
          <div className="mx-auto max-w-3xl px-4 sm:px-6 pb-16 sm:pb-24">
            <PageBlocks blocks={page.blocks} />
          </div>
        </main>
      )}
      <SiteFooter />
    </div>
  );
}
