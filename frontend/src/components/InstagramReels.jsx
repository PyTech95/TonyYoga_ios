import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "@/lib/api";

const DEFAULT_HANDLE = "https://www.instagram.com/tonyoga_school/";

export default function InstagramReels() {
  const [reels, setReels] = useState([]);
  const [enabled, setEnabled] = useState(true);
  const [handle, setHandle] = useState(DEFAULT_HANDLE);

  useEffect(() => {
    api.get("/marketing/reels").then(({ data }) => setReels(data || [])).catch(() => setReels([]));
    api.get("/settings/public").then(({ data }) => {
      setEnabled(data?.reels_enabled !== false);
      if (data?.social_instagram) setHandle(data.social_instagram);
    }).catch(() => {});
  }, []);

  if (!enabled || reels.length === 0) return null;

  return (
    <section id="reels" className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20 lg:py-24" data-testid="marketing-reels">
      <div className="flex items-end justify-between mb-8 sm:mb-10 gap-4 sm:gap-6">
        <div>
          <div className="eyebrow mb-3">Practice in motion</div>
          <h2 className="serif text-3xl sm:text-4xl leading-tight max-w-md">Fresh from the mat.</h2>
        </div>
        <a
          href={handle}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="reels-follow"
          className="hidden md:inline-flex items-center gap-2 text-sm text-[#B25A45] hover:underline"
        >
          Follow on Instagram <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {reels.slice(0, 4).map((r) => (
          <a
            key={r.shortcode}
            href={`https://www.instagram.com/reel/${r.shortcode}/`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`reel-${r.shortcode}`}
            className="group block rounded-2xl overflow-hidden bg-[#1C221F] relative aspect-[9/16] hover:ring-2 hover:ring-[#B25A45] transition"
          >
            <iframe
              src={`https://www.instagram.com/reel/${r.shortcode}/embed/`}
              className="absolute inset-0 h-full w-full pointer-events-none"
              loading="lazy"
              scrolling="no"
              allowtransparency="true"
              title={r.caption || `Reel ${r.shortcode}`}
            />
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-[#1C221F]/90 to-transparent">
              <div className="text-[11px] text-white/85 line-clamp-2 leading-tight">{r.caption}</div>
            </div>
          </a>
        ))}
      </div>

      <a
        href={handle}
        target="_blank"
        rel="noopener noreferrer"
        className="md:hidden mt-6 pill pill-ghost !text-[13px] w-full"
      >
        Follow on Instagram <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </section>
  );
}
