"use client";
import Select from "@/components/Select";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Cta, PillBtn, Skeleton, SkeletonLine } from "@/components/ui";
import { useFeedback } from "@/components/feedback";
import { Acts, Field, FieldGrid, PanelHead, Split, inpCls, taCls } from "@/components/split";
import { api } from "@/lib/api";
import { useData } from "@/lib/data";
import { Swatch } from "@/components/CoverGen";
import { since } from "@/lib/seo";
import { exportArticlesCsv } from "@/lib/export";

const Badge = ({ on, a, b }: { on: boolean; a: string; b: string }) => <span className={`rounded-6 px-[7px] py-1 text-[10px] font-medium ${on ? "bg-positive-bg text-positive" : "bg-pill text-text-2"}`}>{on ? a : b}</span>;
const How = ({ children }: { children: React.ReactNode }) => <div className="rounded-12 bg-icon p-4 text-[13px] text-text-2"><b className="text-text-1">How to connect</b><ol className="mt-2 list-decimal space-y-1 pl-5">{children}</ol></div>;
const Hint = ({ children, bad }: { children: React.ReactNode; bad?: boolean }) => <p className={`text-xs ${bad ? "text-negative" : "text-text-3"}`}>{children}</p>;
const sel = `${inpCls} cursor-pointer`;
const SettingsSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <div aria-label="Loading settings" aria-busy="true" className="space-y-4">
    <SkeletonLine className="h-4 w-2/5" />
    {Array.from({ length: rows }, (_, i) => <div key={i} className="space-y-2"><SkeletonLine className="w-1/4" /><Skeleton className="h-10 w-full rounded-10" /></div>)}
  </div>
);

function Gsc() {
  const { gsc, user, reload } = useData();
  const { toast, ask } = useFeedback();
  const own = user.role === "admin";
  const [sites, setSites] = useState<{ site: string }[]>([]);
  useEffect(() => { if (gsc.connected) api("/gsc/sites").then(setSites).catch((e) => toast(e.message)); /* eslint-disable-next-line */ }, [gsc.connected]);
  const connect = async () => { try { location.href = (await api("/gsc/auth-url")).url; } catch (e: any) { toast(e.message); } };
  const disc = async () => {
    if (!(await ask({ t: "Disconnect Search Console?", p: "Performance data will be unavailable until you reconnect.", ok: "Disconnect", danger: true }))) return;
    try { await api("/gsc", { method: "DELETE" }); await reload(); toast("Search Console disconnected"); } catch (e: any) { toast(e.message); }
  };
  const setSite = async (site: string) => { try { await api("/gsc/site", { method: "PUT", body: { site } }); await reload(); toast("Property updated"); } catch (e: any) { toast(e.message); } };
  return <>
    <PanelHead title="Google Search Console" desc="Real clicks, queries and pages for your blog, straight from Google." right={<Badge on={gsc.connected} a="Connected" b="Not connected" />} />
    {!gsc.configured && <Hint bad>GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing in backend/.env.</Hint>}
    <FieldGrid>
      <Field full label="Search Console property">
        <Select className="w-full" disabled={!own} value={gsc.site} onChange={(v) => setSite(v)}>{(sites.length ? sites : [{ site: gsc.site }]).map((x) => <option key={x.site}>{x.site}</option>)}</Select>
      </Field>
      <Field label="Website domain"><input className={inpCls} disabled value={/^sc-domain:/.test(gsc.site) ? "www." + gsc.domain : gsc.domain} readOnly /></Field>
      <Field label="Connected since"><input className={inpCls} disabled readOnly value={gsc.connectedAt ? new Date(gsc.connectedAt).toLocaleString("en") : "—"} /></Field>
    </FieldGrid>
    <Hint>Pick the property that owns your blog: sc-domain:uxboga.com (domain) or https://www.uxboga.com/ (URL prefix).</Hint>
    {own ? <Acts one={!gsc.connected}>{gsc.connected && <PillBtn onClick={disc}>Disconnect</PillBtn>}<Cta onClick={connect}>{gsc.connected ? "Reconnect" : "Connect Google"}</Cta></Acts> : <Hint>Only the owner can connect or change Search Console.</Hint>}
    <How><li>Enable the Search Console API in Google Cloud Console.</li><li>Create an OAuth client (Web application) and add <b>/api/gsc/callback</b> of your API as an authorized redirect URI.</li><li>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env, click Connect Google and sign in with the account that owns the property.</li></How>
  </>;
}

type AiP = { hasKey: boolean; last4?: string; model?: string };
type Ai = { ready: boolean; provider: string; anthropic: AiP; groq: AiP; brief: string; language: string; coverStyle?: string };
const AIL: Record<string, string> = { anthropic: "Claude", groq: "Groq" };
function AiPanel() {
  const { user } = useData();
  const { toast, ask } = useFeedback();
  const own = user.role === "admin";
  const [ai, setAi] = useState<Ai | null>(null);
  const [selP, setSelP] = useState<string | null>(null);
  const [models, setModels] = useState<Record<string, { id: string; name: string }[]>>({});
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const load = () => api<Ai>("/ai/settings").then(setAi).catch((e) => { toast(e.message); setAi({ ready: false, provider: "anthropic", anthropic: { hasKey: false }, groq: { hasKey: false }, brief: "", language: "English" }); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  if (!ai) return <><PanelHead title="AI assistant" desc="Generate article ideas and full drafts from your content data." /><SettingsSkeleton rows={4} /></>;
  const sel0 = selP || ai.provider, cur = (ai as any)[sel0] as AiP;
  const put = async (b: object, msg: string) => { try { setAi(await api<Ai>("/ai/settings", { method: "PUT", body: b })); toast(msg); return true; } catch (e: any) { toast(e.message); return false; } };
  const loadModels = async (p = sel0) => { setBusy(true); try { setModels((m) => ({ ...m, [p]: [] })); const r = await api("/ai/models?provider=" + p); setModels((m) => ({ ...m, [p]: r.models })); } catch (e: any) { toast(e.message); } setBusy(false); };
  const saveKey = async () => { if (!key.trim()) return toast("Paste your API key first"); if (await put({ [sel0 + "Key"]: key.trim() }, "Key verified and saved")) { setKey(""); loadModels(); } };
  const rmKey = async () => { if (await ask({ t: `Remove the ${AIL[sel0]} key?`, p: "AI features stop working with this provider until you add a new key.", ok: "Remove", danger: true }) && await put({ clearKeys: [sel0] }, "Key removed")) setModels((m) => ({ ...m, [sel0]: [] })); };
  const setModel = (m: string) => setAi({ ...ai, [sel0]: { ...cur, model: m } } as Ai);
  const save = async () => { if (await put({ provider: sel0, brief: ai.brief, language: ai.language, coverStyle: ai.coverStyle || "", [sel0 + "Model"]: cur.model }, "AI settings saved")) setSelP(null); };
  const ms = models[sel0]?.length ? models[sel0] : cur.model ? [{ id: cur.model, name: cur.model }] : [];
  return <>
    <PanelHead title="AI assistant" desc="Generate article ideas and full drafts from your content data. API keys are stored encrypted on the server and are never shown again." right={<Badge on={ai.ready} a="Ready" b="Not configured" />} />
    <div className="grid grid-cols-2 gap-2.5 max-[560px]:grid-cols-1">
      {(["anthropic", "groq"] as const).map((p) => (
        <button key={p} disabled={!own} onClick={() => { setSelP(p); if (ai[p].hasKey && !models[p]) loadModels(p); }} className={`flex cursor-pointer items-center gap-3 rounded-12 border p-3.5 text-left ${sel0 === p ? "border-accent bg-accent/[.04]" : "border-border"}`}>
          <span className="flex size-8 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: p === "groq" ? "#f55036" : "#d97757" }}>{p === "groq" ? "G" : "C"}</span>
          <div><b className="block text-sm font-medium">{p === "anthropic" ? "Claude (Anthropic)" : "Groq"}</b><span className="text-xs text-text-3">{ai[p].hasKey ? "Key saved ••••" + ai[p].last4 : "No key yet"}{ai.provider === p ? " · active" : ""}</span></div>
        </button>
      ))}
    </div>
    {own ? <>
      <FieldGrid>
        <Field full label={`${AIL[sel0]} API key`} hint={`Create a key at ${sel0 === "anthropic" ? "console.anthropic.com" : "console.groq.com/keys"}. It is checked with ${AIL[sel0]} before being saved.`}>
          <div className="flex gap-2"><input className={`${inpCls} flex-1`} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={cur.hasKey ? "Paste a new key to replace the saved one" : sel0 === "anthropic" ? "sk-ant-…" : "gsk_…"} /><PillBtn onClick={saveKey}>Save key</PillBtn>{cur.hasKey && <PillBtn onClick={rmKey}>Remove</PillBtn>}</div>
        </Field>
        <Field full label="Model">
          <div className="flex gap-2"><Select className="flex-1" disabled={!cur.hasKey} value={cur.model || ""} onChange={(v) => setModel(v)}>{ms.length ? ms.map((m) => <option key={m.id} value={m.id}>{m.name === m.id ? m.id : `${m.name} · ${m.id}`}</option>) : <option>Save a key to load models</option>}</Select><PillBtn disabled={!cur.hasKey} onClick={() => loadModels()}>{busy ? "Loading…" : "Refresh models"}</PillBtn></div>
        </Field>
        <Field full label="Brand & strategy notes" hint="Added to every prompt so ideas and articles follow your strategy.">
          <textarea className={taCls} maxLength={2000} placeholder="Audience, tone of voice, business goals, topics to prioritise or avoid…" value={ai.brief} onChange={(e) => setAi({ ...ai, brief: e.target.value })} />
        </Field>
        <Field label="Content language"><Select className="w-full" value={ai.language} onChange={(v) => setAi({ ...ai, language: v })}>{["English", "French", "Spanish", "German", "Arabic", "Italian", "Portuguese"].map((l) => <option key={l}>{l}</option>)}</Select></Field>
      </FieldGrid>
      <Acts one><Cta onClick={save}>Use {AIL[sel0]} and save settings</Cta></Acts>
    </> : <Hint>Only the owner can change AI settings.</Hint>}
  </>;
}

type CvAi = { ready: boolean; coverStyle?: string; coverStyleSource?: string; coverStyleAt?: string; coverProfile?: { ratio: string; palette: string[]; samples: number }; imageKeywords?: string; imageKeywordsSource?: string; imageNegative?: string; hf?: { hasKey: boolean; last4?: string; model?: string } };
function CoverPanel() {
  const { user } = useData();
  const { toast, ask } = useFeedback();
  const own = user.role === "admin";
  const [ai, setAi] = useState<CvAi | null>(null);
  const [models, setModels] = useState<{ id: string }[]>([]);
  const [loadM, setLoadM] = useState(false), [analyzing, setAnalyzing] = useState(false);
  const [tok, setTok] = useState("");
  const fetchModels = async () => { setLoadM(true); try { const r = await api("/ai/image-models"); setModels(r.models); if (!r.live) toast("Showing a short list — the Hugging Face model list could not be loaded"); } catch (e: any) { toast(e.message); } setLoadM(false); };
  useEffect(() => { api<CvAi>("/ai/settings").then((a) => { setAi(a); if (a.hf?.hasKey) fetchModels(); }).catch((e) => { toast(e.message); setAi({ ready: false }); }); /* eslint-disable-next-line */ }, []);
  const head = <PanelHead title="Cover images" desc="Generate covers with Hugging Face that stay consistent with your previous articles." right={ai && <Badge on={!!ai.hf?.hasKey} a="Ready" b="Not configured" />} />;
  if (!ai) return <>{head}<SettingsSkeleton rows={3} /></>;
  if (!own) return <>{head}<Hint>Only the owner can change cover settings.</Hint></>;
  const h = ai.hf || { hasKey: false }, P = ai.coverProfile;
  const put = async (b: object, msg: string) => { try { setAi(await api<CvAi>("/ai/settings", { method: "PUT", body: b })); toast(msg); return true; } catch (e: any) { toast(e.message); return false; } };
  const ms = [...models]; if (h.model && !ms.some((m) => m.id === h.model)) ms.unshift({ id: h.model });
  const src = ai.coverStyle ? ({ vision: "Learned from your latest cover images", alt: "Inferred from alt texts only (images could not be loaded)", manual: "Written by hand" } as Record<string, string>)[ai.coverStyleSource || ""] || "" : "No style yet";
  const analyze = async () => {
    setAnalyzing(true);
    try { const r = await api("/ai/cover-style/analyze", { method: "POST" }); setAi({ ...ai, coverStyle: r.style, coverStyleSource: r.source, coverStyleAt: r.at, imageKeywords: r.imageKeywords, imageNegative: r.imageNegative, imageKeywordsSource: r.imageKeywordsSource, ...(r.profile ? { coverProfile: r.profile } : {}) }); toast(r.used ? `Style learned from ${r.used} cover${r.used === 1 ? "" : "s"}` : "Style inferred from alt texts"); } catch (e: any) { toast(e.message); }
    setAnalyzing(false);
  };
  const saveTok = async () => { if (!tok.trim()) return toast("Paste your Hugging Face token first"); if (await put({ hfKey: tok.trim() }, "Token verified and saved")) { setTok(""); setModels([]); fetchModels(); } };
  const rmTok = async () => { if (await ask({ t: "Remove the Hugging Face token?", p: "Cover image generation stops working until you add a new token.", ok: "Remove", danger: true }) && await put({ clearKeys: ["hf"] }, "Token removed")) setModels([]); };
  return <>
    {head}
    <FieldGrid>
      <Field full label="Visual style guide" hint="The AI reads your latest covers and writes this guide. Their aspect ratio and colours are measured directly from the images. Edit it freely.">
        <textarea className={taCls} rows={7} maxLength={2500} placeholder={"MEDIUM: …\nPALETTE: …\nCOMPOSITION: …\nAVOID: …"} value={ai.coverStyle || ""} onChange={(e) => setAi({ ...ai, coverStyle: e.target.value })} />
        <div className="mt-2 flex flex-wrap items-center gap-2"><PillBtn disabled={analyzing || !ai.ready} onClick={analyze}>{analyzing ? "Analyzing covers…" : "Analyze my previous covers"}</PillBtn><span className="text-xs text-text-3">{src}{ai.coverStyleAt ? " · " + since(ai.coverStyleAt) : ""}</span></div>
        {P && <div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-pill px-2.5 py-1 text-xs text-text-2" title="Measured on the pixels of your covers">Ratio {P.ratio}</span><Swatch colors={P.palette} /><span className="text-xs text-text-3">Measured on {P.samples} cover{P.samples === 1 ? "" : "s"}</span></div>}
      </Field>
      <Field full label="Style keywords" hint={<>Appended to every image prompt, together with your measured palette. {ai.imageKeywordsSource === "auto" ? "Suggested from your covers — edit freely." : ""}</>}>
        <textarea className={taCls} rows={3} maxLength={600} placeholder="3D render, soft glass, deep navy background, red accent, minimal, generous negative space" value={ai.imageKeywords || ""} onChange={(e) => setAi({ ...ai, imageKeywords: e.target.value })} />
      </Field>
      <Field full label="Things to avoid" hint="Sent to models that support negative prompts (Stable Diffusion family). FLUX ignores it.">
        <textarea className={taCls} rows={2} maxLength={400} placeholder="stock photos, clutter, text, logos" value={ai.imageNegative || ""} onChange={(e) => setAi({ ...ai, imageNegative: e.target.value })} />
      </Field>
      <Field full label="Hugging Face token" hint={<>{h.hasKey ? `Token saved ••••${h.last4}. ` : ""}Create a fine-grained token at huggingface.co/settings/tokens with the “Inference Providers” permission. It is checked with Hugging Face before it is saved.</>}>
        <div className="flex gap-2"><input className={`${inpCls} flex-1`} type="password" autoComplete="off" placeholder={h.hasKey ? "Paste a new token to replace the saved one" : "hf_…"} value={tok} onChange={(e) => setTok(e.target.value)} /><PillBtn onClick={saveTok}>Save token</PillBtn>{h.hasKey && <PillBtn onClick={rmTok}>Remove</PillBtn>}</div>
      </Field>
      <Field full label="Image model" hint="Only models served through Inference Providers are listed. Check a model's licence before commercial use. Images use your Hugging Face credits.">
        <div className="flex gap-2"><Select className="flex-1" disabled={!h.hasKey} value={h.model || ""} onChange={(v) => setAi({ ...ai, hf: { ...h, model: v } })}>{ms.length ? ms.map((m) => <option key={m.id}>{m.id}</option>) : <option>Save a token to load models</option>}</Select><PillBtn disabled={!h.hasKey} onClick={fetchModels}>{loadM ? "Loading…" : "Refresh models"}</PillBtn></div>
      </Field>
    </FieldGrid>
    <Acts one><Cta onClick={() => put({ coverStyle: ai.coverStyle || "", imageKeywords: ai.imageKeywords || "", imageNegative: ai.imageNegative || "", hfModel: h.model }, "Cover settings saved")}>Save cover settings</Cta></Acts>
    <How><li>Analyze your previous covers once: the AI describes their style and the app measures their aspect ratio and colours.</li><li>In any article, generate the cover prompt, then <b>Generate cover image</b>. Every image is made with your style keywords and palette, cropped to your usual ratio, and shown with a style-match score.</li><li>Pick the best one: it is saved as the cover (hosted by your API) when you save the article.</li></How>
  </>;
}

const FRK: [string, string][] = [["title", "Title"], ["meta", "Meta description"], ["sub", "Subtitle"], ["cat", "Category"], ["tags", "Tags"], ["html", "Content"], ["img", "Cover image"], ["alt", "Alt text (separate field)"], ["date", "Publish date & time"]];
function FramerPanel() {
  const { user } = useData();
  const { toast } = useFeedback();
  const own = user.role === "admin";
  const [I, setI] = useState<any>(null);
  const [cols, setCols] = useState<{ id: string; name: string }[]>([]);
  const [fl, setFl] = useState<any>(null);
  const [f, setF] = useState({ url: "", key: "", tz: "", pub: "1", dep: "1", map: {} as Record<string, string> });
  const sync = (i: any) => setF((x) => ({ ...x, url: i.projectUrl || "", tz: i.timezone || "", pub: i.publish ? "1" : "0", dep: i.deploy ? "1" : "0", map: { ...(i.fieldMap || {}) }, key: "" }));
  const flds = (quiet?: boolean) => api("/framer/fields").then(setFl).catch((e) => !quiet && toast(e.message));
  useEffect(() => {
    if (!own) return;
    api("/framer/settings").then((i) => { setI(i); sync(i); if (i.collectionId && i.hasKey) flds(true); }).catch((e) => { toast(e.message); setI({ enabled: false, ready: false, fieldMap: {} }); });
    // eslint-disable-next-line
  }, [own]);
  const head = <PanelHead title="Framer" desc="At the scheduled date and time, the article is added to your Framer CMS and the site is published." right={I && <Badge on={I.enabled} a="Auto-publish on" b="Off" />} />;
  if (!own) return <>{head}<Hint>Only the owner can configure Framer.</Hint></>;
  if (!I) return <>{head}<SettingsSkeleton rows={4} /></>;
  const save = async (extra: Record<string, unknown> = {}, quiet?: boolean) => {
    const b: Record<string, unknown> = { ...extra, projectUrl: f.url.trim(), timezone: f.tz.trim(), publish: f.pub === "1", deploy: f.dep === "1" };
    if (f.key.trim()) b.apiKey = f.key.trim();
    if (fl && !extra.collectionId) b.fieldMap = f.map;
    try { const i = await api("/framer/settings", { method: "PUT", body: b }); setI(i); sync(i); if (!quiet) toast("Framer settings saved"); return true; }
    catch (e: any) { toast(e.message); return false; }
  };
  const connect = async () => { if (!(await save({}, true))) return; try { const c = await api("/framer/collections"); setCols(c); toast(c.length + " collection(s) found"); } catch (e: any) { toast(e.message); } };
  const pick = async (v: string) => { setFl(null); if ((await save({ collectionId: v }, true)) && v) flds(); };
  const list = cols.length ? cols : I.collectionId ? [{ id: I.collectionId, name: I.collectionName || I.collectionId }] : [];
  return <>
    {head}
    <FieldGrid>
      <Field full label="Framer project URL" hint="Copy it from the browser bar while the project is open in Framer. The ID after “--” must be 20 letters/digits (not your published .framer.website address)."><input className={inpCls} placeholder="https://framer.com/projects/My-Site--aBcDeFgHiJkLmNoPqRsT" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
      <Field label="Server API key"><input className={inpCls} type="password" autoComplete="off" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} placeholder={I.hasKey ? `•••• ${I.last4} (saved — paste to replace)` : "Paste your Framer API key"} /></Field>
      <Field label="Time zone"><input className={inpCls} placeholder="Africa/Tunis" value={f.tz} onChange={(e) => setF({ ...f, tz: e.target.value })} /></Field>
      <Field full label="Blog CMS collection">
        <div className="flex gap-2"><Select className="flex-1" value={I.collectionId || ""} onChange={(v) => pick(v)}><option value="">{list.length ? "Choose a collection" : "Click “Connect” to load"}</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select><PillBtn onClick={connect}>Connect</PillBtn></div>
      </Field>
      <Field label="Publish the site"><Select className="w-full" value={f.pub} onChange={(v) => setF({ ...f, pub: v })}><option value="1">Yes — publish after adding the article</option><option value="0">No — only add it to the CMS</option></Select></Field>
      <Field label="Go to production"><Select className="w-full" value={f.dep} onChange={(v) => setF({ ...f, dep: v })}><option value="1">Yes — deploy to the live site</option><option value="0">No — preview deployment only</option></Select></Field>
    </FieldGrid>
    {fl ? <>
      <FieldGrid>{FRK.map(([m, l]) => (
        <Field key={m} label={l}>
          <Select className="w-full" value={f.map[m] || ""} onChange={(v) => setF({ ...f, map: { ...f.map, [m]: v } })}>
            <option value="">Auto{fl.autoNames?.[m] ? " → " + fl.autoNames[m] : " (no match)"}</option><option value="-">Don&apos;t send</option>
            {fl.fields.map((x: any) => <option key={x.id} value={x.id}>{x.name} · {x.type}</option>)}
          </Select>
        </Field>
      ))}</FieldGrid>
      <Hint>Content → a <b>Formatted text</b> field, Cover image → an <b>Image</b> field, Publish date → a <b>Date</b> field. <b>Tags</b> fill Tag 1, Tag 2, Tag 3… one by one. The cover image&apos;s alt text is sent inside the Cover image field itself. Fields that don&apos;t match are skipped.</Hint>
    </> : I.collectionId ? <Hint>Loading the collection fields…</Hint> : null}
    <Acts>
      <PillBtn disabled={!(I.ready || I.enabled)} onClick={() => save({ enabled: !I.enabled })}>{I.enabled ? "Turn off auto-publish" : "Turn on auto-publish"}</PillBtn>
      <Cta onClick={() => save()}>Save</Cta>
    </Acts>
    {!!I.pendingErrors && <Hint bad>{I.pendingErrors} scheduled article(s) failed to publish — open them to see the error and retry.</Hint>}
    <How><li>In Framer open <b>Site Settings → API Keys</b> and create a Server API key (the project URL is the address of your project in Framer).</li><li>Paste both above, click <b>Connect</b>, choose your blog collection and check the field mapping.</li><li>Turn on auto-publish. Scheduled articles go out at their date and time; failures are retried 5 times, then shown on the article.</li></How>
  </>;
}

function Look() {
  const [t, setT] = useState("dark");
  useEffect(() => setT(document.documentElement.getAttribute("data-theme") || "dark"), []);
  const pick = (x: string) => { document.documentElement.setAttribute("data-theme", x); localStorage.setItem("uxb.t", JSON.stringify(x)); setT(x); };
  return <>
    <PanelHead title="Appearance" desc="Choose how the admin looks." />
    <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
      {["dark", "light"].map((x) => (
        <button key={x} onClick={() => pick(x)} className={`flex cursor-pointer flex-col gap-2.5 rounded-12 border p-3 text-left text-sm font-medium ${t === x ? "border-accent" : "border-border"}`}>
          <span className={`flex h-20 items-end gap-1.5 rounded-8 border border-border p-2 ${x === "dark" ? "bg-[#0b1220]" : "bg-[#f8fafc]"}`}>{[1, 2, 3].map((i) => <i key={i} className={`h-${i * 3} flex-1 rounded-sm ${x === "dark" ? "bg-[#1e293b]" : "bg-[#e2e8f0]"}`} style={{ height: i * 12 }} />)}</span>
          {x === "dark" ? "Dark" : "Light"}
        </button>
      ))}
    </div>
  </>;
}
function Data() {
  const { articles } = useData();
  return <>
    <PanelHead title="Data & backup" desc="Your articles are stored in your database." />
    <div className="text-sm text-text-2"><b className="mr-1.5 font-jakarta text-2xl font-semibold text-text-1">{articles.length}</b>articles in database</div>
    <Acts one><PillBtn onClick={() => exportArticlesCsv(articles)}><Icon k="download" />Export CSV</PillBtn></Acts>
  </>;
}

export default function Settings() {
  const [sec, setSec] = useState("gsc");
  useEffect(() => { const k = new URLSearchParams(location.search).get("s"); if (k) setSec(k); }, []);
  return (
    <Split items={[["gsc", "Search Console", "search"], ["ai", "AI assistant", "sparkles"], ["cover", "Cover images", "image"], ["framer", "Framer", "globe"], ["look", "Appearance", "palette"], ["data", "Data & backup", "database"]]} cur={sec} onSelect={setSec}>
      {sec === "gsc" && <Gsc />}{sec === "ai" && <AiPanel />}{sec === "cover" && <CoverPanel />}{sec === "framer" && <FramerPanel />}{sec === "look" && <Look />}{sec === "data" && <Data />}
    </Split>
  );
}
