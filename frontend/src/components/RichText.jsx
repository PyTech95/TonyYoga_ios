import { Fragment } from "react";
import { Link } from "react-router-dom";
import { isIOSApp } from "@/lib/iosPlatform";

// Plain text written in the admin, shown safely (no HTML is ever injected).
// Supported: blank line = new paragraph, lines starting with "- " = bullet list,
// **bold**, and [link text](/path or https://…).

const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;

export function safeHref(href) {
  const h = (href || "").trim();
  if (h.startsWith("/") && !h.startsWith("//")) return h;
  if (/^(https?:|mailto:|tel:)/i.test(h)) return h;
  return null;
}

export function SmartLink({ href, children, className, ...rest }) {
  const safe = safeHref(href);
  if (!safe) return <span className={className}>{children}</span>;
  if (safe.startsWith("/")) return <Link to={safe} className={className} {...rest}>{children}</Link>;
  const external = /^https?:/i.test(safe);
  // App Store rules: the iPhone / iPad app doesn't send people to outside web pages from
  // admin-written content (they could lead to a purchase). Buttons are left out, text stays.
  if (external && isIOSApp()) {
    if ((className || "").split(/\s+/).includes("pill")) return null;
    return <span className={className}>{children}</span>;
  }
  return <a href={safe} className={className} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} {...rest}>{children}</a>;
}

export function Inline({ text }) {
  const parts = String(text || "").split(TOKEN);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold text-[#1C221F]">{part.slice(2, -2)}</strong>;
    const m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (m) return <SmartLink key={i} href={m[2]} className="text-[#B25A45] underline underline-offset-2 hover:text-[#8E4535]">{m[1]}</SmartLink>;
    const lines = part.split("\n");
    return <Fragment key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{l}</Fragment>)}</Fragment>;
  });
}

const BULLET = /^\s*[-•*]\s+/;
// Split a paragraph into runs of plain lines and bullet lines ("- item").
function runs(p) {
  const out = [];
  p.split("\n").forEach((line) => {
    const list = BULLET.test(line);
    const last = out[out.length - 1];
    if (last && last.list === list) last.lines.push(line);
    else out.push({ list, lines: [line] });
  });
  return out;
}

export default function RichText({ text, className = "" }) {
  const paras = String(text || "").replace(/\r\n/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className={`space-y-4 text-[15px] sm:text-base leading-relaxed text-[#3D463F] ${className}`}>
      {paras.flatMap((p, i) => runs(p).map((r, k) => r.list ? (
        <ul key={`${i}-${k}`} className="list-disc pl-5 space-y-1.5 marker:text-[#B25A45]">
          {r.lines.map((l, j) => <li key={j}><Inline text={l.replace(BULLET, "")} /></li>)}
        </ul>
      ) : <p key={`${i}-${k}`}><Inline text={r.lines.join("\n")} /></p>))}
    </div>
  );
}

/** Text without the markup, for meta descriptions. */
export function plainText(text, max = 300) {
  const s = String(text || "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : s;
}
