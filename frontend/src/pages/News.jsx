import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { contentImageUrl } from "@/components/ContentImageInput";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";

export default function News() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    api.get("/news").then(({ data }) => setRows(data)).catch(() => setRows([]));
  }, []);

  return (
    <div data-testid="news-page">
      <PageHeader eyebrow="Journal" title="News & writing" testId="news-header" />

      <div className="mx-auto max-w-2xl px-5">
        {rows === null ? <Spinner /> : rows.length === 0 ? (
          <p className="text-sm text-[#6B7269] py-8 text-center">Nothing yet.</p>
        ) : (
          <ul className="space-y-8" data-testid="news-list">
            {rows.map((n) => (
              <li key={n.id} className="border-b border-[#E5E6DF] pb-8 last:border-0">
                <Link to={`/news/${n.slug}`} className="group block" data-testid={`news-item-${n.slug}`}>
                {n.cover_image && (
                  <div className="aspect-[16/9] overflow-hidden bg-[#F2F2EC] rounded-2xl mb-4">
                    <img src={contentImageUrl(n.cover_image)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" loading="lazy" />
                  </div>
                )}
                <div className="eyebrow">{n.category}</div>
                <h2 className="serif text-2xl mt-1 leading-tight group-hover:text-[#B25A45] transition-colors">{n.title}</h2>
                <p className="text-sm text-[#545E56] mt-2 leading-relaxed">{n.excerpt}</p>
                <div className="text-xs text-[#839682] mt-3">
                  {n.author_name} · {new Date(n.published_at || n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
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
