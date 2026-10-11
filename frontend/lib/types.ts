export type Article = {
  slug: string; img: string; alt: string; title: string; meta: string; sub: string; cat: string; t: string[];
  html: string; coverPrompt: string; date: string; time: string; status: string;
  framerState: string; framerNote: string; framerSyncedAt: string | null;
};
export type UpcomingArticle = Article & { scheduledAt: string };
export type User = {
  name: string; email: string; job: string; bio: string; role: "admin" | "editor" | "viewer" | "link"; avatar: string;
  notifications: { seo?: boolean; editorial?: boolean; gsc?: boolean };
};
export type GscStatus = { configured: boolean; connected: boolean; site: string; domain: string; connectedAt: string | null };
export type GscRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };
export type Perf = {
  range: { start: string; end: string; days: number };
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  previous: { clicks: number; impressions: number };
  series: GscRow[]; devices: { key: string; clicks: number; impressions: number }[];
  queries: GscRow[]; pages: GscRow[];
};
