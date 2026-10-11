"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Cta, PillBtn, btn } from "./ui";
import { inpCls } from "./split";
import type { Article } from "@/lib/types";

const kind = (h: string, base: string) => {
  h = h.trim();
  let slug: string | null = /^\/blog\/([^/?#]+)/.exec(h)?.[1] ?? null;
  if (slug === null) { const u = /^https?:\/\/([^/]+)\/blog\/([^/?#]+)/i.exec(h); if (u && u[1].replace(/^www\./, "") === base.replace(/^www\./, "")) slug = u[2]; }
  return slug !== null ? { t: "int", slug: decodeURIComponent(slug) } : /^(mailto|tel):/i.test(h) ? { t: "mail", slug: "" } : /^#/.test(h) ? { t: "anchor", slug: "" } : /^https?:/i.test(h) ? { t: "ext", slug: "" } : { t: "path", slug: "" };
};
const site = (h: string, base: string) => (/^https?:|^mailto:|^tel:/i.test(h) ? h : "https://" + base + (h[0] === "/" ? h : "/" + h));

/** Popover « voir / ouvrir / modifier / supprimer » affiché au clic sur un lien du contenu */
export default function LinkPopover({ a, articles, base, can, onChange, onClose, onView, toast }: {
  a: HTMLAnchorElement; articles: Article[]; base: string; can: boolean;
  onChange: () => void; onClose: () => void; onView: (slug: string) => void; toast: (m: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [txt, setTxt] = useState(a.textContent || ""), [url, setUrl] = useState(a.getAttribute("href") || "");
  const h = a.getAttribute("href") || "", k = kind(h, base), t = k.t === "int" ? articles.find((x) => x.slug === k.slug) : null;
  let host = ""; try { if (k.t === "ext") host = new URL(h).hostname.replace(/^www\./, ""); } catch {}
  const [pos, setPos] = useState({ left: 12, top: 12, width: 380 });

  useLayoutEffect(() => {
    const r = a.getBoundingClientRect(), w = Math.min(380, innerWidth - 24), ph = ref.current?.offsetHeight || 140;
    setPos({ width: w, left: Math.max(12, Math.min(r.left, innerWidth - w - 12)), top: r.bottom + 8 + ph > innerHeight ? Math.max(12, r.top - ph - 8) : r.bottom + 8 });
  }, [a, editing]);
  useEffect(() => {
    const d = (e: MouseEvent) => { const n = e.target as Node; if (!ref.current?.contains(n) && !a.contains(n)) onClose(); };
    document.addEventListener("mousedown", d); return () => document.removeEventListener("mousedown", d);
  }, [a, onClose]);

  const apply = () => {
    if (!can) return;
    let u = url.trim();
    if (!u) return remove();
    if (!/^(https?:|mailto:|tel:|\/|#)/i.test(u)) u = "https://" + u;
    a.setAttribute("href", u);
    if (txt.trim() && txt !== a.textContent) a.textContent = txt;
    if (/^https?:/i.test(u)) { a.target = "_blank"; a.rel = "noopener"; } else { a.removeAttribute("target"); a.removeAttribute("rel"); }
    onChange(); onClose(); toast("Link updated");
  };
  const remove = () => {
    if (!can) return;
    const f = document.createDocumentFragment(); while (a.firstChild) f.appendChild(a.firstChild); a.replaceWith(f);
    onChange(); onClose(); toast("Link removed");
  };
  const gb = btn("ghost", "sm");
  return (
    <div ref={ref} style={pos} className="fixed z-[80] rounded-12 border border-border bg-surface p-3 shadow-[0_12px_32px_rgba(0,0,0,.3)]">
      {editing ? (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-text-2">Text</label>
          <input className={inpCls} value={txt} onChange={(e) => setTxt(e.target.value)} />
          <label className="text-xs font-medium text-text-2">Link — a web address or /blog/slug</label>
          <input autoFocus className={inpCls} list="lp-articles" value={url} placeholder="https://… or /blog/slug" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} />
          <datalist id="lp-articles">{articles.map((x) => <option key={x.slug} value={"/blog/" + x.slug}>{x.title}</option>)}</datalist>
          <div className="flex justify-end gap-2"><PillBtn onClick={onClose}>Cancel</PillBtn><Cta className="!py-2" onClick={apply}>Apply</Cta></div>
        </div>
      ) : <>
        <div className="mb-2 min-w-0 border-b border-border-soft pb-2 text-sm">
          {k.t === "int" ? (t ? <><b className="block truncate font-medium">{t.title}</b><span className="text-xs text-text-3">/blog/{k.slug} · {t.status}</span></> : <><b className="block font-medium text-negative">Article not found</b><span className="text-xs text-text-3">/blog/{k.slug}</span></>)
            : <><b className="block truncate font-medium">{host || (k.t === "mail" ? "Email or phone" : k.t === "anchor" ? "Anchor on this page" : h ? "Link" : "No address")}</b><span className="block truncate text-xs text-text-3">{h || "This link has no address yet"}</span></>}
        </div>
        <div className="flex flex-wrap gap-1">
          {k.t === "int" && t ? <><button className={gb} onClick={() => onView(t.slug)}>View article</button><button className={gb} onClick={() => window.open(site(h, base), "_blank", "noopener")}>Open on site</button></>
            : h ? <button className={gb} onClick={() => window.open(site(h, base), "_blank", "noopener")}>Open link</button> : null}
          <button className={gb} onClick={() => navigator.clipboard.writeText(h).then(() => toast("Link copied"), () => toast("Could not copy"))}>Copy</button>
          {can && <><button className={gb} onClick={() => setEditing(true)}>Edit</button><button className={btn("ghost", "sm", "!text-negative hover:!bg-negative-bg")} onClick={remove}>Remove</button></>}
        </div>
      </>}
    </div>
  );
}
