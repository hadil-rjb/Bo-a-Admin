"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import S from "./S";
import Icon from "./Icon";
import { Cta, IconBtn, PillBtn, btn } from "./ui";
import { useFeedback } from "./feedback";
import { inpCls } from "./split";
import { api } from "@/lib/api";
import { useData } from "@/lib/data";

export type Idea = { _id: string; title: string; cat: string; keyword?: string; rationale?: string; priority: number; format: string; intent: string; angle?: string; outline?: string[]; tags?: string[] };
type AiS = { ready: boolean; provider: string; anthropic: { model?: string }; groq: { model?: string } };
const up1 = (s?: string) => (s ? s[0].toUpperCase() + s.slice(1) : "");
const prio = (p: number): [string, string] => (p >= 75 ? ["High", "bg-positive-bg text-positive"] : p >= 45 ? ["Medium", "bg-[rgba(217,119,6,.12)] text-[#d97706]"] : ["Low", "bg-pill text-text-2"]);

export function useIdeas() {
  const { user, reload } = useData();
  const { toast, ask } = useFeedback();
  const router = useRouter();
  const can = user.role === "admin" || user.role === "editor";
  const [ai, setAi] = useState<AiS | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [gen, setGen] = useState(false);
  const [busy, setBusy] = useState<string[]>([]);
  useEffect(() => {
    if (user.role === "link") return;
    Promise.all([api("/ai/settings"), api("/ai/ideas")]).then(([a, i]) => { setAi(a); setIdeas(i); }).catch(() => setAi({ ready: false, provider: "anthropic", anthropic: {}, groq: {} }));
  }, [user.role]);
  const generate = useCallback(async () => {
    if (!can || gen) return;
    const f = await ask({ t: "Generate article ideas", p: "The AI studies your articles and Search Console data to find gaps and quick wins. Optionally add a focus: a topic, a campaign or a keyword.", input: "", ph: "Focus (optional)", ok: "Generate" });
    if (f === null) return;
    setGen(true);
    try { setIdeas((await api("/ai/ideas/generate", { method: "POST", body: { count: 6, focus: String(f).trim() || undefined } })).ideas); toast("New ideas ready"); } catch (e: any) { toast(e.message); }
    setGen(false);
  }, [can, gen, ask, toast]);
  const dismiss = useCallback(async (id: string) => { try { await api("/ai/ideas/" + id, { method: "DELETE" }); setIdeas((x) => x.filter((i) => i._id !== id)); } catch (e: any) { toast(e.message); } }, [toast]);
  const write = useCallback(async (id: string, date?: string) => {
    if (!can || busy.includes(id)) return;
    setBusy((b) => [...b, id]); toast("Writing the article… this can take up to a minute");
    try {
      const a = await api("/ai/ideas/" + id + "/article", { method: "POST", body: date ? { date } : {} });
      setIdeas((x) => x.filter((i) => i._id !== id)); await reload(); toast("Draft ready — review it before publishing");
      router.push(`/articles?edit=${encodeURIComponent(a.slug)}`);
    } catch (e: any) { toast(e.message); }
    setBusy((b) => b.filter((x) => x !== id));
  }, [can, busy, toast, reload, router]);
  return { can, ai, ideas, gen, busy, generate, dismiss, write, own: user.role === "admin" };
}
export type Ideas = ReturnType<typeof useIdeas>;

export function IdeasPanel({ h, onDrag, onEnd }: { h: Ideas; onDrag: (id: string) => void; onEnd: () => void }) {
  const router = useRouter();
  const [all, setAll] = useState(false), [open, setOpen] = useState<string | null>(null);
  const { ai, ideas, gen, busy, can } = h;
  const rd = !!ai?.ready, lbl = rd && ai ? (ai.provider === "groq" ? "Groq" : "Claude") + " · " + ((ai as any)[ai.provider].model || "") : "";
  const L = all ? ideas : ideas.slice(0, 4);
  const sk = (k: number) => [...Array(k)].map((_, i) => <div key={i} className="h-[132px] animate-pulse rounded-12 bg-pill" />);
  const empty = "flex flex-col items-start gap-3 rounded-12 border border-dashed border-border p-4 text-[13px] text-text-2";
  return (
    <div className="flex flex-col gap-3 rounded-16 border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><b className="flex items-center gap-1.5 text-base font-medium"><Icon k="sparkles" size={20} className="text-accent" />Article ideas</b><span className="text-xs text-text-3">{rd ? "From your catalog and Search Console · " + lbl : "Connect an AI provider to get ideas"}</span></div>
        {can && rd && <PillBtn disabled={gen} onClick={h.generate}>{gen ? "Generating…" : ideas.length ? "More ideas" : "Generate ideas"}</PillBtn>}
      </div>
      {!ai ? <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">{sk(3)}</div>
        : !rd ? <div className={empty}><p>{h.own ? "Add your Claude or Groq API key and the AI will suggest article ideas from your data, then write full drafts." : "Ask the owner to connect an AI provider in Settings → AI."}</p>{h.own && <Cta onClick={() => router.push("/settings?s=ai")}>Connect AI</Cta>}</div>
        : !ideas.length && !gen ? <div className={empty}><p>No ideas yet. The AI studies your articles and Search Console data to suggest what to publish next.</p>{can && <Cta onClick={h.generate}>Generate ideas</Cta>}</div>
        : <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">
            {gen && sk(2)}
            {L.map((i) => {
              const b = busy.includes(i._id), [pl, pc] = prio(i.priority);
              return (
                <div key={i._id} tabIndex={0} role="button" onClick={() => setOpen(i._id)} onKeyDown={(e) => e.key === "Enter" && setOpen(i._id)} draggable={can && !b}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", i._id); e.dataTransfer.effectAllowed = "move"; onDrag(i._id); }} onDragEnd={onEnd}
                  title={`Click for details${can ? " · drag onto a day to write and schedule it" : ""}`}
                  className={`flex cursor-pointer flex-col gap-1.5 rounded-12 border border-border p-3 hover:border-accent ${b ? "pointer-events-none opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-2"><b className="text-[13px] font-medium leading-snug">{i.title}</b>
                    {can && <button title="Dismiss" aria-label="Dismiss idea" disabled={b} onClick={(e) => { e.stopPropagation(); h.dismiss(i._id); }} className={btn("ghost", "icon-sm", "-mr-1 -mt-1")}><Icon k="x" /></button>}</div>
                  <p className="text-[11px] text-text-3">{i.cat}{i.keyword ? ` · “${i.keyword}”` : ""}</p>
                  <p className="line-clamp-2 text-xs text-text-2" title={i.rationale}>{i.rationale}</p>
                  <div className={`mt-auto flex items-center gap-2 rounded-8 px-2 py-1.5 text-[11px] font-medium ${pc}`}><span className="flex-1">{pl} priority · {i.format}</span>
                    {can && <button disabled={b} onClick={(e) => { e.stopPropagation(); h.write(i._id); }} className={btn("secondary", "sm")}>{b ? "Writing…" : "Write article"}</button>}</div>
                </div>
              );
            })}
          </div>
          {ideas.length > 4 && <PillBtn className="self-start" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${ideas.length} ideas`}</PillBtn>}
        </>}
      {open && ideas.find((i) => i._id === open) && <IdeaDrawer i={ideas.find((x) => x._id === open)!} h={h} onClose={() => setOpen(null)} />}
    </div>
  );
}

function IdeaDrawer({ i, h, onClose }: { i: Idea; h: Ideas; onClose: () => void }) {
  const [date, setDate] = useState("");
  const b = h.busy.includes(i._id), [pl, pc] = prio(i.priority);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const dg = (l: string, v: React.ReactNode, full?: boolean) => <div className={full ? "col-span-full" : ""}><span className="block text-xs text-text-3">{l}</span><b className="text-sm font-medium">{v}</b></div>;
  const ck = "rounded-6 bg-pill px-2 py-1 text-[11px] text-text-2";
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[min(520px,100%)] flex-col border-l border-border bg-surface shadow-[-20px_0_40px_rgba(0,0,0,.25)]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3"><IconBtn onClick={onClose}><Icon k="x" /></IconBtn><p className="flex-1 font-medium">Article idea</p></div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-1.5"><span className={`rounded-6 px-2 py-1 text-[11px] font-medium ${pc}`}>{pl} priority <b>{i.priority}</b></span><span className={ck}>{up1(i.format)}</span><span className={ck}>{up1(i.intent)}</span></div>
          <h2 className="font-jakarta text-xl font-semibold leading-snug">{i.title}</h2>
          {i.angle && <p className="text-sm text-text-2">{i.angle}</p>}
          {i.rationale && <div className="flex gap-2.5 rounded-12 bg-icon p-3.5"><Icon k="sparkles" size={18} className="text-accent" /><div><b className="text-sm font-medium">Why this idea</b><p className="mt-1 text-[13px] text-text-2">{i.rationale}</p></div></div>}
          {!!i.outline?.length && <><h4 className="text-xs font-medium uppercase tracking-[0.06em] text-text-3">Suggested structure</h4><ol className="list-decimal space-y-1.5 pl-5 text-sm">{i.outline.map((o) => <li key={o}>{o}</li>)}</ol></>}
          <h4 className="text-xs font-medium uppercase tracking-[0.06em] text-text-3">Details</h4>
          <div className="grid grid-cols-2 gap-3.5">{dg("Category", i.cat || "—")}{dg("Primary keyword", i.keyword ? `“${i.keyword}”` : "—")}{dg("Search intent", up1(i.intent))}{dg("Format", up1(i.format))}{dg("Tags", <span className="flex flex-wrap gap-1.5">{(i.tags || []).map((t) => <span key={t} className={ck}>{t}</span>)}{!i.tags?.length && "—"}</span>, true)}</div>
          {h.can && <><h4 className="text-xs font-medium uppercase tracking-[0.06em] text-text-3">Schedule</h4><input type="date" className={inpCls} value={date} onChange={(e) => setDate(e.target.value)} /><p className="text-xs text-text-3">Optional — pick a publish date, or leave empty to save the article as a draft.</p></>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          {h.can ? <><PillBtn disabled={b} onClick={() => { h.dismiss(i._id); onClose(); }}>Dismiss</PillBtn><Cta disabled={b} onClick={() => h.write(i._id, date || undefined)}>{b ? "Writing the article…" : "Write full article"}</Cta></> : <span className="text-xs text-text-3">View only</span>}
        </div>
      </aside>
    </>
  );
}
