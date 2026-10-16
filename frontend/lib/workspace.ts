/** Workspaces share one root layout and one stylesheet; <html data-ws> tells the CSS which one is active. */
export type Workspace = "blog" | "social";

export const workspaceOf = (pathname: string): Workspace => (/^\/social-media(\/|$)/.test(pathname) ? "social" : "blog");

/** Per-workspace document language (unchanged from the separate apps) */
export const LANG: Record<Workspace, string> = { blog: "fr", social: "en" };

/** Runs before first paint (inline in <head>): saved theme + workspace of the current URL. */
export const BOOT_SCRIPT = `try{var t=JSON.parse(localStorage.getItem("uxb.t"));document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark")}catch(e){document.documentElement.setAttribute("data-theme","dark")}
var w=/^\\/social-media(\\/|$)/.test(location.pathname)?"social":"blog";document.documentElement.setAttribute("data-ws",w);document.documentElement.lang=w==="social"?"en":"fr";`;

export function applyWorkspace(ws: Workspace) {
  const html = document.documentElement;
  if (html.dataset.ws !== ws) html.dataset.ws = ws;
  if (html.lang !== LANG[ws]) html.lang = LANG[ws];
}
