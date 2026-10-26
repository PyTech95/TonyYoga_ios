import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { isNativeApp } from "@/lib/platform";
import { useSeo, SITE_URL } from "@/lib/seo";
import { breadcrumbJsonLd } from "@/seo/seoData.mjs";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import RichText, { plainText } from "@/components/RichText";
import { contentImageUrl } from "@/components/ContentImageInput";

const absUrl = (u) => {
  const v = contentImageUrl(u) || "";
  return !v ? "" : /^https?:\/\//.test(v) ? v : `${SITE_URL}${v.startsWith("/") ? "" : "/"}${v}`;
};
const KIND = { blog: "Article", news: "News", event: "Event" };

export function articleSeo(post) {
  const url = `${SITE_URL}/news/${post.slug}`;
  const description = plainText(post.excerpt || post.body, 300);
  const image = absUrl(post.cover_image);
  return {
    title: `${post.title} | Tony Yoga Journal`,
    description,
    image: image || null,
    type: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": post.category === "news" ? "NewsArticle" : "BlogPosting",
          "@id": url, url, mainEntityOfPage: url, headline: post.title.slice(0, 110), description,
          ...(image ? { image: [image] } : {}),
          datePublished: post.published_at || post.created_at,
          dateModified: post.updated_at || post.published_at || post.created_at,
          author: { "@id": `${SITE_URL}/#founder` },
          publisher: { "@id": `${SITE_URL}/#organization` },
          ...(post.tags?.length ? { keywords: post.tags.join(", ") } : {}),
          inLanguage: "en",
        },
        breadcrumbJsonLd(SITE_URL, [{ name: "Home", path: "/" }, { name: "Journal", path: "/news" }, { name: post.title, path: `/news/${post.slug}` }]),
      ],
    },
  };
}

/** One Journal post (Admin → Journal & news), at /news/{slug}. */
export default function NewsArticle() {
  const { slug } = useParams();
  const native = isNativeApp();
  const [post, setPost] = useState(undefined);

  useEffect(() => {
    let alive = true;
    setPost(undefined);
    api.get(`/news/${encodeURIComponent(slug)}`)
      .then(({ data }) => { if (alive) setPost(data); })
      .catch(() => { if (alive) setPost(null); });
    return () => { alive = false; };
  }, [slug]);

  useSeo(post ? articleSeo(post) : null);
  if (post === null) return <Navigate to="/news" replace />;

  const date = post && new Date(post.published_at || post.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const article = post && (
    <article className="space-y-6" data-testid="news-article">
      {post.cover_image && (
        <div className="aspect-[16/9] overflow-hidden rounded-2xl bg-[#F2F2EC]">
          <img src={contentImageUrl(post.cover_image)} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      {post.excerpt && <p className="serif text-xl sm:text-2xl leading-snug text-[#1C221F]">{post.excerpt}</p>}
      <RichText text={post.body} />
      {post.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {post.tags.map((t) => <span key={t} className="rounded-full bg-[#F2F2EC] px-3 py-1 text-[12px] text-[#545E56]">#{t}</span>)}
        </div>
      )}
    </article>
  );

  if (native) {
    return (
      <div className="pb-10">
        <PageHeader back eyebrow={post ? `${KIND[post.category] || "Journal"} · ${date}` : "Journal"} title={post?.title} testId="news-article-header" />
        <div className="mx-auto max-w-2xl px-5">{post === undefined ? <Spinner /> : article}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 pt-8 sm:pt-12 pb-16 sm:pb-24">
        <Link to="/news" className="inline-flex items-center gap-1.5 text-sm text-[#6B7269] hover:text-[#1C221F] mb-6"><ArrowLeft className="h-4 w-4" /> Journal</Link>
        {post === undefined ? <Spinner /> : (
          <>
            <div className="eyebrow mb-3">{KIND[post.category] || "Journal"} · {date}</div>
            <h1 className="serif text-[2.1rem] leading-[1.06] sm:text-5xl font-medium mb-8">{post.title}</h1>
            {article}
            <p className="mt-10 text-[13px] text-[#6B7269]">By {post.author_name || "Tony Sanchez"}</p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
