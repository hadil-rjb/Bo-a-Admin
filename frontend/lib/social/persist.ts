import { getToken } from "@/lib/api";

/**
 * Persistence adapter between the Social Media studio engine and the NestJS API (/api/social).
 *
 * - load():  reads the workspace (brands, per-brand data, settings) from the API.
 * - save():  called by the engine; caches locally and schedules a sync.
 * - watch(): autosaves any change (editor edits don't call save() themselves).
 * - reset(): deletes the workspace so the demo data is seeded again on reload.
 *
 * Sync is a delta: only brands / designs / posts that changed since the last sync are sent,
 * plus the ones this tab deleted. Items created elsewhere (another tab, the REST API) are
 * never removed by a stale tab.
 *
 * A full copy is kept in localStorage and flagged "pending" until the API confirms it, so
 * nothing is lost if the tab closes mid-request or the API is briefly unreachable. A small
 * fingerprint of the last synced state is stored too, so pending edits are diffed against
 * what this browser actually synced (and never delete items it has not seen).
 *
 * Requests use the admin session (Bearer token from the login page). Local copies are kept
 * per user, and viewers (read-only role) never write.
 *
 * The studio can be left and re-entered without a page reload: dispose() sends what is pending,
 * and the next load() starts from the in-memory workspace, so switching back is instant.
 */

export type Workspace = {
  brands: any[];
  data: Record<string, any>;
  active: string;
  set?: Record<string, unknown>;
};

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/$/, "");

// Local keys, suffixed with the user id by init()
let CACHE = "boga.studio.v2";
let PENDING = "boga.studio.pending";
let BASE = "boga.studio.synced";
const DEBOUNCE_MS = 600;
const WATCH_MS = 2000;
const KEEPALIVE_MAX = 60_000; // browsers cap keepalive bodies at 64 KB

const ls = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

/** Session expired / signed out: back to the login page, then here again. */
export const toLogin = () => {
  try {
    localStorage.removeItem("uxb.token");
  } catch {}
  location.replace("/login?next=" + encodeURIComponent(location.pathname + location.hash));
};

const authFetch = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${API_URL}/social${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken(), ...(init.headers || {}) },
  });
  if (res.status === 401) {
    toLogin();
    throw new Error("Session expired");
  }
  return res;
};

const isWorkspace = (v: any): v is Workspace => !!v && Array.isArray(v.brands) && v.brands.length > 0 && !!v.data;

/** JSON with sorted keys, so the same content always compares equal. */
const stable = (v: unknown): string => {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().filter((k) => (v as any)[k] !== undefined).map((k) => JSON.stringify(k) + ":" + stable((v as any)[k])).join(",") + "}";
  }
  return JSON.stringify(v) ?? "null";
};

/** cyrb53: fast 53-bit string hash, used to fingerprint items. */
const hash = (str: string) => {
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

/* ---------- workspace -> comparable model ---------- */
type Model = {
  items: Map<string, string>; // "b|brand" | "d|brand|id" | "p|brand|id" -> content hash
  values: Map<string, any>;
  brandOrder: string[];
  designOrder: Record<string, string[]>;
  postOrder: Record<string, string[]>;
  ws: string;
};

function toModel(w: Workspace): Model {
  const m: Model = { items: new Map(), values: new Map(), brandOrder: [], designOrder: {}, postOrder: {}, ws: hash(stable({ active: w.active, set: w.set ?? {} })) };
  const put = (k: string, compare: unknown, value: any) => {
    m.items.set(k, hash(stable(compare)));
    m.values.set(k, value);
  };
  for (const b of w.brands) {
    const id = String(b.id);
    const { designs = [], posts = [], ...content } = w.data[id] || {};
    m.brandOrder.push(id);
    put("b|" + id, { kit: b, content }, { id, kit: b, content });
    m.designOrder[id] = designs.filter((d: any) => d && d.id).map((d: any) => (put(`d|${id}|${d.id}`, d, { brandId: id, item: d }), d.id));
    m.postOrder[id] = posts.filter((p: any) => p && p.id).map((p: any) => (put(`p|${id}|${p.id}`, p, { brandId: id, item: p }), p.id));
  }
  return m;
}

const saveBase = (m: Model) =>
  ls.set(BASE, JSON.stringify({ items: [...m.items], brandOrder: m.brandOrder, designOrder: m.designOrder, postOrder: m.postOrder, ws: m.ws }));

const loadBase = (): Model | null => {
  try {
    const v = JSON.parse(ls.get(BASE) || "null");
    return v && { ...v, items: new Map(v.items), values: new Map() };
  } catch {
    return null;
  }
};

type Delta = {
  active?: string;
  set?: Record<string, unknown>;
  brandOrder?: string[];
  brands?: { id: string; kit: any; content: any }[];
  designs?: { brandId: string; item: any }[];
  posts?: { brandId: string; item: any }[];
  designOrder?: Record<string, string[]>;
  postOrder?: Record<string, string[]>;
  deleted?: { brands: string[]; designs: { brandId: string; id: string }[]; posts: { brandId: string; id: string }[] };
};

/** What changed from `base` (last state the server confirmed) to `cur`. null = nothing. */
function diff(base: Model | null, cur: Model, ws: Workspace): Delta | null {
  const d: Delta = {};
  let changed = false;
  const kinds = { b: "brands", d: "designs", p: "posts" } as const;
  cur.items.forEach((json, k) => {
    if (base?.items.get(k) === json) return;
    const list = ((d as any)[kinds[k[0] as "b"]] ||= []);
    list.push(cur.values.get(k));
    changed = true;
  });
  if (base) {
    const del: NonNullable<Delta["deleted"]> = { brands: [], designs: [], posts: [] };
    base.items.forEach((_, k) => {
      if (cur.items.has(k)) return;
      const [kind, brandId, id] = k.split("|");
      if (kind === "b") del.brands.push(brandId);
      else (kind === "d" ? del.designs : del.posts).push({ brandId, id });
    });
    if (del.brands.length || del.designs.length || del.posts.length) {
      d.deleted = del;
      changed = true;
    }
  }
  const same = (a?: string[], b?: string[]) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
  if (!same(base?.brandOrder, cur.brandOrder)) {
    d.brandOrder = cur.brandOrder;
    changed = true;
  }
  for (const id of cur.brandOrder) {
    if (!same(base?.designOrder[id], cur.designOrder[id])) ((d.designOrder ||= {})[id] = cur.designOrder[id]), (changed = true);
    if (!same(base?.postOrder[id], cur.postOrder[id])) ((d.postOrder ||= {})[id] = cur.postOrder[id]), (changed = true);
  }
  if (base?.ws !== cur.ws) {
    d.active = ws.active;
    d.set = ws.set ?? {};
    changed = true;
  }
  return changed ? d : null;
}

function createPersist() {
  let base: Model | null = null; // last state confirmed by the API (null = unknown)
  let latest = ""; // last snapshot staged by the engine
  let lastSynced = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let inflight: Promise<void> | null = null;
  let queued = false;
  let resetting = false;
  let localFailed = false;
  let onFail: (() => void) | undefined;
  let readOnly = false;
  let userId = "";
  let getState: (() => Workspace) | null = null;
  let exit: (() => void) | null = null;
  const onHidden = () => document.hidden && exit?.();

  const send = (delta: Delta, keepalive = false) => authFetch("/workspace", { method: "PATCH", body: JSON.stringify(delta), keepalive });

  async function push(): Promise<void> {
    if (readOnly || resetting || !latest || latest === lastSynced) return;
    if (inflight) {
      queued = true;
      return inflight;
    }
    // .finally runs after the assignment even when sync() has nothing to send and finishes at once
    inflight = sync(latest).finally(() => {
      inflight = null;
      if (queued) {
        queued = false;
        void push();
      }
    });
    return inflight;
  }

  async function sync(snapshot: string) {
    try {
      const ws = JSON.parse(snapshot) as Workspace;
      const cur = toModel(ws);
      const delta = diff(base, cur, ws);
      if (delta) {
        const res = await send(delta);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      base = cur;
      lastSynced = snapshot;
      saveBase(cur);
      if (snapshot === latest) ls.del(PENDING);
    } catch (e) {
      console.warn("[persist] could not save to the API", e);
      if (localFailed) onFail?.();
    }
  }

  function stage(json: string) {
    if (readOnly || resetting || json === latest) return;
    latest = json;
    localFailed = !(ls.set(CACHE, json) && ls.set(PENDING, "1"));
    clearTimeout(timer);
    timer = setTimeout(() => void push(), DEBOUNCE_MS);
  }

  /** Last chance when the tab closes: small deltas can still be delivered with keepalive. */
  function flushOnExit() {
    if (resetting || !latest || latest === lastSynced || inflight) return;
    try {
      const ws = JSON.parse(latest) as Workspace;
      const delta = diff(base, toModel(ws), ws);
      const body = delta && JSON.stringify(delta);
      if (body && body.length <= KEEPALIVE_MAX) send(delta!, true).catch(() => {});
      // Larger changes stay "pending" in localStorage and are pushed on the next load.
    } catch {}
  }

  return {
    /** Who is signed in: scopes the local copy to this user; viewers are read-only. */
    init(user: { _id?: string; id?: string; role?: string }) {
      const id = String(user._id || user.id || "me");
      if (id !== userId) {
        // another account: forget this session's in-memory state
        userId = id;
        base = null;
        latest = lastSynced = "";
        resetting = false;
      }
      CACHE = `boga.studio.v2:${id}`;
      PENDING = `boga.studio.pending:${id}`;
      BASE = `boga.studio.synced:${id}`;
      readOnly = !["admin", "editor"].includes(String(user.role));
    },

    get readOnly() {
      return readOnly;
    },

    async load(): Promise<Workspace | null> {
      // Back in the workspace during this session: resume from memory (edits were pushed on leave)
      if (latest && !resetting) return JSON.parse(latest) as Workspace;
      let local: Workspace | null = null;
      try {
        const v = JSON.parse(ls.get(CACHE) || "null");
        if (isWorkspace(v)) local = v;
      } catch {}
      const pending = ls.get(PENDING) === "1" && !!local;

      try {
        const res = await authFetch("/workspace", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { workspace } = await res.json();
        if (pending) {
          // Unsaved local edits win; watch() pushes what changed since this browser's last sync.
          // Without a fingerprint nothing is deleted, only upserted.
          base = isWorkspace(workspace) ? loadBase() : null; // empty server: send everything
          return local;
        }
        if (isWorkspace(workspace)) {
          base = toModel(workspace);
          saveBase(base);
          ls.set(CACHE, JSON.stringify(workspace));
          return workspace;
        }
        base = null;
        return local; // empty database: keep local data if any, otherwise the demo is seeded
      } catch (e) {
        console.warn("[persist] API unreachable, using the local copy", e);
        base = loadBase();
        return local;
      }
    },

    save(snapshot: Workspace, fail?: () => void) {
      if (fail) onFail = fail;
      stage(JSON.stringify(snapshot));
    },

    watch(get: () => Workspace) {
      this.dispose();
      getState = get;
      interval = setInterval(() => stage(JSON.stringify(get())), WATCH_MS);
      exit = () => {
        stage(JSON.stringify(get()));
        flushOnExit();
      };
      addEventListener("pagehide", exit);
      document.addEventListener("visibilitychange", onHidden);
    },

    /** The studio is unmounting (e.g. switching to the Blog Admin): save now and stop watching. */
    dispose() {
      if (getState) {
        stage(JSON.stringify(getState()));
        clearTimeout(timer);
        void push();
      }
      clearInterval(interval);
      if (exit) removeEventListener("pagehide", exit);
      document.removeEventListener("visibilitychange", onHidden);
      getState = exit = null;
    },

    /** Wipes the shared social workspace (admin only). Resolves false when not allowed. */
    async reset(): Promise<boolean> {
      try {
        const res = await authFetch("/workspace", { method: "DELETE" });
        if (!res.ok) return false;
      } catch (e) {
        console.warn("[persist] could not reset the workspace on the API", e);
        return false;
      }
      resetting = true;
      clearTimeout(timer);
      clearInterval(interval);
      ls.del(CACHE);
      ls.del(PENDING);
      ls.del(BASE);
      return true;
    },

    /** Same as the Blog Admin's "Sign out" (the caller navigates to /login) */
    signOut() {
      try {
        localStorage.removeItem("uxb.token");
      } catch {}
    },
  };
}

export type Persist = ReturnType<typeof createPersist>;
export const persist = createPersist();
