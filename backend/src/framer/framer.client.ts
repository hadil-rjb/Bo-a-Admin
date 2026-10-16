import { BadGatewayException, BadRequestException } from "@nestjs/common";

/** Même règle que framer-api : l'ID du projet = exactement 20 caractères alphanumériques (…/projects/Nom--<ID>). */
export function parseFramerProject(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  if (/^[A-Za-z0-9]{20}$/.test(raw)) return `https://framer.com/projects/${raw}`;
  let u: URL;
  try { u = new URL(raw, "https://framer.com"); } catch { throw new BadRequestException("The Framer project URL is not a valid address"); }
  if (/framer\.(website|app|media)$|framer\.website|framerusercontent/.test(u.hostname)) throw new BadRequestException("That is the address of your published website. Use the editor address of the project instead: https://framer.com/projects/Name--XXXXXXXXXXXXXXXXXXXX");
  const seg = u.pathname.split("/").filter(Boolean);
  const i = seg.findIndex(x => x.toLowerCase() === "projects");
  const last = i >= 0 ? decodeURIComponent(seg[i + 1] ?? "") : "";
  const id = last.match(/^.+--([A-Za-z0-9]+)/)?.[1] ?? last;
  if (!/^[A-Za-z0-9]{20}$/.test(id)) throw new BadRequestException("Invalid Framer project URL. Open your project in Framer and copy the address from the browser bar: it looks like https://framer.com/projects/My-Site--aBcDeFgHiJkLmNoPqRsT (the ID after “--” has 20 letters/digits)");
  return `https://framer.com/projects/${seg[i + 1]}`;
}

// framer-api est un module ESM : depuis du CommonJS (NestJS) il faut un import() dynamique réel.
const esm = new Function("s", "return import(s)") as (s: string) => Promise<any>;

/** Ouvre une connexion WebSocket Framer Server API, exécute `fn`, puis ferme toujours la connexion. */
export async function withFramer<T>(projectUrl: string, apiKey: string, fn: (framer: any) => Promise<T>): Promise<T> {
  if (!projectUrl) throw new BadRequestException("Add the Framer project URL first (Settings → Framer)");
  if (!apiKey) throw new BadRequestException("Add the Framer Server API key first (Settings → Framer)");
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 22) {
    throw new BadGatewayException("Framer integration requires Node.js 22 or newer. Restart the backend with Node.js 22+.");
  }
  projectUrl = parseFramerProject(projectUrl);
  let mod: any;
  try { mod = await esm("framer-api"); } catch { throw new BadGatewayException("The framer-api package is not installed (run npm install in backend/, Node 22+ required)"); }
  let framer: any;
  try {
    framer = await Promise.race([
      mod.connect(projectUrl, apiKey), // la clé est passée en simple string (2ᵉ argument)
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 30_000)),
    ]);
  } catch (e: any) {
    const m = String(e?.message ?? e);
    throw new BadRequestException(/unauthor|token|401|403|forbidden|invalid.*key/i.test(m) ? `Framer rejected the API key (${m.slice(0, 100)}). Create a new Server API key in Framer → Site Settings → API Keys.` : `Could not connect to Framer — ${m.slice(0, 160)}`);
  }
  try { return await fn(framer); }
  finally { try { await framer.disconnect(); } catch { /* ignore */ } }
}
