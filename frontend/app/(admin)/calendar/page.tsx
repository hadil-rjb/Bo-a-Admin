"use client";
import Select from "@/components/Select";
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { PillBtn, Widget } from "@/components/ui";
import { StatusBadge, fieldCls, pageCls } from "@/components/table";
import { useFeedback } from "@/components/feedback";
import { IdeasPanel, useIdeas } from "@/components/IdeasPanel";
import { api } from "@/lib/api";
import { useData } from "@/lib/data";
import { useArticleDrawer } from "@/components/ArticleDrawerHost";
import { ds, score, scoreClass, slugify, today } from "@/lib/seo";
import type { Article } from "@/lib/types";

const mon = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const addD = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString("en", o);
const bg: Record<string, string> = { Live: "bg-positive-bg", Scheduled: "bg-accent/[.08]", Draft: "bg-pill" };

function WCard({ a, sm, onOpen, onDrag, onEnd, can }: { a: Article; sm?: boolean; onOpen: () => void; onDrag: () => void; onEnd: () => void; can: boolean }) {
  const s = score(a);
  return (
    <div draggable={can} title={a.title} onDragStart={(e) => { e.dataTransfer.setData("text/plain", a.slug); e.dataTransfer.effectAllowed = "move"; onDrag(); }} onDragEnd={onEnd}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      className={`flex cursor-grab flex-col gap-1.5 rounded-10 text-[13px] active:cursor-grabbing ${bg[a.status] || bg.Draft} ${sm ? "px-2 py-1.5" : "px-3 py-2.5"}`}>
      <p className={`m-0 overflow-hidden font-medium leading-[1.35] text-text-1 [-webkit-box-orient:vertical] [display:-webkit-box] ${sm ? "text-xs [-webkit-line-clamp:1]" : "[-webkit-line-clamp:3]"}`}>{a.title}</p>
      {!sm && <>
        <p className="m-0 text-xs text-text-2">{a.cat}</p>
        <div className="mt-auto flex items-center justify-between gap-2"><StatusBadge s={a.status} /><span className={`text-xs font-semibold ${scoreClass(s)}`}>SEO {s}</span></div>
      </>}
    </div>
  );
}

export default function CalendarPage() {
  const { articles: A, user, reload } = useData();
  const { toast, ask } = useFeedback();
  const { openArticle, openNewArticle } = useArticleDrawer();
  const can = user.role === "admin" || user.role === "editor";
  const [view, setView] = useState<"week" | "month">("week");
  const [cw, setCw] = useState(() => mon(new Date()));
  const [cm, setCm] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState(""), [cat, setCat] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const [dIdea, setDIdea] = useState<string | null>(null);
  const ih = useIdeas();
  const [over, setOver] = useState<string | null>(null);
  const wk = view === "week", t = today();
  const cats = useMemo(() => [...new Set(A.map((a) => a.cat))].sort(), [A]);

  const y = cm.getFullYear(), m = cm.getMonth();
  const f = (new Date(y, m, 1).getDay() + 6) % 7;
  const s0 = wk ? cw : new Date(y, m, 1 - f);
  const n0 = wk ? 7 : Math.ceil((f + new Date(y, m + 1, 0).getDate()) / 7) * 7;
  const D = [...Array(n0)].map((_, i) => addD(s0, i));
  const k0 = ds(D[0]), k1 = ds(D[n0 - 1]);
  const fl = (a: Article) => (!q || (a.title + a.cat).toLowerCase().includes(q.toLowerCase())) && (!cat || a.cat === cat);
  const inR = A.filter((a) => fl(a) && a.date && a.date >= k0 && a.date <= k1);
  const cnt = (s: string) => inR.filter((a) => a.status === s).length;
  const ideas = A.filter((a) => fl(a) && !a.date);
  const vis = inR.filter((a) => tab === "all" || a.status === tab);
  const tabs: [string, string, number][] = [["all", "All", inR.length], ["Live", "Live", cnt("Live")], ["Scheduled", "Scheduled", cnt("Scheduled")], ["Draft", "Drafts", cnt("Draft")], ["ideas", "Unscheduled", ideas.length]];
  const label = wk ? `${fmt(D[0], { month: "short", day: "2-digit" })} – ${fmt(D[6], { month: "short", day: "2-digit", year: "numeric" })}` : fmt(cm, { month: "long", year: "numeric" });

  const mv = (d: number) => {
    if (wk) setCw(d ? addD(cw, 7 * d) : mon(new Date()));
    else if (d) setCm(new Date(cm.getFullYear(), cm.getMonth() + d, 1)); else { const n = new Date(); n.setDate(1); setCm(n); }
  };
  const cview = (v: "week" | "month") => {
    if (v === "month") { const c = addD(cw, 3); setCm(new Date(c.getFullYear(), c.getMonth(), 1)); }
    else { const n = new Date(); setCw(n.getMonth() === cm.getMonth() && n.getFullYear() === cm.getFullYear() ? mon(n) : mon(cm)); }
    setView(v);
  };
  const end = () => { setDrag(null); setDIdea(null); setOver(null); };
  // La date ET le statut suivent le calendrier (futur = Scheduled, sinon Draft)
  const drop = async (k: string) => {
    const slug = drag, idea = dIdea; end();
    if (idea) { if (can && k) ih.write(idea, k); return; }
    if (!can || !slug) return;
    const a = A.find((x) => x.slug === slug);
    if (!a || k === (a.date || "")) return;
    if (!k && a.status === "Live") return toast("Published articles keep their date");
    let st = !k ? "Draft" : a.status === "Live" ? "Live" : k > t ? "Scheduled" : "Draft";
    if (a.status === "Live" && k > t) {
      if (!(await ask({ t: "Move a published article?", p: `“${a.title}” is live. Moving it to a future date will set it back to Scheduled.`, ok: "Move" }))) return;
      st = "Scheduled";
    }
    try {
      await api("/articles/" + encodeURIComponent(a.slug), { method: "PATCH", body: { date: k, status: st } });
      await reload();
      toast(k ? `Moved to ${fmt(new Date(k + "T00:00:00"), { month: "short", day: "numeric" })} · ${st}` : "Moved to Unscheduled");
    } catch (e: any) { toast(e.message); }
  };
  const addIdea = async (title: string) => {
    if (!can || !title.trim()) return;
    try { await api("/articles", { method: "POST", body: { slug: slugify(title), title: title.trim(), cat: cats[0] || "", date: "", status: "Draft" } }); await reload(); } catch (e: any) { toast(e.message); }
  };
  const card = (a: Article, sm?: boolean) => <WCard key={a.slug} a={a} sm={sm} can={can} onOpen={() => openArticle(a.slug)} onDrag={() => setDrag(a.slug)} onEnd={end} />;
  const dz = (k: string) => ({ onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(k); }, onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }, onDrop: (e: React.DragEvent) => { e.preventDefault(); drop(k); } });
  const segBtn = (on: boolean) => `cursor-pointer px-3.5 text-sm font-medium ${on ? "bg-pill text-text-1" : "text-text-2"}`;

  return (
    <div className={pageCls}>
      <div className="flex flex-wrap items-center gap-2.5">
        <PillBtn onClick={() => mv(0)}>Today</PillBtn>
        <div className="flex h-10 overflow-hidden rounded-12 border border-border"><button className={segBtn(wk)} onClick={() => cview("week")}>Week</button><button className={segBtn(!wk)} onClick={() => cview("month")}>Month</button></div>
        <div className="flex h-10 items-center overflow-hidden rounded-12 border border-border">
          <button aria-label="Previous" onClick={() => mv(-1)} className="grid h-full w-10 cursor-pointer place-items-center text-text-2 hover:bg-icon"><Icon k="chevL" size={16} /></button>
          <span className="flex h-full items-center whitespace-nowrap border-x border-border px-3.5 text-sm font-medium">{label}</span>
          <button aria-label="Next" onClick={() => mv(1)} className="grid h-full w-10 cursor-pointer place-items-center text-text-2 hover:bg-icon"><Icon k="chevR" size={16} /></button>
        </div>
        <div className="relative ml-auto min-w-[200px] max-w-[340px] flex-1 max-[640px]:ml-0 max-[640px]:max-w-none max-[640px]:basis-full">
          <Icon k="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
          <input className={`${fieldCls} w-full pl-10`} placeholder="Search articles…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select  value={cat} onChange={(v) => setCat(v)}><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
      </div>

      <div className="flex gap-[26px] overflow-x-auto border-b border-border">
        {tabs.map(([k, l, c]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-0.5 py-3 text-[15px] font-medium ${tab === k ? "border-accent text-accent" : "border-transparent text-text-2"}`}>
            {l}<span className="rounded-full bg-pill px-2 py-px text-xs text-text-2">{c}</span>
          </button>
        ))}
      </div>

      {tab === "ideas" && (
        <Widget>
          <div className="flex items-center gap-2 text-base font-medium">Unscheduled articles</div>
          {can && <input className={`${fieldCls} w-full`} placeholder="Add a title and press Enter" onKeyDown={(e) => { if (e.key === "Enter") { addIdea(e.currentTarget.value); e.currentTarget.value = ""; } }} />}
          {ideas.length ? <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">{ideas.map((a) => card(a))}</div> : <p className="px-0.5 text-[13px] text-text-2">Nothing unscheduled. Type a title above and press Enter.</p>}
          <p className="px-0.5 text-[13px] text-text-2">Drag a card onto a day below to schedule it.</p>
        </Widget>
      )}

      {user.role !== "link" && <IdeasPanel h={ih} onDrag={setDIdea} onEnd={end} />}

      <div className="overflow-x-auto rounded-16 border border-border bg-surface">
        <div className="grid min-w-[1050px] grid-cols-[repeat(7,minmax(150px,1fr))]">
          {(wk ? D : D.slice(0, 7)).map((d) => (
            <div key={d.toISOString()} className={`border-b border-l border-border bg-icon p-3 text-center text-[13px] first:border-l-0 ${wk && ds(d) === t ? "font-semibold text-accent" : "font-medium text-text-2"}`}>
              {wk ? String(d.getDate()).padStart(2, "0") + " " : ""}{fmt(d, { weekday: "short" }).toUpperCase()}
            </div>
          ))}
          {D.map((d, i) => {
            const k = ds(d), we = d.getDay() % 6 === 0, isT = k === t;
            return (
              <div key={k} {...dz(k)} onClick={() => can && openNewArticle(k)}
                className={`flex cursor-pointer flex-col gap-1.5 border-l border-border p-2 hover:bg-icon ${i % 7 === 0 ? "border-l-0" : ""} ${wk ? "min-h-[300px]" : "min-h-[112px] border-t"} ${!wk && d.getMonth() !== m ? "opacity-45" : ""} ${isT ? "bg-accent/[.04]" : ""} ${over === k ? "!bg-accent/[.08] shadow-[inset_0_0_0_2px_var(--accent)]" : ""} ${drag || dIdea ? "[&>*]:pointer-events-none" : ""}`}
                style={we ? { backgroundImage: "repeating-linear-gradient(135deg,transparent 0 7px,var(--border-soft) 7px 8px)" } : undefined}>
                {!wk && <span className={`text-xs ${isT ? "font-semibold text-accent" : "text-text-2"}`}>{d.getDate()}</span>}
                {vis.filter((a) => a.date === k).map((a) => card(a, !wk))}
              </div>
            );
          })}
        </div>
      </div>
      {!vis.length && tab !== "ideas" && <p className="px-0.5 text-[13px] text-text-2">Nothing {tab === "all" ? "planned" : tab.toLowerCase()} in this {wk ? "week" : "month"} — click a day to plan an article, or drag an idea onto it.</p>}
      {drag && (
        <div {...dz("")} className={`flex items-center justify-center gap-2 rounded-[14px] border-2 border-dashed p-3.5 text-[13px] ${over === "" ? "border-accent bg-accent/[.06] text-accent" : "border-border text-text-2"}`}>
          <Icon k="x" size={16} />Drop here to unschedule
        </div>
      )}
    </div>
  );
}
