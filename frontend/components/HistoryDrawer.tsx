"use client";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { IconBtn, PillBtn, Skeleton, SkeletonLine } from "./ui";
import { useFeedback } from "./feedback";
import { Pa } from "./split";
import { api } from "@/lib/api";
import { useData } from "@/lib/data";
import { ds } from "@/lib/seo";

type Item = { _id: string; kind: string; action: string; actorName: string; actorId: string; target: string; createdAt: string; changes?: { f: string; from: string; to: string }[]; restorable?: boolean; restoredAt?: string };
const TABS: [string, string][] = [["all", "Changes"], ["article", "Articles"], ["share", "Sharing"], ["open", "Opened by"]];
const FL: Record<string, string> = { title: "Title", meta: "Meta description", sub: "Subtitle", cat: "Category", t: "Tags", html: "Content", date: "Publish date", time: "Publish time", status: "Status", slug: "Slug", img: "Cover image", alt: "Alt text", coverPrompt: "Cover prompt" };
const line = (x: Item) => {
  const n = `“${x.target}”`;
  if (x.kind === "open") return x.action === "open-link" ? "Opened the shared link" : "Opened the admin";
  return ({ create: "Created " + n, update: "Edited " + n, delete: "Deleted " + n, restore: "Restored " + n, invite: "Invited " + x.target, role: "Changed access: " + x.target, remove: "Removed " + x.target, link: "Turned link sharing " + x.target, reset: "Reset the share link", ai: `Updated AI settings (${x.target})`, "ai-create": "Generated a draft with AI: " + n } as Record<string, string>)[x.action] || x.action;
};

export default function HistoryDrawer({ onClose }: { onClose: () => void }) {
  const { user, reload } = useData();
  const { toast, ask } = useFeedback();
  const can = user.role === "admin" || user.role === "editor";
  const [kind, setKind] = useState("all");
  const [items, setItems] = useState<Item[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = async (reset: boolean, k = kind) => {
    try {
      const r = await api(`/share/activity?kind=${k}&limit=30${!reset && next ? "&before=" + encodeURIComponent(next) : ""}`);
      setItems((x) => (reset ? r.items : x.concat(r.items))); setNext(r.next);
    } catch (e: any) { toast(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(true); /* eslint-disable-next-line */ }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const restore = async (id: string) => {
    if (!(await ask({ t: "Restore this version?", p: "The article will go back to how it was before this change. The restore itself is logged in the history.", ok: "Restore" }))) return;
    try { await api(`/share/activity/${id}/restore`, { method: "POST" }); await reload(); toast("Version restored"); load(true); } catch (e: any) { toast(e.message); }
  };
  const t = ds(new Date()), y = ds(new Date(Date.now() - 864e5));
  const G: Record<string, Item[]> = {};
  items.forEach((x) => { const d = new Date(x.createdAt), k = ds(d); (G[k === t ? "Today" : k === y ? "Yesterday" : d.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" })] ||= []).push(x); });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[min(520px,100%)] flex-col border-l border-border bg-surface shadow-[-20px_0_40px_rgba(0,0,0,.25)]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3"><IconBtn onClick={onClose}><Icon k="x" /></IconBtn><p className="flex-1 font-medium">Version history</p></div>
        <div className="flex gap-[22px] overflow-x-auto border-b border-border px-4">
          {TABS.map(([k, l]) => <button key={k} onClick={() => { setKind(k); setLoading(true); load(true, k); }} className={`-mb-px cursor-pointer whitespace-nowrap border-b-2 py-3 text-sm font-medium ${kind === k ? "border-accent text-accent" : "border-transparent text-text-2"}`}>{l}</button>)}
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {loading && !items.length && <div aria-label="Loading version history" aria-busy="true" className="space-y-4 py-3">{[1, 2, 3, 4].map((x) => <div key={x} className="flex gap-3 border-b border-border-soft py-3"><Skeleton className="size-9 rounded-full" /><div className="flex-1 space-y-2"><div className="flex justify-between gap-3"><SkeletonLine className="w-28" /><SkeletonLine className="w-12" /></div><SkeletonLine className="w-4/5" /><Skeleton className="h-5 w-24 rounded-6" /></div></div>)}</div>}
          {Object.entries(G).map(([lb, L]) => (
            <div key={lb}>
              <div className="py-3 text-xs font-medium uppercase tracking-[0.06em] text-text-3">{lb}</div>
              {L.map((x) => (
                <div key={x._id} className="flex gap-3 border-b border-border-soft py-3">
                  <Pa name={x.actorName} id={x.actorId} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="flex justify-between gap-2"><b className="font-medium">{x.actorName}</b><span className="text-xs text-text-3">{new Date(x.createdAt).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}</span></p>
                    <p className="mt-0.5 text-text-2">{line(x)}</p>
                    {!!x.changes?.length && <>
                      <div className="mt-2 flex flex-wrap gap-1.5">{x.changes.map((c) => <span key={c.f} className="rounded-6 bg-pill px-2 py-1 text-[11px] text-text-2">{FL[c.f] || c.f}</span>)}</div>
                      <details className="mt-2 text-xs text-text-2"><summary className="cursor-pointer">Details</summary>
                        {x.changes.map((c) => <div key={c.f} className="mt-1.5"><b className="block text-text-1">{FL[c.f] || c.f}</b><s className="block break-words text-negative">{c.from}</s><em className="block break-words not-italic text-positive">{c.to}</em></div>)}
                      </details>
                    </>}
                    {can && x.kind === "article" && x.restorable && !x.restoredAt && (x.action === "update" || x.action === "delete") && <div className="mt-2"><PillBtn onClick={() => restore(x._id)}>Restore this version</PillBtn></div>}
                    {x.restoredAt && <span className="mt-2 block text-xs text-text-3">Restored</span>}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {!loading && !items.length && <p className="py-6 text-xs text-text-3">No activity yet.</p>}
          {next && <div className="py-4 text-center"><PillBtn onClick={() => load(false)}>Load more</PillBtn></div>}
        </div>
      </aside>
    </>
  );
}
