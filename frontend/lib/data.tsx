"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getShare, getToken } from "./api";
import type { Article, GscStatus, Perf, UpcomingArticle, User } from "./types";
import AppSkeleton from "@/components/AppSkeleton";

const mapA = (a: any): Article => ({
  slug: a.slug, img: a.img || "", alt: a.alt || "", title: a.title, meta: a.meta || "", sub: a.sub || "", cat: a.cat || "",
  t: [0, 1, 2].map((i) => (a.t || [])[i] || ""), html: a.html || "<p></p>", coverPrompt: a.coverPrompt || "",
  date: a.date || "", time: a.time || "09:00", status: a.status, framerState: a.framerState || "",
  framerNote: a.framerNote || "", framerSyncedAt: a.framerSyncedAt || null,
});

type Ctx = {
  user: User; articles: Article[]; upcoming: UpcomingArticle[]; gsc: GscStatus;
  perf: (days: number) => Promise<Perf | null>;
  reload: () => Promise<void>;
};
const C = createContext<Ctx | null>(null);
export const useData = () => { const c = useContext(C); if (!c) throw new Error("DataProvider manquant"); return c; };

export function DataProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [s, setS] = useState<{ user: User; articles: Article[]; upcoming: UpcomingArticle[]; gsc: GscStatus } | null>(null);
  const [err, setErr] = useState("");
  const cache = useRef<Record<number, Perf>>({});

  const reload = useCallback(async () => {
    const [user, arts, upcoming, gsc] = await Promise.all([api("/auth/me"), api("/articles?full=1"), api("/articles/upcoming"), api("/gsc/status")]);
    cache.current = {};
    setS({ user, articles: arts.map(mapA), upcoming: upcoming.map((a: UpcomingArticle) => ({ ...mapA(a), scheduledAt: a.scheduledAt })), gsc });
  }, []);

  useEffect(() => {
    const sh = new URLSearchParams(location.search).get("share");
    if (sh) { sessionStorage.setItem("uxb.share", sh); history.replaceState(null, "", location.pathname); }
    if (!getToken() && !getShare()) { router.replace("/login"); return; }
    reload().catch((e) => setErr(e.message));
  }, [reload, router]);

  const perf = useCallback(async (days: number) => {
    if (!s?.gsc.connected) return null;
    if (cache.current[days]) return cache.current[days];
    return (cache.current[days] = await api<Perf>("/gsc/performance?days=" + days));
  }, [s?.gsc.connected]);

  if (err) return <div className="grid min-h-screen place-items-center text-center text-text-2">Could not reach the API ({err}).<br /><a href="/" className="text-accent">Retry</a> · <a href="/login" className="text-accent">Sign in</a></div>;
  if (!s) return <AppSkeleton />;
  return <C.Provider value={{ ...s, perf, reload }}>{children}</C.Provider>;
}

/** Données Search Console pour une période (null = non connecté / erreur) */
export function usePerf(days: number) {
  const { perf } = useData();
  const [d, setD] = useState<{ data: Perf | null; loading: boolean; error: string }>({ data: null, loading: true, error: "" });
  const [n, setN] = useState(0);
  useEffect(() => {
    let off = false;
    setD((x) => ({ ...x, loading: true }));
    perf(days).then((data) => !off && setD({ data, loading: false, error: "" })).catch((e) => !off && setD({ data: null, loading: false, error: e.message }));
    return () => { off = true; };
  }, [days, perf, n]);
  return { ...d, retry: () => setN((x) => x + 1) };
}
