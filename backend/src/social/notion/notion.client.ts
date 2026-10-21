import { BadGatewayException, BadRequestException } from "@nestjs/common";

/** Notion API version: databases keep their database_id (Notion Calendar shows any database with a date) */
export const NOTION_VERSION = "2022-06-28";

/**
 * A minimal Notion REST client. Waits and retries when Notion rate-limits (HTTP 429, about 3 requests a
 * second per integration), and never passes Notion's 401 through (the admin would be signed out).
 */
export class NotionClient {
  constructor(private token: string, private base: string) {}

  async call<T = any>(method: string, path: string, body?: unknown, tries = 4): Promise<T> {
    for (let i = 0; ; i++) {
      let res: Response;
      try {
        res = await fetch(`${this.base}${path}`, {
          method,
          headers: { Authorization: `Bearer ${this.token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (e: any) {
        if (i < tries - 1) { await wait(800 * (i + 1)); continue; }
        throw new BadGatewayException(`Couldn't reach Notion: ${e?.name === "TimeoutError" ? "it took too long" : e?.message || e}`);
      }
      if (res.status === 429 && i < tries - 1) { await wait(Math.min(10, Number(res.headers.get("retry-after")) || 1 + i) * 1000); continue; }
      if (res.status >= 500 && i < tries - 1) { await wait(1000 * (i + 1)); continue; }
      const j: any = await res.json().catch(() => ({}));
      if (res.ok) return j as T;
      const msg = String(j?.message || res.statusText).slice(0, 300);
      if (res.status === 401) throw new BadRequestException("Notion rejected the token. Check it, or create a new one.");
      if (res.status === 404 || j?.code === "object_not_found") throw new BadRequestException(`Notion can't see it: share the page or database with your integration (••• → Connections). ${msg}`);
      if (res.status === 400) throw new BadRequestException(`Notion: ${msg}`);
      throw new BadGatewayException(`Notion error ${res.status}: ${msg}`);
    }
  }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plain text of a Notion title / rich_text array */
export const plain = (rt: any[] | undefined) => (rt || []).map((t) => t?.plain_text ?? t?.text?.content ?? "").join("");
/** A rich_text value (Notion caps one text object at 2000 characters) */
export const text = (s: string) => (s ? [{ type: "text", text: { content: s.slice(0, 2000) } }] : []);
