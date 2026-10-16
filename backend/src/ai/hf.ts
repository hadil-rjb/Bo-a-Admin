import { BadGatewayException, BadRequestException, HttpException } from "@nestjs/common";
import sharp from "sharp";
import { sniff } from "./image";

export const HF_DEFAULT_MODEL = "black-forest-labs/FLUX.1-schnell";
export const HF_CURATED = [HF_DEFAULT_MODEL, "black-forest-labs/FLUX.1-dev", "stabilityai/stable-diffusion-3.5-large", "stabilityai/stable-diffusion-3.5-large-turbo"];
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Vérifie un jeton Hugging Face avant de l'enregistrer */
export async function hfWhoami(token: string) {
  let res: Response;
  try { res = await fetch("https://huggingface.co/api/whoami-v2", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new BadGatewayException("Could not reach Hugging Face"); }
  if (res.status === 401 || res.status === 403) throw new BadRequestException("Hugging Face rejected the token");
  if (!res.ok) throw new BadGatewayException(`Hugging Face error (${res.status})`);
  const j: any = await res.json().catch(() => ({}));
  return { name: String(j.name ?? "") };
}

/** Modèles text-to-image servis par au moins un Inference Provider (liste courte de secours si le Hub est injoignable) */
export async function hfImageModels(token?: string) {
  try {
    const res = await fetch("https://huggingface.co/api/models?pipeline_tag=text-to-image&inference_provider=all&sort=likes&limit=30", { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      const j: any[] = await res.json();
      const models = j.map(x => ({ id: String(x.id ?? x.modelId ?? ""), likes: Number(x.likes ?? 0) })).filter(x => /^[\w.-]+\/[\w.-]+$/.test(x.id));
      if (models.length) return { models, live: true };
    }
  } catch { /* repli ci-dessous */ }
  return { models: HF_CURATED.map(id => ({ id, likes: 0 })), live: false };
}

/* ───────────── Prompt, dimensions, paramètres ───────────── */
/** Sépare le prompt généré par l'IA (sujet + « Aspect ratio » + « Avoid ») */
export function splitCoverPrompt(text: string) {
  const ratio = /^\s*Aspect ratio\s*:\s*(\d{1,2}:\d{1,2})\s*$/im.exec(text)?.[1];
  const avoid = /^\s*Avoid\s*:\s*(.+)$/im.exec(text)?.[1]?.trim();
  const subject = text.replace(/^\s*(Aspect ratio|Avoid)\s*:.*$/gim, "").replace(/\s+/g, " ").trim();
  return { subject, ratio, avoid };
}
/** Sujet + mots-clés de style de la marque + palette mesurée : c'est ce qui garde les couvertures cohérentes d'un article à l'autre */
export function composePrompt(subject: string, keywords?: string, palette?: string[]) {
  const parts = [subject.replace(/[.\s]+$/, ""), keywords?.trim() ? `Style: ${keywords.trim().replace(/[.\s]+$/, "")}` : "", palette?.length ? `Dominant colour palette: ${palette.slice(0, 4).join(", ")}` : ""].filter(Boolean);
  return clip(parts.join(". ") + ".", 1400);
}
export function dimsFor(ratio: string, model: string) {
  const [a, b] = ratio.split(":").map(Number), r = a / b || 16 / 9;
  const flux = /flux/i.test(model), long = flux ? 1344 : /sd3|stable-diffusion-3|xl/i.test(model) ? 1216 : 1024, step = flux ? 16 : 64;
  const snap = (n: number) => Math.max(256, Math.round(n / step) * step);
  return { width: snap(r >= 1 ? long : long * r), height: snap(r >= 1 ? long / r : long) };
}
export function paramsFor(model: string, o: { width: number; height: number; negative?: string; seed: number }) {
  const m = model.toLowerCase(), p: Record<string, unknown> = { width: o.width, height: o.height, seed: o.seed };
  if (m.includes("flux")) { // FLUX n'a pas de negative prompt
    if (m.includes("schnell")) p.num_inference_steps = 4; else { p.num_inference_steps = 28; p.guidance_scale = 3.5; }
  } else {
    if (o.negative) p.negative_prompt = clip(o.negative, 400);
    if (/turbo|lightning|lcm/.test(m)) { p.num_inference_steps = 4; p.guidance_scale = 1; }
    else if (/sd3|stable-diffusion-3/.test(m)) { p.num_inference_steps = 28; p.guidance_scale = 4.5; }
    else if (/xl/.test(m)) { p.num_inference_steps = 30; p.guidance_scale = 7; }
  }
  return p;
}

/* ───────────── Post-traitement : ratio exact + WebP léger ───────────── */
export async function toCover(raw: Buffer, ratio: string, maxW = 1600) {
  if (!sniff(raw)) throw new BadGatewayException("The provider did not return an image");
  try {
    const [a, b] = ratio.split(":").map(Number), target = a / b || 16 / 9;
    const m = await sharp(raw, { failOn: "none" }).metadata();
    if (!m.width || !m.height) throw new Error("no size");
    let left = 0, top = 0, cw = m.width, ch = m.height;
    if (Math.abs(cw / ch - target) / target > 0.01) {
      if (cw / ch > target) { cw = Math.round(ch * target); left = Math.round((m.width - cw) / 2); }
      else { ch = Math.round(cw / target); top = Math.round((m.height - ch) / 2); }
    }
    let pipe = sharp(raw, { failOn: "none" }).extract({ left, top, width: cw, height: ch });
    if (cw > maxW) pipe = pipe.resize({ width: maxW });
    let q = 84, out = await pipe.clone().webp({ quality: q }).toBuffer();
    while (out.length > 900_000 && q > 55) { q -= 10; out = await pipe.clone().webp({ quality: q }).toBuffer(); }
    const mm = await sharp(out).metadata();
    return { buf: out, width: mm.width ?? cw, height: mm.height ?? ch };
  } catch { throw new BadGatewayException("The provider returned an unreadable image"); }
}
/** Ré-encode une image envoyée par le navigateur (supprime les métadonnées, garantit un vrai WebP) */
export async function reencode(raw: Buffer, maxW = 1600) {
  const t = sniff(raw);
  if (!t || t === "image/gif") throw new BadRequestException("This is not a PNG, JPEG or WebP image");
  try {
    const pipe = sharp(raw, { failOn: "none" }).resize({ width: maxW, withoutEnlargement: true });
    let q = 84, out = await pipe.clone().webp({ quality: q }).toBuffer();
    while (out.length > 1_500_000 && q > 50) { q -= 10; out = await pipe.clone().webp({ quality: q }).toBuffer(); }
    const m = await sharp(out).metadata();
    return { buf: out, width: m.width ?? 0, height: m.height ?? 0 };
  } catch { throw new BadRequestException("This image could not be read — it may be corrupted"); }
}

/* ───────────── Erreurs ───────────── */
const statusOf = (e: any): number | undefined => e?.httpResponse?.status ?? e?.status;
/** Jamais de 401 renvoyé tel quel : le navigateur déconnecterait l'utilisateur */
export function mapHfError(e: any): HttpException {
  if (e instanceof HttpException) return e;
  const st = statusOf(e), body = e?.httpResponse?.body, msg = clip(typeof body === "string" ? body : body?.error?.message ?? body?.error ?? body?.message ?? e?.message, 200);
  if (e?.name === "AbortError" || e?.name === "TimeoutError") return new BadGatewayException("The image provider took too long to respond");
  if (st === 401) return new BadRequestException("Hugging Face rejected the token — save a new one in Settings → Cover images");
  if (st === 402) return new HttpException("Your Hugging Face inference credits are used up — purchase credits or enable Hugging Face PRO, then try again", 402);
  if (st === 403) return new BadRequestException("This token cannot call Inference Providers — create a fine-grained token with the Inference Providers permission");
  if (st === 404 || e?.name === "InferenceClientRoutingError" || /no provider|not (supported|available)/i.test(msg)) return new BadRequestException("This model is not available through Inference Providers — choose another model in Settings → Cover images");
  if (st === 429) return new BadGatewayException("Hugging Face rate limit reached — try again shortly");
  if (st === 400 || st === 422) return new BadGatewayException(`The provider refused this request: ${msg}`);
  return new BadGatewayException(`Image generation failed${st ? ` (${st})` : ""}: ${msg || "unknown error"}`);
}

export type HfLike = { textToImage: (args: any, options?: any) => Promise<Blob> };
export type GenOpts = { model: string; provider?: string; prompt: string; negative?: string; ratio: string; seed?: number; signal?: AbortSignal; sleep?: (ms: number) => Promise<void> };

/** Appelle Inference Providers (le client choisit le fournisseur) : jeu complet de paramètres, puis minimal, puis aucun si le modèle les refuse */
export async function generateCover(client: HfLike, o: GenOpts) {
  const { width, height } = dimsFor(o.ratio, o.model), seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);
  const attempts: (Record<string, unknown> | undefined)[] = [paramsFor(o.model, { width, height, negative: o.negative, seed }), { width, height }, undefined];
  const sleep = o.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
  let last: unknown, warm = false;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const blob = await client.textToImage({ provider: o.provider ?? "auto", model: o.model, inputs: o.prompt, ...(attempts[i] ? { parameters: attempts[i] } : {}) }, { outputType: "blob", signal: o.signal });
      const out = await toCover(Buffer.from(await blob.arrayBuffer()), o.ratio);
      return { ...out, seed, model: o.model };
    } catch (e) {
      last = e;
      const st = statusOf(e);
      if (st === 503 && !warm) { warm = true; i--; await sleep(8_000); continue; } // modèle en cours de chargement
      if ((st === 400 || st === 422) && i < attempts.length - 1) continue;
      break;
    }
  }
  throw mapHfError(last);
}
