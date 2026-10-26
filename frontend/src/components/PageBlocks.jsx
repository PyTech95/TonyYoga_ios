import { ArrowRight, Check, ChevronDown } from "lucide-react";
import RichText, { Inline, SmartLink } from "@/components/RichText";
import { contentImageUrl } from "@/components/ContentImageInput";
import { youTubeEmbed } from "@/lib/youtube";

// Renders the content blocks written in Admin → Custom pages. Everything is plain
// text rendered by React (no HTML from the database), so a page can't break the site.

function vimeoEmbed(url) {
  const m = String(url || "").match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? `https://player.vimeo.com/video/${m[1]}?dnt=1` : null;
}

function VideoBlock({ b }) {
  const embed = youTubeEmbed(b.url) || vimeoEmbed(b.url);
  return (
    <figure className="my-2">
      {embed ? (
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#1C221F]">
          <iframe src={embed} title={b.caption || "Video"} className="absolute inset-0 h-full w-full" loading="lazy" allow="fullscreen; picture-in-picture; encrypted-media" allowFullScreen />
        </div>
      ) : (
        <div className="mx-auto max-w-sm overflow-hidden rounded-2xl bg-[#1C221F]">
          <video src={contentImageUrl(b.url)} poster={contentImageUrl(b.poster) || undefined} controls playsInline preload="metadata" className="block w-full h-auto max-h-[75vh]" />
        </div>
      )}
      {b.caption && <figcaption className="mt-2 text-center text-[13px] text-[#6B7269]">{b.caption}</figcaption>}
    </figure>
  );
}

function Block({ b }) {
  switch (b.type) {
    case "heading":
      return b.level === 3
        ? <h3 className="serif text-xl sm:text-2xl leading-snug pt-2">{b.text}</h3>
        : <h2 className="serif text-2xl sm:text-3xl leading-tight pt-4">{b.text}</h2>;
    case "text":
      return <RichText text={b.text} />;
    case "image":
      return (
        <figure>
          <img src={contentImageUrl(b.src)} alt={b.alt || ""} loading="lazy" className="w-full h-auto rounded-2xl bg-[#F2F2EC]" />
          {b.caption && <figcaption className="mt-2 text-center text-[13px] text-[#6B7269]">{b.caption}</figcaption>}
        </figure>
      );
    case "button":
      return (
        <div>
          <SmartLink href={b.href} className={`pill ${b.style === "ghost" ? "pill-ghost" : "pill-primary"}`}>
            {b.label} <ArrowRight className="h-4 w-4" />
          </SmartLink>
        </div>
      );
    case "list":
      return (
        <ul className="space-y-2.5">
          {(b.items || []).map((it, i) => (
            <li key={i} className="flex items-start gap-3 text-[15px] leading-relaxed text-[#3D463F]">
              <span className="mt-1 h-5 w-5 shrink-0 rounded-full bg-[#EEF1EC] flex items-center justify-center"><Check className="h-3 w-3 text-[#5C7355]" /></span>
              <span><Inline text={it} /></span>
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-[#B25A45] pl-5 py-1">
          <p className="serif italic text-xl sm:text-2xl leading-snug text-[#1C221F]">“{b.text}”</p>
          {b.author && <footer className="mt-2 text-[13px] font-semibold text-[#6B7269]">— {b.author}</footer>}
        </blockquote>
      );
    case "faq":
      return (
        <div className="divide-y divide-[#E5E6DF] rounded-2xl border border-[#E5E6DF] bg-white">
          {(b.items || []).map((it, i) => (
            <details key={i} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-[15px] text-[#1C221F]">
                {it.q}<ChevronDown className="h-4 w-4 shrink-0 text-[#6B7269] transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3"><RichText text={it.a} className="!text-[14.5px]" /></div>
            </details>
          ))}
        </div>
      );
    case "cards":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          {(b.items || []).map((it, i) => {
            const body = (
              <>
                {it.image && (
                  <div className="aspect-[16/10] overflow-hidden bg-[#F2F2EC]">
                    <img src={contentImageUrl(it.image)} alt="" loading="lazy" className="h-full w-full object-cover object-[center_20%] transition-transform duration-500 group-hover:scale-105" />
                  </div>
                )}
                <div className="p-5">
                  <div className="font-semibold text-[16px] text-[#1C221F] flex items-center justify-between gap-2">
                    {it.title}{it.href && <ArrowRight className="h-4 w-4 shrink-0 text-[#B25A45]" />}
                  </div>
                  {it.text && <p className="mt-1.5 text-[14px] leading-relaxed text-[#545E56]">{it.text}</p>}
                </div>
              </>
            );
            const cls = "group block overflow-hidden rounded-2xl border border-[#E5E6DF] bg-white hover:border-[#B25A45]/50 transition-colors";
            return it.href ? <SmartLink key={i} href={it.href} className={cls}>{body}</SmartLink> : <div key={i} className={cls}>{body}</div>;
          })}
        </div>
      );
    case "video":
      return <VideoBlock b={b} />;
    default:
      return null;
  }
}

export default function PageBlocks({ blocks }) {
  // Consecutive buttons sit on one row.
  const groups = [];
  (blocks || []).forEach((b) => {
    const last = groups[groups.length - 1];
    if (b.type === "button" && last && last.type === "buttons") last.items.push(b);
    else if (b.type === "button") groups.push({ type: "buttons", id: b.id, items: [b] });
    else groups.push(b);
  });
  return (
    <div className="space-y-6">
      {groups.map((g, i) => g.type === "buttons" ? (
        <div key={g.id || i} className="flex flex-wrap gap-3 pt-2">
          {g.items.map((b) => (
            <SmartLink key={b.id} href={b.href} className={`pill ${b.style === "ghost" ? "pill-ghost" : "pill-primary"}`}>
              {b.label} <ArrowRight className="h-4 w-4" />
            </SmartLink>
          ))}
        </div>
      ) : <Block key={g.id || i} b={g} />)}
    </div>
  );
}

/** FAQ items in a page, for structured data. */
export function pageFaqs(blocks) {
  return (blocks || []).filter((b) => b.type === "faq").flatMap((b) => b.items || []).filter((x) => x.q && x.a);
}
