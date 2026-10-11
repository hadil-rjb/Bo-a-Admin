"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import S from "./S";
import { Cta, PillBtn } from "./ui";
import { useFeedback } from "./feedback";
import { api } from "@/lib/api";
import { useData } from "@/lib/data";

type Cand = { image: string; model: string; width: number; height: number; bytes: number; match?: number | null };
type Hf = { hasKey: boolean; model?: string };
export const Swatch = ({ colors, n = 6 }: { colors: string[]; n?: number }) => (
  <span className="inline-flex items-center gap-1">{colors.slice(0, n).map((c) => <i key={c} title={c} className="inline-block size-[18px] rounded-full border border-border" style={{ background: c }} />)}</span>
);
const ck = "rounded-full bg-pill px-2.5 py-1 text-xs text-text-2";

/** Panneau « Generate cover image » de l'éditeur (Hugging Face, style appris des anciennes couvertures) */
export default function CoverGen({ title, slug, ensurePrompt, onUse }: { title: string; slug: string; ensurePrompt: () => Promise<string>; onUse: (url: string) => void }) {
  const { user } = useData();
  const { toast } = useFeedback();
  const [ai, setAi] = useState<{ hf?: Hf; coverProfile?: { ratio: string; palette: string[] } } | null>(null);
  const [cg, setCg] = useState<Cand[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("/ai/settings").then(setAi).catch(() => setAi({})); }, []);
  const ok = !!ai?.hf?.hasKey, P = ai?.coverProfile;

  const gen = async () => {
    if (!title) return toast("Add a title first");
    setBusy(true);
    try {
      const prompt = await ensurePrompt();
      if (!prompt.trim()) throw new Error("Could not create a cover prompt");
      const r = await api<Cand>("/ai/cover-image", { method: "POST", body: { prompt } });
      setCg((x) => [r, ...x].slice(0, 4));
    } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  const use = async (i: number) => {
    const c = cg[i];
    try { const r = await api("/media/cover", { method: "POST", body: { dataUrl: c.image, model: c.model } }); onUse(r.url); setCg((x) => x.filter((_, j) => j !== i)); toast("Cover applied — save the article to keep it"); } catch (e: any) { toast(e.message); }
  };
  const dl = (i: number) => { const a = document.createElement("a"); a.href = cg[i].image; a.download = (slug || "cover") + "-cover.webp"; document.body.appendChild(a); a.click(); a.remove(); };

  return (
    <div className="mt-3 flex flex-col gap-2.5 border-t border-border-soft pt-3">
      {ok && <div className="flex flex-wrap items-center gap-2"><span className={ck} title="Image model">{ai!.hf!.model}</span>{P && <><span className={ck} title="Aspect ratio measured on your covers">{P.ratio}</span><Swatch colors={P.palette} n={5} /></>}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <PillBtn disabled={busy || !ok} onClick={gen}><Icon k="sparkles" size={16} />{busy ? "Generating image…" : cg.length ? "Generate another" : "Generate cover image"}</PillBtn>
        {!ok && <span className="text-xs text-text-3">{!ai ? "Loading…" : user.role === "admin" ? <><Link href="/settings?s=cover" className="cursor-pointer text-accent">Set up Hugging Face</Link> to generate images.</> : "Ask the owner to connect Hugging Face."}</span>}
        {busy && <span className="text-xs text-text-3">This usually takes 10–40 seconds…</span>}
      </div>
      {(cg.length > 0 || busy) && (
        <div className="grid grid-cols-2 gap-2.5 max-[560px]:grid-cols-1">
          {busy && <div className="aspect-video animate-pulse rounded-12 bg-pill" />}
          {cg.map((c, i) => (
            <figure key={i} className="m-0 flex flex-col gap-2 rounded-12 border border-border p-2">
              <img src={c.image} alt={`Generated cover candidate ${i + 1}`} className="w-full rounded-8 bg-pill object-cover" />
              <figcaption className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-text-3">
                <span>{c.width}×{c.height} · {Math.round(c.bytes / 1024)} KB</span>
                {c.match != null && <span title="Palette similarity with your previous covers" className={`rounded-6 px-1.5 py-0.5 font-medium ${c.match >= 75 ? "bg-positive-bg text-positive" : c.match >= 50 ? "bg-[rgba(217,119,6,.12)] text-[#d97706]" : "bg-negative-bg text-negative"}`}>Style match {c.match}%</span>}
              </figcaption>
              <div className="flex gap-1.5"><Cta className="flex-1 justify-center" onClick={() => use(i)}>Use as cover</Cta><PillBtn title="Download" onClick={() => dl(i)}><Icon k="download" size={15} /></PillBtn><PillBtn title="Discard" onClick={() => setCg((x) => x.filter((_, j) => j !== i))}><Icon k="x" size={15} /></PillBtn></div>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
