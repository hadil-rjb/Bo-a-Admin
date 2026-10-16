"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect } from "react";
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
    </>
  );
}
