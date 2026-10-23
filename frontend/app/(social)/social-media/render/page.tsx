"use client";

import { useEffect } from "react";

/**
 * Headless renderer for the API (backend/src/social/publishing/live-render.service.ts).
 *
 * A live post (economic calendar, price alert, news) scheduled with no studio tab open still has to go
 * out with fresh data: that day's events, the latest price or the latest headlines.
 * The API opens this page in headless Chromium, calls bogaBoot() with the post's brand, design and
 * settings, then bogaRender(): the studio engine itself applies the live data and renders the slides,
 * so the files are identical to what "Schedule" in the studio uploads.
 *
 * The page holds no data and makes no API calls: requests the engine makes go to window.bogaApi,
 * which the API exposes to the page (only live data is answered: calendar events, quotes, news, photos).
 */
type Renderer = { renderPost: (designId: string, postId: string) => Promise<{ images: string[]; live: unknown[]; texts?: string[] }> };
type Win = Window & {
  bogaApi?: (path: string) => Promise<unknown>;
  bogaBoot?: (state: unknown) => Promise<boolean>;
  bogaRender?: (designId: string, postId: string) => Promise<{ images: string[]; live: unknown[]; texts?: string[] }>;
  bogaReady?: boolean;
};

/** The only requests the engine makes while rendering: live data */
const LIVE_PATHS = /^\/social\/(calendar\/events|markets\/(quotes|news|photo))\?/;

const persist = {
  readOnly: true,
  init() {},
  load: async () => null,
  onConflict() {},
  save() {},
  watch() {},
  flush: async () => true,
  dispose() {},
  reset: async () => false,
  signOut() {},
};

export default function StudioRenderPage() {
  useEffect(() => {
    const w = window as Win;
    w.bogaBoot = async (initialState) => {
      const { bootStudio } = await import("@/studio/engine");
      let renderer: Renderer | null = null;
      const api = async (path: string, o?: { method?: string }) => {
        if ((!o?.method || o.method === "GET") && LIVE_PATHS.test(path) && w.bogaApi) return w.bogaApi(path);
        throw new Error("Not available while rendering");
      };
      bootStudio({
        initialState, persist, user: { name: "Boğa", email: "", role: "viewer" }, blogArticles: null,
        navigate: () => {}, api, headless: (r: Renderer) => { renderer = r; },
      });
      if (!renderer) throw new Error("The studio engine has no headless renderer");
      w.bogaRender = (designId, postId) => renderer!.renderPost(designId, postId);
      return true;
    };
    w.bogaReady = true;
  }, []);

  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
      <div id="shell">
        <div className="scrim" id="scrim" hidden></div>
        <aside className="side" id="side"></aside>
        <div className="main">
          <header className="top" id="top"></header>
          <main id="view"></main>
        </div>
      </div>
      <div id="editor" hidden></div>
      <div id="modal-root"></div>
    </div>
  );
}
