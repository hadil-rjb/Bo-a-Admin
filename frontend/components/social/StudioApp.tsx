"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import { persist, toLogin } from "@/lib/social/persist";
import { applyWorkspace } from "@/lib/workspace";

type BlogArticle = { t: string; c: string };
let articlesCache: BlogArticle[] | null = null;

/** Latest live Blog Admin articles, for the studio's "From your blog" panel. */
async function fetchBlogArticles() {
  try {
    const list = await api<{ title: string; cat?: string; status?: string; date?: string }[]>("/articles");
    articlesCache = list
      .filter((a) => a.status === "Live")
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .slice(0, 3)
      .map((a) => ({ t: a.title, c: a.cat || "Blog" }));
  } catch {
    // keep the brand's own list
  }
  return articlesCache;
}

/** First visit waits for the articles; later visits use the last list and refresh it in the background. */
const blogArticles = () => (articlesCache ? (void fetchBlogArticles(), Promise.resolve(articlesCache)) : fetchBlogArticles());

const Sk = ({ w, h, r, style }: { w?: number | string; h: number; r?: number; style?: React.CSSProperties }) => (
  <i className="skel" style={{ display: "block", width: w ?? "100%", height: h, borderRadius: r, flexShrink: 0, ...style }} />
);

/** Placeholder with the studio's layout while the session, workspace and engine load. */
function StudioSkeleton() {
  const [editor, setEditor] = useState(false);
  useLayoutEffect(() => setEditor(location.hash.startsWith("#/editor")), []);
  if (editor) {
    return (
      <div className="boot" aria-busy="true" aria-label="Opening the editor">
        <div className="boot-top" style={{ borderBottom: "1px solid var(--border)", padding: "12px 16px" }}>
          <Sk w={32} h={32} r={8} /><Sk w={180} h={14} /><span style={{ flex: 1 }} /><Sk w={88} h={36} r={10} /><Sk w={110} h={36} r={10} />
        </div>
        <div className="boot-ed">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRight: "1px solid var(--border)" }}>{[0, 1, 2, 3, 4, 5].map((i) => <Sk key={i} h={40} r={10} />)}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRight: "1px solid var(--border)" }}><Sk w={120} h={16} /><Sk h={44} r={10} /><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{[0, 1, 2, 3].map((i) => <Sk key={i} h={150} r={10} />)}</div></div>
          <div style={{ display: "grid", placeItems: "center", padding: 24 }}><Sk w="min(420px, 80%)" h={520} r={12} style={{ maxHeight: "70vh" }} /></div>
        </div>
      </div>
    );
  }
  return (
    <div className="boot" aria-busy="true" aria-label="Loading the Social Media workspace">
      <aside className="boot-side">
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16, marginBottom: 8, borderBottom: "1px solid var(--border-soft)" }}>
          <Sk w={36} h={36} r={10} /><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Sk w={70} h={12} /><Sk w={130} h={10} /></div>
        </div>
        {[0, 1, 2, 3, 4].map((i) => <Sk key={i} h={36} r={8} />)}
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
          <Sk w={36} h={36} r={18} /><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Sk w={80} h={12} /><Sk w={140} h={10} /></div>
        </div>
      </aside>
      <div className="boot-main">
        <div className="boot-top">
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Sk w={220} h={20} /><Sk w="min(360px, 70%)" h={12} /></div>
          <Sk w={120} h={40} r={999} /><Sk w={40} h={40} r={10} />
        </div>
        <div className="boot-page">
          <div className="boot-stats">{[0, 1, 2, 3].map((i) => <div key={i} className="widget" style={{ display: "flex", flexDirection: "column", gap: 10 }}><Sk w={90} h={12} /><Sk w={60} h={26} /><Sk w={110} h={10} /></div>)}</div>
          <div className="boot-grid">{[0, 1].map((i) => (
            <div key={i} className="widget" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Sk w={140} h={16} />
              {[0, 1, 2].map((j) => <div key={j} style={{ display: "flex", alignItems: "center", gap: 12 }}><Sk w={48} h={48} r={10} /><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Sk w="70%" h={12} /><Sk w="40%" h={10} /></div><Sk w={64} h={22} r={6} /></div>)}
            </div>
          ))}</div>
          <div className="boot-cards">{[0, 1, 2, 3].map((i) => <div key={i} className="card"><Sk h={250} r={0} /><div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}><Sk w="75%" h={12} /><Sk w="45%" h={10} /></div></div>)}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * The Social Media workspace shell, identical to the original studio <body> markup. The studio
 * engine renders the sidebar, top bar, pages, editor and modals into these containers and
 * handles routing (#/overview, #/planner, #/studio, #/brand, #/settings, #/editor/:id).
 *
 * It mounts and unmounts with the route, so moving between workspaces is a client-side
 * navigation: on leave, destroy() removes everything the engine added to the page and the
 * workspace is saved; coming back resumes from memory.
 */
export default function StudioApp() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // Layout effect: the studio is torn down in the same commit that shows the next page
  useLayoutEffect(() => {
    applyWorkspace("social");
    let destroy: (() => void) | undefined;
    let cancelled = false;

    // The studio navigates with the URL hash. Mark those history entries as this page's, so
    // Back/Forward from another workspace returns here (the router ignores entries it didn't create).
    const entry = history.state;
    const stamp = () => {
      if (entry?.__NA && !history.state?.__NA) history.replaceState(entry, "", location.href);
    };
    addEventListener("hashchange", stamp);

    (async () => {
      if (!getToken()) return toLogin();
      const user = await api("/auth/me"); // redirects to /login when the session expired
      persist.init(user);
      const [initialState, articles, { bootStudio }] = await Promise.all([persist.load(), blogArticles(), import("@/studio/engine")]);
      if (cancelled) return;
      destroy = bootStudio({ initialState, persist, user, blogArticles: articles, navigate: (href: string) => router.push(href), api });
      setReady(true);
    })().catch((e) => console.error("[social] could not start the studio", e));

    return () => {
      cancelled = true;
      removeEventListener("hashchange", stamp);
      destroy?.();
    };
  }, [router]);

  return (
    <>
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
      {!ready && <StudioSkeleton />}
    </>
  );
}
