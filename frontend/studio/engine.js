/* eslint-disable */
// @ts-nocheck
/* ============================================================
   Boğa Social Studio — client engine
   Migrated verbatim from boga-social-studio-v13.html so the UI and
   behaviour stay pixel-identical. The only changes are:
     - icons / templates / logo live in their own modules,
     - state is loaded from and saved to the NestJS API (persist),
     - everything runs inside bootStudio() instead of global scripts,
     - it is wired into the admin: signed-in user + account menu, the
       workspace switcher, and Blog Admin articles in "From your blog",
     - it can be unmounted: page-level hooks go through runtime.js and
       bootStudio() returns destroy(), so switching workspaces needs no reload.
   ============================================================ */
import { IC, ic } from './icons';
import { RATIOS, PLATFORMS, FONTS, uid, Tx, Rc, El, Im, BG, EVENTS, EVENTS_DEFAULT, CUR_COLOR, tplCalendar, tplQuote, tplArticle, tplStat, tplLaunch, tplFeatures, tplTestimonial, tplEvent, TPL, FIGMA_FRAMES } from './templates';
import { BOGA_LOGO } from './assets/bogaLogo';
import { createRuntime } from './runtime';

let mounted = null; // destroy() of the running instance

/**
 * Mounts the studio into the shell rendered by <StudioApp/>.
 * @param {{ initialState: any, persist: import('../lib/social/persist').Persist,
 *   user: { name: string, email: string, avatar?: string, role: string },
 *   blogArticles: { t: string, c: string }[] | null, navigate: (href: string) => void,
 *   api: (path: string, o?: { method?: string, body?: unknown }) => Promise<any>,
 *   headless?: (renderer: { renderPost: (designId: string, postId: string) => Promise<{ images: string[], live: any[] }> }) => void }} opts
 *   headless: server-side rendering (see app/(social)/social-media/render): receives the publishing renderer once booted
 * @returns {() => void} destroy: removes every listener, observer, timer and popup the studio added
 */
export function bootStudio({ initialState, persist, user, blogArticles, navigate, api, headless }) {
if (mounted) mounted();
const runtime = createRuntime();
// Page-level globals the engine hooks into, tracked so destroy() can undo them (see runtime.js)
const { window, document, addEventListener, removeEventListener, visualViewport, matchMedia, MutationObserver, ResizeObserver,
  setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame } = runtime.scope;
/** Custom canvas (designs imported from Figma keep their own size): the ratio key is "<w>x<h>" */
const CUSTOM_RE = /^(\d{1,4})x(\d{1,4})$/;
const isCustom = (r) => CUSTOM_RE.test(String(r));
/**
 * Older layers: image adjustments were stored in `fx` (the name of the horizontal flip flag, so adjusted images
 * showed mirrored) and a single overlay in `ov`/`ovo`/`ovh`. Now: `adj` and a list of fills above the image `ovs`.
 */
/** Figma's flip: mirror across the canvas axis, so a rotated layer's angle is mirrored too */
function flipLayer(l, k) {
  migrateLayer(l);
  if (l[k] === true) delete l[k]; else l[k] = true;
  if (l.rot) l.rot = -l.rot;
}
function migrateLayer(l) {
  if (!l || typeof l !== 'object') return l;
  if (l.fx && typeof l.fx === 'object') { if (!l.adj) l.adj = l.fx; delete l.fx; }
  if (l.fy && typeof l.fy === 'object') delete l.fy;
  if (typeof l.ov === 'string') { l.ovs = [{ k: 'grad', v: l.ov, o: l.ovo ?? 1, ...(l.ovh ? { h: true } : {}) }]; delete l.ov; delete l.ovo; delete l.ovh; }
  return l;
}
function ensureRatio(r) {
  const m = CUSTOM_RE.exec(String(r));
  if (m && !Object.prototype.hasOwnProperty.call(RATIOS, r)) Object.defineProperty(RATIOS, r, { value: [+m[1], +m[2]], enumerable: false, configurable: true });
  return r;
}
const ratioLabel = (r) => (isCustom(r) ? 'Custom' : r);
/** Scales a page's layers uniformly into another canvas (centered), e.g. a Figma frame added to a design of another size */
function fitPage(layers, from, to) {
  const [fw, fh] = from, [tw, th] = to; if (fw === tw && fh === th) return layers;
  const k = Math.min(tw / fw, th / fh), ox = (tw - fw * k) / 2, oy = (th - fh * k) / 2, r1 = (n) => Math.round(n * 10) / 10;
  layers.forEach((l) => {
    if (l.name === 'Background' && l.locked) { Object.assign(l, { x: 0, y: 0, w: tw, h: th }); return; }
    l.x = r1(l.x * k + ox); l.y = r1(l.y * k + oy); l.w = r1(l.w * k); l.h = r1(l.h * k);
    ['size', 'ls', 'r', 'sw', 'shb', 'shy'].forEach((p) => { if (l[p]) l[p] = r1(l[p] * k); });
  });
  return layers;
}
/** Renders one slide to an image Blob (set by the export section, used for publishing) */
let renderSlide = null;
/** Live data templates (set by the live data section): forPost(d, post) → the design with that post's data */
let LIVE = null;
/** Waits until the adjusted images of a page are rendered at full size (set by the image adjustments section) */
let fxReady = async () => {};
/** Text of a text layer as HTML (plain, or spans for mixed styles: set by the mixed text section) */
let textHTML = (l) => esc(l.text);
/** Mixed text hooks: apply(prop, value) styles the selected characters (true when it handled the change) */
const RT = { apply: () => false, loadFont: () => {} };
/** Publishing client (v14 section): render + upload slides, publish now, poll results */
let PUB = null;
/** Connected accounts of the active brand (from the API). `S.platforms` mirrors them for the planner. */
const CONN = {
  brand: null, list: null, pending: null, pendingBrand: null,
  load() {
    const b = S.active;
    if (this.pending && this.pendingBrand === b) return this.pending;
    this.pendingBrand = b;
    return (this.pending = api(`/social/brands/${encodeURIComponent(b)}/connections`).then((list) => {
      this.pending = null;
      if (S.active !== b) return null;
      const was = JSON.stringify(this.brand === b ? this.list : null);
      this.brand = b; this.list = list; this.at = Date.now(); this.fresh = was !== JSON.stringify(list);
      const pf = Object.fromEntries(list.map((c) => [c.net, c.connected ? 1 : 0]));
      if (Object.keys(PLATFORMS).some((k) => !!S.platforms[k] !== !!pf[k])) { S.platforms = pf; save(); this.changed = true; }
      return list;
    }).catch(() => { this.pending = null; return null; }));
  },
};
/** Figma connection (Settings → Figma) */
/** Figma connection (OAuth 2.0, Settings → Figma) and the file picker preferences (default file, recent files, teams) */
const FIG = {
  status: null, subs: new Set(),
  load() { return api('/social/figma/status').then((st) => { this.status = st; this.subs.forEach((f) => f(st)); return st; }).catch(() => null); },
  set(st) { if (st && typeof st === 'object' && 'connected' in st) { this.status = st; this.subs.forEach((f) => f(st)); } return st; },
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); },
  /** Connect Figma: figma.com consent page in a popup; the callback page reports back (see the message listener) */
  async connect() {
    const st = this.status || (await this.load());
    if (st && st.oauth && !st.oauth.configured) return figSetup();
    const w = window.open('', 'boga-connect', 'width=640,height=780'); // opened during the click (popup blockers)
    try { const { url } = await api('/social/figma/oauth/url'); if (w && !w.closed) { w.location.href = url; w.focus(); } else location.href = url; }
    catch (e) { w && w.close(); toast(e.message); }
  },
};
/** Admin steps when the server has no Figma OAuth app yet */
function figSetup() {
  const st = FIG.status || {}, cb = (st.oauth && st.oauth.callbackUrl) || '', sc = ((st.oauth && st.oauth.scopes) || ['current_user:read', 'file_content:read', 'file_metadata:read']);
  modal(`<div class="mh"><span style="color:var(--text-2)">${ic('figma', 22)}</span><h2>Set up Connect Figma</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>
    <div class="mb"><p class="sm-t muted">An admin does this once for the workspace. After that, everyone connects with one click, without copying a token.</p>
    <div class="how"><b>Steps</b><ol>
      <li>Open <a href="https://www.figma.com/developers/apps" target="_blank" rel="noopener">figma.com/developers/apps</a> and create a new app.</li>
      <li>Add this callback URL: <span class="fig9-copy"><code>${esc(cb)}</code><button class="btn ghost sm" data-copy="${esc(cb)}">${ic('copy', 14)}Copy</button></span></li>
      <li>Give it these scopes: ${sc.map((x) => `<code>${esc(x)}</code>`).join(' ')}. Add <code>folders:read</code> (private apps) to browse your teams' files.</li>
      <li>Put <code>FIGMA_CLIENT_ID</code> and <code>FIGMA_CLIENT_SECRET</code> in the API's <code>.env</code> and restart it.</li>
      <li>Come back here and click <b>Connect Figma</b>.</li></ol></div></div>
    <div class="mf"><button class="btn primary" data-close>Got it</button></div>`, {
    onMount: (bg) => bg.addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (b) { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy); toast('Callback URL copied'); } }),
  });
}
/** The redirect URL the API sends to Figma: it must be added to the Figma app exactly (else "Invalid redirect uri") */
const figRedirect = (compact) => {
  const o = (FIG.status && FIG.status.oauth) || {}; if (!o.callbackUrl) return '';
  return `<div class="fig9-redir${compact ? ' sm' : ''}"><span class="lab9">Redirect URL for your Figma app</span><span class="fig9-copy"><code>${esc(o.callbackUrl)}</code><button type="button" class="btn ghost sm" data-act="figCopy" data-v="${esc(o.callbackUrl)}">${ic('copy', 14)}Copy</button></span>
    <p class="xs-t muted">If Figma says <b>Invalid redirect uri</b>: open <a href="${esc(o.appsUrl || 'https://www.figma.com/developers/apps')}" target="_blank" rel="noopener">your Figma apps</a> → this app → <b>OAuth credentials</b> → <b>Add a redirect URL</b>, paste this URL exactly (same http/https, port and path, no trailing slash), save, then connect again.</p></div>`;
};
const figThumb = (f, size = 44) => `<span class="fig9-th" style="width:${size}px;height:${Math.round(size * 0.75)}px">${f && f.thumb ? `<img src="${esc(f.thumb)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${ic('figma', Math.round(size / 2.6))}</span>`;
const figAgo = (d) => { const t = d ? new Date(d).getTime() : 0; if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); const days = Math.round(m / 1440); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : m < 43200 ? `${days} day${days === 1 ? '' : 's'} ago` : new Date(t).toLocaleDateString(); };
/** Linked Figma slides: version checks and re-sync (v14 section) */
let FIGSYNC = null;

/* ---------- Pages / designs ---------- */
function buildPages(d) {
  const [w, h] = RATIOS[d.ratio];
  const n = d.slides || 1, key = d.tpl;
  const mk = (k) => ({ id: uid(), bg: '#0b1220', layers: brandize(TPL[k].fn(w, h)) });
  if (n === 1) return [mk(key)];
  return [mk(key), mk(key === 'article' ? 'quote' : 'stat'), mk('launch')].slice(0, n);
}
const S = {
  theme: 'dark', kit: 'boga', platforms: { ig: 1, li: 1, x: 1, fb: 0, tt: 0, tg: 1 },
  designs: [
    { id: 'd1', name: 'CPI release · High impact news', tpl: 'calendar', ratio: '4:5', status: 'Scheduled', source: 'Template', upd: '2h ago' },
    { id: 'd2', name: 'Onboarding teardown · Blog promo', tpl: 'article', ratio: '4:5', status: 'Draft', source: 'Blog', upd: 'Yesterday' },
    { id: 'd3', name: 'Organic traffic +38%', tpl: 'stat', ratio: '1:1', status: 'Approved', source: 'Template', upd: 'Yesterday' },
    { id: 'd4', name: 'Studio launch · Carousel', tpl: 'launch', ratio: '4:5', slides: 3, status: 'Draft', source: 'Figma', upd: '3 days ago', figma: { file: 'Boga-Social-Kit', node: '12:34', sync: 'In sync' } },
    { id: 'd5', name: 'Growth AMA · Story', tpl: 'event', ratio: '9:16', status: 'Scheduled', source: 'Figma', upd: '4 days ago', figma: { file: 'Boga-Social-Kit', node: '13:02', sync: 'Changed in Figma' } },
    { id: 'd6', name: 'Client quote · Salma', tpl: 'testimonial', ratio: '1:1', status: 'Published', source: 'Template', upd: 'Last week' },
  ],
  posts: [], // filled below relative to today
  ideas: [
    { t: 'Turn the “onboarding teardown” article into a 5-slide carousel', cat: 'Blog → Social', p: 88, tpl: 'article' },
    { t: 'Weekly economic calendar, EN + AR, every Monday 08:00', cat: 'Live data', p: 80, tpl: 'calendar' },
    { t: 'Share the +38% organic traffic result as a big-number post', cat: 'Proof', p: 64, tpl: 'stat' },
    { t: 'Announce the Growth AMA with a story and a reminder post', cat: 'Event', p: 41, tpl: 'event' },
  ],
  articles: [
    { t: 'Why most onboarding flows lose users in the first 60 seconds', c: 'UX Research' },
    { t: 'The 7-point checklist for readable dashboards', c: 'Product' },
    { t: 'How we cut page weight by 62% without touching the design', c: 'Performance' },
  ],
};
(function seedPosts() {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const at = (n) => { const x = new Date(d0); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  S.posts = [
    { id: 'p1', d: 'd1', date: at(0), time: '08:00', pf: ['ig', 'x', 'tg'], status: 'Scheduled' },
    { id: 'p2', d: 'd3', date: at(1), time: '12:30', pf: ['li', 'x'], status: 'Scheduled' },
    { id: 'p3', d: 'd5', date: at(2), time: '17:45', pf: ['ig'], status: 'Scheduled' },
    { id: 'p4', d: 'd6', date: at(-1), time: '10:00', pf: ['ig', 'li'], status: 'Published' },
    { id: 'p5', d: 'd2', date: at(4), time: '09:00', pf: ['li', 'fb'], status: 'Draft' },
  ];
})();
const getD = (id) => { const d = S.designs.find((x) => x.id === id); if (d && !d.pages) d.pages = buildPages(d); return d; };

/* ============================================================
   Brands. Every brand owns its designs, posts, connected
   accounts, ideas, templates and brand kit. S.designs, S.posts,
   S.platforms, S.ideas and S.articles always point at the
   ACTIVE brand, so every page only ever sees that brand.
   ============================================================ */
/* BOGA_LOGO is imported from ./assets/bogaLogo */
const mkColors = (a) => a.map(([name, hex]) => ({ id: 'c' + uid(), name, hex }));
const BOGA = {
  id: 'boga', name: 'Boğa', initials: 'B', handle: '@uxboga', website: 'uxboga.com', industry: 'Digital marketing · Fintech',
  tagline: 'Design that converts.', about: 'UX Boğa is a fintech-focused digital marketing agency. We audit products, redesign for conversion and build design systems for multi-market and RTL audiences.',
  audience: 'Fintech founders, product leads and growth marketers.', voice: 'Friendly, clear and expert. Short sentences. No hype. Always end with a useful question.',
  dos: 'Lead with a clear benefit\nBack claims with a real number\nKeep captions under 150 words', donts: 'No hype or guarantees\nNo stock-photo clichés\nNo more than 3 hashtags',
  hashtags: '#UXDesign #Fintech #ProductDesign', cta: 'Read more on uxboga.com', lang: 'English', defaultRatio: '4:5',
  colors: mkColors([['Boğa red', '#FD0E35'], ['Midnight', '#0B1220'], ['Cloud', '#F8FAFC'], ['Slate', '#94A3B8'], ['Brick', '#B33C3E']]),
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter', arabic: 'Cairo' },
  logos: [{ id: 'l1', name: 'Boğa icon', kind: 'Icon', src: BOGA_LOGO }, { id: 'l2', name: 'Boğa wordmark', kind: 'Primary', text: 'Boğa' }],
  assets: [], templates: [], linkBlog: true,
};
const MPF = {
  id: 'mpf', name: 'My Power Funds', initials: 'MP', handle: '@mypowerfunds', website: 'mypowerfunds.com', industry: 'Trading education · Forex',
  tagline: 'Trade with a plan.', about: 'My Power Funds shares daily market news and an economic calendar for traders. (Sample content for the demo.)',
  audience: 'Retail forex and CFD traders, English and Arabic speaking.', voice: 'Clear, calm and data-led. Plain language, never hype, always risk-aware.',
  dos: 'Show the release time in GMT\nUse the green accent for high impact\nOffer EN and AR versions', donts: 'No profit guarantees\nNo screenshots of live trades\nNo urgency tricks',
  hashtags: '#Forex #Trading #MarketNews', cta: 'mypowerfunds.com', lang: 'English', defaultRatio: '4:5',
  colors: mkColors([['Power green', '#22A24C'], ['Black', '#030504'], ['White', '#FFFFFF'], ['Silver', '#D6D6D6'], ['Forest', '#145A2D']]),
  fonts: { heading: 'Poppins', body: 'Poppins', arabic: 'Cairo' },
  logos: [{ id: 'l1', name: 'MPF wordmark', kind: 'Dark background', text: 'My Power Funds' }, { id: 'l2', name: 'MPF icon', kind: 'Icon', text: 'MPF' }],
  assets: [], templates: [],
};
BOGA.templates = [
  { id: 't1', name: 'Bold quote', ratio: '4:5', layers: tplQuote(1080, 1350) },
  { id: 't2', name: 'Blog article promo', ratio: '4:5', layers: tplArticle(1080, 1350) },
  { id: 't3', name: 'Event story', ratio: '9:16', layers: tplEvent(1080, 1920) },
];
MPF.templates = [
  { id: 't1', name: 'Economic calendar · EN', ratio: '4:5', layers: tplCalendar(1080, 1350, 'en') },
  { id: 't2', name: 'Economic calendar · AR', ratio: '4:5', layers: tplCalendar(1080, 1350, 'ar') },
  { id: 't3', name: 'Big number', ratio: '1:1', layers: brandize(tplStat(1080, 1080), MPF) },
];
(function seedBrands() {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const at = (n) => { const x = new Date(d0); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const cal = S.designs.find((d) => d.id === 'd1');
  S.data = {
    boga: { designs: S.designs.filter((d) => d.id !== 'd1'), posts: S.posts.filter((p) => p.d !== 'd1'), platforms: S.platforms, ideas: S.ideas.filter((i) => i.tpl !== 'calendar'), articles: S.articles },
    mpf: {
      designs: [cal, { id: 'm2', name: 'NFP Friday · Big number', tpl: 'stat', ratio: '1:1', status: 'Draft', source: 'Template', upd: 'Yesterday' }, { id: 'm3', name: 'Risk warning · Quote', tpl: 'quote', ratio: '4:5', status: 'Approved', source: 'Template', upd: '3 days ago' }],
      posts: [...S.posts.filter((p) => p.d === 'd1'), { id: 'pm2', d: 'm3', date: at(3), time: '11:00', pf: ['ig', 'x'], status: 'Scheduled' }],
      platforms: { ig: 1, li: 0, x: 1, fb: 0, tt: 0, tg: 1 },
      ideas: [{ t: 'Weekly economic calendar, EN + AR, every Monday 08:00', cat: 'Live data', p: 80, tpl: 'calendar' }, { t: 'Explain “What is CPI?” in one quote card', cat: 'Education', p: 66, tpl: 'quote' }],
      articles: [],
    },
  };
  S.brands = [BOGA, MPF]; S.active = 'boga';
  ['designs', 'posts', 'platforms', 'ideas', 'articles', 'kit'].forEach((k) => delete S[k]);
  ['designs', 'posts', 'platforms', 'ideas', 'articles'].forEach((k) => Object.defineProperty(S, k, { get: () => S.data[S.active][k], set: (v) => { S.data[S.active][k] = v; }, configurable: true }));
})();

const brand = () => S.brands.find((b) => b.id === S.active) || S.brands[0];
const kitOf = (b) => ({ name: b.name, colors: b.colors.map((c) => c.hex), fonts: [b.fonts.heading, b.fonts.body], logo: b.name });
const initialsOf = (n) => { const w = String(n || '').trim().split(/\s+/).filter(Boolean); if (!w.length) return '?'; return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase(); };
const shade = (h, k) => { const n = parseInt(h.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k)))); return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(); };
const cloneLayers = (ls) => ls.map((l) => ({ ...JSON.parse(JSON.stringify(l)), id: uid() }));
/** Old layer id → new one, in every id and id-keyed entry of a value ("t:<id>" translation keys too) */
const remapIds = (v, m) => {
  if (Array.isArray(v)) return v.map((x) => remapIds(x, m));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [m.get(k) || k.replace(/^([a-z]:)(.+)$/, (s, p, id) => (m.has(id) ? p + m.get(id) : s)), remapIds(x, m)]));
  return typeof v === 'string' && m.has(v) ? m.get(v) : v;
};
/** Live data settings worth keeping in a template: the mapping and choices, not this week's events or picks */
const liveForTemplate = (live) => {
  if (!live || !live.map) return null;
  const { events, feed, shown, room, at, err, pick, ...keep } = JSON.parse(JSON.stringify(live));
  return keep;
};
/** A template's slide as a fresh page: new layer ids, its Live data following them */
const pageFromTemplate = (t) => reIdPage(JSON.parse(JSON.stringify({ bg: t.bg || '#0b1220', layers: t.layers || [], ...(t.live ? { live: t.live } : {}) })));
/** A copied page gets new layer ids; its Live data settings, which name layers by id, follow them */
function reIdPage(pg) {
  const m = new Map(); (pg.layers || []).forEach((l) => { const n = uid(); m.set(l.id, n); l.id = n; });
  if (pg.live) pg.live = remapIds(pg.live, m);
  return pg;
}
function fitLayers(ls, from, to) {
  const oh = RATIOS[from][1], nh = RATIOS[to][1], sy = nh / oh; if (from === to) return ls;
  ls.forEach((l) => { l.y = Math.round(l.y * sy); if (l.h >= oh * 0.5 || l.name === 'Background') l.h = Math.round(l.h * sy); }); return ls;
}
/** Re-skins starter templates with a brand's colors and fonts */
function brandize(layers, b) {
  b = b || brand(); const c = b.colors.map((x) => x.hex);
  const map = [['#fd0e35', c[0]], ['#22a24c', c[0]], ['#0b1220', c[1]], ['#f8fafc', c[2]]].filter((m) => m[1]);
  const sub = (v) => { if (typeof v !== 'string') return v; let o = v; map.forEach(([f, t]) => { o = o.replace(new RegExp(f, 'ig'), t); }); return o; };
  return layers.map((l) => {
    const n = { ...l }; if (n.fill) n.fill = sub(n.fill); if (n.color) n.color = sub(n.color); if (n.stroke) n.stroke = sub(n.stroke);
    if (n.type === 'text') { if (n.font === 'Plus Jakarta Sans') n.font = b.fonts.heading; else if (n.font === 'Inter') n.font = b.fonts.body; }
    return n;
  });
}
/**
 * A brand's avatar: its profile photo (Brand kit → photo), else a logo fitted inside (the icon first, never cropped),
 * else its initials on its color.
 */
function brandAv(b, size) {
  const cls = `bav ${size || 'md'}`;
  if (b.avatar && b.avatar.src) return `<span class="${cls}" style="background-image:url(${b.avatar.src})"></span>`;
  const L = b.logos || [], logo = L.find((l) => l.src && l.kind === 'Icon') || L.find((l) => l.src && l.kind === 'Light background') || L.find((l) => l.src && l.kind === 'Dark background') || L.find((l) => l.src);
  if (logo) {
    const dark = logo.kind === 'Dark background', lu = (h) => { const n = parseInt(String(h).replace('#', '').slice(0, 6), 16) || 0; return (n >> 16 & 255) * 0.3 + (n >> 8 & 255) * 0.59 + (n & 255) * 0.11; }, bg = dark ? ((b.colors || []).map((c) => c.hex).sort((x, y) => lu(x) - lu(y))[0] || '#0b1220') : '#fff';
    return `<span class="${cls} fit" style="background-color:${bg};background-image:url(${logo.src})"></span>`;
  }
  return `<span class="${cls}" style="background:${b.avatarBg || (b.colors[0] ? b.colors[0].hex : '#fd0e35')}">${esc(b.initials)}</span>`;
}
/** "All brands" mode (Settings: S.set.allBrands): overview, planner and studio show every brand together */
const allOn = () => !!(S.set && S.set.allBrands) && S.brands.length > 1;
/** "All brands" avatar: the first brands side by side, overlapping, and "+N" for the others */
const allAv = (size) => `<span class="bgrp ${size || 'md'}" aria-hidden="true">${S.brands.slice(0, 3).map((b) => brandAv(b, 'xs')).join('')}${S.brands.length > 3 ? `<span class="bgrp-n">+${S.brands.length - 3}</span>` : ''}</span>`;
const wsBtn = () => allOn() ? `${allAv('md')}<span class="t"><b>All brands</b><small>${S.brands.length} brands · Social Media Admin</small></span>${ic('chevD', 16)}` : `${brandAv(brand(), 'md')}<span class="t"><b>${esc(brand().name)}</b><small>Social Media Admin</small></span>${ic('chevD', 16)}`;
const pillHTML = () => allOn() ? `${allAv('sm')}<span class="hide-sm">All brands</span>${ic('chevD', 16)}` : `${brandAv(brand(), 'sm')}<span class="hide-sm">${esc(brand().name)}</span>${ic('chevD', 16)}`;
function refreshChrome() { const w = $('.ws-btn'); if (w) w.innerHTML = wsBtn(); const p = $('.bpill'); if (p) p.innerHTML = pillHTML(); }
function brandMenu() {
  const all = allOn();
  return `<div class="div"></div><div class="cap">Switch brand</div>`
    + (S.brands.length > 1 ? `<button class="it ${all ? 'on' : ''}" data-act="allBrands">${allAv('sm')}<span class="grow"><b>All brands</b><small>Every brand in one workspace</small></span>${all ? ic('check', 14, 'faint') : ''}</button>` : '')
    + S.brands.map((b) => `<button class="it ${!all && b.id === S.active ? 'on' : ''}" data-act="switchBrand" data-id="${b.id}">${brandAv(b, 'sm')}<span class="grow"><b>${esc(b.name)}</b><small>${esc(b.industry || 'Brand')} designs</small></span>${!all && b.id === S.active ? ic('check', 14, 'faint') : ''}</button>`).join('')
    + `<div class="div"></div><button class="it addb" data-act="addBrand"><span class="ico">${ic('plus', 16)}</span><span class="grow"><b>Add brand</b><small>New workspace &amp; brand kit</small></span></button><button class="it" data-act="manageBrands"><span class="ico">${ic('layers', 16)}</span><span class="grow"><b>Manage brands</b><small>${S.brands.length} brands</small></span></button>`;
}
/* Brand templates are stored by the API, one document each (social_templates) */
const tplApi = (b, path, o) => api(`/social/brands/${encodeURIComponent(b.id)}/templates${path}`, o);
/** Disables a button and shows a spinner while a request runs */
function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.l = btn.innerHTML; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.innerHTML = `<i class="spin"></i>${esc(label)}`; }
  else if (btn.dataset.l) { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = btn.dataset.l; }
}
/** A brand template's preview; dynamic (live data) templates carry a Live badge */
const btThumb = (t, bw, bh) => { const h = thumb({ bg: t.bg || '#0b1220', layers: t.layers }, t.ratio, bw, bh); return t.live ? h.replace(/<\/div>$/, `<span class="tpl-live">${ic('chart', 11)}Live</span></div>`) : h; };
function aiCaption(d) {
  const b = brand(), tags = b.hashtags ? '\n\n' + b.hashtags : '';
  if (d.tpl === 'calendar') return CAPS[Math.floor(Math.random() * CAPS.length)] + tags;
  return (d.name.split(' · ')[0] + '. ' + (b.tagline || '')).trim() + (b.cta ? '\n' + b.cta : '') + tags;
}
function readImage(file, max, cb) {
  const r = new FileReader();
  r.onload = () => {
    if (/svg/.test(file.type)) { cb(r.result, 0, 0); return; }
    const im = new Image();
    im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), w = Math.round(im.width * k), h = Math.round(im.height * k), c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h); cb(c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92), w, h); };
    im.onerror = () => toast('Could not read this image'); im.src = r.result;
  };
  r.readAsDataURL(file);
}
function makeBrand(o) {
  const src = o.from && S.brands.find((b) => b.id === o.from), id = 'b' + uid(), col = o.color || '#6366f1';
  let colors = src ? JSON.parse(JSON.stringify(src.colors)).map((c) => ({ ...c, id: 'c' + uid() })) : mkColors([['Primary', col], ['Dark', '#0B1220'], ['Light', '#F8FAFC'], ['Neutral', '#94A3B8'], ['Accent', shade(col, -0.28)]]);
  if (src && o.colorTouched) colors[0].hex = col;
  const b = { id, name: o.name, initials: initialsOf(o.name), handle: '', website: o.website || '', industry: o.industry || '', tagline: '', about: '', audience: '',
    voice: src ? src.voice : '', dos: src ? src.dos : '', donts: src ? src.donts : '', hashtags: '', cta: '', lang: src ? src.lang : 'English', defaultRatio: src ? src.defaultRatio : '4:5',
    colors, fonts: src ? { ...src.fonts } : { heading: 'Plus Jakarta Sans', body: 'Inter', arabic: 'Cairo' }, logos: [], assets: [], templates: [] };
  S.brands.push(b);
  S.data[id] = { designs: [], posts: [], platforms: {}, ideas: [{ t: 'Announce ' + o.name + ' with a launch post', cat: 'Announcement', p: 80, tpl: 'launch' }, { t: 'Share a customer quote as a social proof post', cat: 'Proof', p: 60, tpl: 'testimonial' }], articles: [] };
  return b;
}


/* ---------- Poster rendering (shared by thumbnails + editor) ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function lstyle(l) {
  let s = `left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px;opacity:${l.op ?? 1};transform:rotate(${l.rot || 0}deg);`;
  if (l.hidden) s += 'display:none;';
  if (l.type === 'text') s += `color:${l.color};font:${l.weight} ${l.size}px/${l.lh} '${l.font}',sans-serif;text-align:${l.align};letter-spacing:${l.ls || 0}px;direction:${l.dir || 'ltr'};`;
  else {
    s += `background:${l.fill};border-radius:${l.type === 'ellipse' ? '50%' : (l.r || 0) + 'px'};`;
    if (l.stroke) s += `border:${l.sw || 3}px solid ${l.stroke};box-sizing:border-box;`;
  }
  return s;
}
const layerHTML = (l) => `<div class="ly ${l.type}${l.locked ? ' locked' : ''}" data-id="${l.id}" style="${lstyle(l)}">${l.type === 'text' ? textHTML(l) : ''}</div>`;
const posterHTML = (pg) => pg.layers.map(layerHTML).join('');
/** Scaled, static preview of a page (used on cards, planner, template pickers) */
function thumb(pg, ratio, boxW, boxH) {
  const [w, h] = RATIOS[ratio], k = Math.min(boxW / w, boxH / h);
  return `<div class="thumb" style="width:${w * k}px;height:${h * k}px"><div class="poster" style="width:${w}px;height:${h}px;background:${pg.bg};transform:scale(${k})">${posterHTML(pg)}</div></div>`;
}
const tplThumb = (key, ratio, bw, bh) => { const [w, h] = RATIOS[ratio]; return thumb({ bg: '#0b1220', layers: brandize(TPL[key].fn(w, h)) }, ratio, bw, bh); };

/* ---------- Persistence (NestJS API, see src/lib/persist.ts) ---------- */
const STORE = 'boga.studio.v2';
function save() { persist.save({ brands: S.brands, data: S.data, active: S.active, set: S.set }, () => { if (!save.w) { save.w = 1; try { toast('Browser storage is full. Export a backup in Settings, Data.'); } catch (x) {} } }); }
(function load() { try { const v = initialState; if (v && v.data) Object.values(v.data).forEach((d) => (d.designs || []).forEach((x) => { ensureRatio(x.ratio); (x.pages || []).forEach((pg) => (pg.layers || []).forEach(migrateLayer)); })); if (v && v.brands) v.brands.forEach((b) => (b.templates || []).forEach((t) => ensureRatio(t.ratio))); if (v && Array.isArray(v.brands) && v.brands.length && v.data) { S.brands = v.brands; S.data = v.data; S.active = v.brands.some((b) => b.id === v.active) ? v.active : v.brands[0].id; if (v.set) S.set = v.set; S.brands.forEach((b) => { if (!S.data[b.id]) S.data[b.id] = { designs: [], posts: [], platforms: {}, ideas: [], articles: [] }; }); } } catch (e) {} })();
/* Brands linked to the Blog Admin list its latest live articles in "From your blog" */
if (blogArticles) S.brands.forEach((b) => { if (b.linkBlog && S.data[b.id]) S.data[b.id].articles = blogArticles; });
addEventListener('pagehide', save); document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('hashchange', save);

/* ============================================================
   Boğa Social Studio — shell, pages, modals
   ============================================================ */
TPL.blank = { name: 'Blank', cat: 'Basics', fn: (w, h) => [BG(w, h, '#ffffff')] };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
/* Scheduling time zone: Settings → Export & publishing → Time zone (the API publishes in the same zone), else this browser's */
const tzValid = (tz) => { try { return !!tz && !!new Intl.DateTimeFormat('en', { timeZone: tz }); } catch (e) { return false; } };
const schedTz = () => (tzValid(S.set && S.set.tz) ? S.set.tz : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
/** Wall-clock parts of an instant in a time zone */
const tzParts = (ts, tz) => { const o = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ts)).forEach((p) => (o[p.type] = p.value)); return o; };
/** "YYYY-MM-DD" + "HH:mm" in a time zone → Date (same algorithm as the API's zonedToUtc) */
function zonedToUtc(date, time, tz) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = (time || '00:00').split(':').map(Number), wall = Date.UTC(y, mo - 1, d, h, mi);
  const off = (ts) => { const p = tzParts(ts, tz); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ts / 1000) * 1000; };
  let t = wall; for (let i = 0; i < 2; i++) t = wall - off(t); return new Date(t);
}
/** Today's date and the current time in the scheduling time zone */
const nowIn = (tz) => { const p = tzParts(Date.now(), tz); return { date: `${p.year}-${p.month}-${p.day}`, time: `${String(+p.hour % 24).padStart(2, '0')}:${p.minute}` }; };
const tzLabel = (tz) => { try { const n = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((x) => x.type === 'timeZoneName'); return tz.replace(/_/g, ' ') + (n ? ` (${n.value})` : ''); } catch (e) { return tz; } };
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const fmt = (d, o) => d.toLocaleDateString('en', o);
const pfDots = (a) => `<span class="pfs">${a.map((k) => `<span class="pf" title="${PLATFORMS[k].n}" style="background:${PLATFORMS[k].c}">${ic('net_'+k,12)}</span>`).join('')}</span>`;
const badge = (s) => `<span class="badge b-${s}">${s}</span>`;
const ACT = {};

/** Short notice; longer messages stay longer, a click dismisses it, and a new one replaces the previous */
function toast(msg) { document.querySelectorAll('.toast:not(.tu)').forEach((x) => x.remove()); const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = ic('check', 16) + '<span>' + esc(msg) + '</span>'; t.onclick = () => t.remove(); document.body.append(t); setTimeout(() => t.remove(), Math.min(7000, Math.max(2600, String(msg).length * 50))); }
function modal(html, { wide = false, onMount, onClose } = {}) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { if (!bg.isConnected) return; bg.remove(); onClose && onClose(); };
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  bg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  $('#modal-root').append(bg); onMount && onMount(bg, close); return close;
}

/* ---------- Theme ---------- */
function setTheme(t) { S.theme = t; document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('uxb.t', JSON.stringify(t)); } catch (e) {} }
try { setTheme(JSON.parse(localStorage.getItem('uxb.t')) || 'dark'); } catch (e) { setTheme('dark'); }

/* ---------- Sidebar ---------- */
const NAV = [
  ['overview', 'Overview', 'grid'], ['planner', 'Planner', 'cal'], ['studio', 'Studio', 'studio', 'New'], ['brand', 'Brand kit', 'palette', 'New'], ['settings', 'Settings', 'settings'],
];
function renderSide() {
  $('#side').innerHTML = `
  <div class="ws">
    <button class="ws-btn" data-act="ws">${wsBtn()}</button>
    <div class="menu" id="wsMenu" hidden>
      <div class="cap">Switch workspace</div>
      <button class="it" data-act="goWs" data-href="/"><span class="ico">${ic('doc', 16)}</span><span class="grow"><b>Blog Admin</b><small>Content &amp; Articles</small></span></button>
      <button class="it" data-act="goWs" data-href="/bot/overview"><span class="ico">${ic('chat', 16)}</span><span class="grow"><b>Chatbot Admin</b><small>AI &amp; Conversations</small></span><span class="soon">Soon</span></button>
      <button class="it on" data-act="ws"><span class="ico">${ic('globe', 16)}</span><span class="grow"><b>Social Media Admin</b><small>Social &amp; Publishing</small></span>${ic('check', 14, 'faint')}</button>
      <div id="brandMenu">${brandMenu()}</div>
    </div>
  </div>
  <nav class="nav" id="nav">${NAV.map(([k, l, i, n]) => `<a href="#/${k}" data-k="${k}">${ic(i)}${l}${n ? `<span class="new">${n}</span>` : ''}</a>`).join('')}</nav>
  <div class="me">
    <div class="menu" id="meMenu" hidden>
      <div class="row" style="gap:10px;padding:8px">${userAv()}<span class="grow"><b style="font-size:14px;font-weight:500;display:block">${esc(user.name)}</b><small class="muted xs-t">${esc(user.email)}</small></span></div>
      <div class="div"></div>
      <a class="it" href="#/profile" data-act="goProfile"><span class="ico">${ic('user', 16)}</span><span class="grow"><b>Profile</b></span></a>
      <div class="div"></div>
      <button class="it out" data-act="signOut"><span class="ico">${ic('logout', 16)}</span><span class="grow"><b>Sign out</b></span></button>
    </div>
    <button data-act="me">${userAv()}<span class="grow"><b style="font-size:14px;font-weight:500;display:block">${esc(user.name)}</b><small class="muted xs-t">${esc(user.email)}</small></span>${ic('chevD', 16, 'muted')}</button>
  </div>`;
}
const userAv = () => user.avatar
  ? `<span class="av img" style="background-image:url(${esc(user.avatar)})"></span>`
  : `<span class="av">${esc((user.name || '?').charAt(0).toUpperCase())}</span>`;
ACT.goWs = (a, e) => { e && e.preventDefault(); navigate(a.dataset.href); };
ACT.me = () => { const m = $('#meMenu'); m.hidden = !m.hidden; };
/* Profile opens inside this workspace (#/profile), like the Blog Admin's /profile */
ACT.goProfile = (a, e) => { e && e.preventDefault(); closeDrawer(); if (location.hash === '#/profile') route(); else location.hash = '#/profile'; };
ACT.signOut = () => { persist.signOut(); navigate('/login'); };
ACT.ws = () => { const m = $('#wsMenu'); if (m.hidden) $('#brandMenu').innerHTML = brandMenu(); m.hidden = !m.hidden; };
ACT.noop = (a, e) => { e.preventDefault(); toast('Not part of this demo'); $('#wsMenu') && ($('#wsMenu').hidden = true); };
ACT.menu = () => { $('#side').classList.add('open'); $('#scrim').hidden = false; };
ACT.theme = () => { setTheme(S.theme === 'dark' ? 'light' : 'dark'); route(); };
$('#scrim').addEventListener('click', () => { $('#side').classList.remove('open'); $('#scrim').hidden = true; });

/* ---------- Router ---------- */
const PAGES = {};
function route() {
  const [, page = 'overview', arg] = location.hash.slice(1).split('/');
  if (page === 'editor') { document.body.classList.add('in-editor'); $('#editor').hidden = false; return openEditor(arg); }
  document.body.classList.remove('in-editor'); $('#editor').hidden = true; $('#editor').innerHTML = '';
  const p = PAGES[page] || PAGES.overview; $('#side').classList.remove('open'); $('#scrim').hidden = true;
  $$('#nav a[data-k]').forEach((a) => a.classList.toggle('on', a.dataset.k === (PAGES[page] ? page : 'overview')));
  closeDrawer();
  $('#top').innerHTML = `<button class="btn secondary icon" data-act="menu" title="Menu" style="display:${innerWidth > 1024 ? 'none' : 'inline-flex'}">${ic('menu')}</button>
    <div class="grow"><h1>${p.t}</h1><p class="sub">${p.s}</p></div><button class="bpill" data-act="manageBrands" title="Switch brand">${pillHTML()}</button>${p.actions ? p.actions() : ''}
    <button class="btn secondary icon" data-act="theme" title="Toggle theme">${ic(S.theme === 'dark' ? 'sun' : 'moon')}</button>`;
  $('#view').innerHTML = `<div class="page">${p.view()}</div>`; scrollTo(0, 0);
}
addEventListener('hashchange', route);
function closeDrawer() { $('#side').classList.remove('open'); $('#scrim').hidden = true; const m = $('#wsMenu'); m && (m.hidden = true); const u = $('#meMenu'); u && (u.hidden = true); }
/* sidebar: any nav click closes the drawer, even when the page is already open */
document.addEventListener('click', (e) => {
  const a = e.target.closest('#nav a'); if (!a) return;
  closeDrawer(); const t = a.getAttribute('href'); if (t === location.hash || (!location.hash && t === '#/overview')) { e.preventDefault(); route(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
addEventListener('resize', () => { if (innerWidth > 1024) closeDrawer(); const b = $('#top [data-act=menu]'); if (b) b.style.display = innerWidth > 1024 ? 'none' : 'inline-flex'; });

/* ---------- Shared helpers ---------- */
function designCard(d, extra = '') {
  const dd = getD(d.id), [w, h] = RATIOS[d.ratio];
  return `<div class="card dc" data-id="${d.id}">
    <button class="pv" data-act="open" data-id="${d.id}" aria-label="Open ${esc(d.name)}">${thumb(dd.pages[0], d.ratio, 190, 215)}${d.source === 'Figma' ? `<span class="badge b-figma">${ic('figma', 12)}Figma</span>` : ''}<span class="st">${badge(d.status)}</span></button>
    <div class="meta"><div class="dc-h"><b>${esc(d.name)}</b>${persist.readOnly ? '' : `<button class="btn ghost icon sm dc-more" data-act="dMore" data-id="${d.id}" title="More actions" aria-label="More actions for ${esc(d.name)}" aria-haspopup="menu">${ic('more', 16)}</button>`}</div><small>${ratioLabel(d.ratio)} · ${dd.pages.length > 1 ? dd.pages.length + ' slides' : w + '×' + h} · ${d.upd}</small>${extra}</div></div>`;
}

/* ---------- Designs: create / open / rename / duplicate / status / delete ----------
   Changes go to the in-memory workspace, then persist.flush() sends them to the API
   (social_designs) right away so the toast only says "saved" once the server has it. */
const canEdit = () => { if (persist.readOnly) { toast('View only: ask an admin or editor to change designs'); return false; } return true; };
const synced = (msg) => { route(); persist.flush().then((ok) => toast(ok ? msg : msg + '. Saved on this device, it syncs when the server is reachable.')); };
const DSTATUS = ['Draft', 'Approved'];
function designMenu(btn, d) {
  $$('.dmenu').forEach((m) => m.remove());
  const m = document.createElement('div'); m.className = 'dmenu dmenu-d'; m.setAttribute('role', 'menu');
  const it = (act, icon, label, cls = '') => `<button type="button" role="menuitem" class="${cls}" data-act="${act}" data-id="${d.id}"><span class="row" style="gap:10px">${ic(icon, 16)}${label}</span></button>`;
  m.innerHTML = it('open', 'ext', 'Open in editor') + it('dRename', 'type', 'Rename') + it('dDup', 'copy', 'Duplicate')
    + `<div class="div"></div><div class="cap">Status</div>`
    + DSTATUS.map((st) => `<button type="button" role="menuitemradio" aria-checked="${d.status === st}" class="${d.status === st ? 'on' : ''}" data-act="dStatus" data-id="${d.id}" data-s="${st}"><span>${st}</span>${d.status === st ? ic('check', 14) : ''}</button>`).join('')
    + `<div class="div"></div>` + it('dDel', 'trash', 'Delete', 'neg');
  document.body.append(m);
  const r = btn.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8)) + 'px';
  m.style.top = (r.bottom + 6 + mh > innerHeight - 8 ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + 'px';
  m.addEventListener('click', (e) => { if (e.target.closest('[data-act]')) m.remove(); });
  const f = m.querySelector('button'); f && f.focus();
}
Object.assign(ACT, {
  dMore: (a, e) => { e && e.stopPropagation(); const d = getD(a.dataset.id); if (d) designMenu(a, d); },
  dRename: (a) => {
    const d = getD(a.dataset.id); if (!d || !canEdit()) return;
    modal(`<div class="mh"><h2>Rename design</h2><button class="btn ghost icon sm" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="mb"><label class="lab">Design name<input class="field" id="drN" value="${esc(d.name)}" maxlength="80" autocomplete="off"></label></div>
    <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="drGo">Save</button></div>`, {
      onMount: (bg, close) => {
        const i = $('#drN', bg), go = () => { const n = i.value.trim(); if (!n) { i.focus(); return toast('Give the design a name'); } d.name = n; d.upd = 'Just now'; save(); close(); synced('Design renamed'); };
        $('#drGo', bg).addEventListener('click', go); i.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        setTimeout(() => { i.focus(); i.select(); }, 30);
      },
    });
  },
  dDup: (a) => {
    const d = getD(a.dataset.id); if (!d || !canEdit()) return;
    const c = JSON.parse(JSON.stringify(d));
    c.id = 'd' + uid(); c.name = (d.name + ' (copy)').slice(0, 80); c.status = 'Draft'; c.upd = 'Just now';
    // the copy is a design of its own: it is not linked to the Figma frame of the original
    if (c.source === 'Figma') { c.source = 'Template'; delete c.figma; }
    (c.pages || []).forEach((pg) => { pg.id = uid(); reIdPage(pg); });
    S.designs.splice(Math.max(0, S.designs.indexOf(d)), 0, c); save(); synced('Design duplicated');
  },
  dStatus: (a) => { const d = getD(a.dataset.id); if (!d || !canEdit() || d.status === a.dataset.s) return; d.status = a.dataset.s; d.upd = 'Just now'; save(); synced('Marked as ' + d.status); },
  dDel: (a) => {
    const d = getD(a.dataset.id); if (!d || !canEdit()) return;
    const n = S.posts.filter((p) => p.d === d.id).length;
    modal(`<div class="mh"><h2>Delete “${esc(d.name)}”?</h2><button class="btn ghost icon sm" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="mb"><div class="row" style="gap:14px;align-items:flex-start">${thumb(d.pages[0], d.ratio, 80, 100)}<div class="grow"><p class="sm-t">The design is removed from ${esc(brand().name)} for everyone.</p>${n ? `<div class="note warn" style="margin-top:10px">${ic('alert', 16)}<span>${n} planned post${n > 1 ? 's use' : ' uses'} it and will be removed from the planner too.</span></div>` : ''}</div></div></div>
    <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn danger" id="ddGo">${ic('trash', 16)}Delete design</button></div>`, {
      onMount: (bg, close) => $('#ddGo', bg).addEventListener('click', () => {
        S.designs = S.designs.filter((x) => x.id !== d.id); S.posts = S.posts.filter((p) => p.d !== d.id);
        save(); close(); synced('Design deleted');
      }),
    });
  },
});
function createDesign({ name, tpl = 'blank', ratio = '4:5', slides = 1, source = 'Template', mutate }) {
  const d = { id: 'd' + uid(), name, tpl, ratio, status: 'Draft', source, upd: 'Just now' };
  if (!RATIOS[ensureRatio(ratio)]) d.ratio = ratio = '4:5'; // unknown size: fall back to the default canvas
  const [w, h] = RATIOS[ratio];
  d.pages = Array.from({ length: slides }, () => ({ id: uid(), bg: '#0b1220', layers: brandize(TPL[tpl].fn(w, h)) }));
  mutate && mutate(d); S.designs.unshift(d); return d;
}
ACT.open = (a) => { location.hash = '#/editor/' + a.dataset.id; };
ACT.newDesign = (a) => { const d = createDesign({ name: 'Untitled design', ratio: a.dataset.ratio, slides: +a.dataset.slides || 1 }); location.hash = '#/editor/' + d.id; };
ACT.fromTpl = (a) => { const t = a.dataset.tpl; const d = createDesign({ name: TPL[t].name, tpl: t, ratio: a.dataset.ratio || brand().defaultRatio || '4:5' }); location.hash = '#/editor/' + d.id; };
ACT.fromArticle = (a) => {
  const art = S.articles[+a.dataset.i];
  const d = createDesign({ name: art.t.slice(0, 44), tpl: 'article', source: 'Blog', mutate: (d) => { const L = d.pages[0].layers.find((l) => l.name === 'Title'); if (L) L.text = art.t; } });
  toast('Post drafted from your article'); location.hash = '#/editor/' + d.id;
};

/* ---------- Overview ---------- */
PAGES.overview = {
  t: 'Social Media Overview', s: 'What’s going out, what needs a design, and what to post next.',
  actions: () => `<button class="btn secondary hide-sm" data-act="figma">${ic('figma')}Import from Figma</button><a class="btn primary" href="#/studio" data-act="goStudio">${ic('plus')}New design</a>`,
  view: () => {
    const today = iso(new Date()), next = S.posts.filter((p) => p.date >= today && p.status !== 'Published').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const stat = (l, v, d, dn) => `<div class="widget stat"><span class="muted sm-t">${l}</span><b>${v}</b><span class="delta ${dn ? 'dn' : ''}">${d}</span></div>`;
    return `
    <div class="grid g4">${stat('Scheduled', S.posts.filter((p) => p.status === 'Scheduled').length, 'in the planner')}${stat('Designs in draft', S.designs.filter((d) => d.status === 'Draft').length, S.designs.filter((d) => d.status === 'Approved').length + ' approved')}${stat('Published', S.posts.filter((p) => p.status === 'Published').length, 'all time')}${stat('Designs', S.designs.length, S.designs.filter((d) => d.source === 'Figma').length + ' from Figma')}</div>
    <div class="grid g2">
      <div class="widget"><div class="wtitle">${ic('clock', 24)}Next up<span class="sp"></span><a class="btn ghost sm" href="#/planner">Open planner</a></div>
        <div class="list">${next.length ? '' : `<div class="empty">${ic('cal', 28)}<p>Nothing scheduled for ${esc(allOn() ? 'your brands' : brand().name)} yet.</p><a class="btn secondary" href="#/planner">Open planner</a></div>`}${next.map((p) => { const d = getD(p.d); return `<div class="li"><div class="thumbbox" style="width:56px;height:56px">${thumb(d.pages[0], d.ratio, 48, 48)}</div>
          <div class="grow"><p class="tt">${esc(d.name)}</p><p class="xs-t muted">${fmt(new Date(p.date + 'T00:00'), { weekday: 'short', day: 'numeric', month: 'short' })} · ${p.time}</p></div>${pfDots(p.pf)}${badge(p.status)}</div>`; }).join('')}</div></div>
      <div class="widget"><div class="wtitle">${ic('studio', 24)}Post ideas<span class="sp"></span></div>
        <div class="list">${S.ideas.slice(0, 3).map((i, n) => `<div class="li"><div class="grow"><p class="tt">${esc(i.t)}</p><p class="xs-t muted">${i.cat}</p></div><span class="badge b-${i.p >= 75 ? 'High' : i.p >= 45 ? 'Medium' : 'Low'}">${i.p >= 75 ? 'High' : i.p >= 45 ? 'Medium' : 'Low'}</span><button class="btn secondary sm" data-act="fromTpl" data-tpl="${i.tpl}">Design it</button></div>`).join('')}</div></div>
    </div>
    ${S.articles.length ? `<div class="widget"><div class="wtitle">${ic('doc', 24)}From your blog<span class="sp"></span><span class="xs-t muted">Articles from Blog Admin, ready to become posts</span></div>
      <div class="grid g3">${S.articles.map((a, i) => `<div class="idea"><p>${esc(a.t)}</p><div class="row sp"><span class="xs-t muted">${a.c}</span><button class="btn secondary sm" data-act="fromArticle" data-i="${i}">${ic('studio', 16)}Make post</button></div></div>`).join('')}</div></div>` : ''}
    <div class="widget"><div class="wtitle">${ic('layout', 24)}Continue designing<span class="sp"></span><a class="btn ghost sm" href="#/studio">All designs</a></div>
      ${S.designs.length ? `<div class="cards">${S.designs.slice(0, 4).map((d) => designCard(d)).join('')}</div>` : `<div class="empty">${ic('layout', 28)}<p>No designs for ${esc(allOn() ? 'your brands' : brand().name)} yet.</p><a class="btn primary" href="#/studio">${ic('plus')}Create the first one</a></div>`}</div>`;
  },
};
ACT.goStudio = () => {};

/* ---------- Planner ---------- */
const P = { ws: monday(new Date()), tray: 'designs' };
PAGES.planner = {
  t: 'Social Media Planner', s: 'Drag a design onto a day to schedule it.',
  actions: () => `<button class="btn secondary icon" data-act="wk" data-n="-7" title="Previous week">${ic('chevL')}</button><button class="btn secondary" data-act="wk" data-n="0">Today</button><button class="btn secondary icon" data-act="wk" data-n="7" title="Next week">${ic('chevR')}</button>`,
  view: () => {
    const days = [...Array(7)].map((_, i) => addD(P.ws, i)), today = iso(new Date());
    const col = (d) => {
      const k = iso(d), ps = S.posts.filter((p) => p.date === k).sort((a, b) => a.time.localeCompare(b.time));
      return `<div class="day ${k === today ? 'today' : ''}" data-date="${k}"><div class="dh"><b>${fmt(d, { weekday: 'short' })}</b><span>${d.getDate()}</span></div>
        ${ps.map((p) => { const dd = getD(p.d); return `<button class="post ${p.status}" data-act="open" data-id="${p.d}"><div class="row" style="gap:8px;align-items:flex-start"><div class="thumbbox" style="width:34px;height:34px;background:transparent">${thumb(dd.pages[0], dd.ratio, 34, 34)}</div><span class="pt">${esc(dd.name)}</span></div><div class="tm"><span>${p.time}</span>${pfDots(p.pf)}</div></button>`; }).join('')}
        <div class="slot">${ic('plus', 16)}</div></div>`;
    };
    const tray = P.tray === 'designs'
      ? S.designs.filter((d) => !S.posts.some((p) => p.d === d.id)).concat(S.designs.filter((d) => S.posts.some((p) => p.d === d.id)).slice(0, 2)).map((d) => { const dd = getD(d.id); return `<div class="dcard" draggable="true" data-drag="${d.id}"><div class="thumbbox" style="width:52px;height:52px;background:transparent">${thumb(dd.pages[0], d.ratio, 48, 48)}</div><div class="grow"><p class="sm-t" style="font-weight:500;line-height:1.3">${esc(d.name)}</p><p class="xs-t muted">${ratioLabel(d.ratio)} · ${d.status}</p></div></div>`; }).join('')
      : S.ideas.map((i) => `<div class="idea"><p>${esc(i.t)}</p><div class="row sp"><span class="xs-t muted">${i.cat}</span><button class="btn secondary sm" data-act="fromTpl" data-tpl="${i.tpl}">Design it</button></div></div>`).join('');
    return `<div class="row sp" style="flex-wrap:wrap"><b style="font:600 16px var(--jak)">${fmt(days[0], { day: 'numeric', month: 'long' })} – ${fmt(days[6], { day: 'numeric', month: 'long', year: 'numeric' })}</b>
      <div class="chips">${Object.entries(PLATFORMS).filter(([k]) => S.platforms[k]).map(([k, v]) => `<span class="chip on">${v.n}</span>`).join('')}</div></div>
      <div class="plan"><div class="widget" style="padding:10px"><div class="week">${days.map(col).join('')}</div></div>
      <div class="widget"><div class="tabs"><button class="${P.tray === 'designs' ? 'on' : ''}" data-act="tray" data-t="designs">Designs</button><button class="${P.tray === 'ideas' ? 'on' : ''}" data-act="tray" data-t="ideas">Ideas</button></div><div class="tray">${tray}</div></div></div>`;
  },
};
ACT.wk = (a) => { const n = +a.dataset.n; P.ws = n === 0 ? monday(new Date()) : addD(P.ws, n); route(); };
ACT.tray = (a) => { P.tray = a.dataset.t; route(); };
document.addEventListener('dragstart', (e) => { const c = e.target.closest('[data-drag]'); if (c) e.dataTransfer.setData('text/plain', c.dataset.drag); });
document.addEventListener('dragover', (e) => { const d = e.target.closest('.day'); $$('.day.over').forEach((x) => x !== d && x.classList.remove('over')); if (d) { e.preventDefault(); d.classList.add('over'); } });
document.addEventListener('drop', (e) => {
  const d = e.target.closest('.day'); if (!d) return; e.preventDefault();
  const id = e.dataTransfer.getData('text/plain'); if (!id) return;
  S.posts.push({ id: 'p' + uid(), d: id, date: d.dataset.date, time: '09:00', pf: Object.keys(S.platforms).filter((k) => S.platforms[k]).slice(0, 2), status: 'Scheduled' });
  toast('Scheduled for ' + fmt(new Date(d.dataset.date + 'T00:00'), { weekday: 'long', day: 'numeric', month: 'short' }) + ', 09:00'); route();
});

/* ---------- Studio (design hub) ---------- */
const ST = { tab: 0, cat: 'All', q: '' };
PAGES.studio = {
  t: 'Studio', s: 'Design posts for every platform, or bring them in from Figma.',
  actions: () => `<button class="btn secondary" data-act="figma">${ic('figma')}<span class="hide-sm">Import from Figma</span></button><button class="btn primary" data-act="newDesign" data-ratio="4:5">${ic('plus')}New design</button>`,
  view: () => {
    const tile = (r, n, s, w, h, sl) => `<button class="tile" data-act="newDesign" data-ratio="${r}" data-slides="${sl || 1}"><span class="shape"><i style="width:${w}px;height:${h}px"></i></span><span><b>${n}</b><small>${s}</small></span></button>`;
    const tabs = ['All designs', 'Templates', 'Figma imports'];
    let body = '';
    if (ST.tab === 0) { const l = S.designs.filter((d) => d.name.toLowerCase().includes(ST.q.toLowerCase())); body = l.length ? `<div class="cards">${l.map((d) => designCard(d)).join('')}</div>` : `<div class="empty">${ic('search', 28)}<p>No design matches “${esc(ST.q)}”.</p></div>`; }
    if (ST.tab === 1) {
      const bt = brand().templates, cats = ['All', ...new Set(Object.values(TPL).filter((t) => t.cat !== 'Basics').map((t) => t.cat))];
      body = `<div><b style="font:600 16px var(--jak)">${esc(brand().name)} templates</b><p class="xs-t muted">Saved from your designs. Only this brand can see them.</p></div>
      ${bt.length ? `<div class="cards">${bt.map((t) => `<div class="card tp"><button class="pv" data-act="fromBTpl" data-id="${t.id}" style="border:0">${btThumb(t, 170, 200)}<span class="badge b-Approved">Brand</span></button><div class="meta"><b>${esc(t.name)}</b><small>${t.ratio}</small></div></div>`).join('')}</div>` : `<div class="empty">${ic('layout', 28)}<p>No ${esc(brand().name)} templates yet.<br>Open a design and choose “Save slide as brand template”.</p></div>`}
      <div><b style="font:600 16px var(--jak)">Starter templates</b><p class="xs-t muted">Recolored with ${esc(brand().name)}’s colors and fonts.</p></div>
      <div class="chips">${cats.map((c) => `<button class="chip ${ST.cat === c ? 'on' : ''}" data-act="cat" data-c="${c}">${c}</button>`).join('')}</div><div class="cards">${Object.entries(TPL).filter(([, t]) => t.cat !== 'Basics' && (ST.cat === 'All' || t.cat === ST.cat)).map(([k, t]) => `<button class="card tp" data-act="fromTpl" data-tpl="${k}"><div class="pv">${tplThumb(k, '4:5', 170, 200)}${t.live ? '<span class="badge b-Scheduled">Live data</span>' : ''}</div><div class="meta"><b>${t.name}</b><small>${t.cat}</small></div></button>`).join('')}</div>`;
    }
    if (ST.tab === 2) {
      const fg = S.designs.filter((d) => d.source === 'Figma');
      body = `<div class="widget row" style="gap:16px;flex-wrap:wrap"><span class="thumbbox" style="width:48px;height:48px;color:var(--text-2)">${ic('figma', 26)}</span><div class="grow"><b>${FIG.status && FIG.status.connected ? 'Figma connected' + (FIG.status.user && FIG.status.user.handle ? ' as ' + esc(FIG.status.user.handle) : '') : 'Figma not connected'}</b><p class="sm-t muted">${FIG.status && FIG.status.defaultFile ? esc(FIG.status.defaultFile.name) + ' · default file · ' : ''}${fg.length} design${fg.length === 1 ? '' : 's'} linked. Changes in Figma can be pulled into the Studio with Re-sync.</p></div>${FIG.status && !FIG.status.connected ? `<button class="btn secondary" data-act="figConnect">${ic('figma')}Connect Figma</button>` : ''}<button class="btn secondary" data-act="figma">${ic('plus')}Import frames</button></div>
      <div class="cards">${fg.map((d) => designCard(d, `<span class="row" style="margin-top:6px;gap:6px"><span class="badge ${d.figma.sync === 'In sync' ? 'b-Published' : 'b-warn'}">${d.figma.sync}</span></span>`)).join('')}</div>`;
    }
    return `<div class="tiles">${tile('1:1', 'Square post', '1080 × 1080', 26, 26)}${tile('4:5', 'Portrait post', '1080 × 1350', 22, 28)}${tile('9:16', 'Story / Reel', '1080 × 1920', 18, 32)}${tile('4:5', 'Carousel', '3 slides · 4:5', 22, 28, 3)}</div>
    <div class="row sp" style="flex-wrap:wrap;gap:12px"><div class="tabs" style="min-width:300px">${tabs.map((t, i) => `<button class="${ST.tab === i ? 'on' : ''}" data-act="stab" data-i="${i}">${t}</button>`).join('')}</div>
      <input class="field" id="stq" placeholder="Search designs" style="max-width:260px;${ST.tab === 0 ? '' : 'visibility:hidden'}" value="${esc(ST.q)}"></div>${body}`;
  },
};
ACT.stab = (a) => { ST.tab = +a.dataset.i; route(); };
ACT.cat = (a) => { ST.cat = a.dataset.c; route(); };
document.addEventListener('input', (e) => { if (e.target.id === 'stq') { ST.q = e.target.value; const p = e.target.selectionStart; route(); const n = $('#stq'); n.focus(); n.setSelectionRange(p, p); } });

/* ---------- Brand kit (one per brand workspace) ---------- */
const BK = { tab: 'info' };
const BKTABS = [['info', 'Info & guidelines', 'doc'], ['logos', 'Logos & assets', 'image'], ['colors', 'Colors', 'palette'], ['type', 'Typography', 'type'], ['tpl', 'Templates', 'layout'], ['set', 'Settings', 'settings']];
function setupItems() {
  const b = brand();
  return [
    { l: 'Upload a logo', d: b.logos.length > 0, tab: 'logos' },
    { l: 'Describe the brand voice', d: !!(b.voice || '').trim(), tab: 'info' },
    { l: 'Add do and don’t guidelines', d: !!((b.dos || '').trim() || (b.donts || '').trim()), tab: 'info' },
    { l: 'Connect a social account', d: Object.values(S.platforms).some(Boolean), href: '#/settings' },
    { l: 'Save a brand template', d: b.templates.length > 0, tab: 'tpl' },
    { l: 'Create the first design', d: S.designs.length > 0, href: '#/studio' },
  ];
}
function setupCard() {
  const it = setupItems(), n = it.filter((x) => x.d).length; if (n === it.length) return '';
  return `<div class="widget"><div class="wtitle">${brandAv(brand(), 'sm')}Set up ${esc(brand().name)}<span class="sp"></span><span class="xs-t muted">${n} of ${it.length} done</span></div><div class="prog-w"><div class="prog" role="progressbar" aria-label="Setup progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(n / it.length * 100)}"><i style="width:${Math.round(n / it.length * 100)}%"></i></div><b class="prog-pct">${Math.round(n / it.length * 100)}%</b></div><div>${it.map((x) => `<button class="todo" style="width:100%;text-align:left" data-act="bkGo" ${x.tab ? `data-tab="${x.tab}"` : `data-href="${x.href}"`}><span class="cbx ${x.d ? 'on' : ''}">${x.d ? ic('check', 12) : ''}</span><span class="grow ${x.d ? 'muted' : ''}" style="${x.d ? 'text-decoration:line-through' : ''}">${x.l}</span>${x.d ? '' : ic('chevR', 16, 'faint')}</button>`).join('')}</div></div>`;
}
const bkPreview = () => `<div class="row" style="gap:16px;flex-wrap:wrap">${tplThumb('launch', '4:5', 200, 250)}${tplThumb('quote', '4:5', 200, 250)}${tplThumb('stat', '1:1', 200, 250)}</div>`;
const ta = (key, ph, h) => `<textarea class="inp ta" data-b="${key}" placeholder="${ph || ''}" style="min-height:${h || 90}px">${esc(brand()[key])}</textarea>`;
const ip = (key, ph) => `<input class="inp" data-b="${key}" value="${esc(brand()[key])}" placeholder="${ph || ''}">`;
const LANGS = ['English', 'French', 'Spanish', 'German', 'Arabic', 'Italian', 'Portuguese'];
const BKP = {
  info: () => {
    const b = brand();
    return `<div class="phead"><div><h2>Brand information</h2><p>The basics every design and AI caption for ${esc(b.name)} starts from.</p></div></div>`
      + fgrid(fld('Brand name', `<input class="inp" data-b="name" maxlength="40" value="${esc(b.name)}">`) + fld('Industry', ip('industry', 'e.g. Fintech')) + fld('Website', ip('website', 'example.com')) + fld('Social handle', ip('handle', '@yourbrand'))
        + fld('Tagline', ip('tagline', 'A short line that sums the brand up'), { full: 1 }) + fld('About the brand', ta('about', 'What the brand does and what makes it different'), { full: 1 }) + fld('Target audience', ta('audience', 'Who you talk to', 70), { full: 1 }))
      + `<div class="phead"><div><h2>Voice &amp; guidelines</h2><p>Used by the AI assistant and shown to anyone designing for this brand.</p></div></div>`
      + fgrid(fld('Brand voice', ta('voice', 'Tone of voice, words to use or avoid'), { full: 1 }) + fld('Do', ta('dos', 'One rule per line', 110), { hint: 'One rule per line.' }) + fld('Don’t', ta('donts', 'One rule per line', 110), { hint: 'One rule per line.' }));
  },
  logos: () => {
    const b = brand(), kinds = ['Primary', 'Icon', 'Light background', 'Dark background'];
    const lcard = (l) => { const dark = l.kind === 'Dark background', lite = l.kind === 'Light background', bg = dark ? '#0b1220' : lite ? '#ffffff' : 'var(--pill)', col = dark ? '#fff' : lite ? '#0f172a' : 'var(--text-1)';
      return `<div class="logo"><div class="lv" style="background:${bg};color:${col}">${l.src ? `<img src="${l.src}" alt="${esc(l.name)}">` : `<span style="font:700 ${l.kind === 'Icon' ? 34 : 26}px '${b.fonts.heading}',sans-serif">${esc(l.text || b.name)}</span>`}</div><div class="lm"><div class="grow"><b class="sm-t">${esc(l.name)}</b><p class="xs-t muted">${l.kind}</p></div>${l.src ? `<a class="btn ghost icon sm" href="${l.src}" download="${esc(l.name)}" title="Download">${ic('download', 16)}</a>` : ''}<button class="btn ghost icon sm" data-act="delLogo" data-id="${l.id}" title="Remove">${ic('trash', 16)}</button></div></div>`; };
    return `<div class="phead"><div><h2>Logos</h2><p>Primary logo, icon and light or dark versions. Add them to any design from the editor’s Brand tab.</p></div></div>
      <div class="row" style="flex-wrap:wrap"><select class="field sm" id="logoKind" style="width:190px">${kinds.map((k) => `<option>${k}</option>`).join('')}</select><label class="btn primary sm">${ic('upload', 16)}Upload logo<input type="file" id="logoUp" accept="image/*" multiple hidden></label><span class="xs-t muted">PNG, JPG or SVG. Transparent PNG or SVG works best.</span></div>
      ${b.logos.length ? `<div class="logos">${b.logos.map(lcard).join('')}</div>` : `<div class="empty">${ic('image', 28)}<p>No logos for ${esc(b.name)} yet.</p></div>`}
      <div class="phead"><div><h2>Other brand assets</h2><p>Photography, patterns, icons and mockups that belong to this brand only.</p></div><label class="btn secondary sm">${ic('upload', 16)}Add images<input type="file" id="assetUp" accept="image/*" multiple hidden></label></div>
      ${b.assets.length ? `<div class="logos">${b.assets.map((a) => `<div class="logo"><div class="lv" style="padding:0;height:130px"><img src="${a.src}" alt="${esc(a.name)}" style="max-width:none;max-height:none;width:100%;height:100%;object-fit:cover"></div><div class="lm"><div class="grow"><b class="sm-t">${esc(a.name)}</b></div><button class="btn ghost icon sm" data-act="delAsset" data-id="${a.id}" title="Remove">${ic('trash', 16)}</button></div></div>`).join('')}</div>` : `<p class="sm-t muted">No extra assets yet.</p>`}`;
  },
  colors: () => {
    const b = brand(), role = (i) => ['Primary: buttons, accents', 'Dark: backgrounds', 'Light: backgrounds'][i] || '';
    return `<div class="phead"><div><h2>Brand colors</h2><p>The first three colors drive starter templates: primary, dark and light.</p></div><button class="btn secondary sm" data-act="addColor" ${b.colors.length >= 12 ? 'disabled' : ''}>${ic('plus', 16)}Add color</button></div>
      <div style="display:flex;flex-direction:column;gap:8px">${b.colors.map((c, i) => `<div class="crow"><input type="color" data-ci="${c.id}" value="${hex(c.hex)}"><div class="grow"><input class="inp" style="padding:6px 10px" data-cn="${c.id}" value="${esc(c.name)}"><p class="xs-t faint" style="margin-top:3px">${role(i)}</p></div><code class="sm-t muted">${c.hex.toUpperCase()}</code><button class="btn ghost icon sm" data-act="delColor" data-id="${c.id}" ${b.colors.length <= 3 ? 'disabled' : ''} title="Remove">${ic('trash', 16)}</button></div>`).join('')}</div>
      <div><span class="label">Live preview on starter templates</span><div id="bkPreview">${bkPreview()}</div></div>`;
  },
  type: () => {
    const b = brand(), sel = (key, label, list) => `<div class="fld"><label>${label}</label><select class="field" data-bf="${key}">${list.map((f) => `<option ${f === b.fonts[key] ? 'selected' : ''}>${f}</option>`).join('')}</select></div>`;
    return `<div class="phead"><div><h2>Typography</h2><p>Headings, body text and the Arabic font for RTL posts.</p></div></div>`
      + fgrid(sel('heading', 'Heading font', FONTS) + sel('body', 'Body font', FONTS) + sel('arabic', 'Arabic font', ['Cairo', 'Tajawal', 'Poppins']))
      + `<div class="grid g2" style="grid-template-columns:1fr 1fr"><div class="typecard"><span class="xs-t muted">${b.fonts.heading} · Heading</span><p style="font:700 36px/1.1 '${b.fonts.heading}',sans-serif">${esc(b.tagline || 'Design that converts.')}</p><p style="font:500 22px '${b.fonts.heading}',sans-serif" class="muted">Aa Bb Cc 0123</p></div>
        <div class="typecard"><span class="xs-t muted">${b.fonts.body} · Body</span><p style="font:400 16px/1.5 '${b.fonts.body}',sans-serif">${esc((b.about || 'Write something short and useful. Keep sentences simple and the next step obvious.').slice(0, 160))}</p><p dir="rtl" style="font:600 24px '${b.fonts.arabic}',sans-serif;margin-top:6px">تصميم واضح ونتائج أفضل</p></div></div>`;
  },
  tpl: () => {
    const b = brand();
    return `<div class="phead"><div><h2>${esc(b.name)} templates</h2><p>Reusable layouts saved from your designs. Only this brand sees them.</p></div><a class="btn secondary sm" href="#/studio" data-act="goTemplates">Starter templates</a></div>
      ${b.templates.length ? `<div class="cards">${b.templates.map((t) => `<div class="card tp"><button class="pv" data-act="fromBTpl" data-id="${t.id}" style="border:0">${btThumb(t, 170, 200)}</button><div class="meta"><b>${esc(t.name)}</b><small>${t.ratio}</small><div class="row" style="margin-top:8px;gap:4px"><button class="btn secondary sm grow" data-act="fromBTpl" data-id="${t.id}">Use</button>${persist.readOnly ? '' : `<button class="btn ghost icon sm" data-act="rnBTpl" data-id="${t.id}" title="Rename" aria-label="Rename ${esc(t.name)}">${ic('type', 16)}</button><button class="btn ghost icon sm" data-act="delBTpl" data-id="${t.id}" title="Delete" aria-label="Delete ${esc(t.name)}">${ic('trash', 16)}</button>`}</div></div></div>`).join('')}</div>` : `<div class="empty">${ic('layout', 28)}<p>No templates yet.<br>Open any design in the editor and choose “Save slide as brand template”.</p></div>`}`;
  },
  set: () => {
    const b = brand(), connected = Object.entries(PLATFORMS).filter(([k]) => S.platforms[k]);
    return `<div class="phead"><div><h2>Brand settings</h2><p>Defaults that apply only to ${esc(b.name)}.</p></div></div>`
      + fgrid(fld('Default canvas', dd('b:defaultRatio', b.defaultRatio || '4:5', [['1:1', 'Square 1:1'], ['4:5', 'Portrait 4:5'], ['9:16', 'Story 9:16']])) + fld('Caption language', dd('b:lang', b.lang || 'English', LANGS.map((l) => [l, l])))
        + fld('Default hashtags', `<textarea class="inp ta" data-b="hashtags" style="min-height:70px" placeholder="#yourbrand #topic">${esc(b.hashtags)}</textarea>`, { full: 1, hint: 'Added to AI-written captions.' }) + fld('Call to action', ip('cta', 'e.g. Link in bio, example.com'), { full: 1, hint: 'Added to AI-written captions.' }))
      + `<div><span class="label">Connected accounts</span><div class="row" style="flex-wrap:wrap;gap:8px">${connected.map(([k, v]) => `<span class="chip on">${v.n}</span>`).join('') || '<span class="sm-t muted">None connected yet</span>'}<button class="btn secondary sm" data-act="goAccounts">Manage accounts</button></div></div>`
      + `<div><span class="label">Brand actions</span><div class="acts"><button class="btn secondary" data-act="dupBrand">${ic('copy')}Duplicate brand</button><button class="btn secondary" data-act="delBrand" style="color:var(--neg)" ${S.brands.length < 2 ? 'disabled' : ''}>${ic('trash')}Delete brand</button></div>${S.brands.length < 2 ? '<p class="hint">You need at least one brand.</p>' : ''}</div>`;
  },
};
PAGES.brand = {
  t: 'Brand kit', get s() { return 'Colors, fonts, logos and templates for ' + brand().name + '. Nothing here is shared with your other brands.'; },
  actions: () => `<button class="btn secondary hide-sm" data-act="manageBrands">${ic('layers')}Manage brands</button><button class="btn primary" data-act="addBrand">${ic('plus')}New brand</button>`,
  view: () => {
    const b = brand(), it = setupItems(), done = it.filter((x) => x.d).length;
    return `<div class="widget"><div class="bk-head"><button class="br-av lg" data-act="brandPhoto" data-id="${b.id}" title="Change the brand photo" aria-label="Change ${esc(b.name)}’s photo">${brandAv(b, 'lg')}<span class="br-cam">${ic('image', 13)}</span></button><div class="grow"><h2 id="bkName" style="font:600 20px/1.3 var(--jak)">${esc(b.name)}</h2><p class="sm-t muted">${esc([b.industry, b.website].filter(Boolean).join(' · ') || 'Add your brand details below')}</p></div><span class="badge ${done === it.length ? 'b-Published' : 'b-warn'}">${done === it.length ? 'Brand kit complete' : done + ' of ' + it.length + ' set up'}</span></div></div>
    <div class="bk-tabs">${BKTABS.map(([k, l, i]) => `<button class="${BK.tab === k ? 'on' : ''}" data-act="bkTab" data-k="${k}">${ic(i, 18)}${l}</button>`).join('')}</div>
    <div class="widget" style="gap:22px">${BKP[BK.tab]()}</div>`;
  },
};

/* ---------- Brand switching, creating, managing ---------- */
const closeModals = () => { $('#modal-root').innerHTML = ''; };
/** Your brands: drag to reorder (the order of the switcher), quick sorts, photo, switch, delete */
function openBrands() {
  const stats = (b) => { const dt = S.data[b.id] || { designs: [], posts: [] }; return { designs: dt.designs.length, sch: dt.posts.filter((p) => p.status === 'Scheduled').length }; };
  const row = (b, i) => { const st = stats(b), on = !allOn() && b.id === S.active;
    return `<div class="br-row ${on ? 'on' : ''}" draggable="true" data-bid="${b.id}">
      <span class="br-grip" title="Drag to reorder" aria-hidden="true">${ic('menu', 16)}</span>
      <button class="br-av" data-act="brandPhoto" data-id="${b.id}" title="Change ${esc(b.name)}’s photo" aria-label="Change ${esc(b.name)}’s photo">${brandAv(b, 'md')}<span class="br-cam">${ic('image', 11)}</span></button>
      <div class="grow"><b class="sm-t">${esc(b.name)}</b><p class="xs-t muted">${st.designs} design${st.designs === 1 ? '' : 's'} · ${st.sch} scheduled</p></div>
      <span class="br-mv"><button class="btn ghost icon sm" data-act="brMove" data-id="${b.id}" data-n="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(b.name)} up"><span class="r180">${ic('chevD', 14)}</span></button><button class="btn ghost icon sm" data-act="brMove" data-id="${b.id}" data-n="1" ${i === S.brands.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(b.name)} down">${ic('chevD', 14)}</button></span>
      ${on ? '<span class="badge b-Published">Active</span>' : `<button class="btn secondary sm" data-act="switchBrand" data-id="${b.id}">Open</button>`}
      ${S.brands.length > 1 ? `<button class="btn ghost icon sm" data-act="delBrand" data-id="${b.id}" title="Delete brand" aria-label="Delete ${esc(b.name)}">${ic('trash', 16)}</button>` : ''}</div>`; };
  const view = () => `<div class="mh"><h2>Your brands</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>
    <div class="mb" style="gap:12px">
      <div class="br-tools"><span class="xs-t muted">Sort</span><div class="seg br-sort">${[['az', 'A–Z'], ['recent', 'Recently used'], ['busy', 'Most scheduled']].map(([k, l]) => `<button data-act="brSort" data-k="${k}">${l}</button>`).join('')}</div></div>
      <p class="xs-t muted">Drag a brand to change the order of the switcher. Click a photo to change it.</p>
      <div class="br-list">${S.brands.map(row).join('')}</div>
      ${S.brands.length > 1 ? `<button class="br-all ${allOn() ? 'on' : ''}" data-act="allBrands">${allAv('md')}<span class="grow"><b>All brands in one workspace</b><small>Overview, planner and designs of every brand together</small></span>${allOn() ? '<span class="badge b-Published">On</span>' : ic('chevR', 16)}</button>` : ''}
    </div>
    <div class="mf"><button class="btn secondary" data-close>Close</button><button class="btn primary" data-act="addBrand">${ic('plus', 18)}Add brand</button></div>`;
  let bg = null, from = null;
  const paint = () => { if (bg && bg.isConnected) { $('.modal', bg).innerHTML = view(); } };
  BR.paint = paint;
  modal(view(), { onClose: () => { BR.paint = null; }, onMount: (el) => {
    bg = el;
    el.addEventListener('dragstart', (e) => { const r = e.target.closest('.br-row'); if (!r) return; from = r.dataset.bid; r.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'brand:' + from); });
    el.addEventListener('dragover', (e) => {
      const r = e.target.closest('.br-row'); if (!r || !from || r.dataset.bid === from) return; e.preventDefault();
      const a = S.brands.findIndex((x) => x.id === from), b = S.brands.findIndex((x) => x.id === r.dataset.bid), rc = r.getBoundingClientRect(), after = e.clientY > rc.top + rc.height / 2;
      const [m] = S.brands.splice(a, 1); let to = S.brands.findIndex((x) => x.id === r.dataset.bid) + (after ? 1 : 0); S.brands.splice(to, 0, m);
      if (a !== S.brands.indexOf(m)) { const list = $('.br-list', el), node = list.querySelector(`[data-bid="${from}"]`); after ? r.after(node) : r.before(node); }
    });
    el.addEventListener('dragend', () => { if (!from) return; from = null; save(); renderSide(); paint(); toast('Brand order saved'); });
  } });
}
const BR = { paint: null };
/** Brand photo: an uploaded picture or a logo, zoomed and moved inside the square, on a background; or the initials */
function openBrandPhoto(b) {
  const st = { src: null, img: null, zoom: 1, ox: 0, oy: 0, bg: '#FFFFFF', initials: !(b.avatar && b.avatar.src) && !(b.logos || []).some((l) => l.src) };
  const sw = [...new Set(['#FFFFFF', '#0B1220', ...(b.colors || []).map((c) => String(c.hex).toUpperCase())])].slice(0, 9);
  const logos = (b.logos || []).filter((l) => l.src);
  const load = (src, cb) => { const im = new Image(); im.onload = () => { st.img = im; st.src = src; st.zoom = 1; st.ox = 0; st.oy = 0; st.initials = false; cb && cb(); draw(); }; im.src = src; };
  let cv = null;
  const draw = (target) => {
    const c = target || cv; if (!c) return; const g = c.getContext('2d'), N = c.width;
    g.clearRect(0, 0, N, N); g.fillStyle = st.initials ? (b.avatarBg || st.bg) : st.bg; g.fillRect(0, 0, N, N);
    if (st.initials) { g.fillStyle = '#fff'; g.font = `700 ${Math.round(N * 0.36)}px ${'"' + (b.fonts && b.fonts.heading) + '"'}, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.initials || '?', N / 2, N / 2 + N * 0.02); return; }
    if (!st.img) return;
    const im = st.img, fit = Math.min(N / im.width, N / im.height) * 0.86, k = fit * st.zoom, w = im.width * k, h = im.height * k;
    g.imageSmoothingQuality = 'high'; g.drawImage(im, (N - w) / 2 + st.ox * N, (N - h) / 2 + st.oy * N, w, h);
  };
  const view = () => `<div class="mh"><h2>${esc(b.name)} photo</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>
    <div class="mb bp">
      <div class="bp-stage"><canvas id="bpCv" width="320" height="320" class="${st.initials ? '' : 'pan'}" aria-label="Photo preview. Drag to move it."></canvas><p class="xs-t muted">${st.initials ? 'Initials on the brand color.' : 'Drag to move · zoom below'}</p></div>
      <div class="bp-side">
        <span class="lv-l">Source</span>
        <div class="bp-src">
          <label class="bp-up">${ic('upload', 18)}<span>Upload</span><input type="file" id="bpFile" accept="image/*" hidden></label>
          ${logos.map((l, i) => `<button type="button" class="bp-logo ${st.src === l.src ? 'on' : ''} ${l.kind === 'Dark background' ? 'dk' : ''}" data-i="${i}" title="${esc(l.name)}"><img src="${l.src}" alt=""></button>`).join('')}
          <button type="button" class="bp-ini ${st.initials ? 'on' : ''}" id="bpIni" style="background:${b.avatarBg || (b.colors[0] ? b.colors[0].hex : '#fd0e35')}">${esc(b.initials || '?')}</button>
        </div>
        <span class="lv-l">Zoom</span><input type="range" id="bpZoom" min="0.5" max="3" step="0.01" value="${st.zoom}" ${st.initials ? 'disabled' : ''}>
        <span class="lv-l">Background</span><div class="bp-sw">${sw.map((c) => `<button type="button" data-c="${c}" class="${(st.initials ? (b.avatarBg || '') : st.bg) === c ? 'on' : ''}" style="background:${c}" aria-label="Background ${c}"></button>`).join('')}</div>
      </div></div>
    <div class="mf">${b.avatar && b.avatar.src ? `<button class="btn ghost" id="bpDel" style="margin-right:auto;color:var(--neg)">${ic('trash', 16)}Remove photo</button>` : ''}<button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="bpGo">Save photo</button></div>`;
  let el = null;
  const paint = () => { $('.modal', el).innerHTML = view(); cv = $('#bpCv', el); draw(); };
  const close = modal('', { onMount: (bg, cl) => {
    el = bg; paint();
    bg.addEventListener('click', (e) => {
      const lg = e.target.closest('.bp-logo'), c = e.target.closest('.bp-sw [data-c]');
      if (lg) { const l = logos[+lg.dataset.i]; st.bg = l.kind === 'Dark background' ? (sw.find((x) => x !== '#FFFFFF') || '#0B1220') : '#FFFFFF'; load(l.src, paint); }
      else if (e.target.closest('#bpIni')) { st.initials = true; st.img = null; st.src = null; paint(); }
      else if (c) { if (st.initials) b.avatarBg = c.dataset.c; else st.bg = c.dataset.c; paint(); }
      else if (e.target.closest('#bpDel')) { delete b.avatar; save(); cl(); afterBrandPhoto(b, 'Photo removed'); }
      else if (e.target.closest('#bpGo')) {
        if (st.initials) { delete b.avatar; }
        else if (st.img) { const out = document.createElement('canvas'); out.width = out.height = 256; draw(out); b.avatar = { src: out.toDataURL('image/png') }; }
        save(); cl(); afterBrandPhoto(b, 'Photo saved');
      }
    });
    bg.addEventListener('change', (e) => { if (e.target.id === 'bpFile' && e.target.files[0]) readImage(e.target.files[0], 1024, (src) => { st.bg = '#FFFFFF'; load(src, paint); }); });
    bg.addEventListener('input', (e) => { if (e.target.id === 'bpZoom') { st.zoom = +e.target.value; draw(); } });
    let drag = null;
    bg.addEventListener('pointerdown', (e) => { if (e.target.id !== 'bpCv' || st.initials || !st.img) return; drag = { x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy, w: e.target.getBoundingClientRect().width }; e.target.setPointerCapture(e.pointerId); });
    bg.addEventListener('pointermove', (e) => { if (!drag) return; st.ox = drag.ox + (e.clientX - drag.x) / drag.w; st.oy = drag.oy + (e.clientY - drag.y) / drag.w; draw(); });
    bg.addEventListener('pointerup', () => { drag = null; });
  } });
  // start from what the brand shows today
  if (b.avatar && b.avatar.src) load(b.avatar.src);
  else if (logos.length) { const l = logos.find((x) => x.kind === 'Icon') || logos[0]; st.bg = l.kind === 'Dark background' ? '#0B1220' : '#FFFFFF'; load(l.src, () => el && paint()); }
  return close;
}
function afterBrandPhoto(b, msg) { refreshChrome(); renderSide(); BR.paint && BR.paint(); if (location.hash === '#/brand' || !location.hash.startsWith('#/editor')) route(); toast(msg); }
function openAddBrand() {
  let touched = false;
  modal(`<div class="mh"><h2>Add a brand</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>
  <div class="mb"><button type="button" class="bg-drop" id="nbGuide"><span class="bg-ic">${ic('doc', 22)}</span><span class="grow"><b>Start from a brand guide</b><small>Upload a brand guide or company profile (PDF). Claude fills in the name, tone, colors, fonts and logos for you to review.</small></span>${ic('upload', 18)}</button>
  <input type="file" id="nbPdf" accept="application/pdf,.pdf" hidden>
  <div class="bg-or"><span>or set it up yourself</span></div>
  <div class="note">${ic('layers', 16)}<span>Every brand gets its own workspace. Designs, planner, connected accounts, templates and brand kit stay separate from your other brands.</span></div>
  <label class="lab">Brand name<input class="field" id="nbName" maxlength="40" placeholder="e.g. Nuba Capital"></label>
  <div class="g2f"><label class="lab">Industry<input class="field" id="nbInd" placeholder="e.g. Fintech"></label><label class="lab">Website<input class="field" id="nbWeb" placeholder="example.com"></label></div>
  <div class="g2f"><label class="lab">Primary color<input type="color" id="nbCol" value="#6366f1"></label><label class="lab">Start from<select class="field" id="nbFrom"><option value="">Empty brand kit</option>${S.brands.map((b) => `<option value="${b.id}">Copy colors, fonts &amp; guidelines from ${esc(b.name)}</option>`).join('')}</select></label></div>
  <p class="xs-t" id="nbErr" style="color:var(--neg)" hidden></p></div>
  <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="nbGo">${ic('plus', 18)}Create brand</button></div>`, {
    onMount: (bg, close) => {
      const go = () => {
        const name = $('#nbName', bg).value.trim(), err = $('#nbErr', bg);
        if (!name) { err.textContent = 'Give your brand a name.'; err.hidden = false; $('#nbName', bg).focus(); return; }
        if (S.brands.some((b) => b.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'You already have a brand with this name.'; err.hidden = false; return; }
        const b = makeBrand({ name, industry: $('#nbInd', bg).value.trim(), website: $('#nbWeb', bg).value.trim(), color: $('#nbCol', bg).value, colorTouched: touched, from: $('#nbFrom', bg).value });
        close(); S.active = b.id; save(); BK.tab = 'info'; ST.q = ''; ST.tab = 0; ST.cat = 'All'; renderSide(); toast('“' + b.name + '” workspace created');
        location.hash === '#/brand' ? route() : (location.hash = '#/brand');
      };
      $('#nbGo', bg).addEventListener('click', go);
      $('#nbGuide', bg).addEventListener('click', () => $('#nbPdf', bg).click());
      $('#nbPdf', bg).addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) { close(); openGuideImport(f); } });
      $('#nbCol', bg).addEventListener('input', () => { touched = true; });
      bg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'color') go(); });
      setTimeout(() => $('#nbName', bg).focus(), 30);
    },
  });
}
/* ---------- New brand from a brand guide (PDF) ----------
   pdf.js renders the pages in the browser and reads their text; Claude (/social/brand-guide/read) returns the brand
   kit and where the logos are; the logos are cut out of a sharp render of their page, with a transparent background. */
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let pdfjsP = null;
const loadPdfJs = () => (pdfjsP ??= new Promise((ok, ko) => {
  if (window.pdfjsLib) return ok(window.pdfjsLib);
  const sc = document.createElement('script'); sc.src = PDFJS + 'pdf.min.js'; sc.async = true;
  sc.onload = () => { const L = window.pdfjsLib; if (!L) return ko(new Error('PDF reader unavailable')); L.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(L); };
  sc.onerror = () => { pdfjsP = null; ko(new Error('Could not load the PDF reader. Check your connection.')); };
  document.head.append(sc);
}));
/** One page as a canvas, `w` pixels wide */
async function pdfPage(doc, n, w) {
  const page = await doc.getPage(n), v0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: w / v0.width });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise; return c;
}
/** Which pages Claude sees: all of a short guide, else the first ones and a spread of the rest */
const guidePages = (N, max = 10) => { if (N <= max) return [...Array(N)].map((_, i) => i + 1); const head = [1, 2, 3, 4, 5, 6], rest = max - head.length, out = new Set(head); for (let i = 1; i <= rest; i++) out.add(Math.round(6 + (i * (N - 6)) / (rest + 1))); return [...out].sort((a, b) => a - b); };
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0xffffff; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lumRgb = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
/**
 * A logo cut out of a page: the background (the median of the box's edge) becomes transparent, each pixel keeps the
 * colour it has over that background, and the result is trimmed to the logo. `recolor` paints it in one colour.
 */
function cutLogo(page, box, ink, photo) {
  const W = page.width, H = page.height, pad = 0.012;
  const x0 = Math.max(0, Math.floor((box.x0 - pad) * W)), y0 = Math.max(0, Math.floor((box.y0 - pad) * H)), x1 = Math.min(W, Math.ceil((box.x1 + pad) * W)), y1 = Math.min(H, Math.ceil((box.y1 + pad) * H));
  const w = x1 - x0, h = y1 - y0; if (w < 8 || h < 8) return null;
  const d = page.getContext('2d').getImageData(x0, y0, w, h), px = d.data;
  if (photo) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(d, 0, 0); return { canvas: c, mono: false }; }
  const ring = []; for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) ring.push((y * w + x) * 4); for (let y = 0; y < h; y++) for (const x of [0, 1, w - 2, w - 1]) ring.push((y * w + x) * 4);
  const med = (k) => { const v = ring.map((i) => px[i + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const bg = [med(0), med(1), med(2)], ik = hexRgb(ink), D = Math.max(70, Math.hypot(ik[0] - bg[0], ik[1] - bg[1], ik[2] - bg[2]));
  let bx0 = w, by0 = h, bx1 = -1, by1 = -1, solid = 0, spread = 0, mean = [0, 0, 0];
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const dist = Math.hypot(px[i] - bg[0], px[i + 1] - bg[1], px[i + 2] - bg[2]), a = Math.max(0, Math.min(1, (dist - 22) / (D * 0.82 - 22)));
    if (a < 0.06) { px[i + 3] = 0; continue; }
    for (let k = 0; k < 3; k++) px[i + k] = Math.max(0, Math.min(255, Math.round(bg[k] + (px[i + k] - bg[k]) / a)));
    px[i + 3] = Math.round(a * 255);
    if (a > 0.35) { const x = j % w, y = (j / w) | 0; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; } // the trim ignores faint gradient specks
    if (a > 0.9) { solid++; for (let k = 0; k < 3; k++) mean[k] += px[i + k]; }
  }
  if (bx1 < 0) return null;
  mean = mean.map((v) => v / Math.max(1, solid));
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 230) spread += Math.hypot(px[i] - mean[0], px[i + 1] - mean[1], px[i + 2] - mean[2]);
  const src = document.createElement('canvas'); src.width = w; src.height = h; src.getContext('2d').putImageData(d, 0, 0);
  const tw = bx1 - bx0 + 5, th = by1 - by0 + 5, k = Math.min(1, 1400 / Math.max(tw, th));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(tw * k)); c.height = Math.max(1, Math.round(th * k));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, bx0 - 2, by0 - 2, tw, th, 0, 0, c.width, c.height);
  return { canvas: c, mono: solid > 0 && spread / solid < 38 }; // one-colour logos can be recoloured for the other background
}
/** The symbol at the start of a horizontal logo (separated from the wordmark by a clear gap), or null */
function splitIcon(c) {
  const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, col = new Array(w).fill(0);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (d[(y * w + x) * 4 + 3] > 90) col[x]++;
  const start = col.findIndex((v) => v > 0); if (start < 0) return null;
  let x = start, gap = 0;
  for (; x < w; x++) { if (col[x] === 0) { if (++gap >= Math.max(6, w * 0.02)) break; } else gap = 0; }
  const end = x - gap + 1, iw = end - start;
  if (x >= w || iw < h * 0.4 || iw > w * 0.4) return null; // no gap, or not a symbol-sized part
  let y0 = h, y1 = -1; for (let y = 0; y < h; y++) for (let xx = start; xx < end; xx++) if (d[(y * w + xx) * 4 + 3] > 90) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
  if (y1 < 0) return null;
  const o = document.createElement('canvas'); o.width = iw + 4; o.height = y1 - y0 + 5; o.getContext('2d').drawImage(c, start - 2, y0 - 2, o.width, o.height, 0, 0, o.width, o.height); return o;
}
const recolor = (c, hex) => { const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const g = o.getContext('2d'); g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = hex; g.fillRect(0, 0, o.width, o.height); return o; };

/** Reads the PDF and asks Claude: { guide, logos: [{ name, kind, src }] }. `step(i, text)` reports progress. */
async function readBrandGuide(file, step) {
  step(0, 'Opening the PDF');
  const L = await loadPdfJs(), doc = await L.getDocument({ data: await file.arrayBuffer() }).promise, N = doc.numPages, list = guidePages(N);
  let text = '';
  for (let n = 1; n <= Math.min(N, 40) && text.length < 30000; n++) { const t = await (await doc.getPage(n)).getTextContent(); text += `\n--- Page ${n} ---\n` + t.items.map((x) => x.str).join(' ').replace(/\s+/g, ' '); }
  const pages = [];
  for (const [i, n] of list.entries()) { step(1, `Reading page ${i + 1} of ${list.length}`); const c = await pdfPage(doc, n, 1100); pages.push({ n, image: c.toDataURL('image/jpeg', 0.72) }); }
  step(2, 'Claude is reading the brand');
  const r = await api('/social/brand-guide/read', { method: 'POST', body: { pages, text, fileName: file.name } }), g = r.guide;
  step(3, 'Cutting out the logos');
  const dark = (g.colors.find((c) => c.role === 'dark') || [...g.colors].sort((a, b) => lumRgb(hexRgb(a.hex)) - lumRgb(hexRgb(b.hex)))[0] || { hex: '#0B1220' }).hex;
  const primary = (g.colors.find((c) => c.role === 'primary') || g.colors[0] || { hex: '#6366f1' }).hex;
  const logos = [], sharp = new Map();
  for (const l of g.logos) {
    try {
      const pg = sharp.get(l.page) || sharp.set(l.page, await pdfPage(doc, l.page, 2600)).get(l.page);
      const cut = cutLogo(pg, l.box, l.ink, l.background === 'photo'); if (!cut) continue;
      const light = lumRgb(hexRgb(l.ink)) > 0.6, nm = g.name || 'Logo', src = (c) => c.toDataURL('image/png');
      if (l.kind === 'icon') {
        logos.push({ name: nm + ' icon', kind: 'Icon', src: src(cut.mono && light ? recolor(cut.canvas, primary) : cut.canvas) });
        if (cut.mono && light) logos.push({ name: nm + ' icon white', kind: 'Primary', src: src(cut.canvas) });
      } else {
        logos.push({ name: nm + (light ? ' white' : ''), kind: l.background === 'photo' ? 'Primary' : light ? 'Dark background' : 'Light background', src: src(cut.canvas) });
        if (cut.mono && l.background !== 'photo') logos.push(light ? { name: nm + ' dark', kind: 'Light background', src: src(recolor(cut.canvas, dark)) } : { name: nm + ' white', kind: 'Dark background', src: src(recolor(cut.canvas, '#FFFFFF')) });
        // no separate symbol in the guide: take it from the full logo
        const icon = !g.logos.some((o) => o.kind === 'icon') && cut.mono && l.background !== 'photo' && splitIcon(cut.canvas);
        if (icon) { logos.push({ name: nm + ' icon', kind: 'Icon', src: src(recolor(icon, light ? primary : lumRgb(hexRgb(l.ink)) < 0.25 ? primary : l.ink)) }); logos.push({ name: nm + ' icon white', kind: 'Primary', src: src(recolor(icon, '#FFFFFF')) }); }
      }
    } catch (e) { /* a logo that can't be cut is skipped; the others still come */ }
  }
  return { guide: g, logos, pages: N };
}

function openGuideImport(file) {
  const steps = ['Opening the PDF', 'Reading the pages', 'Claude is reading the brand', 'Cutting out the logos'];
  let at = 0, sub = '', res = null, err = '', alive = true;
  const st = { colors: null, logos: null };
  const head = (t) => `<div class="mh"><span style="color:var(--text-2)">${ic('doc', 22)}</span><h2>${t}</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>`;
  const view = () => {
    if (err) return `${head('Start from a brand guide')}<div class="mb"><div class="note warn">${ic('alert', 16)}<span>${esc(err)}</span></div><p class="sm-t muted">You can still create the brand yourself and fill in its kit.</p></div>
      <div class="mf"><button class="btn secondary" data-close>Close</button><button class="btn primary" id="bgManual">${ic('plus', 18)}Create it myself</button></div>`;
    if (!res) return `${head('Reading your brand guide')}<div class="mb"><p class="sm-t muted">${esc(file.name)} · ${(file.size / 1048576).toFixed(1)} MB</p>
      <ol class="bg-steps">${steps.map((t, i) => `<li class="${i < at ? 'done' : i === at ? 'on' : ''}"><span class="bg-dot">${i < at ? ic('check', 12) : ''}</span><span>${i === at && sub ? esc(sub) : t}</span></li>`).join('')}</ol>
      <p class="xs-t muted">This takes about a minute. The PDF is read in your browser; only page previews and text are sent to Claude.</p></div>`;
    const g = res.guide, cols = st.colors, lg = st.logos, fonts = g.fonts;
    const fontRow = (k, l) => `<div class="bg-font"><span class="lv-l">${l}</span><b style="font-family:'${esc(fonts[k].studio)}'">${esc(fonts[k].studio)}</b>${fonts[k].found && fonts[k].found !== fonts[k].studio ? `<small>for ${esc(fonts[k].found)}</small>` : ''}</div>`;
    return `${head('Review the brand')}<div class="mb bg-review">
      ${g.isBrandGuide ? '' : `<div class="note warn">${ic('alert', 16)}<span>This document doesn't look like a brand guide. Check everything before creating the brand.</span></div>`}
      <div class="g2f"><label class="lab">Brand name<input class="field" id="bgName" maxlength="40" value="${esc(g.name)}"></label><label class="lab">Website<input class="field" id="bgWeb" value="${esc(g.website)}"></label></div>
      <div class="g2f"><label class="lab">Industry<input class="field" id="bgInd" value="${esc(g.industry)}"></label><label class="lab">Tagline<input class="field" id="bgTag" value="${esc(g.tagline)}"></label></div>
      <div class="lab">Colors <small class="muted">${cols.filter((c) => c.on).length} kept · click one to leave it out</small><div class="bg-cols">${cols.map((c, i) => `<button type="button" class="bg-col ${c.on ? 'on' : ''}" data-i="${i}" title="${esc(c.name)} ${c.hex}"><i style="background:${c.hex}"></i><span><b>${esc(c.name)}</b><small>${c.hex}</small></span></button>`).join('')}</div></div>
      <div class="lab">Typography<div class="bg-fonts">${fontRow('heading', 'Headings')}${fontRow('body', 'Body')}${fontRow('arabic', 'Arabic')}</div></div>
      <div class="lab">Logos <small class="muted">${lg.length ? 'cut out with a transparent background · click one to leave it out' : 'none found: upload them later in Brand kit → Logos'}</small>${lg.length ? `<div class="bg-logos">${lg.map((l, i) => `<button type="button" class="bg-logo ${l.on ? 'on' : ''} ${l.kind === 'Dark background' || /white/i.test(l.name) ? 'dk' : ''}" data-i="${i}"><img src="${l.src}" alt=""><span>${esc(l.kind)}</span></button>`).join('')}</div>` : ''}</div>
      <details class="bg-more"><summary>About, tone and guidelines</summary><div class="bg-more-b"><p><b>About</b>${esc(g.about)}</p><p><b>Audience</b>${esc(g.audience)}</p><p><b>Voice</b>${esc(g.voice)}</p><p><b>Do</b>${esc(g.dos).replace(/\n/g, '<br>')}</p><p><b>Don't</b>${esc(g.donts).replace(/\n/g, '<br>')}</p><p><b>Hashtags</b>${esc(g.hashtags)}</p></div></details>
      ${g.note ? `<p class="xs-t muted">${esc(g.note)}</p>` : ''}<p class="xs-t" id="bgErr" style="color:var(--neg)" hidden></p></div>
      <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="bgGo">${ic('plus', 18)}Create brand</button></div>`;
  };
  let bgEl = null;
  const paint = () => { if (!bgEl || !alive) return; const m = $('.modal', bgEl), keep = res ? { name: $('#bgName', bgEl)?.value, web: $('#bgWeb', bgEl)?.value, ind: $('#bgInd', bgEl)?.value, tag: $('#bgTag', bgEl)?.value } : null; m.innerHTML = view();
    if (keep && keep.name != null) { $('#bgName', bgEl).value = keep.name; $('#bgWeb', bgEl).value = keep.web; $('#bgInd', bgEl).value = keep.ind; $('#bgTag', bgEl).value = keep.tag; } };
  const create = () => {
    const g = res.guide, name = $('#bgName', bgEl).value.trim(), e = $('#bgErr', bgEl);
    if (!name) { e.textContent = 'Give your brand a name.'; e.hidden = false; return; }
    if (S.brands.some((b) => b.name.toLowerCase() === name.toLowerCase())) { e.textContent = 'You already have a brand with this name.'; e.hidden = false; return; }
    const cols = st.colors.filter((c) => c.on), b = makeBrand({ name, industry: $('#bgInd', bgEl).value.trim(), website: $('#bgWeb', bgEl).value.trim(), color: (cols[0] || { hex: '#6366f1' }).hex });
    Object.assign(b, {
      initials: g.initials || initialsOf(name), handle: g.handle || '', tagline: $('#bgTag', bgEl).value.trim(), about: g.about, audience: g.audience, voice: g.voice, dos: g.dos, donts: g.donts, hashtags: g.hashtags, cta: g.cta || b.website, lang: g.lang || 'English',
      fonts: { heading: g.fonts.heading.studio, body: g.fonts.body.studio, arabic: g.fonts.arabic.studio },
      logos: st.logos.filter((l) => l.on).map((l) => ({ id: 'l' + uid(), name: l.name.slice(0, 40), kind: l.kind, src: l.src })),
    });
    if (cols.length) b.colors = mkColors(cols.map((c) => [c.name, c.hex]));
    closeAll(); S.active = b.id; save(); BK.tab = 'info'; ST.q = ''; ST.tab = 0; ST.cat = 'All'; renderSide(); toast('“' + b.name + '” created from its brand guide');
    location.hash === '#/brand' ? route() : (location.hash = '#/brand');
  };
  const closeAll = modal(view(), { wide: true, onClose: () => { alive = false; }, onMount: (bg) => {
    bgEl = bg;
    bg.addEventListener('click', (e) => {
      const c = e.target.closest('.bg-col'), l = e.target.closest('.bg-logo');
      if (c) { st.colors[+c.dataset.i].on = !st.colors[+c.dataset.i].on; paint(); }
      else if (l) { st.logos[+l.dataset.i].on = !st.logos[+l.dataset.i].on; paint(); }
      else if (e.target.closest('#bgGo')) create();
      else if (e.target.closest('#bgManual')) { closeAll(); openAddBrand(); }
    });
  } });
  readBrandGuide(file, (i, t) => { at = i; sub = t; paint(); })
    .then((r) => { res = r; st.colors = r.guide.colors.map((c) => ({ ...c, on: true })); st.logos = r.logos.map((l) => ({ ...l, on: true })); paint(); })
    .catch((e) => { err = e.message || 'Could not read this PDF'; paint(); });
}

Object.assign(ACT, {
  switchBrand: (a) => {
    const wasAll = allOn(); if (S.set) S.set.allBrands = false;
    const b0 = S.brands.find((x) => x.id === a.dataset.id); if (b0) b0.lastUsed = Date.now();
    closeModals(); if (a.dataset.id === S.active && !wasAll) { closeDrawer(); return; }
    S.active = a.dataset.id; save(); ST.q = ''; ST.tab = 0; ST.cat = 'All'; P.tray = 'designs'; renderSide(); route(); toast('Switched to ' + brand().name);
  },
  addBrand: () => { closeModals(); closeDrawer(); openAddBrand(); },
  allBrands: () => { closeModals(); closeDrawer(); S.set.allBrands = true; save(); renderSide(); if (/^#\/(brand|settings|profile|editor)/.test(location.hash)) location.hash = '#/overview'; else route(); toast('All brands in one workspace'); },
  brandPhoto: (a) => { const b = S.brands.find((x) => x.id === (a.dataset.id || S.active)); if (b && canEdit()) openBrandPhoto(b); },
  brMove: (a) => { const i = S.brands.findIndex((x) => x.id === a.dataset.id), j = i + +a.dataset.n; if (i < 0 || j < 0 || j >= S.brands.length) return; const [m] = S.brands.splice(i, 1); S.brands.splice(j, 0, m); save(); renderSide(); BR.paint && BR.paint(); },
  brSort: (a) => {
    const k = a.dataset.k, sch = (b) => ((S.data[b.id] || { posts: [] }).posts.filter((p) => p.status === 'Scheduled').length);
    S.brands.sort(k === 'az' ? (x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' }) : k === 'recent' ? (x, y) => (y.lastUsed || 0) - (x.lastUsed || 0) : (x, y) => sch(y) - sch(x));
    save(); renderSide(); BR.paint && BR.paint(); toast(k === 'az' ? 'Sorted A–Z' : k === 'recent' ? 'Sorted by last used' : 'Sorted by scheduled posts');
  },
  manageBrands: () => { closeModals(); closeDrawer(); openBrands(); },
  bkTab: (a) => { BK.tab = a.dataset.k; rerender(); },
  bkGo: (a) => { if (a.dataset.tab) { BK.tab = a.dataset.tab; location.hash === '#/brand' ? route() : (location.hash = '#/brand'); } else location.hash = a.dataset.href; },
  goAccounts: () => { S.set.sec = 'accounts'; location.hash = '#/settings'; },
  goTemplates: () => { ST.tab = 1; },
  addColor: () => { const b = brand(); if (b.colors.length >= 12) return; b.colors.push({ id: 'c' + uid(), name: 'Color ' + (b.colors.length + 1), hex: '#6366F1' }); save(); rerender(); },
  delColor: (a) => { const b = brand(); if (b.colors.length <= 3) return; b.colors = b.colors.filter((c) => c.id !== a.dataset.id); save(); refreshChrome(); rerender(); },
  delLogo: (a) => { const b = brand(); b.logos = b.logos.filter((l) => l.id !== a.dataset.id); save(); refreshChrome(); rerender(); toast('Logo removed'); },
  delAsset: (a) => { const b = brand(); b.assets = b.assets.filter((x) => x.id !== a.dataset.id); save(); rerender(); },
  delBTpl: (a) => {
    const b = brand(), t = b.templates.find((x) => x.id === a.dataset.id); if (!t || !canEdit()) return;
    modal(`<div class="mh"><h2>Delete “${esc(t.name)}”?</h2><button class="btn ghost icon sm" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="mb"><div class="row" style="gap:14px;align-items:flex-start">${btThumb(t, 80, 100)}<p class="sm-t grow">The template is removed from ${esc(b.name)}. Designs already made from it are not changed.</p></div></div>
    <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn danger" id="dtGo">${ic('trash', 16)}Delete template</button></div>`, {
      onMount: (bg, close) => { const g = $('#dtGo', bg); g.addEventListener('click', async () => {
        busy(g, true, 'Deleting…');
        try { await tplApi(b, '/' + encodeURIComponent(t.id), { method: 'DELETE' }); }
        catch (e) { if (!/not found/i.test(e.message)) { busy(g, false); return toast('Could not delete the template: ' + e.message); } }
        b.templates = b.templates.filter((x) => x.id !== t.id); close(); rerender(); toast('Template deleted');
      }); },
    });
  },
  rnBTpl: (a) => {
    const b = brand(), t = b.templates.find((x) => x.id === a.dataset.id); if (!t || !canEdit()) return;
    modal(`<div class="mh"><h2>Rename template</h2><button class="btn ghost icon sm" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="mb"><label class="lab">Template name<input class="field" id="rtN" value="${esc(t.name)}" maxlength="80" autocomplete="off"></label></div>
    <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="rtGo">Save</button></div>`, {
      onMount: (bg, close) => {
        const i = $('#rtN', bg), g = $('#rtGo', bg);
        const go = async () => {
          const n = i.value.trim(); if (!n) return toast('Give the template a name');
          busy(g, true, 'Saving…');
          try { const r = await tplApi(b, '/' + encodeURIComponent(t.id), { method: 'PATCH', body: { name: n } }); t.name = r.name || n; close(); rerender(); toast('Template renamed'); }
          catch (e) { busy(g, false); toast('Could not rename the template: ' + e.message); }
        };
        g.addEventListener('click', go); i.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        setTimeout(() => { i.focus(); i.select(); }, 30);
      },
    });
  },
  fromBTpl: (a) => {
    const t = brand().templates.find((x) => x.id === a.dataset.id); if (!t) return;
    const d = createDesign({ name: t.name, tpl: 'blank', ratio: t.ratio, mutate: (d) => { d.pages = [{ id: uid(), ...pageFromTemplate(t) }]; } });
    toast('Design created from “' + t.name + '”'); location.hash = '#/editor/' + d.id;
  },
  dupBrand: () => {
    const src = brand(), od = S.data[src.id], nb = JSON.parse(JSON.stringify(src)), map = {};
    nb.id = 'b' + uid(); nb.name = src.name + ' (copy)'; nb.initials = initialsOf(nb.name);
    const designs = JSON.parse(JSON.stringify(od.designs)).map((d) => { const n = 'd' + uid(); map[d.id] = n; d.id = n; return d; });
    const posts = JSON.parse(JSON.stringify(od.posts)).map((p) => ({ ...p, id: 'p' + uid(), d: map[p.d] || p.d }));
    S.brands.push(nb); S.data[nb.id] = { designs, posts, platforms: { ...od.platforms }, ideas: JSON.parse(JSON.stringify(od.ideas)), articles: JSON.parse(JSON.stringify(od.articles)) };
    S.active = nb.id; save(); renderSide(); route(); toast('Brand duplicated. You are now in “' + nb.name + '”.');
    // templates have their own API: copy them once the new brand exists on the server (oldest first keeps the order)
    if (!persist.readOnly && nb.templates.length) persist.flush().then(async () => { for (const t of [...nb.templates].reverse()) await tplApi(nb, '', { method: 'POST', body: { id: t.id, name: t.name, ratio: t.ratio, bg: t.bg, layers: t.layers } }); })
      .catch((e) => toast('Some templates were not copied: ' + e.message));
  },
  delBrand: (a) => {
    const b = S.brands.find((x) => x.id === (a.dataset.id || S.active)); if (!b) return; if (S.brands.length < 2) return toast('Keep at least one brand');
    closeModals(); const dt = S.data[b.id];
    modal(`<div class="mh"><h2>Delete ${esc(b.name)}?</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>
    <div class="mb"><div class="note warn">${ic('alert', 16)}<span>This permanently removes <b>${dt.designs.length} designs</b>, ${dt.posts.length} planned posts, ${b.templates.length} templates, the logos and the whole brand kit. It can’t be undone.</span></div>
    <label class="lab">Type <b style="color:var(--text-1)">${esc(b.name)}</b> to confirm<input class="field" id="dbN" autocomplete="off"></label></div>
    <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn danger" id="dbGo" disabled>Delete brand</button></div>`, {
      onMount: (bg, close) => {
        const i = $('#dbN', bg), g = $('#dbGo', bg);
        i.addEventListener('input', () => { g.disabled = i.value.trim().toLowerCase() !== b.name.toLowerCase(); });
        g.addEventListener('click', () => { delete S.data[b.id]; S.brands = S.brands.filter((x) => x.id !== b.id); if (S.active === b.id) S.active = S.brands[0].id; save(); close(); renderSide(); route(); toast('Brand deleted'); });
        setTimeout(() => i.focus(), 30);
      },
    });
  },
  edBrandKit: () => { location.hash = '#/brand'; },
  edLogo: (a) => {
    const b = brand(), l = b.logos.find((x) => x.id === (a && a.dataset && a.dataset.id)) || b.logos[0];
    if (l && l.src) addLayer(Im(80, 70, 360, 150, `url(${l.src}) left center/contain no-repeat`, { name: l.name.slice(0, 20), r: 0 }));
    else addLayer(Tx(80, 70, 520, (l && l.text) || b.name, { name: 'Logo', size: 48, weight: 700, font: b.fonts.heading, color: autoColor(), ls: -1 }));
  },
  edAsset: (a) => {
    const A = brand().assets.find((x) => x.id === a.dataset.id); if (!A) return; const [W] = dim(), w = Math.min(Math.round(W * 0.6), A.w || 600), h = A.w ? Math.round(w * (A.h / A.w)) : w;
    addLayer(Im(Math.round((W - w) / 2), 200, w, h, `url(${A.src}) center/cover`, { name: A.name.slice(0, 20), r: 24 }));
  },
  edBTpl: (a) => {
    const t = brand().templates.find((x) => x.id === a.dataset.id); if (!t) return;
    const same = t.ratio === ED.d.ratio, pg = pageFromTemplate(t), live = same && pg.live;
    mutate(() => {
      const cur = curP(); cur.layers = same ? pg.layers : fitLayers(pg.layers, t.ratio, ED.d.ratio);
      if (live) cur.live = live; else delete cur.live; // the old mapping named the replaced layers
      ED.sel = null;
    });
    if (live) { LIVE && LIVE.refresh(ED.d, { force: true }); toast('Template applied: its live data is updating'); }
    else toast(t.live ? 'Template applied. Re-analyze it in Live data to make it live at this size' : 'Template applied');
  },
  edSaveTpl: () => {
    modal(`<div class="mh"><h2>Save as brand template</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>
    <div class="mb"><div class="row" style="gap:14px;align-items:flex-start">${thumb(curP(), ED.d.ratio, 100, 130)}<div class="grow"><label class="lab">Template name<input class="field" id="tpN" value="${esc(ED.d.name)}" maxlength="50"></label><p class="xs-t muted" style="margin-top:8px">Saved to ${esc(brand().name)} only. Text and shapes stay editable when you reuse it.${curP().live && curP().live.map ? ' <b>Live data is kept</b>: the template stays a live calendar.' : ''}</p></div></div></div>
    <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="tpGo">Save template</button></div>`, {
      onMount: (bg, close) => {
        const g = $('#tpGo', bg), i = $('#tpN', bg);
        const go = async () => {
          if (g.disabled || !canEdit()) return;
          const b = brand(), n = i.value.trim() || 'Untitled template';
          const src = reIdPage(JSON.parse(JSON.stringify({ layers: curP().layers, live: liveForTemplate(curP().live) })));
          const tpl = { id: 't' + uid(), name: n.slice(0, 80), ratio: ED.d.ratio, bg: curP().bg, layers: src.layers, ...(src.live ? { live: src.live } : {}) };
          busy(g, true, 'Saving…');
          try {
            await persist.flush(); // a brand created a moment ago must exist on the server first
            const saved = await tplApi(b, '', { method: 'POST', body: tpl });
            b.templates = [saved || tpl, ...b.templates.filter((x) => x.id !== tpl.id)];
            close(); edPanel(); toast('Saved to ' + b.name + ' templates');
          } catch (e) { busy(g, false); toast('Could not save the template: ' + e.message); }
        };
        g.addEventListener('click', go); i.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        setTimeout(() => { i.focus(); i.select(); }, 30);
      },
    });
  },
});
document.addEventListener('input', (e) => {
  const t = e.target, d = t.dataset || {};
  if (d.b && d.b !== 'name') brand()[d.b] = t.value;
  if (d.ci) { const c = brand().colors.find((x) => x.id === d.ci); if (c) { c.hex = t.value; const r = t.closest('.crow'); r && (r.querySelector('code').textContent = t.value.toUpperCase()); } }
  if (d.cn) { const c = brand().colors.find((x) => x.id === d.cn); if (c) c.name = t.value; }
});
document.addEventListener('change', (e) => {
  const t = e.target, d = t.dataset || {};
  if (d.b === 'name') { const b = brand(); b.name = t.value.trim() || b.name; t.value = b.name; b.initials = initialsOf(b.name); const h = $('#bkName'); h && (h.textContent = b.name); refreshChrome(); save(); }
  else if (d.b) { const sub = $('.bk-head .sm-t'); if (sub && (d.b === 'industry' || d.b === 'website')) sub.textContent = [brand().industry, brand().website].filter(Boolean).join(' · ') || 'Add your brand details below'; save(); }
  if (d.ci) { refreshChrome(); const pv = $('#bkPreview'); pv && (pv.innerHTML = bkPreview()); save(); }
  if (d.bf) { brand().fonts[d.bf] = t.value; save(); rerender(); }
  if (t.id === 'logoUp' && t.files.length) {
    const kind = $('#logoKind').value, files = [...t.files]; let n = 0;
    files.forEach((f) => readImage(f, 1600, (src) => { brand().logos.push({ id: 'l' + uid(), name: f.name.replace(/\.[^.]+$/, '').slice(0, 24), kind, src }); if (++n === files.length) { save(); refreshChrome(); rerender(); toast(n + (n > 1 ? ' logos added' : ' logo added')); } }));
    t.value = '';
  }
  if (t.id === 'assetUp' && t.files.length) {
    const files = [...t.files]; let n = 0;
    files.forEach((f) => readImage(f, 2400, (src, w, h) => { brand().assets.push({ id: 'a' + uid(), name: f.name.replace(/\.[^.]+$/, '').slice(0, 24), src, w, h }); if (++n === files.length) { save(); rerender(); toast(n + (n > 1 ? ' images added' : ' image added')); } }));
    t.value = '';
  }
});

/* ---------- Settings (same layout as Blog Admin → Settings) ---------- */
S.set = Object.assign({ sec: 'accounts', provider: 'claude', claudeModel: 'claude-sonnet-5-5', groqModel: 'llama-3.3-70b-versatile', lang: 'English', brief: 'Friendly, clear and expert. Short sentences. No hype. Always end with a useful question.', figUrl: 'https://www.figma.com/design/Kf2x9Q/Boga-Social-Kit', sync: 'manual', fonts: 1, fmt: 'PNG', quality: '1x', exLang: 'English only', tz: 'Africa/Tunis', safe: 1, auto: 1, liveServer: 1 }, S.set || {});
const SETS = [['accounts', 'Connected accounts', 'globe'], ['figma', 'Figma', 'figma'], ['ai', 'AI assistant', 'studio'], ['export', 'Export & publishing', 'download'], ['look', 'Appearance', 'palette'], ['data', 'Data & backup', 'layers']];
const sbadge = (on, a, b) => `<span class="sbadge ${on ? 'on' : ''}">${on ? a : b}</span>`;
const phead = (t, d, right = '') => `<div class="phead"><div><h2>${t}</h2><p>${d}</p></div>${right}</div>`;
const fld = (label, inner, { full, hint } = {}) => `<div class="fld ${full ? 'full' : ''}"><label>${label}</label>${inner}${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
const fgrid = (x) => `<div class="fgrid">${x}</div>`;
const acts = (x, one) => `<div class="acts ${one ? 'one' : ''}">${x}</div>`;
const how = (items) => `<div class="how"><b>How to connect</b><ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol></div>`;
const sw = (on, act, attrs, label) => `<button class="sw ${on ? 'on' : ''}" data-act="${act}" ${attrs} aria-label="${label}" aria-pressed="${!!on}"><span></span></button>`;
const dd = (id, val, opts) => `<div class="dd"><button type="button" class="ddb" data-act="ddt"><span class="grow">${esc((opts.find((o) => o[0] === val) || opts[0])[1])}</span>${ic('chevD', 16)}</button><div class="ddm" hidden>${opts.map(([v, l]) => `<button type="button" data-act="ddp" data-id="${id}" data-v="${esc(v)}" class="${v === val ? 'on' : ''}"><span class="grow">${esc(l)}</span>${v === val ? ic('check', 14) : ''}</button>`).join('')}</div></div>`;
const swRow = (title, hint, key) => `<div class="swrow"><div class="grow"><b>${title}</b><p>${hint}</p></div>${sw(S.set[key], 'setSw', `data-k="${key}"`, title)}</div>`;
const AI_NAME = { anthropic: 'Claude (Anthropic)', groq: 'Groq' };
const AI_MODELS = { anthropic: [['claude-opus-5-5', 'Claude Opus 5.5'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-5-5', 'Claude Haiku 5.5']], groq: [['llama-3.3-70b-versatile', 'Llama 3.3 70B'], ['llama-3.1-8b-instant', 'Llama 3.1 8B']] };
/** AI settings from the API: view = { provider, anthropic: { hasKey, last4, model }, groq: {…}, ready } */
const AIS = { view: null, pick: null, models: {}, loading: null };
function aiLoad(force) {
  if (AIS.loading && !force) return AIS.loading;
  AIS.loading = api('/ai/settings').then((v) => {
    AIS.view = v; S.set.provider = v.provider === 'groq' ? 'groq' : 'claude';
    if (user.role === 'admin') ['anthropic', 'groq'].forEach((k) => { if (v[k].hasKey && !AIS.models[k]) api('/ai/models?provider=' + k).then((r) => { AIS.models[k] = r.models || []; aiRerender(); }).catch(() => { AIS.models[k] = []; }); });
    aiRerender();
  }).catch((e) => toast('Could not load the AI settings: ' + e.message)).finally(() => { AIS.loading = null; });
  return AIS.loading;
}
const aiRerender = () => { if (/^#\/settings/.test(location.hash) && S.set.sec === 'ai') rerender(); };
const SP = {
  /* Connections come from the API (v14 section: CONN). Each network has a Connect button. */
  accounts: () => {
    const list = CONN.list && CONN.brand === S.active ? CONN.list : null;
    // always re-check when the panel opens (another tab, or the API, may have changed them)
    if (!list || Date.now() - (CONN.at || 0) > 3000) CONN.load().then((l) => l && CONN.fresh && S.set.sec === 'accounts' && /^#\/settings/.test(location.hash) && rerender());
    const n = list ? list.filter((c) => c.connected).length : 0;
    const row = ([k, v]) => {
      const c = list && list.find((x) => x.net === k), on = c && c.connected, bad = on && c.status === 'error';
      const who = on ? esc(c.account.handle || c.account.name) : '';
      const status = !c ? '<i class="skel sk-line" aria-label="Checking…"></i>' : bad ? `${who} · needs reconnecting` : on ? `${who} · connected` : c.configured ? 'Not connected yet' : 'Needs setup first';
      const btn = !c ? '<i class="skel sk-btn"></i>' : on ? `${bad ? `<button class="btn primary sm" data-act="pfConnect" data-k="${k}">Reconnect</button>` : ''}<button class="btn secondary sm" data-act="pfDisconnect" data-k="${k}">Disconnect</button>` : `${c.configured && c.kind === 'oauth' ? `<button class="btn ghost sm" data-act="pfSetup" data-k="${k}" title="Domains and callback URLs to add in the app's settings">Setup help</button>` : ''}<button class="btn ${c.configured ? 'primary' : 'secondary'} sm" data-act="pfConnect" data-k="${k}">Connect</button>`;
      return `<div class="prov ${on ? 'on' : ''}"><span class="pcirc" style="background:${v.c}">${ic('net_' + k, 18)}</span><div class="grow"><b>${v.n}</b><span ${bad ? 'style="color:var(--neg)" title="' + esc(c.error || '') + '"' : ''}>${status}</span></div>${btn}</div>`;
    };
    return phead('Connected accounts', `Accounts for ${esc(brand().name)}. Each brand connects its own profiles; tokens are stored encrypted on the server.`, sbadge(n > 0, n + ' connected', 'None connected')) +
    `<div class="provgrid">${Object.entries(PLATFORMS).map(row).join('')}</div>
    <p class="hint">Connected accounts show up in the planner and in the schedule dialog. Disconnecting removes the stored tokens.</p>` +
    how(['Click <b>Connect</b> and sign in with the profile that owns the page or channel.', 'Allow Boğa to publish on its behalf.', 'You come back here: the account shows up as connected, in the Planner and in the schedule dialog.']);
  },
  figma: () => {
    const f = FIG.status; if (!f) FIG.load().then(() => S.set.sec === 'figma' && /^#\/settings/.test(location.hash) && rerender());
    const on = !!(f && f.connected), legacy = on && f.method === 'token', ready = !!(f && f.oauth && f.oauth.configured), u = (f && f.user) || {}, df = f && f.defaultFile;
    const account = on
      ? `<div class="fig9-acct">${u.img ? `<img class="fig9-av" src="${esc(u.img)}" alt="">` : `<span class="fig9-av">${ic('figma', 22)}</span>`}<div class="grow"><b>${esc(u.handle || 'Figma account')}</b><small>${u.email ? esc(u.email) + ' · ' : ''}${legacy ? 'Personal access token (older setup)' : 'Signed in with Figma'}${f.connectedAt ? ' · since ' + new Date(f.connectedAt).toLocaleDateString() : ''}</small></div>
          ${legacy && ready ? `<button class="btn primary sm" data-act="figConnect">${ic('figma', 16)}Switch to Connect Figma</button>` : !legacy ? `<button class="btn secondary sm" data-act="figConnect" title="Sign in again (another account, or new permissions)">Reconnect</button>` : ''}<button class="btn secondary sm" data-act="figDisconnect">Disconnect</button></div>
        ${f.error ? `<div class="note warn">${ic('alert', 16)}<span>${esc(f.error)} <button class="btn link sm" data-act="figConnect">Connect Figma</button></span></div>` : ''}
`
      : `<div class="fig9-cta"><span class="fig9-logo">${ic('figma', 26)}</span><div class="grow"><b>Connect your Figma account</b><p class="sm-t muted">Sign in on figma.com and allow access, like any app. No token to copy: the sign-in is stored encrypted on the server and renewed automatically.</p></div><button class="btn primary" data-act="figConnect" ${f ? '' : 'disabled'}>${ic('figma', 18)}Connect Figma</button></div>
        ${f && !ready ? `<div class="note warn">${ic('alert', 16)}<span>Connect Figma isn't set up on the server yet. <button class="btn link sm" data-act="figSetup">How to set it up</button></span></div>` : ''}`;
    const redir = ready && !(on && !legacy) ? figRedirect() : '';
    // alternative to Connect Figma: a personal access token (e.g. while Figma denies the OAuth app access to a file)
    const tokenAlt = f ? `<details class="fig9-adv"${!ready && !on ? ' open' : ''}><summary>Use a personal access token instead</summary><div class="inrow"><input class="inp" id="figTok" type="password" autocomplete="off" placeholder="figd_…"><button class="btn secondary" data-act="figSaveTok">Save token</button></div><p class="hint">Figma → Settings → Security → Personal access tokens, with read access to file content. It is checked with Figma, stored encrypted, and replaces the current connection.</p></details>` : '';
    const dfile = `<div class="fig9-file">${df ? `${figThumb(df)}<div class="grow"><b>${esc(df.name)}</b><small>Opens first when you click Import from Figma</small></div><button class="btn secondary sm" data-act="figPickDefault" ${on ? '' : 'disabled'}>Change</button><button class="btn ghost sm" data-act="figClearDefault">Remove</button>`
      : `${figThumb(null)}<div class="grow"><b>No default file</b><small>Choose the file you import from most: Import from Figma opens it directly.</small></div><button class="btn secondary sm" data-act="figPickDefault" ${on ? '' : 'disabled'}>Choose a file</button>`}</div>`;
    const teams = f && f.canBrowseTeams ? fld('Teams', `<div class="fig9-teams">${(f.teams || []).map((t) => `<span class="chip">${ic('users', 14)}${esc(t.name)}<button class="fig9-x" data-act="figRmTeam" data-id="${esc(t.id)}" aria-label="Remove ${esc(t.name)}">${ic('x', 12)}</button></span>`).join('')}</div><div class="inrow"><input class="inp" id="figTeam" placeholder="https://www.figma.com/files/team/…"><button class="btn secondary" data-act="figAddTeam" ${on ? '' : 'disabled'}>Add team</button></div>`, { full: 1, hint: 'Figma lists files by team: paste a team page link once, then browse its folders in the file picker.' }) : '';
    return phead('Figma', 'Import frames as editable posts and re-sync them when the design changes.', sbadge(on, 'Connected', 'Not connected')) + account + redir + tokenAlt +
    fgrid(fld('Default file', dfile, { full: 1 }) + teams +
      fld('Re-sync', dd('sync', S.set.sync, [['manual', 'Manual: when I click Re-sync'], ['open', 'When I open a linked design'], ['daily', 'Every day']]), {}) +
      fld('Missing fonts', dd('fontsMode', S.set.fonts ? 'warn' : 'off', [['warn', 'Warn and swap to a brand font'], ['off', 'Keep the original name']]), {})) +
    acts(`<button class="btn primary" data-act="saveSet">Save Figma settings</button>`, 1) +
    how(['Click <b>Connect Figma</b> and allow access on figma.com: you come back here connected.', 'Choose a <b>default file</b> (or pick any file when you import: recent files are remembered).', 'In the Studio click <b>Import from Figma</b> and choose the frames to bring in as editable layers.']);
  },
  /* AI assistant: the real provider settings (/api/ai/settings), shared with Blog Admin → Settings → AI */
  ai: () => {
    if (!AIS.view) { aiLoad(); return phead('AI assistant', 'Write captions in your brand voice, read calendar slides and rebuild pictures as layers.') + '<div class="ai-sk"><div class="skel" style="height:76px"></div><div class="skel" style="height:76px"></div><div class="skel" style="height:44px;grid-column:1/-1"></div></div>'; }
    const v = AIS.view, owner = user.role === 'admin', p = AIS.pick || v.provider, cur = v[p], nm = AI_NAME[p];
    const models = (AIS.models[p] || []).length ? AIS.models[p].map((m) => [m.id, m.name || m.id]) : AI_MODELS[p];
    if (cur.model && !models.some(([id]) => id === cur.model)) models.unshift([cur.model, cur.model]);
    const card = (k) => { const x = v[k]; return `<button class="prov pick ${p === k ? 'active' : ''}" data-act="aiProv" data-k="${k}" ${owner ? '' : 'disabled'}><span class="pcirc" style="background:${k === 'anthropic' ? '#d97757' : '#f55036'}">${k === 'anthropic' ? 'C' : 'G'}</span><div><b>${AI_NAME[k]}</b><span>${x.hasKey ? `Key saved ••••${esc(x.last4)}` : 'No key yet'}${v.provider === k ? ' · in use' : ''}</span></div></button>`; };
    return phead('AI assistant', 'Write captions in your brand voice, read calendar slides and rebuild pictures as layers. Keys are checked with the provider, stored encrypted on the server and never shown again.', sbadge(v.ready, 'Ready', 'Not configured')) +
      (owner ? '' : `<div class="note">${ic('lock', 16)}<span>Only the workspace owner can change AI keys and models. You can still edit the brand voice.</span></div>`) +
      `<div class="provgrid">${card('anthropic')}${card('groq')}</div>` +
      fgrid(
        (owner ? fld(`${nm} API key`, `<div class="inrow"><input class="inp" id="aiKey" type="password" autocomplete="off" spellcheck="false" placeholder="${cur.hasKey ? 'Paste a new key to replace the saved one' : (p === 'anthropic' ? 'sk-ant-…' : 'gsk_…')}"><button class="btn secondary" data-act="aiSaveKey">${cur.hasKey ? 'Replace key' : 'Save key'}</button>${cur.hasKey ? '<button class="btn ghost" data-act="aiRmKey" style="color:var(--neg)">Remove</button>' : ''}</div><p class="hint" id="aiKeyMsg">${p === 'anthropic' ? 'Get a key at console.anthropic.com → API keys.' : 'Get a key at console.groq.com → API keys.'} It is verified with ${nm} before it is saved.</p>`, { full: 1 }) : '') +
        fld('Model', owner ? `<select class="field" id="aiModel" ${cur.hasKey ? '' : 'disabled'}>${models.map(([id, l]) => `<option value="${esc(id)}" ${id === cur.model ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : `<input class="inp" value="${esc(cur.model || '')}" disabled>`, { full: 1, hint: cur.hasKey ? (AIS.models[p] ? `${AIS.models[p].length} models available with this key.` : 'Loading the models your key can use…') : 'Save a key first.' }) +
        fld('Brand voice', `<textarea class="inp ta" data-b="voice" maxlength="2000" placeholder="Audience, tone of voice, words to use or avoid…">${esc(brand().voice)}</textarea>`, { full: 1, hint: `Saved on ${brand().name}. Added to every caption prompt so posts follow its voice.` }) +
        fld('Caption language', dd('b:lang', brand().lang || 'English', ['English', 'French', 'Spanish', 'German', 'Arabic', 'Italian', 'Portuguese'].map((l) => [l, l])), {})) +
      `<div class="ai-uses"><b>Where it's used</b><ul><li>${ic('send', 15)}<span><b>Write with AI</b> in the Schedule dialog: captions from the slide's content, in your brand voice (${nm}).</span></li><li>${ic('chart', 15)}<span><b>Live data</b>: reading calendar slides and rebuilding pictures as layers always uses Claude, so add a Claude key for those even when Groq writes captions.</span></li></ul></div>` +
      acts(`<button class="btn secondary" data-act="aiTest" ${cur.hasKey ? '' : 'disabled'}>${ic('refresh', 16)}Test connection</button><button class="btn primary" data-act="aiSave">${owner ? `Use ${nm} and save` : 'Save brand voice'}</button>`);
  },
  export: () => phead('Export & publishing', 'Defaults used by the Export button and the Schedule dialog.') +
    fgrid(fld('Format', dd('fmt', S.set.fmt, [['PNG', 'PNG (lossless)'], ['JPG', 'JPG (smaller file)'], ['PDF', 'PDF (carousel document)']])) + fld('Quality', dd('quality', S.set.quality, [['1x', '1× (the design’s size)'], ['2x', '2× (sharp on high-density screens)'], ['3x', '3× (print and large displays)']])) +
      fld('Languages', dd('exLang', S.set.exLang, [['English only', 'English only'], ['Arabic only', 'Arabic only'], ['English + Arabic', 'English + Arabic (auto-translate)']])) + fld('Time zone', `<input class="inp" data-s="tz" value="${esc(S.set.tz)}">`, { hint: 'Scheduled posts go out in this time zone.' })) +
    `<div class="swlist">${swRow('Check safe zones before export', 'Warn when text sits under the profile bar or the reply bar of a story.', 'safe')}${swRow('Create every ratio automatically', 'Export 1:1, 4:5 and 9:16 from one design with Magic resize.', 'auto')}${swRow('Refresh live calendar posts on the server', 'Just before a scheduled post with live data goes out, the server fills in that day’s events and renders its slides again, even with no studio tab open.', 'liveServer')}</div>` +
    acts(`<button class="btn primary" data-act="saveSet">Save export settings</button>`, 1),
  look: () => phead('Appearance', 'Choose how the admin looks.') +
    `<div class="themes">${['dark', 'light'].map((x) => `<button class="theme ${S.theme === x ? 'active' : ''}" data-act="pickTheme" data-t="${x}"><span class="tprev ${x}"><i style="height:12px"></i><i style="height:24px"></i><i style="height:36px"></i></span>${x === 'dark' ? 'Dark' : 'Light'}</button>`).join('')}</div>`,
  data: () => phead('Data & backup', 'Brands, designs, posts and templates are saved to the database as you work. Export a JSON backup any time.') +
    `<div class="count"><b>${S.designs.length}</b>designs in library<span class="sep2"></span><b>${S.posts.length}</b>posts in planner</div>` +
    acts(`<button class="btn secondary" data-act="exportJson">${ic('download')}Export JSON</button><button class="btn secondary" data-act="resetDemo">${ic('refresh')}Reset demo data</button>`),
};
PAGES.settings = {
  t: 'Social Media Settings', s: 'Integrations and data.',
  view: () => `<div class="split"><div class="splitnav"><div class="cap">Select menu</div>${SETS.map(([k, l, i]) => `<button class="${S.set.sec === k ? 'on' : ''}" data-act="setSec" data-k="${k}">${ic(i, 20)}<span>${l}</span></button>`).join('')}</div><div class="panel">${SP[S.set.sec]()}</div></div>`,
};
const rerender = () => { const y = scrollY; route(); scrollTo(0, y); };
/* phones: the section menu is a horizontal strip, keep the chosen section in view */
const showTab = () => { const b = $('.splitnav button.on'); b && b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); };

/* ---------- Profile (same sections and API as Blog Admin → Profile) ---------- */
const PR = { sec: 'info', u: null, f: null, pw: { c: '', a: '', b: '' }, show: {}, loading: null };
const PR_ROLE = { admin: 'Owner', editor: 'Editor', viewer: 'Viewer' };
const PR_NOTIFS = [['editorial', 'Editorial reminders', 'Upcoming publications, new posts and publishing gaps.'], ['seo', 'SEO alerts', 'Missing meta descriptions, alt text and long titles.'], ['gsc', 'Search Console', 'Connection status and indexing alerts.']];
const PR_SECS = [['info', 'Profile settings', 'user'], ['notif', 'Notifications', 'bell'], ['sec', 'Password & security', 'lock'], ['sess', 'Session', 'logout']];
const prForm = (u) => ({ name: u.name || '', email: u.email || '', job: u.job || '', bio: u.bio || '' });
function prLoad() {
  if (PR.loading) return PR.loading;
  PR.loading = api('/auth/me').then((u) => { PR.u = u; PR.f = prForm(u); Object.assign(user, { name: u.name, email: u.email, avatar: u.avatar, role: u.role }); renderSide(); if (/^#\/profile/.test(location.hash)) rerender(); })
    .catch((e) => toast('Could not load your profile: ' + e.message)).finally(() => { PR.loading = null; });
  return PR.loading;
}
async function prPatch(extra) {
  const u = PR.u, n = u.notifications || {};
  try {
    const r = await api('/auth/me', { method: 'PATCH', body: { name: u.name, email: u.email, job: u.job || '', bio: u.bio || '', avatar: u.avatar || '', notifications: { seo: n.seo !== false, editorial: n.editorial !== false, gsc: n.gsc !== false }, ...extra } });
    PR.u = { ...u, ...r }; Object.assign(user, { name: PR.u.name, email: PR.u.email, avatar: PR.u.avatar }); renderSide(); return true;
  } catch (e) { toast(e.message || 'Could not save your profile'); return false; }
}
const prAv = (u, size) => u.avatar
  ? `<span class="av img" style="width:${size}px;height:${size}px;background-image:url(${esc(u.avatar)})"></span>`
  : `<span class="av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px">${esc((u.name || '?').charAt(0).toUpperCase())}</span>`;
const prRules = (a, b) => [['8+ characters', a.length >= 8], ['Upper & lower case', /[a-z]/.test(a) && /[A-Z]/.test(a)], ['A number', /\d/.test(a)], ['A symbol', /[^A-Za-z0-9]/.test(a)], ['Passwords match', !!b && a === b]];
function prMeter() {
  const { a, b } = PR.pw, rules = prRules(a, b), n = rules.slice(0, 4).filter((x) => x[1]).length;
  return `<div class="pr-meter lv${n}"><span class="bars">${[0, 1, 2, 3].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span><span class="lbl">${a ? ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][n] : ''}</span></div>
    <div class="pr-rules">${rules.map(([l, ok]) => `<span class="${ok ? 'ok' : ''}">${ok ? '✓' : '○'} ${l}</span>`).join('')}</div>`;
}
const prPw = (k, label, ac) => fld(label, `<div class="pr-pw"><input class="inp" type="${PR.show[k] ? 'text' : 'password'}" autocomplete="${ac}" data-pw="${k}" value="${esc(PR.pw[k])}"><button type="button" class="btn ghost sm" data-act="prShow" data-k="${k}">${PR.show[k] ? 'Hide' : 'Show'}</button></div>`, { full: k === 'c' });
const prSkeleton = () => `<div class="pr-sk" aria-busy="true" aria-label="Loading your profile"><div class="skel" style="height:22px;width:180px"></div><div class="skel" style="height:14px;width:260px;margin-top:8px"></div>
  <div class="row" style="gap:20px;margin:26px 0 22px"><div class="skel" style="width:72px;height:72px;border-radius:50%"></div><div class="grow"><div class="skel" style="height:14px;width:120px"></div><div class="skel" style="height:12px;width:200px;margin-top:8px"></div><div class="skel" style="height:34px;width:110px;margin-top:12px"></div></div></div>
  ${[0, 1, 2].map(() => '<div class="skel" style="height:12px;width:90px;margin-top:18px"></div><div class="skel" style="height:44px;margin-top:8px"></div>').join('')}</div>`;
const PRP = {
  info: (u) => phead('Profile settings', 'Your name, photo and public details.', `<span class="sbadge on">${PR_ROLE[u.role] || 'Guest'}</span>`) +
    `<div class="pr-photo">${prAv(u, 72)}<div><b>Upload image</b><p class="sm-t muted">PNG, JPG or WebP · square works best</p><div class="row" style="gap:8px;margin-top:10px"><button class="btn secondary sm" data-act="prPhoto">${ic('upload', 16)}Upload</button>${u.avatar ? '<button class="btn secondary sm" data-act="prPhotoRm">Remove</button>' : ''}</div></div><input type="file" id="prFile" accept="image/*" hidden></div>` +
    fgrid(fld('Full name <span class="req">*</span>', `<input class="inp" data-pf="name" value="${esc(PR.f.name)}" autocomplete="name">`, { full: 1 }) +
      fld('Email <span class="req">*</span>', `<input class="inp" type="email" data-pf="email" value="${esc(PR.f.email)}" autocomplete="email">`, { full: 1 }) +
      fld('Job title', `<input class="inp" data-pf="job" placeholder="e.g. Content Manager" value="${esc(PR.f.job)}">`, { full: 1 }) +
      fld('Biography <span class="muted" style="font-weight:400">(Optional)</span>', `<textarea class="inp ta" data-pf="bio" maxlength="200" placeholder="Describe yourself…">${esc(PR.f.bio)}</textarea><div class="pr-count"><span>It will be displayed on your profile.</span><span id="prBioN">${PR.f.bio.length}/200</span></div>`, { full: 1 })) +
    acts(`<button class="btn secondary" data-act="prDiscard">Discard</button><button class="btn primary" data-act="prSave">Apply changes</button>`),
  notif: (u) => { const n = u.notifications || {}; return phead('Notifications', 'Choose what appears in your notification bell.') +
    `<div class="swlist">${PR_NOTIFS.map(([k, t, d]) => `<div class="swrow"><div class="grow"><b>${t}</b><p>${d}</p></div>${sw(n[k] !== false, 'prNotif', `data-k="${k}"`, t)}</div>`).join('')}</div>`; },
  sec: () => phead('Password & security', 'Use at least 8 characters with upper and lower case letters and a number.') +
    fgrid(prPw('c', 'Current password', 'current-password') + prPw('a', 'New password', 'new-password') + prPw('b', 'Confirm new password', 'new-password')) +
    `<div id="prMeter">${prMeter()}</div>` +
    acts(`<button class="btn secondary" data-act="prPwReset">Discard</button><button class="btn primary" data-act="prPwSave">Update password</button>`),
  sess: () => phead('Session', 'Sign out of the admin on this device.') + acts(`<button class="btn secondary" data-act="signOut">${ic('logout', 16)}Sign out</button>`, 1),
};
PAGES.profile = {
  t: 'Profile', s: 'Manage your account and notification preferences.',
  view: () => {
    if (!PR.u) prLoad();
    return `<div class="split"><div class="splitnav"><div class="cap">Select menu</div>${PR_SECS.map(([k, l, i]) => `<button class="${PR.sec === k ? 'on' : ''}" data-act="prSec" data-k="${k}">${ic(i, 20)}<span>${l}</span></button>`).join('')}</div>
      <div class="panel">${PR.u ? PRP[PR.sec](PR.u) : prSkeleton()}</div></div>`;
  },
};
Object.assign(ACT, {
  prSec: (a) => { PR.sec = a.dataset.k; rerender(); showTab(); },
  prDiscard: () => { PR.f = prForm(PR.u); rerender(); },
  prSave: async (a) => {
    const name = PR.f.name.trim(), email = PR.f.email.trim();
    if (!name) return toast('Name is required');
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid email');
    busy(a, true, 'Saving…');
    const ok = await prPatch({ name, email, job: PR.f.job.trim(), bio: PR.f.bio.trim() });
    if (ok) { PR.f = prForm(PR.u); rerender(); toast('Profile saved'); } else busy(a, false);
  },
  prPhoto: () => { const i = $('#prFile'); i && i.click(); },
  prPhotoRm: async () => { if (await prPatch({ avatar: '' })) { rerender(); toast('Photo removed'); } },
  prNotif: async (a) => {
    const k = a.dataset.k, n = { ...(PR.u.notifications || {}) }; n[k] = n[k] === false;
    a.classList.toggle('on', n[k]); a.setAttribute('aria-pressed', n[k]);
    if (await prPatch({ notifications: { seo: n.seo !== false, editorial: n.editorial !== false, gsc: n.gsc !== false } })) PR.u.notifications = n; else rerender();
  },
  prShow: (a) => { PR.show[a.dataset.k] = !PR.show[a.dataset.k]; rerender(); },
  prPwReset: () => { PR.pw = { c: '', a: '', b: '' }; rerender(); },
  prPwSave: async (a) => {
    const { c, a: n, b } = PR.pw;
    if (!c) return toast('Enter your current password');
    if (n.length < 8 || !/[a-z]/.test(n) || !/[A-Z]/.test(n) || !/\d/.test(n)) return toast('New password does not meet the requirements');
    if (n !== b) return toast('Passwords do not match');
    if (n === c) return toast('Choose a password different from the current one');
    busy(a, true, 'Updating…');
    try { await api('/auth/password', { method: 'POST', body: { currentPassword: c, newPassword: n } }); PR.pw = { c: '', a: '', b: '' }; rerender(); toast('Password updated'); }
    catch (e) { busy(a, false); toast(e.message || 'Could not update password'); }
  },
});
document.addEventListener('input', (e) => {
  const t = e.target, d = t.dataset || {};
  if (d.pf && PR.f) { PR.f[d.pf] = t.value; if (d.pf === 'bio') { const c = $('#prBioN'); c && (c.textContent = t.value.length + '/200'); } }
  if (d.pw) { PR.pw[d.pw] = t.value; const m = $('#prMeter'); m && (m.innerHTML = prMeter()); }
});
document.addEventListener('change', (e) => {
  const t = e.target; if (t.id !== 'prFile' || !t.files || !t.files[0]) return;
  const f = t.files[0]; t.value = '';
  if (!f.type.startsWith('image/')) return toast('Please choose an image file');
  const r = new FileReader();
  r.onload = () => { const i = new Image(); i.onload = async () => {
    const sz = Math.min(i.width, i.height), c = document.createElement('canvas'); c.width = c.height = 256;
    c.getContext('2d').drawImage(i, (i.width - sz) / 2, (i.height - sz) / 2, sz, sz, 0, 0, 256, 256);
    if (await prPatch({ avatar: c.toDataURL('image/webp', 0.85) })) { rerender(); toast('Photo updated'); }
  }; i.src = r.result; };
  r.readAsDataURL(f);
});
Object.assign(ACT, {
  setSec: (a) => { S.set.sec = a.dataset.k; rerender(); showTab(); },
  setSw: (a) => { S.set[a.dataset.k] = S.set[a.dataset.k] ? 0 : 1; rerender(); },
  setProv: (a) => { S.set.provider = a.dataset.k; rerender(); },
  aiProv: (a) => { AIS.pick = a.dataset.k; rerender(); },
  aiSaveKey: async (a) => {
    const p = AIS.pick || AIS.view.provider, i = $('#aiKey'), key = i && i.value.trim(), msg = $('#aiKeyMsg');
    if (!key) { i && i.focus(); return toast('Paste the API key first'); }
    busy(a, true, 'Checking…');
    try {
      AIS.view = await api('/ai/settings', { method: 'PUT', body: { [p + 'Key']: key, ...(AIS.view[p === 'anthropic' ? 'groq' : 'anthropic'].hasKey ? {} : { provider: p }) } });
      delete AIS.models[p]; AIS.pick = null; await aiLoad(true); toast(`${AI_NAME[p]} key verified and saved`);
    } catch (e) { busy(a, false); if (msg) { msg.textContent = e.message; msg.style.color = 'var(--neg)'; } }
  },
  aiRmKey: (a) => {
    const p = AIS.pick || AIS.view.provider;
    modal(`<div class="mh"><h2>Remove the ${AI_NAME[p]} key?</h2><button class="btn ghost icon sm" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="mb"><p class="sm-t">Features that use ${AI_NAME[p]} stop working in the Social Media and Blog Admin workspaces until a new key is saved.</p></div>
    <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn danger" id="aiRmGo">Remove key</button></div>`, {
      onMount: (bg, close) => $('#aiRmGo', bg).addEventListener('click', async (e) => { busy(e.currentTarget, true, 'Removing…'); try { AIS.view = await api('/ai/settings', { method: 'PUT', body: { clearKeys: [p] } }); delete AIS.models[p]; close(); aiRerender(); toast('Key removed'); } catch (x) { close(); toast(x.message); } }),
    });
  },
  aiTest: async (a) => {
    const p = AIS.pick || AIS.view.provider; busy(a, true, 'Testing…');
    try { const r = await api('/ai/models?provider=' + p); AIS.models[p] = r.models || []; toast(`${AI_NAME[p]} answered: ${AIS.models[p].length} models available`); aiRerender(); }
    catch (e) { busy(a, false); toast(`${AI_NAME[p]} didn't accept the key: ${e.message}`); }
  },
  aiSave: async (a) => {
    save(); // brand voice and caption language live on the brand
    if (user.role !== 'admin') return toast('Brand voice saved');
    const p = AIS.pick || AIS.view.provider, m = $('#aiModel');
    if (!AIS.view[p].hasKey) return toast(`Save a ${AI_NAME[p]} key first`);
    busy(a, true, 'Saving…');
    try { AIS.view = await api('/ai/settings', { method: 'PUT', body: { provider: p, ...(m && m.value ? { [p + 'Model']: m.value } : {}) } }); AIS.pick = null; S.set.provider = p === 'groq' ? 'groq' : 'claude'; aiRerender(); toast(`${AI_NAME[p]} is now used for AI features`); }
    catch (e) { busy(a, false); toast(e.message); }
  },
  pickTheme: (a) => { setTheme(a.dataset.t); rerender(); },
  saveSet: () => toast('Settings saved'), saveTok: () => toast('Key verified and saved (demo)'), rmTok: () => toast('Key removed (demo)'),
  ddt: (a) => { const m = a.nextElementSibling, h = m.hidden; $$('.ddm').forEach((x) => (x.hidden = true)); m.hidden = !h; },
  ddp: (a) => { const id = a.dataset.id; if (id === 'fontsMode') S.set.fonts = a.dataset.v === 'warn' ? 1 : 0; else if (id.startsWith('b:')) brand()[id.slice(2)] = a.dataset.v; else S.set[id] = a.dataset.v; rerender(); },
  pftoggle: (a) => { S.platforms[a.dataset.k] = S.platforms[a.dataset.k] ? 0 : 1; rerender(); },
  exportJson: () => { const b = new Blob([JSON.stringify({ brands: S.brands, data: S.data }, null, 2)], { type: 'application/json' }), l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = 'boga-social-data.json'; l.click(); toast('Backup downloaded'); },
  resetDemo: () => { persist.reset().then((ok) => (ok ? location.reload() : toast('Only the workspace owner can reset the data'))); },
});
document.addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.s; if (k) S.set[k] = e.target.value; });
document.addEventListener('click', (e) => { if (!e.target.closest('.dd')) $$('.ddm').forEach((m) => (m.hidden = true)); });

/* ---------- Figma import modal ---------- */
/**
 * Import from Figma: Connect Figma (OAuth) → file (default file, recent files, team folders, or a link) → frames
 * (with Figma's thumbnails) → editable designs or slides. API: /social/figma. `pickDefault` only chooses the default file.
 */
function openFigma({ into = false, pickDefault = false } = {}) {
  const st = { step: 'wait', tab: null, mode: 'designs', data: null, sel: new Set(), err: '', busy: false, warn: [], open: null, team: null, folder: null, browse: null, q: '' };
  const meta = (f) => ({ file: st.data.file, fileKey: st.data.fileKey, node: f.id, version: st.res.version, lastModified: st.res.lastModified, sync: 'In sync', at: Date.now() });
  let off = null;
  modal('<div id="fgBody"></div>', {
    wide: true, onClose: () => off && off(), onMount: (bg, close) => {
      const head = (t, back) => `<div class="mh">${back ? `<button class="btn ghost icon sm" id="${back}" aria-label="Back">${ic('chevL')}</button>` : `<span style="color:var(--text-2)">${ic('figma', 22)}</span>`}<h2>${t}</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>`;
      const F = () => FIG.status || {};
      // errors that a new Figma sign-in fixes (expired, or permissions changed) come with the button to do it
      const errNote = () => (st.err ? `<div class="note warn">${ic('alert', 16)}<span>${esc(st.err)}${/connect figma again/i.test(st.err) ? ` <button type="button" class="btn link sm" id="fgConnect">Reconnect Figma</button>` : ''}</span></div>` : '');
      const fileCard = (f) => `<div class="fig9-card${pickDefault && F().defaultFile && F().defaultFile.key === f.key ? ' on' : ''}"><button type="button" class="fig9-open" data-file="${esc(f.key)}" title="${esc(f.name)}"><span class="fig9-cth">${f.thumb ? `<img src="${esc(f.thumb)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${ic('figma', 26)}</span><b>${esc(f.name)}</b><small>${esc(figAgo(f.lastModified || f.at) || 'Figma file')}</small></button>${F().defaultFile && F().defaultFile.key === f.key ? `<span class="fig9-star on" title="Default file">${ic('star', 14)}</span>` : `<button type="button" class="fig9-star" data-star="${esc(f.key)}" title="Set as default file" aria-label="Set ${esc(f.name)} as default file">${ic('star', 14)}</button>`}</div>`;

      const decide = () => {
        const f = F();
        if (!f.connected) { st.step = 'connect'; return paint(); }
        if (!pickDefault && f.defaultFile && !st.data) return fetchFrames({ fileKey: f.defaultFile.key });
        st.step = 'files'; st.tab = st.tab || ((f.recent || []).length ? 'recent' : f.canBrowseTeams && (f.teams || []).length ? 'teams' : 'link'); paint();
      };

      const paint = () => {
        const b = $('#fgBody', bg), f = F();
        if (st.step === 'wait') { b.innerHTML = `${head('Import from Figma')}<div class="mb"><div class="frames">${[0, 1, 2, 3].map(() => '<div class="skel" style="height:180px"></div>').join('')}</div></div>`; return; }
        if (st.step === 'connect') {
          b.innerHTML = `${head('Connect Figma')}
            <div class="mb"><div class="fig9-hero"><span class="fig9-logo lg">${ic('figma', 34)}</span><b>Connect your Figma account</b><p class="sm-t muted">You sign in on figma.com and allow access. The studio then lists your files and frames: no token to copy, no link to paste.</p>
            <button class="btn primary" id="fgConnect">${ic('figma', 18)}Connect Figma</button>${f.oauth && !f.oauth.configured ? `<p class="xs-t muted">Connect Figma isn't set up on the server yet. <button class="btn link sm" id="fgSetup">How to set it up</button></p>` : ''}</div>${f.oauth && f.oauth.configured ? `<details class="fig9-adv"><summary>Figma says “Invalid redirect uri”?</summary>${figRedirect(true)}</details>` : ''}${errNote()}</div>
            <div class="mf"><button class="btn secondary" data-close>Cancel</button></div>`;
          return;
        }
        if (st.step === 'files') {
          const recent = f.recent || [], tabs = [['recent', `Recent${recent.length ? ` (${recent.length})` : ''}`], ...(f.canBrowseTeams ? [['teams', 'Teams']] : []), ['link', 'Paste a link']];
          let body = '';
          if (st.tab === 'recent') body = recent.length ? `<div class="fig9-grid">${recent.map(fileCard).join('')}</div>` : `<div class="empty">${ic('figma', 28)}<p>No recent files yet.<br>Open a file once (paste its link${f.canBrowseTeams ? ' or browse a team' : ''}): it shows up here.</p></div>`;
          if (st.tab === 'teams') {
            const teams = f.teams || [];
            body = `<div class="fig9-bc">${teams.map((t) => `<button type="button" class="chip ${st.team && st.team.id === t.id ? 'on' : ''}" data-team="${esc(t.id)}">${ic('users', 14)}${esc(t.name)}</button>`).join('')}<span class="grow"></span></div>
              <div class="inrow"><input class="field" id="fgTeam" placeholder="Add a team: paste its page link (figma.com/files/team/…)"><button class="btn secondary" id="fgTeamAdd">Add team</button></div>`;
            if (st.team) {
              const bw = st.browse;
              body += `<div class="fig9-path"><button type="button" class="btn link sm" data-team="${esc(st.team.id)}">${esc(st.team.name)}</button>${st.folder ? ` <span class="muted">/</span> <b>${esc(st.folder.name)}</b>` : ''}</div>`;
              body += !bw ? `<div class="fig9-grid">${[0, 1, 2].map(() => '<div class="skel" style="height:150px"></div>').join('')}</div>`
                : `${(bw.folders || []).length ? `<div class="fig9-folders">${bw.folders.map((x) => `<button type="button" class="fig9-folder" data-folder="${esc(x.id)}" data-name="${esc(x.name)}">${ic('layers', 16)}${esc(x.name)}</button>`).join('')}</div>` : ''}
                   ${(bw.files || []).length ? `<div class="fig9-grid">${bw.files.map(fileCard).join('')}</div>` : st.folder ? `<p class="sm-t muted">No files in this folder.</p>` : ''}`;
            } else if (teams.length) body += `<p class="sm-t muted">Choose a team to browse its folders.</p>`;
          }
          if (st.tab === 'link') body = `<label class="lab">Link to a Figma file, page or frame<input class="field" id="fgUrl" value="${esc(st.url || '')}" placeholder="https://www.figma.com/design/…"></label><p class="xs-t muted">In Figma, <span class="kbd">Ctrl</span> <span class="kbd">L</span> copies the link of the selection. The file is added to your recent files.</p>`;
          b.innerHTML = `${head(pickDefault ? 'Choose the default Figma file' : 'Choose a Figma file', !pickDefault && st.data ? 'fgToFrames' : '')}
            <div class="mb fg9"><div class="row sp" style="flex-wrap:wrap;gap:10px"><div class="seg fig9-tabs">${tabs.map(([k, n]) => `<button type="button" class="${st.tab === k ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
              <span class="xs-t muted">${f.user ? `${ic('figma', 12)} ${esc(f.user.handle || '')}` : ''}</span></div>
              <div class="fig9-body">${body}</div>${errNote()}</div>
            <div class="mf"><button class="btn secondary" data-close>Cancel</button>${st.tab === 'link' ? `<button class="btn primary" id="fgGo" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Reading the file…' : pickDefault ? 'Use as default file' : 'Open file'}</button>` : ''}</div>`;
          return;
        }
        if (st.step === 'loading') { b.innerHTML = `${head('Reading the file…')}<div class="mb"><div class="frames">${[0, 1, 2, 3].map(() => '<div class="skel" style="height:210px"></div>').join('')}</div></div>`; return; }
        if (st.step === 'frames') {
          const fr = st.data.frames, pages = [...new Set(fr.map((x) => x.page || ''))], dup = new Set(fr.map((x) => x.name).filter((n, k, a) => a.indexOf(n) !== k)), isDef = f.defaultFile && f.defaultFile.key === st.data.fileKey;
          const card = (x) => `<button type="button" class="frame ${st.sel.has(x.id) ? 'on' : ''}" data-f="${esc(x.id)}" data-q="${esc((x.name + ' ' + (x.page || '') + ' ' + x.width + 'x' + x.height).toLowerCase())}" aria-pressed="${st.sel.has(x.id)}"><span class="ck">${ic('check', 14)}</span><div class="pv">${x.thumb ? `<img src="${esc(x.thumb)}" alt="" loading="lazy">` : ic('image', 28)}</div><b title="${esc(x.name)}">${esc(x.name)}</b><small>${x.kind === 'group' ? 'Group · ' : ''}${isCustom(x.ratio) ? 'Custom' : x.ratio} · ${x.width}×${x.height}${dup.has(x.name) ? ` · <span class="fg9-id">#${esc(x.id)}</span>` : ''}</small></button>`;
          b.innerHTML = `${head('Choose frames to import')}
          <div class="mb fg9">
            <div class="fig9-filebar">${figThumb({ thumb: st.data.thumb }, 40)}<div class="grow"><b>${esc(st.data.file)}</b><small>${fr.length} frame${fr.length > 1 ? 's' : ''}${pages.length > 1 ? ` on ${pages.length} pages` : ''}${st.data.more ? ' (first 60)' : ''}</small></div>
              <button type="button" class="btn ${isDef ? 'secondary' : 'ghost'} sm fig9-def" id="fgDef" aria-pressed="${!!isDef}" title="${isDef ? 'This file opens first when you import' : 'Open this file first next time'}">${ic('star', 14)}${isDef ? 'Default file' : 'Set as default'}</button>
              <button type="button" class="btn secondary sm" id="fgChange">${ic('layers', 14)}Change file</button></div>
            ${into ? '' : `<div class="seg" style="align-self:flex-start;min-width:260px"><button class="${st.mode === 'designs' ? 'on' : ''}" data-m="designs">Separate designs</button><button class="${st.mode === 'slides' ? 'on' : ''}" data-m="slides">One carousel</button></div>`}
            <div class="fg9-bar"><label class="fg9-q">${ic('search', 16)}<input class="field" id="fgQ" type="search" placeholder="Search frames by name, page or size" value="${esc(st.q || '')}" autocomplete="off"></label><span class="fg9-n" id="fgN"></span><button type="button" class="btn ghost sm" id="fgAll">Select all</button><button type="button" class="btn ghost sm" id="fgNone">Clear</button></div>
            <div class="fg9-list" id="fgList">${pages.map((pg) => `<section class="fg9-pg" data-pg="${esc(pg)}">${pages.length > 1 ? `<h4>${esc(pg || 'Frames')}</h4>` : ''}<div class="frames">${fr.filter((x) => (x.page || '') === pg).map(card).join('')}</div></section>`).join('')}<p class="fg9-empty sm-t muted" id="fgEmpty" hidden>No frame matches your search.</p></div>
            <div id="fgNote"></div>
            ${errNote()}
            <p class="xs-t muted">Tip: <span class="kbd">Shift</span> + click selects a range.</p>
          </div>
          <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="fgImp" disabled></button></div>`;
          filterFrames(); syncSel();
          return;
        }
        if (st.step === 'notes') b.innerHTML = `${head('Imported, with a few notes')}
          <div class="mb"><p class="sm-t muted">Figma features the studio can't edit were simplified:</p>${st.warn.map((w) => `<div class="note warn">${ic('alert', 16)}<span>${esc(w)}</span></div>`).join('')}</div>
          <div class="mf"><button class="btn primary" id="fgDone">Open ${st.open && st.open.many ? 'designs' : 'design'}</button></div>`;
      };

      /** Selection and search update the list in place: the scroll position and the search box focus stay */
      const syncSel = () => {
        const fr = st.data.frames, picked = fr.filter((x) => st.sel.has(x.id)), ratios = new Set(picked.map((x) => x.ratio));
        $$('#fgList .frame', bg).forEach((c) => { const on = st.sel.has(c.dataset.f); c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
        const n = $('#fgN', bg); if (n) n.textContent = `${st.sel.size} selected`;
        const btn = $('#fgImp', bg); if (btn) { btn.disabled = !st.sel.size || st.busy; btn.innerHTML = `${ic('download', 18)}${st.busy ? 'Importing…' : (st.sel.size ? `Import ${st.sel.size} frame${st.sel.size === 1 ? '' : 's'}` : 'Select frames to import')}`; }
        const note = $('#fgNote', bg); if (!note) return;
        note.innerHTML = picked.length && ((st.mode === 'slides' && ratios.size > 1) || (into && ED.d && picked.some((x) => x.ratio !== ED.d.ratio)))
          ? `<div class="note warn">${ic('alert', 16)}<span>Slides share one canvas size: frames of another size are scaled to fit ${into && ED.d ? (isCustom(ED.d.ratio) ? ED.d.ratio.replace('x', '×') : ED.d.ratio) : picked[0].width + '×' + picked[0].height}.</span></div>`
          : `<div class="note">${ic('figma', 16)}<span>Each design is created at its frame's size, with layers at the same position and size as in Figma.</span></div>`;
      };
      const visibleCards = () => $$('#fgList .frame', bg).filter((c) => !c.hidden);
      const filterFrames = () => {
        const words = String(st.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
        $$('#fgList .frame', bg).forEach((c) => { c.hidden = !words.every((w) => c.dataset.q.includes(w)); });
        $$('#fgList .fg9-pg', bg).forEach((p) => { p.hidden = !p.querySelector('.frame:not([hidden])'); });
        const e = $('#fgEmpty', bg); if (e) e.hidden = !!visibleCards().length;
        const all = $('#fgAll', bg); if (all) all.textContent = words.length ? `Select ${visibleCards().length} shown` : 'Select all';
      };

      /** Frames of a file: { fileKey } (picker) or { url } (pasted link) */
      const fetchFrames = async (ref) => {
        st.err = ''; st.lastRef = ref; const back = st.step; st.step = 'loading'; paint();
        try {
          const q = ref.fileKey ? 'fileKey=' + encodeURIComponent(ref.fileKey) : 'url=' + encodeURIComponent(ref.url);
          st.data = await api('/social/figma/frames?' + q);
          // a link to one frame selects it; a page full of frames starts empty (pick, or search then Select all)
          st.sel = new Set(st.data.frames.length <= (into ? 1 : 4) ? st.data.frames.map((x) => x.id) : []); st.q = ''; st.last = null; st.step = 'frames';
          FIG.load(); // the file joined the recent files
        } catch (e) {
          st.err = e.message;
          if (/connect figma/i.test(e.message)) { await FIG.load(); st.step = 'connect'; } else { st.step = back === 'loading' || back === 'wait' ? 'files' : back; if (!st.tab) st.tab = 'link'; }
        }
        paint();
      };
      const setDefault = async (key, quiet) => {
        try { FIG.set(await api('/social/figma/default', { method: 'PUT', body: { ref: key } })); if (!quiet) toast('Default Figma file saved'); return true; }
        catch (e) { toast(e.message); return false; }
      };
      const openTeam = async (id) => {
        const t = (F().teams || []).find((x) => x.id === id); if (!t) return; st.team = t; st.folder = null; st.browse = null; st.err = ''; paint();
        try { const r = await api('/social/figma/teams/' + encodeURIComponent(id) + '/folders'); st.browse = { folders: r.folders, files: [] }; } catch (e) { st.err = e.message; st.browse = { folders: [], files: [] }; }
        paint();
      };
      const openFolder = async (id, name) => {
        st.folder = { id, name }; st.browse = null; st.err = ''; paint();
        try { st.browse = await api('/social/figma/folders/' + encodeURIComponent(id) + '/files'); } catch (e) { st.err = e.message; st.browse = { folders: [], files: [] }; }
        paint();
      };
      const pickFile = async (key) => {
        if (pickDefault) { if (await setDefault(key)) close(); return; }
        fetchFrames({ fileKey: key });
      };

      const doImport = async () => {
        st.busy = true; st.err = ''; syncSel();
        try {
          const b = brand(), ids = st.data.frames.filter((x) => st.sel.has(x.id)).map((x) => x.id);
          st.res = await api('/social/figma/import', { method: 'POST', body: { fileKey: st.data.fileKey, ids, fonts: S.set.fonts ? { heading: b.fonts.heading, body: b.fonts.body } : undefined, keepFonts: !S.set.fonts } });
        } catch (e) { st.busy = false; st.err = e.message; return paint(); }
        const ok = st.res.frames.filter((x) => !x.error), failed = st.res.frames.filter((x) => x.error);
        st.warn = [...new Set(ok.flatMap((x) => x.warnings.map((w) => (ok.length > 1 ? x.name + ': ' : '') + w)).concat(failed.map((x) => `${x.id}: ${x.error}`)))];
        if (!ok.length) { st.busy = false; st.err = failed[0] ? failed[0].error : 'Nothing was imported'; return paint(); }
        ok.forEach((x) => ensureRatio(x.ratio));
        const page = (x, ratio) => ({ id: uid(), bg: x.page.bg, layers: ratio && ratio !== x.ratio ? fitPage(x.page.layers, [x.width, x.height], RATIOS[ratio]) : x.page.layers, figma: meta(x) });
        let go;
        if (into && ED.d) {
          mutate(() => { ok.forEach((x) => ED.d.pages.push(page(x, ED.d.ratio))); ED.pi = ED.d.pages.length - 1; ED.sel = null; });
          toast(ok.length + ' frame' + (ok.length > 1 ? 's' : '') + ' added as slides');
        } else if (st.mode === 'slides' && ok.length > 1) {
          const r = ok[0].ratio, d = createDesign({ name: 'Figma carousel · ' + st.data.file, ratio: r, source: 'Figma', mutate: (d) => { d.pages = ok.map((x) => page(x, r)); d.figma = meta(ok[0]); } });
          toast('Imported as a ' + ok.length + '-slide carousel'); go = () => { location.hash = '#/editor/' + d.id; };
        } else {
          const ds = ok.map((x) => createDesign({ name: x.name.replace(' / ', ' · '), ratio: x.ratio, source: 'Figma', mutate: (d) => { d.pages = [page(x)]; d.figma = meta(x); } }));
          toast(ds.length + ' design' + (ds.length > 1 ? 's' : '') + ' imported from Figma');
          go = () => { if (ds.length === 1) location.hash = '#/editor/' + ds[0].id; else { ST.tab = 2; location.hash = '#/studio'; route(); } };
          st.open = { many: ds.length > 1 };
        }
        save(); st.busy = false;
        if (st.warn.length) { st.step = 'notes'; st.go = go; paint(); } else { close(); go && go(); }
      };

      bg.addEventListener('click', async (e) => {
        const t = e.target, at = (sel) => t.closest(sel);
        if (at('#fgConnect')) FIG.connect();
        else if (at('#fgSetup')) figSetup();
        else if (at('[data-tab]')) { st.tab = at('[data-tab]').dataset.tab; st.err = ''; paint(); }
        else if (at('[data-star]')) { const k = at('[data-star]').dataset.star; if (await setDefault(k)) { if (pickDefault) close(); else paint(); } }
        else if (at('[data-file]')) pickFile(at('[data-file]').dataset.file);
        else if (at('[data-team]')) openTeam(at('[data-team]').dataset.team);
        else if (at('[data-folder]')) { const x = at('[data-folder]'); openFolder(x.dataset.folder, x.dataset.name); }
        else if (at('#fgTeamAdd')) { const v = ($('#fgTeam', bg) || {}).value; if (!v) return; try { FIG.set(await api('/social/figma/teams', { method: 'POST', body: { ref: v } })); const nt = (F().teams || [])[0]; nt && openTeam(nt.id); } catch (er) { st.err = er.message; paint(); } }
        else if (at('#fgGo')) {
          st.url = ($('#fgUrl', bg) || {}).value || st.url || ''; if (!st.url.trim()) { st.err = 'Paste a Figma link first'; return paint(); }
          S.set.figUrl = st.url.trim(); save();
          if (pickDefault) { st.busy = true; paint(); const ok = await setDefault(st.url.trim()); st.busy = false; if (ok) close(); else paint(); }
          else fetchFrames({ url: st.url.trim() });
        }
        else if (at('#fgChange')) { st.step = 'files'; st.tab = (F().recent || []).length ? 'recent' : st.tab || 'link'; st.err = ''; paint(); }
        else if (at('#fgToFrames')) { st.step = 'frames'; st.err = ''; paint(); }
        else if (at('#fgDef')) {
          const isDef = F().defaultFile && F().defaultFile.key === st.data.fileKey;
          if (isDef) { try { FIG.set(await api('/social/figma/default', { method: 'DELETE' })); toast('Default file removed'); } catch (er) { toast(er.message); } }
          else await setDefault(st.data.fileKey);
          const d = $('#fgDef', bg), now = F().defaultFile && F().defaultFile.key === st.data.fileKey;
          if (d) { d.className = `btn ${now ? 'secondary' : 'ghost'} sm fig9-def`; d.setAttribute('aria-pressed', !!now); d.innerHTML = `${ic('star', 14)}${now ? 'Default file' : 'Set as default'}`; }
        }
        else if (at('[data-m]')) { st.mode = at('[data-m]').dataset.m; $$('[data-m]', bg).forEach((x) => x.classList.toggle('on', x.dataset.m === st.mode)); syncSel(); }
        else if (at('#fgAll')) { visibleCards().forEach((c) => st.sel.add(c.dataset.f)); syncSel(); }
        else if (at('#fgNone')) { st.sel.clear(); syncSel(); }
        else if (at('[data-f]')) {
          const id = at('[data-f]').dataset.f, cards = visibleCards().map((c) => c.dataset.f);
          if (e.shiftKey && st.last && cards.includes(st.last)) { // range, like a file list
            const [a, z] = [cards.indexOf(st.last), cards.indexOf(id)].sort((x, y) => x - y), on = !st.sel.has(id);
            cards.slice(a, z + 1).forEach((x) => (on ? st.sel.add(x) : st.sel.delete(x)));
          } else st.sel.has(id) ? st.sel.delete(id) : st.sel.add(id);
          st.last = id; syncSel();
        }
        else if (at('#fgImp')) doImport();
        else if (at('#fgDone')) { close(); st.go && st.go(); }
      });
      bg.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        if (e.target.id === 'fgUrl') { e.preventDefault(); $('#fgGo', bg) && $('#fgGo', bg).click(); }
        if (e.target.id === 'fgTeam') { e.preventDefault(); $('#fgTeamAdd', bg) && $('#fgTeamAdd', bg).click(); }
      });
      bg.addEventListener('input', (e) => { if (e.target.id === 'fgQ') { st.q = e.target.value; filterFrames(); } });
      // connected in the popup: carry on to the files
      off = FIG.on((s2) => {
        if (!s2 || !s2.connected) return;
        if (st.step === 'connect') { st.err = ''; decide(); }
        // signed in again from an error (new permissions): open the same file again
        else if (st.err && st.lastRef && s2.connectedAt !== st.connectedAt) { st.connectedAt = s2.connectedAt; fetchFrames(st.lastRef); }
      });
      st.connectedAt = FIG.status && FIG.status.connectedAt;
      st.url = S.set.figUrl || '';
      paint(); (FIG.status ? Promise.resolve() : FIG.load()).then(decide);
    },
  });
}
ACT.figma = () => openFigma();

/* ---------- Schedule + export modals (used by the editor) ---------- */
const CAPS = ['New: CPI is out at 13:30 GMT. Here’s the high-impact calendar for today. Save this post and trade with a plan.', 'Today’s market movers, in one glance. Which release are you watching?'];
function openSchedule(d) {
  const sel = new Set(Object.keys(S.platforms).filter((k) => S.platforms[k]).slice(0, 3)), dd = iso(addD(new Date(), 1));
  modal(`<div class="mh"><h2>Schedule post</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>
  <div class="mb"><div class="row" style="gap:14px;align-items:flex-start">${thumb(d.pages[0], d.ratio, 110, 140)}<div class="grow"><span class="label">Platforms</span><div class="chips" id="scPf">${Object.entries(PLATFORMS).filter(([k]) => S.platforms[k]).map(([k, v]) => `<button class="chip ${sel.has(k) ? 'on' : ''}" data-k="${k}">${v.n}</button>`).join('')}</div></div></div>
  <label class="lab">Caption<textarea class="field" id="scCap" placeholder="Write a caption…"></textarea></label>
  <div class="row"><button class="btn secondary sm" id="scAi">${ic('studio', 16)}Write with AI</button><span class="xs-t muted">Uses your brand voice</span></div>
  <div class="g2f"><label class="lab">Date<input class="field" type="date" id="scD" value="${dd}"></label><label class="lab">Time<input class="field" type="time" id="scT" value="09:00"></label></div></div>
  <div class="mf"><button class="btn secondary" data-close>Save as draft</button><button class="btn primary" id="scGo">${ic('clock', 18)}Schedule</button></div>`, {
    onMount: (bg, close) => {
      bg.addEventListener('click', (e) => {
        const c = e.target.closest('#scPf .chip'); if (c) { sel.has(c.dataset.k) ? sel.delete(c.dataset.k) : sel.add(c.dataset.k); c.classList.toggle('on'); }
        if (e.target.closest('#scAi')) $('#scCap', bg).value = aiCaption(d);
        if (e.target.closest('#scGo')) { S.posts.push({ id: 'p' + uid(), d: d.id, date: $('#scD', bg).value, time: $('#scT', bg).value, pf: [...sel], status: 'Scheduled' }); d.status = 'Scheduled'; close(); toast('Scheduled and added to the Planner'); }
      });
    },
  });
}
function openExport(d, pi) {
  const n = d.pages.length;
  modal(`<div class="mh"><h2>Export</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>
  <div class="mb"><div class="g2f"><label class="lab">Format<select class="field"><option>PNG</option><option>JPG</option><option>PDF</option></select></label><label class="lab">Size<select class="field"><option>1× · ${RATIOS[d.ratio][0]} px</option><option>2×</option></select></label></div>
  <label class="lab">Pages<select class="field" id="exP"><option value="1">Current slide (${pi + 1})</option><option value="${n}">All ${n} slide${n > 1 ? 's' : ''}</option></select></label>
  <label class="lab">Languages<select class="field"><option>English</option><option>Arabic</option><option>English + Arabic</option></select></label></div>
  <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="exGo">${ic('download', 18)}Export</button></div>`, {
    onMount: (bg, close) => bg.addEventListener('click', (e) => { if (e.target.closest('#exGo')) { const k = $('#exP', bg).value; close(); toast('Exported ' + k + ' file' + (k > 1 ? 's' : '') + ' (demo)'); } }),
  });
}

/* ---------- Global click / init ---------- */
document.addEventListener('click', (e) => {
  if (!e.target.closest('.ws')) { const m = $('#wsMenu'); m && (m.hidden = true); }
  const a = e.target.closest('[data-act]'); if (a && ACT[a.dataset.act]) ACT[a.dataset.act](a, e);
});

/* ============================================================
   Boğa Social Studio — editor (Canva / Figma style)
   ============================================================ */
const ED = { d: null, pi: 0, sel: null, zoom: 0.5, fit: true, undo: [], redo: [], tab: 'templates', rtab: 'design', safe: false, lang: 'en', pre: null, editing: null };
const RAIL = [['agent', 'Agent', 'studio'], ['templates', 'Templates', 'layout'], ['elements', 'Elements', 'shapes'], ['text', 'Text', 'type'], ['uploads', 'Uploads', 'upload'], ['figma', 'Figma', 'figma'], ['brand', 'Brand', 'palette'], ['data', 'Live data', 'chart']];
const dim = () => RATIOS[ED.d.ratio];
const curP = () => ED.d.pages[ED.pi];
const curL = () => ED.sel && curP().layers.find((l) => l.id === ED.sel);
const elOf = (id) => $(`#poster .ly[data-id="${id}"]`);
/** Undo history: pages and canvas size (Magic resize changes the ratio) */
const snap = () => JSON.stringify({ r: ED.d.ratio, p: ED.d.pages });
const restore = (str) => { const v = JSON.parse(str), changed = v.r !== ED.d.ratio; ED.d.pages = v.p; if (changed) ED.d.ratio = ensureRatio(v.r); return changed; };
const hex = (v) => {
  v = String(v || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + v.slice(1).split('').map((c) => c + c).join('');
  const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); if (m) return '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('');
  const g = v.match(/#[0-9a-f]{6}/i); return g ? g[0] : '#000000';
};
const edKit = () => kitOf(brand());
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- history ---------- */
function touch() { ED.d.upd = 'Just now'; const s = $('#savetxt'); if (s) s.innerHTML = '<i></i>Saved'; }
function commit(pre) { if (pre && snap() !== pre) { ED.undo.push(pre); if (ED.undo.length > 60) ED.undo.shift(); ED.redo = []; touch(); edTop(); } }
function mutate(fn, redraw = edAll) { const pre = snap(); fn(); commit(pre); redraw(); }
function doUndo() { if (!ED.undo.length) return; ED.redo.push(snap()); const ch = restore(ED.undo.pop()); fixSel(); edAll(); if (ch) fitZoom(); }
function doRedo() { if (!ED.redo.length) return; ED.undo.push(snap()); const ch = restore(ED.redo.pop()); fixSel(); edAll(); if (ch) fitZoom(); }
function fixSel() { ED.pi = Math.min(ED.pi, ED.d.pages.length - 1); if (!curL()) ED.sel = null; }

/* ---------- open ---------- */
function openEditor(id) {
  const d = getD(id); if (!d) { location.hash = '#/studio'; return; }
  Object.assign(ED, { d, pi: 0, sel: null, fit: true, undo: [], redo: [], rtab: 'design', safe: false, lang: 'en', pre: null, editing: null, tab: d.tpl === 'blank' ? 'templates' : d.tpl === 'calendar' ? 'data' : d.source === 'Figma' ? 'figma' : 'templates' });
  $('#editor').innerHTML = `<div class="ed">
    <div class="ed-top">
      <button class="btn ghost icon sm" data-act="edBack" title="Back to Studio">${ic('chevL')}</button><span title="${esc(brand().name)}">${brandAv(brand(), 'sm')}</span>
      <input class="ed-name" id="edName" value="${esc(d.name)}" aria-label="Design name">
      <span class="sep"></span>
      <select class="field sm" id="edRatio" style="width:${isCustom(d.ratio) ? 104 : 84}px" title="Magic resize">${[...Object.keys(RATIOS), ...(Object.keys(RATIOS).includes(d.ratio) ? [] : [d.ratio])].map((r) => `<option value="${r}" ${r === d.ratio ? 'selected' : ''}>${isCustom(r) ? r.replace('x', '×') : r}</option>`).join('')}</select>
      <button class="btn ghost icon sm" id="edUndo" data-act="edUndo" title="Undo (Ctrl+Z)">${ic('undo', 18)}</button>
      <button class="btn ghost icon sm" id="edRedo" data-act="edRedo" title="Redo (Ctrl+Shift+Z)">${ic('redo', 18)}</button>
      <span class="grow"></span>
      <span class="savetxt" id="savetxt"><i></i>Saved</span><span class="sep"></span>
      <button class="btn ghost icon sm" data-act="edZoom" data-n="-0.1" title="Zoom out">${ic('minus', 16)}</button><button class="btn ghost sm zoomtxt" id="zoomTxt" data-act="edFit" title="Fit to screen"></button><button class="btn ghost icon sm" data-act="edZoom" data-n="0.1" title="Zoom in">${ic('plus', 16)}</button>
      <button class="btn ghost icon sm" id="edSafe" data-act="edSafe" title="Safe zones">${ic('frame', 18)}</button><span class="sep"></span>
      <button class="btn ghost icon sm only-narrow" data-act="edProps" title="Properties">${ic('layers', 18)}</button>
      <button class="btn secondary sm" data-act="edSchedule">${ic('clock', 16)}Schedule</button>
      <button class="btn primary sm" data-act="edExport">${ic('download', 16)}Export</button>
    </div>
    <nav class="ed-rail" id="edRail"></nav><aside class="ed-panel" id="edPanel"></aside>
    <section class="ed-stage"><div class="ed-scroll" id="edScroll"><div class="cwrap" id="cwrap"><div class="scaler" id="scaler"><div class="poster" id="poster"></div><div class="safe" id="safe"></div><div id="guides"></div>
      <div class="sel" id="sel" hidden>${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rot'].map((h) => `<i data-h="${h}"></i>`).join('')}<span class="size"></span></div></div></div></div><div class="ed-pages" id="edPages"></div></section>
    <aside class="ed-props" id="edProps"></aside></div>`;
  edAll(); requestAnimationFrame(fitZoom);
}

/* ---------- drawing ---------- */
function edAll() { edTop(); edRail(); edPanel(); edStage(); edPages(); edProps(); }
function edTop() {
  $('#edUndo') && ($('#edUndo').disabled = !ED.undo.length); $('#edRedo') && ($('#edRedo').disabled = !ED.redo.length);
  $('#zoomTxt') && ($('#zoomTxt').textContent = Math.round(ED.zoom * 100) + '%'); $('#edSafe') && $('#edSafe').classList.toggle('on', ED.safe);
  $('#edRatio') && ($('#edRatio').value = ED.d.ratio);
}
function edRail() { $('#edRail').innerHTML = RAIL.map(([k, l, i]) => `<button class="${ED.tab === k ? 'on' : ''} ${k === 'figma' ? 'fig' : ''}" data-act="edTab" data-k="${k}" title="${l}">${ic(i, 22)}<span>${l}</span></button>`).join(''); }
function edStage() {
  const [w, h] = dim(), pg = curP(), p = $('#poster');
  p.style.cssText = `width:${w}px;height:${h}px;background:${pg.bg}`; p.innerHTML = posterHTML(pg);
  applyZoom(); drawSafe(); drawSel();
}
function applyZoom() {
  const [w, h] = dim(), z = ED.zoom;
  $('#cwrap').style.cssText = `width:${w * z}px;height:${h * z}px`;
  $('#scaler').style.cssText = `width:${w}px;height:${h}px;transform:scale(${z});--z:${1 / z}`; edTop();
}
function fitZoom() { const s = $('#edScroll'); if (!s) return; const [w, h] = dim(); ED.zoom = clamp(Math.min((s.clientWidth - 96) / w, (s.clientHeight - 96) / h), 0.1, 1.5); applyZoom(); drawSel(); }
function drawSafe() {
  const [w, h] = dim(), s = $('#safe'); if (!ED.safe) { s.innerHTML = ''; return; }
  s.innerHTML = ED.d.ratio === '9:16' ? `<i style="top:0;height:${h * 0.13}px">Profile bar</i><i style="bottom:0;height:${h * 0.2}px">Reply bar</i>` : `<i style="top:0;height:${h * 0.04}px;background:none"></i><i style="left:${w * 0.0}px;right:0;top:${h * 0.9}px;height:${h * 0.1}px">Caption overlap on feed</i>`;
}
function drawSel() {
  agCtx();
  const l = curL(), s = $('#sel'); if (!s) return;
  if (!l || l.hidden || ED.editing) { s.hidden = true; return; }
  s.hidden = false; s.classList.toggle('lk', !!l.locked);
  s.style.cssText = `left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px;transform:rotate(${l.rot || 0}deg)`;
  s.querySelector('.size').textContent = `${Math.round(l.w)} × ${Math.round(l.h)}`;
}
function edPages() {
  const d = ED.d, [w, h] = dim();
  $('#edPages').innerHTML = d.pages.map((pg, i) => `<div class="pg ${i === ED.pi ? 'on' : ''}"><button data-act="edPage" data-i="${i}" title="Slide ${i + 1}">${thumb(pg, d.ratio, 66, 76)}</button><span>${i + 1}</span>${i === ED.pi ? `<span class="mini"><button data-act="edDupPage" title="Duplicate slide">${ic('copy', 13)}</button>${d.pages.length > 1 ? `<button data-act="edDelPage" title="Delete slide">${ic('trash', 13)}</button>` : ''}</span>` : ''}</div>`).join('') + `<button class="pg-add" data-act="edAddPage" title="Add slide">${ic('plus', 20)}</button><span class="xs-t muted" style="margin-left:8px">${d.pages.length > 1 ? 'Carousel · ' + d.pages.length + ' slides' : 'Add a slide to make a carousel'}</span>`;
}

/* ---------- left panel ---------- */
const SHAPES = { rect: 'Rectangle', round: 'Rounded', circle: 'Circle', pill: 'Pill', line: 'Line', grad: 'Gradient', ring: 'Ring', card: 'Card' };
const shapeIcon = { rect: 'width:30px;height:22px', round: 'width:30px;height:22px;border-radius:7px', circle: 'width:26px;height:26px;border-radius:50%', pill: 'width:34px;height:14px;border-radius:9px', line: 'width:34px;height:3px', grad: 'width:30px;height:22px;border-radius:5px;background:linear-gradient(135deg,#fd0e35,#6366f1)', ring: 'width:26px;height:26px;border-radius:50%;background:none;border:3px solid var(--text-2)', card: 'width:30px;height:22px;border-radius:7px;background:none;border:2px solid var(--text-2)' };
function bgLum() { const b = curP().layers.find((l) => l.locked && l.name === 'Background'); const m = b && b.fill.match(/#([0-9a-f]{6})/i); if (!m) return 0; const n = parseInt(m[1], 16); return (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255; }
const autoColor = () => (bgLum() > 0.6 ? '#0f172a' : '#ffffff');
function edPanel() {
  const t = ED.tab, k = edKit(), p = $('#edPanel'); let h = '';
  const isAg = t === 'agent'; p.classList.toggle('agent', isAg);
  if (isAg) return agPanel(p);
  if (t === 'templates') {
    const bt = brand().templates;
    h = `<h3>Templates</h3><button class="btn secondary" style="padding: 12px 16px;" data-act="edSaveTpl">${ic('plus')}Save slide as brand template</button>
    <span class="label" style="margin-top:6px">${esc(brand().name)} templates</span>
    ${bt.length ? `<div class="tgrid">${bt.map((x) => `<button data-act="edBTpl" data-id="${x.id}">${btThumb(x, 126, 150)}<span>${esc(x.name)}</span></button>`).join('')}</div>` : `<p class="xs-t muted">None yet. Design a slide, then save it here to reuse it. Only this brand sees it.</p>`}
    <span class="label" style="margin-top:10px">Starter templates</span><p class="xs-t muted">Uses ${esc(brand().name)}’s colors and fonts. Replaces the current slide. You can undo it.</p><div class="tgrid">${Object.keys(TPL).filter((x) => x !== 'blank').map((x) => `<button data-act="edTpl" data-k="${x}">${tplThumb(x, ED.d.ratio, 126, 150)}<span>${TPL[x].name}</span></button>`).join('')}</div>`;
  }
  if (t === 'elements') h = `<h3>Elements</h3><div class="g3f">${Object.keys(SHAPES).map((x) => `<button class="shapebtn" data-act="edShape" data-k="${x}" title="${SHAPES[x]}"><i style="${shapeIcon[x]}"></i></button>`).join('')}</div>
    <span class="label" style="margin-top:6px">Brand colors</span><div class="chips">${k.colors.map((c) => `<button class="chip" style="padding:0;width:30px;height:30px;background:${c}" data-act="edColor" data-c="${c}" title="${c}"></button>`).join('')}</div>`;
  if (t === 'text') h = `<h3>Text</h3><button class="txtbtn" data-act="edText" data-k="h"><b style="font:700 24px var(--jak)">Add a heading</b></button><button class="txtbtn" data-act="edText" data-k="s"><b style="font:600 17px var(--jak)">Add a subheading</b></button><button class="txtbtn" data-act="edText" data-k="b"><span class="sm-t">Add body text</span></button>
    <span class="label" style="margin-top:8px">Headline ideas</span>${['CPI day: what the print means for your trades', 'Today’s 5 market movers in 30 seconds', 'CPI lands at 13:30 GMT. Are you ready?'].map((s) => `<button class="sugg" data-act="edSugg" data-s="${esc(s)}">${ic('studio', 14)} ${esc(s)}</button>`).join('')}<p class="xs-t muted">${ED.sel && curL() && curL().type === 'text' ? 'Click an idea to replace the selected text.' : 'Select a text layer to replace it, or click to add as a new heading.'}</p>`;
  if (t === 'uploads') h = `<h3>Uploads</h3><label class="drop">${ic('upload', 24)}<span><b style="color:var(--text-1)">Upload an image</b><br>PNG, JPG or SVG</span><input type="file" accept="image/*" id="upl" hidden></label><span class="label">Backgrounds</span><div class="g2f">${['linear-gradient(135deg,#fd0e35,#7c1d6f)', 'linear-gradient(160deg,#0b1220,#1e1b4b)', 'linear-gradient(135deg,#22A24C,#030504)', 'linear-gradient(135deg,#f8fafc,#cbd5e1)'].map((g) => `<button class="shapebtn" style="aspect-ratio:1.5;background:${g}" data-act="edImg" data-g="${g}"></button>`).join('')}</div>`;
  if (t === 'figma') {
    const fg = ED.d.pages.map((pg, i) => ({ pg, i, f: pg.figma || (i === 0 && ED.d.figma) })).filter((x) => x.f);
    FIGSYNC && FIGSYNC.check(ED.d); // flags slides whose Figma file changed since the import (not defined yet when the editor opens at startup)
    h = `<h3 class="row" style="color:var(--text-2)">${ic('figma', 20)}<span style="color:var(--text-1)">Figma</span></h3><p class="sm-t muted">Bring frames from your Figma files in as editable slides.</p><button class="btn secondary" data-act="edFigmaImport">${ic('link')}Paste link &amp; import</button>
      <span class="label" style="margin-top:6px">Linked frames</span>${fg.length ? fg.map(({ f, i }) => `<div class="idea"><div class="row sp"><b class="sm-t">Slide ${i + 1} · ${esc(f.file || 'Figma')}</b><span class="badge ${f.sync === 'Changed in Figma' ? 'b-warn' : 'b-Published'}">${f.sync || 'In sync'}</span></div><button class="btn secondary sm" data-act="edResync" data-i="${i}">${ic('refresh', 16)}Re-sync from Figma</button></div>`).join('') : '<p class="sm-t muted">No linked frames in this design yet.</p>'}
      <div class="note">${ic('figma', 16)}<span>Edit here like in Figma: drag, resize, rotate, change text. Re-sync pulls updated frames and keeps your caption and schedule.</span></div>`;
  }
  if (t === 'brand') {
    const b = brand(), dk = (l) => l.kind === 'Dark background', lt = (l) => l.kind === 'Light background';
    h = `<h3 class="row">${brandAv(b, 'sm')}<span>${esc(b.name)}</span></h3><p class="xs-t muted">Only ${esc(b.name)}’s assets show up here.</p>
    <span class="label">Colors (click to apply)</span><div class="chips">${k.colors.map((c) => `<button class="chip" style="padding:0;width:34px;height:34px;background:${c}" data-act="edColor" data-c="${c}" title="${c}"></button>`).join('')}</div>
    <span class="label" style="margin-top:6px">Fonts</span>${[...new Set([b.fonts.heading, b.fonts.body, b.fonts.arabic])].filter(Boolean).map((f) => `<button class="txtbtn" data-act="edFont" data-f="${f}"><b style="font:600 20px '${f}'">${f}</b></button>`).join('')}
    <span class="label" style="margin-top:6px">Logos</span>${b.logos.length ? `<div class="g2f">${b.logos.map((l) => `<button class="shapebtn" style="aspect-ratio:1.4;padding:6px;background:${dk(l) ? '#0b1220' : lt(l) ? '#fff' : 'var(--pill)'};color:${dk(l) ? '#fff' : lt(l) ? '#0f172a' : 'var(--text-1)'}" data-act="edLogo" data-id="${l.id}" title="${esc(l.name)}">${l.src ? `<img src="${l.src}" alt="" style="max-width:100%;max-height:100%;object-fit:contain">` : `<b style="font:700 15px '${b.fonts.heading}'">${esc(l.text || b.name)}</b>`}</button>`).join('')}</div>` : `<p class="xs-t muted">No logos yet. Add them in the brand kit.</p>`}
    ${b.assets.length ? `<span class="label" style="margin-top:6px">Brand images</span><div class="g2f">${b.assets.map((a) => `<button class="shapebtn" style="aspect-ratio:1.2;padding:0;overflow:hidden" data-act="edAsset" data-id="${a.id}"><img src="${a.src}" alt="" style="width:100%;height:100%;object-fit:cover"></button>`).join('')}</div>` : ''}
    <button class="btn secondary" data-act="edBrandKit" style="margin-top:6px">${ic('palette')}Edit brand kit</button>`;
  }
  if (t === 'data') {
    const live = ED.d.tpl === 'calendar';
    h = `<h3>Live data</h3><p class="sm-t muted">Economic calendar feed. ${live ? 'Changes update the slide instantly.' : 'Apply it to build a calendar slide.'}</p>
      <div class="seg"><button class="${ED.lang === 'en' ? 'on' : ''}" data-act="edLang" data-l="en">English</button><button class="${ED.lang === 'ar' ? 'on' : ''}" data-act="edLang" data-l="ar">العربية</button></div>
      ${EVENTS.map((e) => `<button class="evrow" data-act="edEv" data-id="${e.id}"><span class="cbx ${e.on ? 'on' : ''}">${e.on ? ic('check', 12) : ''}</span><span class="cur" style="background:${CUR_COLOR[e.cur]}">${e.cur}</span><span class="grow" style="text-align:left">${ED.lang === 'ar' ? e.ar : e.en}</span><span class="xs-t muted">${e.t}</span></button>`).join('')}
      ${live ? '' : `<button class="btn primary" data-act="edApplyCal">Replace slide with calendar</button>`}<p class="xs-t muted">Times are GMT. Source: Forex Factory feed (as in the current Calendar Studio).</p>`;
  }
  p.innerHTML = h;
}

/* ---------- right panel ---------- */
const numIn = (lbl, p, v, step = 1) => `<label class="num"><span>${lbl}</span><input type="number" step="${step}" data-p="${p}" value="${Math.round(v * 100) / 100}"></label>`;
function edProps() {
  const l = curL(), el = $('#edProps'), [W, H] = dim();
  const tabs = `<div class="tabs"><button class="${ED.rtab === 'design' ? 'on' : ''}" data-act="edRTab" data-k="design">Design</button><button class="${ED.rtab === 'layers' ? 'on' : ''}" data-act="edRTab" data-k="layers">Layers</button></div>`;
  if (ED.rtab === 'layers') {
    el.innerHTML = tabs + `<div class="body" style="gap:2px;padding:10px">${[...curP().layers].reverse().map((x) => `<div class="layerrow ${x.id === ED.sel ? 'on' : ''}" data-act="edPick" data-id="${x.id}">${ic(x.type === 'text' ? 'type' : x.type === 'image' ? 'image' : 'shapes', 15, 'faint')}<span class="nm">${esc(x.name)}</span><button class="tg" data-act="edVis" data-id="${x.id}" title="Show / hide">${ic(x.hidden ? 'eyeOff' : 'eye', 15)}</button><button class="tg" data-act="edLock" data-id="${x.id}" title="Lock">${ic(x.locked ? 'lock' : 'unlock', 15)}</button></div>`).join('')}</div>`; return;
  }
  if (!l) {
    const bg = curP().layers.find((x) => x.name === 'Background' && x.locked);
    el.innerHTML = tabs + `<div class="body"><div><span class="label">Canvas</span><div class="seg">${[...Object.keys(RATIOS), ...(Object.keys(RATIOS).includes(ED.d.ratio) ? [] : [ED.d.ratio])].map((r) => `<button class="${ED.d.ratio === r ? 'on' : ''}" data-act="edRatio" data-r="${r}">${isCustom(r) ? r.replace('x', '×') : r}</button>`).join('')}</div><p class="xs-t muted" style="margin-top:6px">${W} × ${H} px. Magic resize re-flows layers when you switch.</p></div>
      ${bg ? `<div><span class="label">Background</span><input type="color" data-p="bgfill" value="${hex(bg.fill)}"><div class="chips" style="margin-top:8px">${edKit().colors.map((c) => `<button class="chip" style="padding:0;width:26px;height:26px;background:${c}" data-act="edBg" data-c="${c}"></button>`).join('')}</div></div>` : ''}
      <div class="row sp"><div><b class="sm-t">Safe zones</b><p class="xs-t muted">Show where platform UI covers the post</p></div><button class="switch ${ED.safe ? 'on' : ''}" data-act="edSafe" aria-label="Safe zones"></button></div>
      <div class="note">${ic('wand', 16)}<span>Click a layer on the canvas to edit it. Double-click text to type. Hold <span class="kbd">Shift</span> to keep proportions.</span></div></div>`; return;
  }
  const isT = l.type === 'text', canFill = !isT, ops = ['Left', 'Center', 'Right', 'Top', 'Middle', 'Bottom'];
  el.innerHTML = tabs + `<div class="body">
    <div class="row"><input class="field sm" data-p="name" value="${esc(l.name)}"><span class="badge b-Draft">${l.type}</span></div>
    ${l.locked ? `<div class="note warn">${ic('lock', 16)}<span>This layer is locked. <button class="btn link sm" style="height:auto;padding:0 4px" data-act="edLock" data-id="${l.id}">Unlock</button></span></div>` : ''}
    <div><span class="label">Align to page</span><div class="chips">${ops.map((o) => `<button class="chip" data-act="edAlign" data-o="${o}">${o}</button>`).join('')}</div></div>
    <div><span class="label">Position &amp; size</span><div class="g2f">${numIn('X', 'x', l.x)}${numIn('Y', 'y', l.y)}${numIn('W', 'w', l.w)}${numIn('H', 'h', l.h)}${numIn('°', 'rot', l.rot || 0)}</div></div>
    ${isT ? `<div><span class="label">Text</span><textarea class="field" data-p="text" style="min-height:70px">${esc(l.text)}</textarea></div>
      <div class="g2f"><label class="lab">Font<select class="field sm" data-p="font">${FONTS.map((f) => `<option ${f === l.font ? 'selected' : ''}>${f}</option>`).join('')}</select></label><label class="lab">Weight<select class="field sm" data-p="weight">${[300, 400, 500, 600, 700].map((w) => `<option ${w == l.weight ? 'selected' : ''}>${w}</option>`).join('')}</select></label></div>
      <div class="g2f">${numIn('Size', 'size', l.size)}${numIn('Line', 'lh', l.lh, 0.05)}</div>
      <div class="seg">${[['left', 'alL'], ['center', 'alC'], ['right', 'alR']].map(([a, i]) => `<button class="${l.align === a ? 'on' : ''}" data-act="edAl" data-a="${a}" title="${a}">${ic(i, 16)}</button>`).join('')}<button class="${l.dir === 'rtl' ? 'on' : ''}" data-act="edRtl" title="Right-to-left">RTL</button></div>
      <div><span class="label">Color</span><input type="color" data-p="color" value="${hex(l.color)}"></div>` : ''}
    ${canFill ? `<div><span class="label">Fill</span><input type="color" data-p="fill" value="${hex(l.fill)}">${/gradient|url/.test(l.fill) ? '<p class="xs-t muted" style="margin-top:4px">Gradient or image. Picking a color replaces it.</p>' : ''}<div class="chips" style="margin-top:8px">${edKit().colors.map((c) => `<button class="chip" style="padding:0;width:26px;height:26px;background:${c}" data-act="edColor" data-c="${c}"></button>`).join('')}</div></div>
      ${l.type !== 'ellipse' ? `<label class="lab">Corner radius<input type="range" min="0" max="200" data-p="r" value="${l.r || 0}"></label>` : ''}` : ''}
    <label class="lab">Opacity<input type="range" min="0" max="1" step="0.01" data-p="op" value="${l.op ?? 1}"></label>
    <div class="row" style="gap:4px"><button class="btn secondary icon sm" data-act="edFwd" title="Bring forward">${ic('front', 16)}</button><button class="btn secondary icon sm" data-act="edBwd" title="Send backward">${ic('back', 16)}</button><button class="btn secondary icon sm" data-act="edDup" title="Duplicate (Ctrl+D)">${ic('copy', 16)}</button><button class="btn secondary icon sm" data-act="edLock" data-id="${l.id}" title="Lock">${ic(l.locked ? 'lock' : 'unlock', 16)}</button><span class="grow"></span><button class="btn secondary icon sm" data-act="edDel" title="Delete (Del)" style="color:var(--neg)">${ic('trash', 16)}</button></div></div>`;
}

/* ---------- layer helpers ---------- */
function fitText(l) { const el = elOf(l.id); if (!el) return; el.style.height = 'auto'; l.h = Math.ceil(el.offsetHeight); el.style.height = l.h + 'px'; }
function refreshL(l) { const el = elOf(l.id); if (!el) return; el.style.cssText = lstyle(l); if (l.type === 'text' && ED.editing !== l.id) { const h = textHTML(l); if (el.innerHTML !== h) el.innerHTML = h; } }
function addLayer(l) { mutate(() => { curP().layers.push(l); ED.sel = l.id; }); }
function shapeLayer(k) {
  const [W, H] = dim(), c = bgLum() > 0.6 ? '#0f172a' : '#fd0e35', cx = (w) => Math.round(W / 2 - w / 2), cy = (h) => Math.round(H / 2 - h / 2);
  const m = { rect: () => Rc(cx(320), cy(220), 320, 220, c, { name: 'Rectangle' }), round: () => Rc(cx(320), cy(220), 320, 220, c, { name: 'Rounded', r: 40 }), circle: () => El(cx(260), cy(260), 260, 260, c), pill: () => Rc(cx(300), cy(90), 300, 90, c, { name: 'Pill', r: 45 }), line: () => Rc(cx(400), cy(6), 400, 6, autoColor(), { name: 'Line', r: 3 }), grad: () => Rc(cx(360), cy(240), 360, 240, 'linear-gradient(135deg,#fd0e35,#6366f1)', { name: 'Gradient', r: 24 }), ring: () => El(cx(260), cy(260), 260, 260, 'transparent', { name: 'Ring', stroke: c, sw: 10 }), card: () => Rc(cx(360), cy(240), 360, 240, 'transparent', { name: 'Outline card', r: 32, stroke: c, sw: 6 }) };
  return m[k]();
}
function magicResize(nr) {
  ensureRatio(nr); const [ow, oh] = RATIOS[ED.d.ratio], [nw, nh] = RATIOS[nr], sy = nh / oh;
  mutate(() => {
    ED.d.pages.forEach((pg) => {
      if (ow !== nw) { // different width (custom canvases): scale by the width ratio first, sizes of text and borders included
        const kx = nw / ow, hh = oh * kx, sy2 = nh / hh, bgL = (l) => l.name === 'Background' && l.locked;
        pg.layers.forEach((l) => {
          l.x = Math.round(l.x * kx); l.w = Math.round(l.w * kx);
          ['size', 'ls', 'r', 'sw', 'shb', 'shy'].forEach((p) => { if (l[p]) l[p] = Math.round(l[p] * kx * 10) / 10; });
          l.y = Math.round(l.y * kx * sy2);
          if (l.type === 'text') l.h = Math.round(l.h * kx); else { l.h = Math.round(l.h * kx); if (l.h >= hh * 0.5) l.h = Math.round(l.h * sy2); }
          if (bgL(l)) Object.assign(l, { x: 0, y: 0, w: nw, h: nh });
        });
      } else pg.layers.forEach((l) => { l.y = Math.round(l.y * sy); if (l.h >= oh * 0.5 || l.name === 'Background') l.h = Math.round(l.h * sy); });
    });
    ED.d.ratio = nr;
  }, () => { edAll(); fitZoom(); });
  toast('Resized to ' + nr + ' with Magic resize');
}
function rebuildCalendar() { const [w, h] = dim(); mutate(() => { const pg = curP(); pg.layers = tplCalendar(w, h, ED.lang, EVENTS.filter((e) => e.on)); ED.sel = null; }, () => { edStage(); edPages(); edProps(); edPanel(); }); }

/* ---------- actions ---------- */
Object.assign(ACT, {
  edBack: () => { location.hash = '#/studio'; },
  edUndo: doUndo, edRedo: doRedo,
  edZoom: (a) => { ED.fit = false; ED.zoom = clamp(ED.zoom + +a.dataset.n, 0.1, 2); applyZoom(); drawSel(); },
  edFit: () => { ED.fit = true; fitZoom(); },
  edSafe: () => { ED.safe = !ED.safe; drawSafe(); edTop(); ED.rtab === 'design' && !curL() && edProps(); },
  edProps: () => $('#edProps').classList.toggle('open'),
  edTab: (a) => { ED.tab = a.dataset.k; $('#edPanel').classList.add('open'); edRail(); edPanel(); },
  edRTab: (a) => { ED.rtab = a.dataset.k; edProps(); },
  edRatio: (a) => magicResize(a.dataset.r),
  edTpl: (a) => { const [w, h] = dim(); mutate(() => { curP().layers = brandize(TPL[a.dataset.k].fn(w, h)); ED.sel = null; }); toast('Template applied'); },
  edShape: (a) => addLayer(shapeLayer(a.dataset.k)),
  edText: (a) => { const [W] = dim(), c = autoColor(), k = a.dataset.k, o = { h: { size: 96, weight: 700, font: 'Plus Jakarta Sans', name: 'Heading', lh: 1.05 }, s: { size: 48, weight: 600, font: 'Plus Jakarta Sans', name: 'Subheading' }, b: { size: 30, weight: 400, font: 'Inter', name: 'Body', lh: 1.4 } }[k]; addLayer(Tx(80, 160, W - 160, { h: 'Your heading', s: 'Your subheading', b: 'Write something short and useful here.' }[k], { ...o, color: c, lines: k === 'b' ? 2 : 1 })); },
  edSugg: (a) => { const l = curL(); if (l && l.type === 'text') { mutate(() => { l.text = a.dataset.s; }, () => { edStage(); fitTextAfter(l); edProps(); }); } else { const [W] = dim(); addLayer(Tx(80, 160, W - 160, a.dataset.s, { size: 80, weight: 700, font: 'Plus Jakarta Sans', color: autoColor(), lines: 3, lh: 1.05, name: 'Heading' })); setTimeout(() => { const n = curL(); n && (fitText(n), drawSel()); }, 0); } },
  edImg: (a) => { const [W, H] = dim(); addLayer(Im(0, 0, W, H, a.dataset.g, { name: 'Background image' })); },
  edColor: (a) => { const l = curL(), c = a.dataset.c; if (!l) return toast('Select a layer first'); mutate(() => { l.type === 'text' ? (l.color = c) : (l.fill = c); }); },
  edBg: (a) => { const b = curP().layers.find((x) => x.name === 'Background' && x.locked); mutate(() => { b.fill = a.dataset.c; }); },
  edFont: (a) => { const l = curL(); if (!l || l.type !== 'text') return toast('Select a text layer first'); mutate(() => { l.font = a.dataset.f; }, () => { edStage(); fitTextAfter(l); edProps(); }); },
  edFigmaImport: () => openFigma({ into: true }),
  edResync: (a) => FIGSYNC.resync(ED.d, +a.dataset.i),
  edLang: (a) => { ED.lang = a.dataset.l; ED.d.tpl === 'calendar' ? rebuildCalendar() : edPanel(); },
  edEv: (a) => { const e = EVENTS.find((x) => x.id === a.dataset.id); e.on = e.on ? 0 : 1; ED.d.tpl === 'calendar' ? rebuildCalendar() : edPanel(); },
  edApplyCal: () => { ED.d.tpl = 'calendar'; rebuildCalendar(); toast('Calendar slide built from the live feed'); },
  edPage: (a) => { ED.pi = +a.dataset.i; ED.sel = null; edAll(); },
  edAddPage: () => { const [w, h] = dim(); mutate(() => { ED.d.pages.push({ id: uid(), bg: '#0b1220', layers: TPL.blank.fn(w, h) }); ED.pi = ED.d.pages.length - 1; ED.sel = null; }); },
  edDupPage: () => mutate(() => { const c = reIdPage(JSON.parse(JSON.stringify(curP()))); c.id = uid(); ED.d.pages.splice(ED.pi + 1, 0, c); ED.pi++; ED.sel = null; }),
  edDelPage: () => mutate(() => { ED.d.pages.splice(ED.pi, 1); ED.pi = Math.max(0, ED.pi - 1); ED.sel = null; }),
  edPick: (a, e) => { if (e.target.closest('.tg')) return; ED.sel = a.dataset.id; drawSel(); edProps(); },
  edVis: (a) => { const l = curP().layers.find((x) => x.id === a.dataset.id); mutate(() => { l.hidden = !l.hidden; }); },
  edLock: (a) => { const l = curP().layers.find((x) => x.id === a.dataset.id); mutate(() => { l.locked = !l.locked; }); },
  edAlign: (a) => { const l = curL(), [W, H] = dim(), o = a.dataset.o; mutate(() => { if (o === 'Left') l.x = 0; if (o === 'Center') l.x = Math.round((W - l.w) / 2); if (o === 'Right') l.x = W - l.w; if (o === 'Top') l.y = 0; if (o === 'Middle') l.y = Math.round((H - l.h) / 2); if (o === 'Bottom') l.y = H - l.h; }); },
  edAl: (a) => { const l = curL(); mutate(() => { l.align = a.dataset.a; }); },
  edRtl: () => { const l = curL(); mutate(() => { l.dir = l.dir === 'rtl' ? 'ltr' : 'rtl'; if (l.dir === 'rtl') { l.align = 'right'; l.font = 'Cairo'; } }); },
  edFwd: () => { const L = curP().layers, i = L.findIndex((l) => l.id === ED.sel); if (i < L.length - 1) mutate(() => L.splice(i + 1, 0, L.splice(i, 1)[0])); },
  edBwd: () => { const L = curP().layers, i = L.findIndex((l) => l.id === ED.sel); if (i > 1) mutate(() => L.splice(i - 1, 0, L.splice(i, 1)[0])); },
  edDup: () => dupSel(), edDel: () => delSel(),
  edSchedule: () => openSchedule(ED.d), edExport: () => openExport(ED.d, ED.pi),
});
function fitTextAfter(l) { fitText(l); drawSel(); }
function dupSel() { const l = curL(); if (!l) return; mutate(() => { const c = JSON.parse(JSON.stringify(l)); c.id = uid(); c.x += 30; c.y += 30; c.name += ' copy'; c.locked = false; curP().layers.push(c); ED.sel = c.id; }); }
function delSel() { const l = curL(); if (!l) return; mutate(() => { curP().layers = curP().layers.filter((x) => x.id !== l.id); ED.sel = null; }); }
function selectL(id) { if (ED.sel === id) return; ED.sel = id; drawSel(); edProps(); }

/* ---------- property inputs ---------- */
document.addEventListener('input', (e) => {
  const t = e.target; if (!t.closest || !t.closest('#edProps') || t.dataset.p === undefined) return;
  const p = t.dataset.p; if (p === 'bgfill') { const b = curP().layers.find((x) => x.name === 'Background' && x.locked); if (!ED.pre) ED.pre = snap(); b.fill = t.value; refreshL(b); return; }
  const l = curL(); if (!l) return; if (!ED.pre) ED.pre = snap();
  l[p] = t.type === 'number' || t.type === 'range' ? +t.value : t.value;
  if (p === 'weight') l.weight = +t.value;
  if (p === 'fill' || p === 'color') { /* solid replaces gradients */ }
  refreshL(l); if (l.type === 'text' && ['text', 'size', 'w', 'font', 'weight', 'lh'].includes(p)) fitText(l);
  drawSel(); $$('#edProps input[type=number]').forEach((i) => { if (i !== t && l[i.dataset.p] !== undefined) i.value = Math.round(l[i.dataset.p] * 100) / 100; });
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'edRatio') return magicResize(t.value);
  if (t.id === 'edName') { ED.d.name = t.value || 'Untitled design'; touch(); return; }
  if (t.id === 'upl' && t.files[0]) { const f = t.files[0], r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { const [W] = dim(), w = Math.min(W * 0.7, im.width), h = w * (im.height / im.width); addLayer(Im(Math.round((W - w) / 2), 200, Math.round(w), Math.round(h), `url(${r.result}) center/cover`, { name: f.name.slice(0, 20), r: 24 })); }; im.src = r.result; }; r.readAsDataURL(f); return; }
  if (t.closest && t.closest('#edProps') && ED.pre) { commit(ED.pre); ED.pre = null; edProps(); edPages(); }
});

/* ---------- canvas pointer interaction ---------- */
function bindCanvas() {
  const sc = $('#scaler'); if (!sc) return;
  sc.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.editing')) return;
    const hd = e.target.closest('[data-h]'); if (hd) { e.preventDefault(); return startHandle(e, hd.dataset.h); }
    const ly = e.target.closest('.ly');
    if (ly) { selectL(ly.dataset.id); const l = curL(); if (l && !l.locked) { e.preventDefault(); startMove(e, l); } } else { ED.sel = null; drawSel(); edProps(); }
  });
  sc.addEventListener('dblclick', (e) => { const ly = e.target.closest('.ly.text'); if (ly) startEdit(ly.dataset.id); });
}
const _openEditor = openEditor;
openEditor = function (id) { _openEditor(id); bindCanvas(); bindWheel(); };
function bindWheel() { const s = $('#edScroll'); s && s.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); ED.fit = false; ED.zoom = clamp(ED.zoom * (e.deltaY < 0 ? 1.08 : 0.92), 0.1, 2); applyZoom(); drawSel(); }, { passive: false }); }
function showGuides(gx, gy) { const [W, H] = dim(); $('#guides').innerHTML = (gx != null ? `<div class="guide" style="left:${gx}px;top:0;width:${2 / ED.zoom}px;height:${H}px"></div>` : '') + (gy != null ? `<div class="guide" style="top:${gy}px;left:0;height:${2 / ED.zoom}px;width:${W}px"></div>` : ''); }
function startMove(e, l) {
  const el = elOf(l.id), sx = e.clientX, sy = e.clientY, ox = l.x, oy = l.y, [W, H] = dim(), others = curP().layers.filter((o) => o.id !== l.id && !o.hidden && !(o.locked && o.name === 'Background'));
  const tx = [0, W / 2, W], ty = [0, H / 2, H]; others.forEach((o) => { tx.push(o.x, o.x + o.w / 2, o.x + o.w); ty.push(o.y, o.y + o.h / 2, o.y + o.h); });
  ED.pre = snap(); let moved = false;
  const mv = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return; moved = true;
    let nx = ox + (ev.clientX - sx) / ED.zoom, ny = oy + (ev.clientY - sy) / ED.zoom, gx = null, gy = null; const th = 8 / ED.zoom;
    if (!ev.altKey) { for (const a of [0, l.w / 2, l.w]) for (const t of tx) if (Math.abs(nx + a - t) < th && gx === null) { nx = t - a; gx = t; } for (const a of [0, l.h / 2, l.h]) for (const t of ty) if (Math.abs(ny + a - t) < th && gy === null) { ny = t - a; gy = t; } }
    l.x = Math.round(nx); l.y = Math.round(ny); el.style.left = l.x + 'px'; el.style.top = l.y + 'px'; showGuides(gx, gy); drawSel();
    $$('#edProps input[data-p=x]').forEach((i) => (i.value = l.x)); $$('#edProps input[data-p=y]').forEach((i) => (i.value = l.y));
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); $('#guides').innerHTML = ''; commit(ED.pre); ED.pre = null; if (moved) { edPages(); edProps(); } };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
function startHandle(e, hd) {
  const l = curL(); if (!l || l.locked) return; const el = elOf(l.id), sx = e.clientX, sy = e.clientY, o = { x: l.x, y: l.y, w: l.w, h: l.h, size: l.size }; ED.pre = snap();
  const r = $('#scaler').getBoundingClientRect(), cx = r.left + (o.x + o.w / 2) * ED.zoom, cy = r.top + (o.y + o.h / 2) * ED.zoom;
  const mv = (ev) => {
    if (hd === 'rot') { let a = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90; if (ev.shiftKey) a = Math.round(a / 15) * 15; l.rot = Math.round(((a % 360) + 360) % 360); refreshL(l); drawSel(); return; }
    const dx = (ev.clientX - sx) / ED.zoom, dy = (ev.clientY - sy) / ED.zoom; let { x, y, w, h } = o;
    if (hd.includes('e')) w = o.w + dx; if (hd.includes('w')) { w = o.w - dx; x = o.x + dx; } if (hd.includes('s')) h = o.h + dy; if (hd.includes('n')) { h = o.h - dy; y = o.y + dy; }
    if (w < 24) { if (hd.includes('w')) x -= 24 - w; w = 24; } if (h < 24) { if (hd.includes('n')) y -= 24 - h; h = 24; }
    if (l.type === 'text') {
      if (hd.length === 2) { const k = w / o.w; l.size = Math.max(8, Math.round(o.size * k)); }
      if (hd === 'n' || hd === 's') return; l.x = Math.round(x); l.w = Math.round(w); refreshL(l); fitText(l); if (hd.includes('n')) l.y = Math.round(o.y + o.h - l.h); refreshL(l);
    } else {
      if (ev.shiftKey && hd.length === 2) { const ar = o.w / o.h; h = w / ar; if (hd.includes('n')) y = o.y + o.h - h; }
      Object.assign(l, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }); refreshL(l);
    }
    drawSel(); $$('#edProps input[type=number]').forEach((i) => { if (l[i.dataset.p] !== undefined) i.value = Math.round(l[i.dataset.p]); });
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); commit(ED.pre); ED.pre = null; edPages(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
function startEdit(id) {
  const l = curP().layers.find((x) => x.id === id), el = elOf(id); if (!l || l.locked || !el) return;
  ED.editing = id; ED.pre = snap(); drawSel(); el.classList.add('editing'); el.contentEditable = 'plaintext-only'; if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true'; el.focus();
  const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  const done = (ev) => {
    el.removeEventListener('blur', done); l.text = el.innerText.replace(/\n$/, ''); el.contentEditable = 'false'; el.classList.remove('editing'); ED.editing = null; fitText(l); commit(ED.pre); ED.pre = null; drawSel();
    // focus went to a panel control (Bold, font…): keep the panel so that click lands; the action redraws it
    if (!(ev && ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest('#edProps, #ftb'))) edProps();
    edPages();
  };
  el.addEventListener('blur', done); el.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') el.blur(); });
}

/* ---------- keyboard ---------- */
document.addEventListener('keydown', (e) => {
  if (!document.body.classList.contains('in-editor') || ED.editing) return;
  const tag = (e.target.tagName || '').toLowerCase(); if (['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable) return;
  const mod = e.ctrlKey || e.metaKey, k = String(e.key || '').toLowerCase();
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
  else if (mod && k === 'y') { e.preventDefault(); doRedo(); }
  else if (mod && k === 'd') { e.preventDefault(); dupSel(); }
  else if (k === 'delete' || k === 'backspace') { e.preventDefault(); delSel(); }
  else if (k === 'escape') { ED.sel = null; drawSel(); edProps(); }
  else if (k.startsWith('arrow') && curL() && !curL().locked) { e.preventDefault(); const l = curL(), n = e.shiftKey ? 10 : 1, pre = snap(); if (k === 'arrowleft') l.x -= n; if (k === 'arrowright') l.x += n; if (k === 'arrowup') l.y -= n; if (k === 'arrowdown') l.y += n; refreshL(l); drawSel(); commit(pre); $$('#edProps input[data-p=x]').forEach((i) => (i.value = l.x)); $$('#edProps input[data-p=y]').forEach((i) => (i.value = l.y)); }
});
addEventListener('resize', () => { if (document.body.classList.contains('in-editor') && ED.fit) fitZoom(); });

/* ============================================================
   Studio Agent: a chat panel that edits the open design.
   Demo version: rule-based edits that run locally. In production
   the prompt goes to the AI assistant configured in Settings.
   ============================================================ */
const agSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AG_GROUPS = [
  { k: 'tidy', t: 'Tidy and polish', i: 'wand', o: [['tidy', 'Keep text inside the canvas and fit its boxes'], ['contrast', 'Fix low-contrast text'], ['brandfix', 'Apply brand fonts'], ['rename', 'Name layers from their content']] },
  { k: 'gen', t: 'Generate designs', i: 'studio', o: [['headline', 'Write a stronger headline'], ['carousel', 'Turn this slide into a 3-slide carousel'], ['story', 'Adapt this post to a Story (9:16)'], ['arabic', 'Create an Arabic (RTL) version']] },
  { k: 'copy', t: 'Write copy', i: 'type', o: [['caption', 'Write a caption in my brand voice'], ['hashtags', 'Suggest hashtags']] },
];
const AG_LABEL = { bigger: 'Make the text bigger', smaller: 'Make the text smaller' };
AG_GROUPS.forEach((g) => g.o.forEach(([k, l]) => (AG_LABEL[k] = l)));
const AG_RULES = [
  ['hashtags', /hashtag/], ['caption', /caption|post text|write (a )?post/], ['arabic', /arab|rtl|عرب/], ['carousel', /carousel|swipe|multi.?slide/],
  ['story', /story|stories|9:16|reel|vertical/], ['contrast', /contrast|readab|legib|hard to read|can.?t read/], ['brandfix', /brand font|fonts?\b|typograph/],
  ['rename', /rename|layer names?|name (the )?layers/], ['bigger', /bigger|larger|enlarge|increase (the )?(text|font|size)/], ['smaller', /smaller|shrink|reduce (the )?(text|font|size)/],
  ['headline', /headline|title|heading|hook/], ['tidy', /tidy|align|polish|clean|overflow|\bfit\b|inside|margin|messy/],
];
const agIntent = (t) => { t = t.toLowerCase(); const r = AG_RULES.find(([, re]) => re.test(t)); return r ? r[0] : null; };
const lumOf = (c) => { const n = parseInt(hex(c).slice(1), 16); return (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255; };
function pageLum(pg) { const b = pg.layers.find((l) => l.locked && l.name === 'Background'), m = b && b.fill.match(/#([0-9a-f]{6})/i); return m ? lumOf(m[0]) : 0; }
function agCtxObj() {
  const sel = curL(), pages = ED.agScope === 'all' ? ED.d.pages : [curP()];
  return {
    pg: curP(), pages, sel, dim: dim(), count: pages.reduce((n, p) => n + p.layers.length, 0),
    texts() { if (sel && sel.type === 'text') return [{ l: sel, pg: curP() }]; return pages.flatMap((pg) => pg.layers.filter((l) => l.type === 'text' && !l.hidden).map((l) => ({ l, pg }))); },
  };
}
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b || a + 's');
function agScale(f) {
  return (c) => ({ steps: ['Finding text layers', 'Scaling and refitting'], apply() {
    let n = 0; mutate(() => c.texts().forEach(({ l, pg }) => { l.size = Math.max(8, Math.round(l.size * f)); n++; if (pg === c.pg) fitText(l); }));
    return { t: n ? `${f > 1 ? 'Increased' : 'Reduced'} the size of ${plural(n, 'text layer')} by about ${Math.round(Math.abs(f - 1) * 100)}%.` : 'There is no text to resize.' };
  } });
}
const AG = {
  tidy: (c) => ({ steps: [`Reading ${plural(c.count, 'layer')}`, 'Checking margins and overflow', 'Fitting text boxes'], apply() {
    const [W, H] = c.dim; let moved = 0, fit = 0;
    mutate(() => c.pages.forEach((pg) => pg.layers.forEach((l) => {
      if (l.type !== 'text' || l.hidden || l.locked) return;
      const x = l.x, y = l.y, w = l.w, h0 = l.h;
      if (l.w > W) l.w = W;
      if (pg === c.pg) { fitText(l); if (l.h !== h0) fit++; }
      l.x = clamp(l.x, 0, W - l.w); l.y = clamp(l.y, 0, Math.max(0, H - l.h));
      if (l.x !== x || l.y !== y || l.w !== w) moved++;
    })));
    const p = []; if (moved) p.push(`moved ${plural(moved, 'text layer')} back inside the canvas`); if (fit) p.push(`resized ${plural(fit, 'text box', 'text boxes')} to fit their content`);
    return { t: p.length ? 'Done: ' + p.join(' and ') + '.' : 'This slide already looks tidy. Nothing to change.' };
  } }),
  contrast: (c) => ({ steps: ['Measuring text against the background', 'Fixing unreadable text'], apply() {
    let n = 0;
    mutate(() => c.texts().forEach(({ l, pg }) => { const L = pageLum(pg), t = lumOf(l.color); let nc = null; if (L > 0.55 && t > 0.7) nc = '#0f172a'; else if (L < 0.4 && t < 0.35) nc = '#ffffff'; if (nc) { l.color = nc; n++; } }));
    return { t: n ? `Changed the color of ${plural(n, 'text layer')} so it stays readable on the background.` : 'Text contrast already looks fine. Text placed on cards or images is not measured.' };
  } }),
  brandfix: (c) => ({ steps: [`Reading ${brand().name}’s brand kit`, 'Matching fonts to roles'], apply() {
    const f = brand().fonts; let n = 0;
    mutate(() => c.texts().forEach(({ l, pg }) => { const nf = l.dir === 'rtl' ? f.arabic : (l.size >= 56 || l.weight >= 700) ? f.heading : f.body; if (nf && l.font !== nf) { l.font = nf; n++; if (pg === c.pg) fitText(l); } }));
    return { t: n ? `Switched ${plural(n, 'text layer')} to the brand fonts: ${f.heading} for headings, ${f.body} for body text.` : 'Fonts already match the brand kit.' };
  } }),
  rename: (c) => ({ steps: ['Reading layer content', 'Renaming layers'], apply() {
    let n = 0;
    mutate(() => c.pages.forEach((pg) => pg.layers.forEach((l) => { if (l.type !== 'text') return; const nm = l.text.replace(/\s+/g, ' ').trim().slice(0, 24) || l.name; if (nm !== l.name) { l.name = nm; n++; } })));
    return { t: n ? `Renamed ${plural(n, 'layer')} after their text. Open the Layers tab to see them.` : 'Layer names already match their content.' };
  } }),
  headline: (c) => ({ steps: ['Reading the slide', 'Drafting options in the brand voice'], apply() {
    const texts = c.pg.layers.filter((l) => l.type === 'text');
    const l = (c.sel && c.sel.type === 'text' && c.sel) || texts.find((x) => /^(headline|title|quote|heading)$/i.test(x.name)) || texts.slice().sort((a, b) => b.size - a.size)[0];
    if (!l) return { t: 'There is no text on this slide to rewrite. Add a heading first.' };
    const topic = ED.d.name.split(' · ')[0].trim() || 'this';
    const opts = [`${topic}: what it means for you`, `${topic} in 30 seconds`, `Are you ready for ${topic}?`, `The ${topic} checklist you can use today`];
    ED.agHl = ((ED.agHl || 0) + 1) % opts.length; let nt = opts[ED.agHl]; if (nt === l.text) nt = opts[(ED.agHl + 1) % opts.length];
    mutate(() => { l.text = nt; fitText(l); });
    return { t: `Updated “${l.name}” to: ${nt}` };
  } }),
  carousel: (c) => ({ steps: ['Duplicating this slide', 'Adding page counters'], apply() {
    const d = ED.d, [W] = c.dim, base = c.pg;
    mutate(() => {
      const copies = [1, 2].map(() => { const x = reIdPage(JSON.parse(JSON.stringify(base))); x.id = uid(); return x; });
      d.pages.splice(ED.pi + 1, 0, ...copies);
      [base, ...copies].forEach((pg, i) => { pg.layers = pg.layers.filter((l) => l.name !== 'Page counter'); pg.layers.push(Tx(W - 80 - 140, 70, 140, `${i + 1}/3`, { name: 'Page counter', size: 28, weight: 600, color: pageLum(pg) > 0.55 ? '#0f172a' : '#ffffff', align: 'right', font: 'Inter', op: 0.7 })); });
    });
    return { t: 'Added 2 slides with 1/3 page counters. Edit the headline on each slide to tell the story, or ask me for a headline.' };
  } }),
  story: () => ({ steps: ['Checking the 9:16 safe zones', 'Re-flowing layers'], apply() {
    if (ED.d.ratio === '9:16') return { t: 'This design is already a Story (9:16).' };
    const rb = ED.d.ratio; magicResize('9:16'); ED.safe = true; drawSafe(); edTop();
    return { t: 'Resized to 9:16 and turned on safe zones. Keep key text away from the profile bar (top) and the reply bar (bottom).', ratioBefore: rb };
  } }),
  arabic: (c) => ({ steps: ['Duplicating this slide', 'Mirroring the layout for right-to-left', 'Switching to the Arabic font'], apply() {
    const [W, H] = c.dim, d = ED.d, ar = brand().fonts.arabic || 'Cairo', live = d.tpl === 'calendar';
    mutate(() => {
      const x = live ? { id: uid(), bg: c.pg.bg, layers: tplCalendar(W, H, 'ar', EVENTS.filter((e) => e.on)) } : JSON.parse(JSON.stringify(c.pg));
      x.id = uid(); if (!live) reIdPage(x);
      if (!live) x.layers.forEach((l) => { if (l.locked && l.name === 'Background') return; l.x = W - l.x - l.w; if (l.type === 'text') { l.dir = 'rtl'; l.font = ar; if (l.align === 'left') l.align = 'right'; else if (l.align === 'right') l.align = 'left'; } });
      d.pages.splice(ED.pi + 1, 0, x); ED.pi++; ED.sel = null;
    });
    return { t: live ? 'Built the Arabic slide from the live calendar feed, with Arabic event names.' : 'Added an RTL slide with the layout mirrored and the Arabic font applied. The text is still English: translation needs an AI key in Settings.' };
  } }),
  caption: () => ({ steps: ['Reading the design', `Applying ${brand().name}’s voice`], apply() { return { t: `Here is a caption in ${brand().name}’s voice:`, caption: aiCaption(ED.d) }; } }),
  hashtags: () => ({ steps: ['Reading the brand kit', 'Picking relevant tags'], apply() {
    const b = brand(), topic = (ED.d.name.split(' · ')[0] || '').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter((w) => w.length > 3).slice(0, 2).map((w) => '#' + w[0].toUpperCase() + w.slice(1).toLowerCase());
    const tags = [...new Set([...(b.hashtags || '').split(/\s+/).filter(Boolean), ...topic])].slice(0, 5).join(' ') || '#' + b.name.replace(/\W/g, '');
    return { t: 'Hashtags for this post:', caption: tags };
  } }),
  bigger: agScale(1.15), smaller: agScale(0.87),
};

/* ---------- rendering ---------- */
const AG_QUICK = [['headline', 'type', 'Stronger headline', 'Rewrite the hook'], ['carousel', 'layers', '3-slide carousel', 'Split this slide'], ['caption', 'copy', 'Brand caption', 'Ready to post'], ['story', 'layout', 'Story 9:16', 'Adapt the format']];
const AG_TONE = { tidy: '#fd0e35', gen: '#fd0e35', copy: '#fd0e35' };
function agEmpty() {
  return `<div class="ag-empty"><div class="ag-hero"><div class="ag-orb">${ic('studio', 26)}</div><h3>What’s next?</h3><p>Pick an action, or describe the change you want.</p></div>
    <div class="ag-lbl">Quick actions</div>
    <div class="ag-quick">${AG_QUICK.map(([k, i, t, d]) => `<button class="ag-qa" data-act="agDo" data-k="${k}"><span class="ag-ti">${ic(i, 16)}</span><b>${t}</b><small>${d}</small></button>`).join('')}</div>
    </div>`;
}
function agMsg(m, i, last) {
  if (m.r === 'u') return `<div class="ag-u">${esc(m.t)}</div>`;
  const steps = (m.steps || []).map((s) => `<div class="ag-step ${s.done ? 'done' : ''}">${s.done ? ic('check', 14, 'ck') : '<i class="spin"></i>'}<span>${esc(s.l)}</span></div>`).join('');
  const acts = [];
  if (m.after != null && !m.undone) acts.push(`<button class="btn secondary sm" data-act="agUndo" data-i="${i}">${ic('undo', 14)}Undo</button>`);
  if (m.undone) acts.push('<span class="xs-t muted">Undone</span>');
  if (m.caption) { acts.push(`<button class="btn secondary sm" data-act="agCopy" data-i="${i}">${ic('copy', 14)}Copy</button>`); if (/Here is/.test(m.t)) acts.push(`<button class="btn secondary sm" data-act="agSched" data-i="${i}">${ic('clock', 14)}Schedule with it</button>`); }
  const chips = last && m.done && m.chips && !m.undone ? `<div class="ag-sugs">${m.chips.map((k) => `<button class="ag-sug" data-act="agDo" data-k="${k}">${esc(AG_LABEL[k])}</button>`).join('')}</div>` : '';
  return `<div class="ag-a"><span class="ag-av">${ic('studio', 14)}</span><div class="ag-body">${steps ? `<div class="ag-steps">${steps}</div>` : ''}${!m.done && !steps ? '<div class="ag-dots"><i></i><i></i><i></i></div>' : ''}${m.t ? `<p>${esc(m.t)}</p>` : ''}${m.caption ? `<div class="ag-quote">${esc(m.caption)}</div>` : ''}${acts.length ? `<div class="ag-acts">${acts.join('')}</div>` : ''}${chips}</div></div>`;
}
function agThread() {
  const th = $('#agTh'); if (!th) return; const ch = ED.d.chat || [];
  if (!ch.length && th.querySelector('.ag-empty')) ED._agTop = th.scrollTop; else if (ch.length) ED._agTop = 0;
  th.innerHTML = ch.length ? ch.map((m, i) => agMsg(m, i, i === ch.length - 1)).join('') : agEmpty();
  if (ch.length) { const n = ch.length + ':' + ch.reduce((a, m) => a + (m.steps ? m.steps.length : 0) + (m.done ? 1 : 0), 0); if (ED._agn !== n) { ED._agn = n; th.scrollTop = th.scrollHeight; } } else { th.scrollTop = ED._agTop || 0; ED._agn = null; }
  agComposer();
}
function agComposer() {
  const b = $('#agSend'), i = $('#agIn'); if (!b) return;
  b.innerHTML = ic(ED.agBusy ? 'stop' : 'arrowUp', 16); b.title = ED.agBusy ? 'Stop' : 'Send'; b.setAttribute('aria-label', b.title); b.disabled = !ED.agBusy && !(i && i.value.trim());
}
function agCtx() {
  const e = $('#agCtx'); if (!e) return; const l = curL(), key = (l ? l.id + l.name : '') + '|' + ED.agScope + '|' + ED.pi + '|' + ED.d.pages.length;
  if (ED._agk === key) return; ED._agk = key;
  e.innerHTML = l ? `<button class="ag-chip on" data-act="agClearSel" title="Deselect to work on the whole slide">${ic('layers', 13)}${esc(l.name)}${ic('x', 12)}</button>`
    : `<button class="ag-chip" data-act="agScope" title="Choose what the agent edits">${ic('layout', 13)}${ED.agScope === 'all' ? 'All ' + ED.d.pages.length + ' slides' : 'Slide ' + (ED.pi + 1)}${ic('chevD', 12)}</button>`;
}
function agPanel(p) {
  const d = ED.d; if (ED.agOpen === undefined) ED.agOpen = ''; ED.agScope = ED.agScope || 'slide'; ED.agDraft = ED.agDraft || ''; d.chat = d.chat || [];
  d.chat.forEach((m) => { if (m.r === 'a' && !m.done && !ED.agBusy) { m.done = true; m.t = m.t || 'Stopped. Nothing was changed.'; } });
  p.innerHTML = `<div class="ag"><div class="ag-h"><div class="grow"><b>Agent</b><small>Edits slide ${ED.pi + 1} of ${d.pages.length}</small></div>
    <button class="btn ghost icon sm" data-act="agNew" title="New chat">${ic('plus', 18)}</button></div>
    <div class="ag-th" id="agTh" role="log" aria-live="polite"></div>
    <div class="ag-cmp"><div class="ag-box"><textarea id="agIn" rows="2" maxlength="600" placeholder="Ask for changes" aria-label="Ask the agent for changes">${esc(ED.agDraft)}</textarea>
      <div class="ag-bar"><span id="agCtx" style="min-width:0;display:flex"></span><span class="grow"></span><button class="ag-send" id="agSend" data-act="agSend" disabled></button></div></div><p class="ag-foot2">Enter to send · Shift+Enter for a new line</p></div></div>`;
  ED._agk = null; agCtx(); agThread(); const i = $('#agIn'); if (i) { i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 140) + 'px'; }
}

/* ---------- running ---------- */
async function agRun(text, key) {
  const d = ED.d; if (!d || !text) return; if (ED.agBusy) return toast('The agent is still working. Press stop to cancel.');
  d.chat = d.chat || []; key = key || agIntent(text);
  const msg = { r: 'a', steps: [], done: false, t: '' };
  d.chat.push({ r: 'u', t: text }, msg); ED.agBusy = true; const run = ++ED.agRun; agThread();
  const alive = () => run === ED.agRun && ED.d === d;
  try {
    await agSleep(350); if (!alive()) return;
    if (!key || !AG[key]) { msg.t = 'I can’t do that one yet. I can tidy layouts, fix contrast and fonts, write headlines, captions and hashtags, build carousels, Story and Arabic versions. Try one of these:'; msg.chips = ['tidy', 'headline', 'caption', 'story']; msg.done = true; return; }
    const plan = AG[key](agCtxObj());
    for (const s of plan.steps) { const st = { l: s, done: false }; msg.steps.push(st); agThread(); await agSleep(380 + Math.random() * 220); if (!alive()) return; st.done = true; }
    agThread(); await agSleep(120); if (!alive()) return;
    const pre = ED.undo.length, res = plan.apply();
    msg.t = res.t; if (res.caption) msg.caption = res.caption; if (res.ratioBefore) msg.ratioBefore = res.ratioBefore; if (ED.undo.length > pre) msg.after = ED.undo.length;
    msg.chips = key === 'headline' ? ['headline', 'caption'] : ['tidy', 'contrast', 'headline', 'caption', 'story'].filter((k) => k !== key).slice(0, 2);
    msg.done = true;
  } catch (e) { msg.t = 'Something went wrong, so I may not have finished. Use Undo or Ctrl+Z if anything looks off, then try again.'; msg.done = true; }
  finally { if (alive()) { ED.agBusy = false; agThread(); if (document.activeElement === document.body) { const i = $('#agIn'); i && i.focus(); } } }
}
function agStop() {
  ED.agRun++; ED.agBusy = false; const m = [...(ED.d.chat || [])].reverse().find((x) => x.r === 'a');
  if (m && !m.done) { m.done = true; m.t = 'Stopped. Nothing was changed.'; } agThread();
}
function agSubmit() {
  const i = $('#agIn'); if (!i) return; const t = i.value.trim(); if (!t || ED.agBusy) return;
  i.value = ''; ED.agDraft = ''; i.style.height = 'auto'; agRun(t);
}
Object.assign(ACT, {
  agGrp: (a) => {
    const k = a.dataset.k, th = $('#agTh'); ED.agOpen = ED.agOpen === k ? '' : k;
    th.querySelectorAll('.ag-grp').forEach((g) => {
      const h = g.querySelector('.hd'), on = h.dataset.k === ED.agOpen;
      g.classList.toggle('open', on); h.setAttribute('aria-expanded', on); g.querySelectorAll('.ag-opt').forEach((o) => (o.tabIndex = on ? 0 : -1));
    });
    if (ED.agOpen) setTimeout(() => { const g = th.querySelector('.ag-grp.open'); if (!g) return; const r = g.getBoundingClientRect(), t = th.getBoundingClientRect(); if (r.bottom > t.bottom - 8) th.scrollBy({ top: r.bottom - t.bottom + 16, behavior: 'smooth' }); }, 230);
  },
  agDo: (a) => agRun(AG_LABEL[a.dataset.k], a.dataset.k),
  agSend: () => (ED.agBusy ? agStop() : agSubmit()),
  agNew: () => { ED.agRun++; ED.agBusy = false; ED.d.chat = []; agThread(); const i = $('#agIn'); i && i.focus(); },
  agScope: () => { if (ED.d.pages.length < 2) return toast('This design has one slide'); ED.agScope = ED.agScope === 'all' ? 'slide' : 'all'; ED._agk = null; agCtx(); toast(ED.agScope === 'all' ? 'The agent will edit all slides' : 'The agent will edit this slide'); },
  agClearSel: () => { ED.sel = null; drawSel(); edProps(); },
  agUndo: (a) => {
    const m = ED.d.chat[+a.dataset.i]; if (!m || m.undone) return;
    if (ED.undo.length !== m.after) return toast('You edited since. Use Ctrl+Z to step back.');
    doUndo(); if (m.ratioBefore) { ED.d.ratio = m.ratioBefore; edAll(); fitZoom(); } m.undone = true; agThread(); toast('Change undone');
  },
  agCopy: (a) => { const m = ED.d.chat[+a.dataset.i]; navigator.clipboard.writeText(m.caption).then(() => toast('Copied'), () => toast('Could not copy')); },
  agSched: (a) => { const m = ED.d.chat[+a.dataset.i]; openSchedule(ED.d); const c = $('#scCap'); if (c) c.value = m.caption; },
});
document.addEventListener('input', (e) => {
  const t = e.target; if (t.id !== 'agIn') return;
  ED.agDraft = t.value; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; agComposer();
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'agIn' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); agSubmit(); }
});
/* leaving or switching designs cancels any running agent */
const _openEditor2 = openEditor;
openEditor = function (id) { ED.agRun = (ED.agRun || 0) + 1; ED.agBusy = false; ED.agDraft = ''; ED._agk = null; _openEditor2(id); };




/* ============================================================
   Editor v2: contextual toolbar, right-click menu, shortcuts,
   command palette, text/shadow/border/flip effects, real export
   ============================================================ */
(function () {
  const clone = (o) => JSON.parse(JSON.stringify(o)), isT = (l) => l.type === 'text';

  /* ---- autosave: every change is persisted ---- */
  const _t = touch; touch = function () { _t(); clearTimeout(touch.h); touch.h = setTimeout(save, 700); };

  /* ---- extra layer styles (italic, underline, uppercase, flip, shadow, blur) ---- */
  const _ls = lstyle;
  lstyle = function (l) {
    let s = _ls(l);
    if (isT(l)) { if (l.it) s += 'font-style:italic;'; if (l.ul) s += 'text-decoration:underline;'; if (l.up) s += 'text-transform:uppercase;'; }
    const fH = l.fx === true, fV = l.fy === true;
    if (fH || fV) s += `transform:rotate(${l.rot || 0}deg) scale(${fH ? -1 : 1},${fV ? -1 : 1});`;
    if (l.shb || l.shy || l.shx) { const c = `color-mix(in srgb,${l.shc || '#000000'} ${Math.round((l.sha ?? 0.45) * 100)}%,transparent)`, v = `${l.shx || 0}px ${l.shy || 0}px ${l.shb || 0}px ${c}`; s += isT(l) ? `text-shadow:${v};` : `box-shadow:${v};`; }
    if (l.bl) s += `filter:blur(${l.bl}px);`;
    return s;
  };

  /* ---- right panel: text style + effects ---- */
  const _ep = edProps;
  edProps = function () {
    _ep(); const l = curL(), b = $('#edProps .body'); if (!l || ED.rtab !== 'design' || !b) return;
    const tg = (k, on, h, t) => `<button class="${on ? 'on' : ''}" data-act="xt" data-k="${k}" title="${t}">${h}</button>`;
    b.insertAdjacentHTML('beforeend', `<div class="xt">`
      + (isT(l) ? `<div><span class="label">Style</span><div class="seg">${tg('b', l.weight >= 600, '<b>B</b>', 'Bold (Ctrl B)')}${tg('it', l.it, '<i>I</i>', 'Italic (Ctrl I)')}${tg('ul', l.ul, '<u>U</u>', 'Underline')}${tg('up', l.up, 'Aa', 'Uppercase')}</div></div>${numIn('Spacing', 'ls', l.ls || 0, 0.5)}` : '')
      + `<div><span class="label">Shadow</span><div style="display:flex;flex-direction:column;gap:8px"><label class="lab">Blur<input type="range" min="0" max="80" data-p="shb" value="${l.shb || 0}"></label><label class="lab">Distance<input type="range" min="-40" max="80" data-p="shy" value="${l.shy || 0}"></label><label class="lab">Strength<input type="range" min="0" max="1" step=".05" data-p="sha" value="${l.sha ?? 0.45}"></label><input type="color" data-p="shc" value="${hex(l.shc || '#000000')}"></div></div>`
      + (isT(l) ? '' : `<div><span class="label">Border</span><div class="row"><input type="color" data-p="stroke" value="${hex(l.stroke || '#ffffff')}"><button class="btn secondary sm" data-act="xt" data-k="nostroke">None</button></div>${l.stroke ? `<label class="lab" style="margin-top:8px">Width<input type="range" min="1" max="40" data-p="sw" value="${l.sw || 3}"></label>` : ''}</div>`)
      + `<label class="lab">Blur<input type="range" min="0" max="30" data-p="bl" value="${l.bl || 0}"></label>`
      + `<div><span class="label">Flip</span><div class="seg">${tg('fx', l.fx, '↔ Horizontal', 'Flip horizontally')}${tg('fy', l.fy, '↕ Vertical', 'Flip vertically')}</div></div></div>`);
  };
  document.addEventListener('input', (e) => { const t = e.target; if (t.dataset && t.dataset.p === 'ls' && t.closest('#edProps')) { const l = curL(); l && (fitText(l), drawSel()); } });

  /* ---- floating toolbar above the selection (Canva style) ---- */
  function ftb() {
    const b = $('#ftb'); if (!b) return; const l = curL(), s = $('#sel');
    if (!l || ED.editing || !s || s.hidden) { b.hidden = true; return; }
    const key = l.id + l.type + (l.locked ? 1 : 0), T = isT(l);
    if (b.dataset.k !== key) {
      b.dataset.k = key;
      b.innerHTML = (T ? `<select data-ft="font" title="Font">${FONTS.map((f) => `<option>${f}</option>`).join('')}</select><button data-act="ftSz" data-n="-1" title="Smaller">${ic('minus', 14)}</button><span class="fsz"></span><button data-act="ftSz" data-n="1" title="Larger">${ic('plus', 14)}</button><i class="v"></i><button data-act="xt" data-k="b" data-s="b" title="Bold (Ctrl B)"><b>B</b></button><button data-act="xt" data-k="it" data-s="it" title="Italic (Ctrl I)"><i>I</i></button><button data-act="ftAl" title="Alignment">${ic('alC', 16)}</button><i class="v"></i>` : '')
        + `<input type="color" data-ft="${T ? 'color' : 'fill'}" title="${T ? 'Text' : 'Fill'} color"><i class="v"></i><button data-act="edDup" title="Duplicate (Ctrl D)">${ic('copy', 16)}</button><button data-act="edLock" data-id="${l.id}" title="Lock">${ic(l.locked ? 'lock' : 'unlock', 16)}</button><button data-act="edDel" class="dl" title="Delete">${ic('trash', 16)}</button><button data-act="ctxBtn" title="More">${ic('more', 16)}</button>`;
    }
    const f = b.querySelector('select'), c = b.querySelector('input[type=color]'), z = b.querySelector('.fsz');
    if (f && document.activeElement !== f) f.value = l.font; if (z) z.textContent = Math.round(l.size);
    if (c && document.activeElement !== c) c.value = hex(T ? l.color : l.fill);
    b.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x.dataset.s === 'b' ? l.weight >= 600 : !!l[x.dataset.s]));
    b.hidden = false;
    const r = s.getBoundingClientRect(), v = $('#edScroll').getBoundingClientRect(), w = b.offsetWidth; let y = r.top - 88; if (y < v.top + 6) y = r.bottom + 48; y = Math.min(y, v.bottom - 52);
    b.style.left = clamp(r.left + r.width / 2 - w / 2, v.left + 8, Math.max(v.left + 8, v.right - w - 8)) + 'px'; b.style.top = y + 'px';
  }
  const _ds = drawSel; drawSel = function () { _ds.apply(this, arguments); ftb(); };
  document.addEventListener('input', (e) => { const t = e.target; if (!t.dataset || !t.dataset.ft || !t.closest('#ftb')) return; const l = curL(); if (!l) return; if (!ED.pre) ED.pre = snap(); l[t.dataset.ft] = t.value; refreshL(l); isT(l) && fitText(l); drawSel(); });
  document.addEventListener('change', (e) => { const t = e.target; if (!t.dataset || !t.dataset.ft || !t.closest('#ftb')) return; if (ED.pre) { commit(ED.pre); ED.pre = null; } edProps(); edPages(); });
  addEventListener('resize', ftb);

  /* ---- actions ---- */
  const zOrder = (w) => { const L = curP().layers, i = L.findIndex((x) => x.id === ED.sel); if (i < 0) return; mutate(() => { const [x] = L.splice(i, 1); w === 'front' ? L.push(x) : L.splice(Math.min(1, L.length), 0, x); }); };
  const zm = (d) => { ED.fit = false; ED.zoom = clamp(ED.zoom + d, 0.1, 2); applyZoom(); drawSel(); };
  const CTX = {
    copy: () => { const l = curL(); if (l) { ED.clip = clone(l); ED.pn = 0; toast('Copied'); } },
    cut: () => { if (curL()) { CTX.copy(); delSel(); } },
    paste: () => { if (!ED.clip) return toast('Nothing to paste'); const [W, H] = dim(); mutate(() => { const c = clone(ED.clip); c.id = uid(); ED.pn = ((ED.pn || 0) % 8) + 1; c.x = clamp(c.x + 28 * ED.pn, 0, Math.max(0, W - c.w)); c.y = clamp(c.y + 28 * ED.pn, 0, Math.max(0, H - c.h)); c.locked = false; curP().layers.push(c); ED.sel = c.id; }); },
    dup: () => dupSel(), del: () => delSel(), front: () => zOrder('front'), back: () => zOrder('back'), fwd: () => ACT.edFwd(), bwd: () => ACT.edBwd(),
    ch: () => { const l = curL(), [W] = dim(); l && mutate(() => { l.x = Math.round((W - l.w) / 2); }); },
    cv: () => { const l = curL(), [, H] = dim(); l && mutate(() => { l.y = Math.round((H - l.h) / 2); }); },
    lock: () => { const l = curL(); l && ACT.edLock({ dataset: { id: l.id } }); }, hide: () => { const l = curL(); l && ACT.edVis({ dataset: { id: l.id } }); },
    fit: () => ACT.edFit(), safe: () => ACT.edSafe(), head: () => ACT.edText({ dataset: { k: 'h' } }), pal: () => cmdk(),
  };
  Object.assign(ACT, {
    xt: (a) => { const l = curL(), k = a.dataset.k; if (!l) return; mutate(() => { if (k === 'b') l.weight = l.weight >= 600 ? 400 : 700; else if (k === 'nostroke') delete l.stroke; else if (k === 'fx' || k === 'fy') flipLayer(l, k); else l[k] = !l[k]; }, () => { edAll(); isT(l) && (fitText(l), drawSel()); }); },
    ftSz: (a) => { const l = curL(); if (!l) return; mutate(() => { l.size = Math.max(8, Math.round(l.size * (1 + 0.1 * a.dataset.n))); }, () => { edAll(); fitText(l); drawSel(); }); },
    ftAl: () => { const l = curL(); if (!l) return; const o = ['left', 'center', 'right']; mutate(() => { l.align = o[(o.indexOf(l.align) + 1) % 3]; }); },
    ctxBtn: (a) => { const r = a.getBoundingClientRect(); openCtx(r.left, r.bottom + 6); },
    cmdk: () => cmdk(),
  });

  /* ---- context menu ---- */
  const closeCtx = () => { const m = $('#ctx'); m && m.remove(); };
  function openCtx(x, y) {
    const l = curL(), I = l ? [['Copy', 'copy', 'Ctrl C'], ['Cut', 'cut', 'Ctrl X'], ['Paste', 'paste', 'Ctrl V'], ['Duplicate', 'dup', 'Ctrl D'], '-', ['Bring to front', 'front', 'Ctrl ]'], ['Bring forward', 'fwd', ']'], ['Send backward', 'bwd', '['], ['Send to back', 'back', 'Ctrl ['], '-', ['Center horizontally', 'ch'], ['Center vertically', 'cv'], '-', [l.locked ? 'Unlock' : 'Lock', 'lock'], [l.hidden ? 'Show' : 'Hide', 'hide'], '-', ['Delete', 'del', 'Del', 'dl']]
      : [['Paste', 'paste', 'Ctrl V'], ['Add heading', 'head', 'T'], '-', ['Fit to screen', 'fit', 'Ctrl 0'], ['Toggle safe zones', 'safe'], ['Search actions', 'pal', 'Ctrl K']];
    closeCtx(); const m = document.createElement('div'); m.className = 'ctx'; m.id = 'ctx';
    m.innerHTML = I.map((i) => (i === '-' ? '<hr>' : `<button data-c="${i[1]}" class="${i[3] || ''}"><span>${i[0]}</span><small>${i[2] || ''}</small></button>`)).join('');
    document.body.append(m); const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    m.onclick = (e) => { const b = e.target.closest('button'); if (b) { closeCtx(); CTX[b.dataset.c](); } };
  }
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ctx')) closeCtx(); }, true);

  /* ---- command palette (Ctrl K) and shortcut sheet (?) ---- */
  function cmdItems() {
    const C = [], a = (g, t, fn, s, sw) => C.push({ g, t, fn, s, sw }), k = edKit();
    [['heading', 'h', 'T'], ['subheading', 's'], ['body text', 'b']].forEach(([t, x, s]) => a('Create', 'Add ' + t, () => ACT.edText({ dataset: { k: x } }), s));
    Object.entries(SHAPES).forEach(([x, n]) => a('Create', 'Add shape: ' + n.toLowerCase(), () => ACT.edShape({ dataset: { k: x } })));
    Object.keys(TPL).filter((x) => x !== 'blank').forEach((x) => a('Template', 'Apply template: ' + TPL[x].name, () => ACT.edTpl({ dataset: { k: x } })));
    Object.keys(RATIOS).forEach((r) => a('Canvas', 'Resize to ' + r, () => magicResize(r)));
    a('Slides', 'Add slide', () => ACT.edAddPage()); a('Slides', 'Duplicate slide', () => ACT.edDupPage());
    RAIL.forEach(([x, n]) => a('Panel', 'Open ' + n, () => ACT.edTab({ dataset: { k: x } })));
    k.colors.forEach((c) => a('Brand color', 'Apply ' + c + ' to selection', () => ACT.edColor({ dataset: { c } }), '', c));
    [['Undo', doUndo, 'Ctrl Z'], ['Redo', doRedo, 'Ctrl Shift Z'], ['Duplicate layer', dupSel, 'Ctrl D'], ['Delete layer', delSel, 'Del'], ['Fit to screen', () => ACT.edFit(), 'Ctrl 0'], ['Toggle safe zones', () => ACT.edSafe()], ['Export', () => openExport(ED.d, ED.pi), 'Ctrl E'], ['Schedule post', () => openSchedule(ED.d)], ['Switch light / dark theme', () => setTheme(S.theme === 'dark' ? 'light' : 'dark')], ['Keyboard shortcuts', kbd, '?']].forEach(([t, fn, s]) => a('Action', t, fn, s));
    return C;
  }
  function cmdk() {
    if ($('#cmdk')) return; const C = cmdItems(); let q = '', i = 0, list = C;
    const bg = document.createElement('div'); bg.className = 'cmdk-bg'; bg.id = 'cmdk';
    bg.innerHTML = '<div class="cmdk" role="dialog" aria-label="Search actions"><input placeholder="Search actions, templates, brand colors…" aria-label="Search actions"><div class="res"></div></div>'; document.body.append(bg);
    const inp = $('input', bg), res = $('.res', bg), close = () => bg.remove();
    const draw = () => {
      list = C.filter((c) => q.split(/\s+/).every((w) => (c.g + ' ' + c.t).toLowerCase().includes(w))); i = Math.min(i, Math.max(0, list.length - 1));
      res.innerHTML = list.length ? list.map((c, n) => `<button data-n="${n}" class="${n === i ? 'on' : ''}">${c.sw ? `<i class="sw2" style="background:${c.sw}"></i>` : ''}<span>${esc(c.t)}</span><small>${esc(c.s || c.g)}</small></button>`).join('') : '<p class="empty xs-t">No match. Try “add”, “template” or “export”.</p>';
      const o = $('.on', res); o && o.scrollIntoView({ block: 'nearest' });
    };
    const run = (n) => { const c = list[n]; if (!c) return; close(); c.fn(); };
    inp.addEventListener('input', () => { q = inp.value.toLowerCase().trim(); i = 0; draw(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); i = Math.min(i + 1, list.length - 1); draw(); } else if (e.key === 'ArrowUp') { e.preventDefault(); i = Math.max(i - 1, 0); draw(); } else if (e.key === 'Enter') { e.preventDefault(); run(i); } else if (e.key === 'Escape') close(); });
    bg.addEventListener('click', (e) => { const b = e.target.closest('button[data-n]'); if (b) run(+b.dataset.n); else if (e.target === bg) close(); });
    draw(); inp.focus();
  }
  function kbd() {
    if ($('#cmdk')) return;
    const R = [['Ctrl K', 'Search every action'], ['T · R · C · L', 'Add text, rectangle, circle, line'], ['Enter', 'Edit the selected text'], ['Tab', 'Select the next layer'], ['Ctrl C · X · V', 'Copy, cut, paste'], ['Ctrl D', 'Duplicate'], ['[ · ]', 'Send backward, bring forward'], ['Ctrl [ · ]', 'Send to back, bring to front'], ['Arrows', 'Nudge (Shift for 10 px)'], ['Alt while dragging', 'Turn snapping off'], ['Space + drag', 'Pan the canvas'], ['Ctrl scroll · + · −', 'Zoom'], ['Ctrl 0 · 1', 'Fit, 100%'], ['Ctrl B · I', 'Bold, italic'], ['Ctrl S · E', 'Save, export'], ['Right-click', 'Context menu']];
    const bg = document.createElement('div'); bg.className = 'cmdk-bg'; bg.id = 'cmdk';
    bg.innerHTML = `<div class="cmdk" role="dialog" aria-label="Keyboard shortcuts"><h3 style="padding:16px 18px 6px">Keyboard shortcuts</h3><div class="res">${R.map((r) => `<div class="kr"><span>${r[1]}</span><span class="kbd">${r[0]}</span></div>`).join('')}</div></div>`; document.body.append(bg);
    const x = () => { bg.remove(); removeEventListener('keydown', h, true); }, h = (e) => { if (e.key === 'Escape') { e.stopPropagation(); x(); } };
    addEventListener('keydown', h, true); bg.onclick = (e) => { if (e.target === bg) x(); };
  }

  /* ---- keyboard shortcuts ---- */
  addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('in-editor')) return;
    const mod = e.ctrlKey || e.metaKey, k = String(e.key || '').toLowerCase();
    if (mod && k === 'k') { e.preventDefault(); return cmdk(); }
    if (k === 'escape') closeCtx();
    if (ED.editing || $('#cmdk')) return; const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable) return;
    if (tag === 'button' && (k === 'enter' || k === 'tab' || e.code === 'Space')) return;
    const l = curL();
    if (e.code === 'Space') { e.preventDefault(); if (!ED.space) { ED.space = 1; const s = $('#edScroll'); s && s.classList.add('pan'); } return; }
    if (mod) {
      const m = { c: CTX.copy, x: CTX.cut, v: CTX.paste, s: () => { save(); toast('All changes saved'); }, e: () => openExport(ED.d, ED.pi), 0: () => ACT.edFit(), 1: () => { ED.fit = false; ED.zoom = 1; applyZoom(); drawSel(); }, '=': () => zm(0.1), '+': () => zm(0.1), '-': () => zm(-0.1), ']': CTX.front, '[': CTX.back, b: () => l && isT(l) && ACT.xt({ dataset: { k: 'b' } }), i: () => l && isT(l) && ACT.xt({ dataset: { k: 'it' } }) }[k];
      if (m && !e.shiftKey) { e.preventDefault(); m(); } return;
    }
    const q = {
      t: CTX.head, r: () => ACT.edShape({ dataset: { k: 'rect' } }), c: () => ACT.edShape({ dataset: { k: 'circle' } }), l: () => ACT.edShape({ dataset: { k: 'line' } }),
      enter: () => l && isT(l) && !l.locked && startEdit(l.id), '?': kbd, ']': CTX.fwd, '[': CTX.bwd,
      tab: () => { const a = curP().layers.filter((x) => !x.locked && !x.hidden); if (!a.length) return; const n = a.findIndex((x) => x.id === ED.sel); ED.sel = a[(n + (e.shiftKey ? -1 : 1) + a.length) % a.length].id; drawSel(); edProps(); },
    }[k];
    if (q) { e.preventDefault(); q(); }
  });
  addEventListener('keyup', (e) => { if (e.code === 'Space' && ED.space) { ED.space = 0; const s = $('#edScroll'); s && s.classList.remove('pan'); } });

  /* ---- real export (PNG / JPG / PDF): the exact canvas, at the chosen resolution ----
     The slide is laid out with the editor's own markup (posterHTML) inside an SVG foreignObject.
     So that the file matches the canvas pixel for pixel:
     - every face of each font family the slide uses is embedded (mixed-style runs and nearest-weight
       matching resolve exactly like on the canvas), limited to the subsets its characters need;
     - images referenced by URL (uploads, Figma, media API, blob:) are inlined, since an SVG image
       can't load anything external;
     - the slide is laid out at its real size and scaled as vectors, so 2× and 3× stay sharp. */
  const EXPORT_BASE = '*{box-sizing:border-box;min-width:0;margin:0}.ly{position:absolute;transform-origin:center;white-space:pre-wrap;word-break:break-word}';
  const fetchCache = new Map();
  const asDataUrl = (url) => {
    if (!fetchCache.has(url)) fetchCache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then((b) => new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = no; f.readAsDataURL(b); }))
      .catch((e) => { fetchCache.delete(url); throw e; }));
    return fetchCache.get(url);
  };
  /** url(…) pointing outside the document (http, relative, blob) → data URL */
  async function inlineUrls(html) {
    const found = new Set(); html.replace(/url\((&quot;|["']?)(?!data:)((?:(?!&quot;)[^"')])+?)\1\)/g, (m, q, u) => { found.add(u.trim()); return m; });
    if (!found.size) return html;
    const map = new Map(await Promise.all([...found].map(async (u) => { try { return [u, await asDataUrl(new URL(u, location.href).href)]; } catch (e) { return [u, u]; } })));
    return html.replace(/url\((&quot;|["']?)(?!data:)((?:(?!&quot;)[^"')])+?)\1\)/g, (m, q, u) => `url(${q}${map.get(u.trim()) || u}${q})`);
  }
  /** Parsed @font-face rules of the Google Fonts stylesheets on the page (base set + fonts loaded by the editor) */
  const faceCache = new Map();
  const parseRange = (v) => (v ? v.split(',').map((x) => { const [a, b] = x.trim().replace(/^U\+/i, '').split('-'); const lo = parseInt(a.replace(/\?/g, '0'), 16); return [lo, b ? parseInt(b, 16) : parseInt(a.replace(/\?/g, 'F'), 16)]; }) : null);
  function parseFaces(css) {
    return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
      const b = m[1], url = (b.match(/url\((https:[^)]+)\)/) || [])[1];
      return { fam: ((b.match(/font-family:\s*['"]?([^;'"]+)/) || [])[1] || '').trim(), url, range: parseRange((b.match(/unicode-range:\s*([^;]+)/) || [])[1]), block: '@font-face{' + b + '}' };
    }).filter((f) => f.fam && f.url);
  }
  async function pageFaces() {
    const hrefs = [...new Set($$('link[href*="fonts.googleapis.com/css"]').map((l) => l.href))];
    return (await Promise.all(hrefs.map((h) => {
      if (!faceCache.has(h)) faceCache.set(h, fetch(h).then((r) => r.text()).then(parseFaces).catch(() => { faceCache.delete(h); return []; }));
      return faceCache.get(h);
    }))).flat();
  }
  /** @font-face rules (fonts as data URLs) for the families and characters used in `html` */
  async function fontCSS(html) {
    const fams = new Set([...html.matchAll(/font(?:-family)?:[^;"]*?'([^']+)'/g)].map((m) => m[1]));
    if (!fams.size) return '';
    const box = document.createElement('div'); box.innerHTML = html;
    const cps = new Set([...(box.textContent || '')].map((c) => c.codePointAt(0)));
    const hit = (range) => !range || [...cps].some((c) => range.some(([lo, hi]) => c >= lo && c <= hi));
    const faces = (await pageFaces()).filter((f) => fams.has(f.fam) && hit(f.range));
    const blocks = await Promise.all(faces.map(async (f) => { try { return f.block.replace(f.url, await asDataUrl(f.url)); } catch (e) { return f.block; } }));
    return blocks.join('');
  }
  /** Largest scale the browser can rasterize for this canvas (canvas area / side limits) */
  const maxScale = (w, h) => Math.max(0.1, Math.min(16384 / w, 16384 / h, Math.sqrt(64e6 / (w * h))));
  /** Renders slide i of design d to a canvas at scale s */
  async function renderCanvas(d, i, s, opaque) {
    const pg = d.pages[i], [w, h] = RATIOS[d.ratio]; await fxReady(pg);
    s = Math.min(s, maxScale(w, h));
    const W = Math.round(w * s), H = Math.round(h * s);
    const body = await inlineUrls(posterHTML(pg)), bg = await inlineUrls(String(pg.bg || 'transparent')), css = await fontCSS(body);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;isolation:isolate;width:${w}px;height:${h}px;overflow:hidden;background:${esc(bg)};transform:scale(${s});transform-origin:0 0;-webkit-font-smoothing:antialiased"><style>${EXPORT_BASE}${css}</style>${body}</div></foreignObject></svg>`;
    // a data: URL, not a blob: one: Chrome taints the canvas for foreignObject SVGs loaded from blob URLs
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    // let embedded fonts settle before the first paint (timer fallback: frames don't run in a background tab)
    await new Promise((r) => { let t = 0; const go = () => { if (!t) { t = 1; r(); } }; requestAnimationFrame(go); setTimeout(go, 60); });
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    if (opaque) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H); }
    x.drawImage(img, 0, 0, W, H);
    return c;
  }
  const toBlob = (c, type, q) => new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('The browser could not encode the image'))), type, q));
  /** One slide as an image Blob. 'png' is lossless; 'jpeg' uses quality 0.95 */
  async function renderBlob(d, i, s, fmt) {
    const c = await renderCanvas(d, i, s, fmt === 'jpeg');
    return toBlob(c, 'image/' + fmt, fmt === 'jpeg' ? 0.95 : undefined);
  }
  renderSlide = renderBlob;

  /* ---- files: ZIP (several slides in one download) and PDF (carousel document) ---- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  /** Uncompressed ZIP (images are already compressed) */
  function zipStore(files) {
    const enc = new TextEncoder(), parts = [], dir = []; let off = 0;
    const now = new Date(), dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff, dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
    files.forEach(({ name, data }) => {
      const nm = enc.encode(name), crc = crc32(data), h = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dt, 2], [12, dd, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, nm.length, 2], [28, 0, 2]].forEach(([o, v, n]) => (n === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true)));
      const c = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dt, 2], [14, dd, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, nm.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]].forEach(([o, v, n]) => (n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true)));
      parts.push(new Uint8Array(h.buffer), nm, data); dir.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + data.length;
    });
    const size = dir.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, off, 4], [20, 0, 2]].forEach(([o, v, n]) => (n === 4 ? e.setUint32(o, v, true) : e.setUint16(o, v, true)));
    return new Blob([...parts, ...dir, new Uint8Array(e.buffer)], { type: 'application/zip' });
  }
  /** PDF with one full-bleed JPEG per page (page size = the design's size, 1 px = 0.75 pt) */
  function pdfFromJpegs(pages) {
    const enc = new TextEncoder(), chunks = [], offs = []; let len = 0;
    const put = (x) => { const u = typeof x === 'string' ? enc.encode(x) : x; chunks.push(u); len += u.length; };
    const obj = (n, body, stream) => { offs[n] = len; put(`${n} 0 obj\n${body}\n`); if (stream) { put('stream\n'); put(stream); put('\nendstream\n'); } put('endobj\n'); };
    put('%PDF-1.4\n'); put(new Uint8Array([37, 226, 227, 207, 211, 10])); // binary marker comment
    const n = pages.length, kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
    pages.forEach((p, i) => {
      const o = 3 + i * 3, pw = +(p.w * 0.75).toFixed(2), ph = +(p.h * 0.75).toFixed(2), draw = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
      obj(o, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${o + 2} 0 R >> >> /Contents ${o + 1} 0 R >>`);
      obj(o + 1, `<< /Length ${draw.length} >>`, enc.encode(draw));
      obj(o + 2, `<< /Type /XObject /Subtype /Image /Width ${p.pxW} /Height ${p.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.data.length} >>`, p.data);
    });
    const xref = len, total = 3 + n * 3;
    put(`xref\n0 ${total}\n0000000000 65535 f \n` + offs.slice(1, total).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
    put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }
  const fileBase = (d) => (d.name || 'design').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'design';
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  const bytes = async (b) => new Uint8Array(await b.arrayBuffer());
  /** Renders and downloads; `onStep(i, n)` reports progress. Several images are zipped into one file. */
  async function runExport(d, pgs, s, fmt, onStep) {
    const [w, h] = RATIOS[d.ratio], base = fileBase(d), multi = pgs.length > 1, ext = fmt === 'png' ? 'png' : 'jpg';
    const out = [];
    for (const [k, i] of pgs.entries()) {
      onStep(k, pgs.length);
      if (fmt === 'pdf') { const c = await renderCanvas(d, i, s, true); out.push({ data: await bytes(await toBlob(c, 'image/jpeg', 0.95)), w, h, pxW: c.width, pxH: c.height }); }
      else out.push({ name: `${base}${multi || d.pages.length > 1 ? '-' + String(i + 1).padStart(2, '0') : ''}.${ext}`, blob: await renderBlob(d, i, s, fmt) });
    }
    if (fmt === 'pdf') return download(pdfFromJpegs(out), base + '.pdf');
    if (!multi) return download(out[0].blob, out[0].name);
    download(zipStore(await Promise.all(out.map(async (f) => ({ name: f.name, data: await bytes(f.blob) })))), base + '.zip');
  }
  const FMT_KEY = { PNG: 'png', JPG: 'jpeg', PDF: 'pdf' }, FMT_SET = { png: 'PNG', jpeg: 'JPG', pdf: 'PDF' };
  openExport = function (d, pi) {
    const n = d.pages.length, [w, h] = RATIOS[d.ratio], top = Math.floor(maxScale(w, h) * 10) / 10;
    const scales = [1, 2, 3].filter((x) => x <= top).concat(top < 1 ? [top] : []);
    const defS = Math.min(parseFloat(S.set.quality) || 2, scales[scales.length - 1]), defF = FMT_KEY[S.set.fmt] || 'png';
    const fmtOpt = (v, l) => `<option value="${v}" ${v === defF ? 'selected' : ''}>${l}</option>`;
    modal(`<div class="mh"><h2>Export</h2><button class="btn ghost icon sm" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="mb"><div class="row" style="gap:14px;align-items:flex-start">${thumb(d.pages[pi], d.ratio, 96, 120)}<div class="grow" style="display:flex;flex-direction:column;gap:12px">
      <div class="g2f"><label class="lab">Format<select class="field" id="exF">${fmtOpt('png', 'PNG · lossless')}${fmtOpt('jpeg', 'JPG · smaller file')}${fmtOpt('pdf', 'PDF · document')}</select></label>
      <label class="lab">Size<select class="field" id="exS">${scales.map((x) => `<option value="${x}" ${x === defS ? 'selected' : ''}>${x}× · ${Math.round(w * x)} × ${Math.round(h * x)} px</option>`).join('')}</select></label></div>
      <label class="lab">Slides<select class="field" id="exP"><option value="cur">Current slide (${pi + 1})</option>${n > 1 ? `<option value="all" selected>All ${n} slides</option>` : ''}</select></label></div></div>
      <p class="xs-t muted" id="exM">Same layout, fonts and images as the canvas.</p></div>
    <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="exGo">${ic('download', 18)}Download</button></div>`, {
      onMount: (bg, close) => {
        const hint = () => { const f = $('#exF', bg).value, all = $('#exP', bg).value === 'all' && n > 1; $('#exM', bg).textContent = f === 'pdf' ? `One PDF${all ? ` with ${n} pages` : ''}, ready for LinkedIn documents and print.` : all ? `${n} ${f === 'png' ? 'PNG' : 'JPG'} files in one ZIP, numbered in slide order.` : 'Same layout, fonts and images as the canvas.'; };
        bg.addEventListener('change', hint); hint();
        bg.addEventListener('click', async (e) => {
          const go = e.target.closest('#exGo'); if (!go || go.disabled) return;
          const f = $('#exF', bg).value, s = +$('#exS', bg).value, pgs = $('#exP', bg).value === 'all' ? d.pages.map((p, i) => i) : [pi];
          S.set.fmt = FMT_SET[f]; S.set.quality = s + 'x'; save();
          busy(go, true, 'Rendering…');
          try {
            await runExport(d, pgs, s, f, (k, t) => { $('#exM', bg).textContent = t > 1 ? `Rendering slide ${k + 1} of ${t}…` : 'Rendering…'; });
            close(); toast(f === 'pdf' ? 'PDF downloaded' : pgs.length > 1 ? `${pgs.length} slides downloaded as a ZIP` : 'Image downloaded');
          } catch (x) { busy(go, false); $('#exM', bg).textContent = 'Export failed: ' + String((x && x.message) || 'this browser could not render the design').replace(/\.$/, '') + '. Try Chrome, Edge or Firefox.'; }
        });
      },
    });
  };

  /* ---- wire up each time the editor opens ---- */
  const _oe = openEditor;
  openEditor = function (id) {
    _oe(id); const ed = $('.ed'); if (!ed) return;
    ed.insertAdjacentHTML('beforeend', '<div class="ftb" id="ftb" hidden></div>');
    const g = $('.ed-top .grow'); g && g.insertAdjacentHTML('beforebegin', `<button class="btn secondary sm" data-act="cmdk" title="Search actions (Ctrl K)">${ic('search', 16)}<span class="hide-sm">Search</span><span class="kbd hide-sm">Ctrl K</span></button>`);
    const s = $('#edScroll'); if (!s) return;
    s.addEventListener('scroll', ftb);
    s.addEventListener('pointerdown', (e) => {
      if (!(ED.space || e.button === 1)) return; e.preventDefault(); e.stopPropagation();
      const x = e.clientX, y = e.clientY, sl = s.scrollLeft, st = s.scrollTop; s.classList.add('pan');
      const mv = (ev) => { s.scrollLeft = sl - (ev.clientX - x); s.scrollTop = st - (ev.clientY - y); ftb(); }, up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (!ED.space) s.classList.remove('pan'); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    }, true);
    s.addEventListener('contextmenu', (e) => {
      e.preventDefault(); const ly = e.target.closest('.ly');
      if (ly && !ly.classList.contains('locked')) selectL(ly.dataset.id); else if (!e.target.closest('#sel')) { ED.sel = null; drawSel(); edProps(); }
      openCtx(e.clientX, e.clientY);
    });
    if (!ED.tip) { ED.tip = 1; setTimeout(() => toast('Tip: press Ctrl K to search every action'), 600); }
  };
})();


/* ============================================================
   v6: custom dropdown lists, Templates first, safe zones rewrite
   ============================================================ */
(function () {
  /* ---- Templates first in the rail, and it opens by default ---- */
  RAIL.unshift(...RAIL.splice(RAIL.findIndex((r) => r[0] === 'templates'), 1));
  const _oe = openEditor;
  openEditor = function (id) { _oe(id); if ($('.ed')) { ED.tab = 'templates'; edRail(); edPanel(); } };

  /* ---- custom dropdown list replacing the native select popup ---- */
  let m = null; const close = () => { m && m.remove(); m = null; };
  function open(sel) {
    close(); const r = sel.getBoundingClientRect(), font = sel.dataset.p === 'font' || sel.dataset.ft === 'font';
    m = document.createElement('div'); m.className = 'dmenu'; m.setAttribute('role', 'listbox');
    m.innerHTML = [...sel.options].map((o, i) => `<button type="button" role="option" data-i="${i}" class="${o.selected ? 'on' : ''}"${font ? ` style="font-family:'${esc(o.value)}',sans-serif"` : ''}><span>${esc(o.textContent)}</span>${o.selected ? ic('check', 16) : ''}</button>`).join('');
    document.body.append(m); m.style.minWidth = Math.max(r.width, 160) + 'px';
    const h = m.offsetHeight; let top = r.bottom + 6; if (top + h > innerHeight - 8 && r.top > h + 14) top = r.top - h - 6;
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px'; m.style.top = Math.max(8, top) + 'px';
    const on = m.querySelector('.on') || m.querySelector('button'); on && (on.focus({ preventScroll: true }), on.scrollIntoView({ block: 'nearest' }));
    m.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; sel.selectedIndex = +b.dataset.i; close(); sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); sel.focus(); };
    m.onkeydown = (e) => {
      const bs = [...m.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); bs[Math.min(i + 1, bs.length - 1)].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); bs[Math.max(i - 1, 0)].focus(); } else if (e.key === 'Escape') { e.stopPropagation(); close(); sel.focus(); } else if (e.key === 'Tab') close();
    };
  }
  document.addEventListener('mousedown', (e) => { const s = e.target.closest && e.target.closest('select'); if (s && !s.disabled) { e.preventDefault(); open(s); } else if (!e.target.closest('.dmenu')) close(); }, true);
  document.addEventListener('keydown', (e) => { const s = e.target; if (s && s.tagName === 'SELECT' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); open(s); } }, true);
  addEventListener('resize', close); document.addEventListener('scroll', (e) => { if (m && !m.contains(e.target)) close(); }, true);

  /* ---- safe zones: real per-format areas + one-click fix for text ---- */
  const safeRect = () => {
    const [w, h] = dim(), r = ED.d.ratio, R = Math.round;
    if (r === '9:16') return { w, h, x0: R(w * 0.06), y0: R(h * 0.13), x1: R(w * 0.89), y1: R(h * 0.8), t: ['Profile and title bar', 'Reply bar and buttons'], hint: 'Stories and Reels UI' };
    const s = R(w * (r === '1:1' ? 0.155 : 0.062)), m = R(h * 0.04);
    return { w, h, x0: s, y0: m, x1: w - s, y1: h - m, t: ['', ''], hint: r === '1:1' ? 'Feed and 3:4 profile grid' : 'Feed and profile grid crop' };
  };
  const outT = (l, s) => l.type === 'text' && !l.hidden && (l.x < s.x0 - 1 || l.y < s.y0 - 1 || l.x + l.w > s.x1 + 1 || l.y + l.h > s.y1 + 1);
  drawSafe = function () {
    const el = $('#safe'); if (!el) return; if (!ED.safe) { el.innerHTML = ''; return; }
    const s = safeRect(), n = curP().layers.filter((l) => outT(l, s)).length;
    const Z = [[0, 0, s.w, s.y0, s.t[0]], [0, s.y1, s.w, s.h - s.y1, s.t[1]], [0, s.y0, s.x0, s.y1 - s.y0, ''], [s.x1, s.y0, s.w - s.x1, s.y1 - s.y0, '']];
    el.innerHTML = Z.map(([x, y, w, h, t]) => `<i style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${t}</i>`).join('')
      + `<b style="left:${s.x0}px;top:${s.y0}px;width:${s.x1 - s.x0}px;height:${s.y1 - s.y0}px"></b>`
      + `<span class="sfc ${n ? 'warn' : ''}" style="left:${s.x0 + 14}px;top:${s.y0 + 14}px">${n ? `${n} text layer${n > 1 ? 's' : ''} outside the safe area` : 'Text is inside the safe area'} · ${s.hint}</span>`;
  };
  Object.assign(ACT, {
    safeFix: () => {
      const s = safeRect(), bad = curP().layers.filter((l) => outT(l, s)); if (!bad.length) return toast('Nothing to fix');
      mutate(() => { bad.forEach((l) => { l.w = Math.min(l.w, s.x1 - s.x0); l.x = clamp(l.x, s.x0, s.x1 - l.w); }); }, () => {
        edAll(); bad.forEach((l) => { fitText(l); l.y = clamp(l.y, s.y0, Math.max(s.y0, s.y1 - l.h)); refreshL(l); }); drawSel(); edPages();
      }); toast('Moved ' + bad.length + ' text layer' + (bad.length > 1 ? 's' : '') + ' inside the safe area');
    },
  });
  const _ep = edProps;
  edProps = function () {
    _ep(); const b = $('#edProps .body'); if (!ED.safe || curL() || ED.rtab !== 'design' || !b) return;
    const n = curP().layers.filter((l) => outT(l, safeRect())).length;
    b.insertAdjacentHTML('beforeend', `<div class="note ${n ? 'warn' : ''}">${ic(n ? 'alert' : 'check', 16)}<span>${n ? `${n} text layer${n > 1 ? 's are' : ' is'} outside the safe area.` : 'All text is inside the safe area.'}</span></div>${n ? '<button class="btn primary" data-act="safeFix">Move text inside</button>' : ''}`);
  };
  const _ds = drawSel; drawSel = function () { _ds.apply(this, arguments); ED.safe && drawSafe(); };
})();


/* ---- v8: extra SVG icons (Lucide paths + simple network marks) ---- */
Object.assign(IC, {
  net_ig: '<rect width="20" height="20" x="2" y="2" rx="5"/><path d="M16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4Z"/><path d="M17.5 6.5h.01"/>',
  net_li: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6Z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>',
  net_x: '<path d="M4 4l16 16"/><path d="M20 4 4 20"/>',
  net_fb: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3Z"/>',
  net_tt: '<path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/>',
  net_tg: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
  comment: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"/>',
  thumb: '<path d="M7 10v12"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8a2 2 0 0 1-1.9 1.4H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  share: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  bars: '<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
  hash: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="m10 3-2 18"/><path d="m16 3-2 18"/>',
  swapH: '<path d="m8 3-4 4 4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  swapV: '<path d="m3 8 4-4 4 4"/><path d="M7 4v16"/><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/>',
});

/* ============================================================
   v7 · Editor: multi-select and groups, icons and shapes,
   gradients, image adjust, text styles, grid, drag to reorder
   ============================================================ */
(function () {
  const clone = (o) => JSON.parse(JSON.stringify(o)), isT = (l) => l.type === 'text';
  const L = () => curP().layers, byId = (id) => L().find((l) => l.id === id);
  const msIds = () => (ED.ms && ED.ms.length > 1 ? ED.ms.filter((id) => byId(id)) : []);
  const msL = () => msIds().map(byId);
  const bbox = (ls) => { const x = Math.min(...ls.map((l) => l.x)), y = Math.min(...ls.map((l) => l.y)), x1 = Math.max(...ls.map((l) => l.x + l.w)), y1 = Math.max(...ls.map((l) => l.y + l.h)); return { x, y, w: x1 - x, h: y1 - y, x1, y1 }; };
  const members = (id) => { const l = byId(id); return l && l.gid ? L().filter((x) => x.gid === l.gid).map((x) => x.id) : [id]; };
  const expand = (ids) => [...new Set(ids.flatMap(members))];
  function setSel(ids) {
    ids = ids.filter((id) => { const l = byId(id); return l && !l.hidden; });
    if (ids.length > 1) { ED.ms = ids; ED.sel = null; } else { ED.ms = []; ED.sel = ids[0] || null; }
    drawSel(); edProps();
  }

  /* ---------- extra layer styles: clip shapes, icons, image filters ---------- */
  const _ls = lstyle;
  lstyle = function (l) {
    let s = _ls(l);
    if (l.clip) s += `clip-path:${l.clip};`;
    if (l.icon && IC[l.icon]) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${hex(l.fill)}" stroke-width="${l.isw || 2}" stroke-linecap="round" stroke-linejoin="round">${IC[l.icon]}</svg>`;
      s += `background:url('data:image/svg+xml,${encodeURIComponent(svg)}') center/contain no-repeat;`;
    }
    const f = [];
    if (l.bri != null && l.bri !== 100) f.push(`brightness(${l.bri}%)`);
    if (l.con != null && l.con !== 100) f.push(`contrast(${l.con}%)`);
    if (l.sat != null && l.sat !== 100) f.push(`saturate(${l.sat}%)`);
    if (l.gry) f.push(`grayscale(${l.gry}%)`);
    if (l.sep) f.push(`sepia(${l.sep}%)`);
    if (l.hue) f.push(`hue-rotate(${l.hue}deg)`);
    if (l.bl) f.push(`blur(${l.bl}px)`);
    if (f.length) s += `filter:${f.join(' ')};`;
    if (l.blend && l.blend !== 'normal') s += `mix-blend-mode:${l.blend};`;
    if (isT(l) && (l.va === 'middle' || l.va === 'bottom')) s += `display:flex;flex-direction:column;justify-content:${l.va === 'middle' ? 'center' : 'flex-end'};`;
    return s;
  };

  /* ---------- selection drawing (multi) ---------- */
  const _ds = drawSel;
  drawSel = function () { if (ED.sel && ED.ms && ED.ms.length) ED.ms = []; _ds.apply(this, arguments); drawMs(); };
  function drawMs() {
    const m = $('#msel'), t = $('#mtb'); if (!m) return;
    const ls = msL().filter((l) => !l.hidden);
    if (ls.length < 2 || ED.editing) { m.innerHTML = ''; t && (t.hidden = true); return; }
    const b = bbox(ls);
    m.innerHTML = ls.map((l) => `<i style="left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px;transform:rotate(${l.rot || 0}deg)"></i>`).join('')
      + `<b style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px"><span>${ls.length} layers · ${Math.round(b.w)} × ${Math.round(b.h)}</span></b>`;
    placeMtb(ls);
  }
  function placeMtb(ls) {
    const t = $('#mtb'), bx = $('#msel b'); if (!t || !bx) return;
    const any = ls.some((l) => l.gid), key = ls.length + '|' + any;
    if (t.dataset.k !== key) {
      t.dataset.k = key;
      const rot = (i) => `<span style="display:grid;transform:rotate(90deg)">${ic(i, 16)}</span>`;
      const bt = (a, h, ti, ex = '') => `<button data-act="${a}" ${ex} title="${ti}">${h}</button>`;
      t.innerHTML = `<span class="lb">${ls.length} selected</span><i class="v"></i>`
        + bt('msAlign', ic('alL', 16), 'Align left', 'data-o="Left"') + bt('msAlign', ic('alC', 16), 'Align center', 'data-o="Center"') + bt('msAlign', ic('alR', 16), 'Align right', 'data-o="Right"')
        + bt('msAlign', rot('alL'), 'Align top', 'data-o="Top"') + bt('msAlign', rot('alC'), 'Align middle', 'data-o="Middle"') + bt('msAlign', rot('alR'), 'Align bottom', 'data-o="Bottom"')
        + '<i class="v"></i>' + bt('msDist', ic('swapH', 16), 'Space evenly, horizontal', 'data-a="x"') + bt('msDist', ic('swapV', 16), 'Space evenly, vertical', 'data-a="y"')
        + '<i class="v"></i>' + bt(any ? 'msUngroup' : 'msGroup', ic('layers', 16), any ? 'Ungroup (Ctrl Shift G)' : 'Group (Ctrl G)') + bt('msDup', ic('copy', 16), 'Duplicate (Ctrl D)') + `<button class="dl" data-act="msDel" title="Delete">${ic('trash', 16)}</button>`;
    }
    t.hidden = false;
    const r = bx.getBoundingClientRect(), v = $('#edScroll').getBoundingClientRect(), w = t.offsetWidth; let y = r.top - 56; if (y < v.top + 6) y = r.bottom + 48; y = Math.min(y, v.bottom - 52);
    t.style.left = clamp(r.left + r.width / 2 - w / 2, v.left + 8, Math.max(v.left + 8, v.right - w - 8)) + 'px'; t.style.top = y + 'px';
  }

  /* ---------- group actions ---------- */
  Object.assign(ACT, {
    msTo: (a) => { ED.alignPage = a.dataset.v === 'page'; edProps(); },
    msAlign: (a) => {
      const ls = msL().filter((l) => !l.locked); if (ls.length < 2) return; const o = a.dataset.o, [W, H] = dim(), B = ED.alignPage && ED.rtab === 'design' && a.closest('#edProps') ? { x: 0, y: 0, w: W, h: H } : bbox(ls), ids = ls.map((l) => l.id);
      mutate(() => ls.forEach((l) => {
        if (o === 'Left') l.x = B.x; if (o === 'Center') l.x = Math.round(B.x + (B.w - l.w) / 2); if (o === 'Right') l.x = Math.round(B.x + B.w - l.w);
        if (o === 'Top') l.y = B.y; if (o === 'Middle') l.y = Math.round(B.y + (B.h - l.h) / 2); if (o === 'Bottom') l.y = Math.round(B.y + B.h - l.h);
      }), () => { edAll(); setSel(ids); edPages(); });
    },
    msDist: (a) => {
      const ls = msL().filter((l) => !l.locked), ax = a.dataset.a; if (ls.length < 3) return toast('Select 3 or more layers to space them evenly');
      const P_ = ax === 'x' ? 'x' : 'y', S_ = ax === 'x' ? 'w' : 'h', s = [...ls].sort((p, q) => p[P_] + p[S_] / 2 - (q[P_] + q[S_] / 2)), ids = ls.map((l) => l.id);
      const first = s[0][P_], last = s[s.length - 1][P_] + s[s.length - 1][S_], total = s.reduce((n, l) => n + l[S_], 0), gap = (last - first - total) / (s.length - 1);
      mutate(() => { let c = first; s.forEach((l) => { l[P_] = Math.round(c); c += l[S_] + gap; }); }, () => { edAll(); setSel(ids); edPages(); });
    },
    msMatch: (a) => {
      const ls = msL().filter((l) => !l.locked), k = a.dataset.a, ids = ls.map((l) => l.id), v = Math.max(...ls.map((l) => l[k]));
      mutate(() => ls.forEach((l) => { l[k] = v; }), () => { edAll(); ls.forEach((l) => isT(l) && fitText(l)); setSel(ids); edPages(); });
    },
    msTidy: () => {
      const ls = msL().filter((l) => !l.locked).sort((p, q) => p.y - q.y), b = bbox(ls), ids = ls.map((l) => l.id);
      mutate(() => { let y = b.y; ls.forEach((l) => { l.x = b.x; l.y = Math.round(y); y += l.h + 24; }); }, () => { edAll(); setSel(ids); edPages(); });
      toast('Stacked with even spacing');
    },
    msGroup: () => { const ids = msIds(); if (ids.length < 2) return toast('Select 2 or more layers to group'); const g = uid(); mutate(() => msL().forEach((l) => { l.gid = g; }), () => { edAll(); setSel(ids); }); toast('Grouped. Click any layer to move them together'); },
    msUngroup: () => { const ids = msIds(), gs = new Set(msL().map((l) => l.gid).filter(Boolean)); if (!gs.size) return; mutate(() => L().forEach((l) => { if (gs.has(l.gid)) delete l.gid; }), () => { edAll(); setSel(ids); }); toast('Ungrouped'); },
    msDup: () => {
      const ls = msL(); if (!ls.length) return dupSel(); const gm = {}, nl = ls.map((l) => { const c = clone(l); c.id = uid(); c.x += 30; c.y += 30; c.locked = false; if (c.gid) c.gid = gm[c.gid] || (gm[c.gid] = uid()); return c; });
      mutate(() => { L().push(...nl); }, () => { edAll(); setSel(nl.map((l) => l.id)); });
    },
    msDel: () => { const ids = msIds(); if (!ids.length) return delSel(); mutate(() => { curP().layers = L().filter((l) => !ids.includes(l.id) || l.locked); ED.ms = []; ED.sel = null; }); },
    msLock: () => { const ls = msL(), lock = !ls.every((l) => l.locked), ids = ls.map((l) => l.id); mutate(() => ls.forEach((l) => { l.locked = lock; }), () => { edAll(); setSel(ids); }); },
  });
  document.addEventListener('input', (e) => {
    const t = e.target; if (!t.dataset || !t.dataset.m || !t.closest('#edProps')) return;
    if (!ED.pre) ED.pre = snap();
    msL().forEach((l) => { const k = t.dataset.m; if (k === 'op') l.op = +t.value; else if (k === 'color' && isT(l)) l.color = t.value; else if (k === 'fill' && !isT(l) && !/url\(/.test(l.fill)) l.fill = t.value; refreshL(l); });
  });

  /* ---------- pointer: shift-click, marquee, group move ---------- */
  function startMoveMulti(e, ids, clickId) {
    const ls = ids.map(byId).filter((l) => l && !l.locked); if (!ls.length) return;
    const o = ls.map((l) => [l, l.x, l.y]), b = bbox(ls), [W, H] = dim(), others = L().filter((x) => !ids.includes(x.id) && !x.hidden && !(x.locked && x.name === 'Background'));
    const tx = [0, W / 2, W], ty = [0, H / 2, H]; others.forEach((q) => { tx.push(q.x, q.x + q.w / 2, q.x + q.w); ty.push(q.y, q.y + q.h / 2, q.y + q.h); });
    const sx = e.clientX, sy = e.clientY, pre = snap(); let moved = false;
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return; moved = true;
      let dx = (ev.clientX - sx) / ED.zoom, dy = (ev.clientY - sy) / ED.zoom, gx = null, gy = null; const th = 8 / ED.zoom;
      if (!ev.altKey) {
        for (const a of [0, b.w / 2, b.w]) for (const t of tx) if (gx === null && Math.abs(b.x + dx + a - t) < th) { dx = t - a - b.x; gx = t; }
        for (const a of [0, b.h / 2, b.h]) for (const t of ty) if (gy === null && Math.abs(b.y + dy + a - t) < th) { dy = t - a - b.y; gy = t; }
      }
      o.forEach(([l, x, y]) => { l.x = Math.round(x + dx); l.y = Math.round(y + dy); const el = elOf(l.id); if (el) { el.style.left = l.x + 'px'; el.style.top = l.y + 'px'; } });
      showGuides(gx, gy); drawSel();
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); $('#guides').innerHTML = ''; commit(pre);
      if (moved) { edPages(); edProps(); } else if (clickId && !(ids.length > 1 && ids.every((id) => byId(id).gid && byId(id).gid === byId(ids[0]).gid))) setSel([clickId]);
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  function startMarquee(e, fallback) {
    const sc = $('#scaler'), mq = $('#marq'), s = $('#edScroll'); if (!sc || !mq) return;
    const r0 = sc.getBoundingClientRect(), z = ED.zoom, add = e.shiftKey || e.ctrlKey || e.metaKey;
    const base = add ? (msIds().length ? msIds() : ED.sel ? [ED.sel] : []) : [], px = (ev) => ({ x: (ev.clientX - r0.left) / z, y: (ev.clientY - r0.top) / z }), p0 = px(e); let on = false, ids = base;
    const mv = (ev) => {
      if (!on && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return; on = true; s.classList.add('marqing');
      const p = px(ev), x = Math.min(p0.x, p.x), y = Math.min(p0.y, p.y), w = Math.abs(p.x - p0.x), h = Math.abs(p.y - p0.y);
      mq.hidden = false; mq.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
      ids = expand([...base, ...L().filter((l) => !l.locked && !l.hidden && l.x < x + w && l.x + l.w > x && l.y < y + h && l.y + l.h > y).map((l) => l.id)]);
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); mq.hidden = true; s.classList.remove('marqing'); if (!on) fallback && fallback(); else setSel(ids); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  function bindMulti() {
    const sc = $('#scaler'), s = $('#edScroll'); if (!sc || !s) return;
    sc.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || ED.space || e.target.closest('.editing') || e.target.closest('[data-h]')) return;
      const ly = e.target.closest('.ly'), l = ly && byId(ly.dataset.id), add = e.shiftKey || e.ctrlKey || e.metaKey, ids = msIds();
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (l && !l.locked) {
        if (add) {
          stop(); const cur = ids.length ? ids : ED.sel ? [ED.sel] : [], mem = members(l.id), has = mem.every((x) => cur.includes(x));
          return setSel(has ? cur.filter((x) => !mem.includes(x)) : [...new Set([...cur, ...mem])]);
        }
        if (ids.includes(l.id)) { stop(); return startMoveMulti(e, ids, l.id); }
        if (l.gid) { stop(); const mem = members(l.id); if (mem.length > 1) { setSel(mem); return startMoveMulti(e, mem, l.id); } }
        return; /* single layer: the default handler moves it */
      }
      stop();
      startMarquee(e, () => { ED.ms = []; ED.sel = l && !(l.locked && l.name === 'Background') ? l.id : null; drawSel(); edProps(); });
    }, true);
    s.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || ED.space || (e.target !== s && e.target.id !== 'cwrap')) return;
      e.preventDefault(); startMarquee(e, () => { ED.ms = []; ED.sel = null; drawSel(); edProps(); });
    });
    s.addEventListener('scroll', drawMs);
  }
  addEventListener('resize', () => $('#mtb') && drawMs());

  /* ---------- keyboard for groups ---------- */
  function pasteM() {
    const gm = {}; ED.pn = ((ED.pn || 0) % 8) + 1;
    const nl = clone(ED.clipM.arr).map((l) => { if (l.gid) l.gid = gm[l.gid] || (gm[l.gid] = uid()); l.id = uid(); l.x += 28 * ED.pn; l.y += 28 * ED.pn; l.locked = false; return l; });
    mutate(() => { L().push(...nl); }, () => { edAll(); setSel(nl.map((l) => l.id)); });
  }
  addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('in-editor') || ED.editing || $('#cmdk') || $('.modal-bg')) return;
    const tag = (e.target.tagName || '').toLowerCase(); if (['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable) return;
    const mod = e.ctrlKey || e.metaKey, k = String(e.key || '').toLowerCase(), ids = msIds(), stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (mod && k === 'a') { stop(); return setSel(L().filter((l) => !l.locked && !l.hidden).map((l) => l.id)); }
    if (mod && k === 'g') { stop(); return e.shiftKey ? ACT.msUngroup() : ACT.msGroup(); }
    if (mod && k === 'v' && ED.clipM && ED.clip === ED.clipM.src) { stop(); return pasteM(); }
    if (!ids.length) return;
    if (mod && (k === 'c' || k === 'x')) { stop(); const arr = clone(msL()); ED.clip = arr[0]; ED.clipM = { arr, src: ED.clip }; toast('Copied ' + ids.length + ' layers'); if (k === 'x') ACT.msDel(); }
    else if (k === 'escape') { stop(); ED.ms = []; drawSel(); edProps(); }
    else if (k === 'delete' || k === 'backspace') { stop(); ACT.msDel(); }
    else if (mod && k === 'd') { stop(); ACT.msDup(); }
    else if (k.startsWith('arrow')) {
      stop(); const n = e.shiftKey ? 10 : 1, pre = snap();
      msL().filter((l) => !l.locked).forEach((l) => { if (k === 'arrowleft') l.x -= n; if (k === 'arrowright') l.x += n; if (k === 'arrowup') l.y -= n; if (k === 'arrowdown') l.y += n; refreshL(l); }); drawSel(); commit(pre);
    }
  }, true);

  /* ---------- left panel: elements (shapes, icons) and text styles ---------- */
  const CLIPS = {
    triangle: ['Triangle', 'polygon(50% 0,100% 100%,0 100%)'], diamond: ['Diamond', 'polygon(50% 0,100% 50%,50% 100%,0 50%)'],
    hexagon: ['Hexagon', 'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)'], pentagon: ['Pentagon', 'polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)'],
    star: ['Star', 'polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)'], arrow: ['Arrow', 'polygon(0 35%,60% 35%,60% 10%,100% 50%,60% 90%,60% 65%,0 65%)'],
    chevron: ['Chevron', 'polygon(0 0,70% 0,100% 50%,70% 100%,0 100%,30% 50%)'], cross: ['Cross', 'polygon(35% 0,65% 0,65% 35%,100% 35%,100% 65%,65% 65%,65% 100%,35% 100%,35% 65%,0 65%,0 35%,35% 35%)'],
    bubble: ['Speech bubble', 'polygon(0 0,100% 0,100% 75%,40% 75%,20% 100%,22% 75%,0 75%)'], parallel: ['Parallelogram', 'polygon(20% 0,100% 0,80% 100%,0 100%)'],
    trapezoid: ['Trapezoid', 'polygon(20% 0,80% 0,100% 100%,0 100%)'], burst: ['Burst', 'polygon(50% 0,60% 20%,80% 10%,78% 32%,100% 40%,82% 55%,95% 75%,72% 75%,68% 100%,50% 82%,32% 100%,28% 75%,5% 75%,18% 55%,0 40%,22% 32%,20% 10%,40% 20%)'],
  };
  const ICONS = ['star', 'bell', 'check', 'x', 'plus', 'search', 'chat', 'globe', 'clock', 'send', 'trend', 'users', 'user', 'shield', 'alert', 'link', 'chart', 'cal', 'doc', 'image', 'layers', 'layout', 'palette', 'wand', 'studio', 'sun', 'moon', 'eye', 'lock', 'download', 'upload', 'refresh', 'history', 'settings', 'grid', 'frame', 'type', 'shapes', 'copy', 'arrowUp'];
  const COMBOS = [
    ['Bold statement', 'Big headline and a supporting line', (W, H, c, a, m) => { const y = Math.round(H * .18); return [Tx(80, y, W - 160, 'Say it with impact', { size: 104, weight: 800, font: 'Plus Jakarta Sans', color: c, lines: 2, lh: 1.02, name: 'Heading' }), Tx(80, y + 260, W - 160, 'A short line that explains why it matters.', { size: 38, weight: 400, font: 'Inter', color: m, lines: 2, lh: 1.35, name: 'Subtitle' })]; }],
    ['Editorial', 'Kicker, serif headline and a rule', (W, H, c, a) => { const y = Math.round(H * .16); return [Tx(80, y, W - 160, 'THE LONG READ', { size: 24, weight: 600, ls: 6, font: 'Inter', color: a, name: 'Kicker' }), Tx(80, y + 50, W - 160, 'A headline with character', { size: 92, weight: 700, font: 'Playfair Display', color: c, lines: 2, lh: 1.08, name: 'Headline' }), Rc(80, y + 290, 120, 6, a, { name: 'Rule', r: 3 })]; }],
    ['Tag and title', 'Pill label above a strong title', (W, H, c, a) => { const y = Math.round(H * .16); return [Rc(80, y, 200, 56, a, { name: 'Tag', r: 28 }), Tx(80, y + 14, 200, 'NEW', { size: 24, weight: 700, align: 'center', font: 'Inter', color: '#ffffff', ls: 2, name: 'Tag text' }), Tx(80, y + 90, W - 160, 'Announcing something new', { size: 88, weight: 800, font: 'Plus Jakarta Sans', color: c, lines: 2, lh: 1.05, name: 'Title' })]; }],
    ['Big number', 'A stat that stops the scroll', (W, H, c, a, m) => { const y = Math.round(H * .18); return [Tx(80, y, W - 160, '+38%', { size: 260, weight: 800, font: 'Plus Jakarta Sans', color: a, lh: 1, name: 'Number' }), Tx(80, y + 300, W - 160, 'organic traffic in 90 days', { size: 44, weight: 500, font: 'Inter', color: c, name: 'Label' })]; }],
    ['Quote', 'Large mark, quote and author', (W, H, c, a, m) => { const y = Math.round(H * .12); return [Tx(80, y, 240, '\u201C', { size: 260, weight: 800, font: 'Playfair Display', color: a, lh: 1, name: 'Quote mark' }), Tx(80, y + 280, W - 160, 'Design is how it works, not just how it looks.', { size: 62, weight: 600, font: 'Plus Jakarta Sans', color: c, lines: 3, lh: 1.2, name: 'Quote' }), Tx(80, y + 560, W - 160, '— Name Surname, Role', { size: 30, weight: 500, font: 'Inter', color: m, name: 'Author' })]; }],
    ['Call to action', 'Button with a short label', (W, H, c, a) => { const y = Math.round(H * .62); return [Rc(80, y, 400, 96, a, { name: 'Button', r: 48 }), Tx(80, y + 30, 400, 'Learn more →', { size: 34, weight: 700, align: 'center', font: 'Plus Jakarta Sans', color: '#ffffff', name: 'Button text' })]; }],
  ];
  const _pn = edPanel;
  edPanel = function () {
    _pn(); const p = $('#edPanel'); if (!p || ED.tab === 'agent') return;
    if (ED.tab === 'elements') {
      const h3 = p.querySelector('h3'); h3 && h3.insertAdjacentHTML('afterend', '<input class="field sm es7" type="search" placeholder="Search shapes and icons" aria-label="Search elements">');
      p.insertAdjacentHTML('beforeend', `<span class="label" style="margin-top:6px">More shapes</span><div class="el7grid">${Object.entries(CLIPS).map(([k, v]) => `<button class="el7" data-n="${v[0].toLowerCase()}" data-act="edClip" data-k="${k}" title="${v[0]}"><i style="clip-path:${v[1]}"></i></button>`).join('')}</div>
        <span class="label" style="margin-top:6px">Icons</span><div class="el7grid">${ICONS.map((k) => `<button class="el7" data-n="${k.toLowerCase()} icon" data-act="edIcon" data-k="${k}" title="${k}">${ic(k, 22)}</button>`).join('')}</div>
        <p class="xs-t muted">Icons take the layer color. Select one, then pick a color or fill.</p>`);
    }
    if (ED.tab === 'text') {
      p.insertAdjacentHTML('beforeend', `<span class="label" style="margin-top:10px">Styles that go together</span>${COMBOS.map(([n, d], i) => `<button class="cmb7" data-act="edCombo" data-i="${i}"><b>${n}</b><small>${d}</small></button>`).join('')}<p class="xs-t muted">Each style is added as a group. Ungroup with Ctrl Shift G.</p>`);
    }
  };
  document.addEventListener('input', (e) => {
    const t = e.target; if (!t.classList || !t.classList.contains('es7')) return; const q = t.value.toLowerCase().trim();
    $$('#edPanel [data-n]').forEach((b) => { b.hidden = !!q && !b.dataset.n.includes(q); }); $$('#edPanel .shapebtn[title]').forEach((b) => { b.hidden = !!q && !b.title.toLowerCase().includes(q); });
  });
  Object.assign(ACT, {
    edClip: (a) => { const k = a.dataset.k, [W, H] = dim(), s = 300, c = bgLum() > .6 ? '#0f172a' : (edKit().colors[0] || '#fd0e35'); addLayer(Rc(Math.round(W / 2 - s / 2), Math.round(H / 2 - s / 2), s, s, c, { name: CLIPS[k][0], clip: CLIPS[k][1] })); },
    edIcon: (a) => { const k = a.dataset.k, [W, H] = dim(), s = 220; addLayer(Im(Math.round(W / 2 - s / 2), Math.round(H / 2 - s / 2), s, s, autoColor(), { name: 'Icon · ' + k, icon: k })); },
    edCombo: (a) => {
      const [W, H] = dim(), acc = edKit().colors[0] || '#fd0e35', c = autoColor(), m = bgLum() > .6 ? '#475569' : '#cbd5e1', ls = COMBOS[+a.dataset.i][2](W, H, c, acc, m), g = uid(); ls.forEach((l) => { l.gid = g; });
      mutate(() => { L().push(...ls); ED.sel = null; }, () => { edAll(); ls.filter(isT).forEach(fitText); setSel(ls.map((l) => l.id)); edPages(); });
    },
    edGrid: () => { ED.grid = ((ED.grid || 0) + 1) % 4; drawGrid(); toast(['Grid off', 'Grid: 60 px', 'Grid: 120 px', 'Grid: thirds'][ED.grid]); },
    eyedrop: () => { if (!window.EyeDropper) return toast('Eyedropper is not supported in this browser'); new EyeDropper().open().then((r) => ACT.edColor({ dataset: { c: r.sRGBHex } })).catch(() => {}); },
  });
  function drawGrid() {
    const g = $('#gridov'), b = $('#edGrid'); if (!g) return; const [W, H] = dim(), n = ED.grid || 0, z = 1 / ED.zoom, ln = 'rgba(253,14,53,.28)';
    b && b.classList.toggle('on', n > 0);
    if (!n) { g.style.cssText = ''; g.innerHTML = ''; return; }
    if (n === 3) { g.style.cssText = ''; g.innerHTML = [1, 2].map((i) => `<div style="position:absolute;left:${W * i / 3}px;top:0;width:${z}px;height:${H}px;background:${ln}"></div><div style="position:absolute;top:${H * i / 3}px;left:0;height:${z}px;width:${W}px;background:${ln}"></div>`).join(''); return; }
    const s = n === 1 ? 60 : 120; g.innerHTML = ''; g.style.cssText = `background-image:linear-gradient(${ln} ${z}px,transparent ${z}px),linear-gradient(90deg,${ln} ${z}px,transparent ${z}px);background-size:${s}px ${s}px`;
  }
  const _az = applyZoom; applyZoom = function () { _az.apply(this, arguments); drawGrid(); };

  /* ---------- properties: gradient, image adjust, document colors ---------- */
  const GP = [['#fd0e35', '#7c1d6f'], ['#0b1220', '#1e1b4b'], ['#22A24C', '#030504'], ['#6366f1', '#ec4899'], ['#f59e0b', '#ef4444'], ['#06b6d4', '#3b82f6']];
  const gradOf = (l) => { const m = String(l.fill).match(/linear-gradient\(\s*(-?[\d.]+)deg\s*,\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))[^,]*,\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i); return m ? { a: Math.round(+m[1]), c1: hex(m[2]), c2: hex(m[3]) } : { a: 135, c1: edKit().colors[0] || '#fd0e35', c2: '#6366f1' }; };
  const setGrad = (l, g) => { l.fill = `linear-gradient(${g.a}deg,${g.c1},${g.c2})`; };
  const PRE = { Original: {}, 'B&W': { gry: 100, con: 110 }, Warm: { sep: 30, sat: 120, bri: 105 }, Cool: { hue: -18, sat: 105, bri: 102 }, Vivid: { sat: 150, con: 110 }, Fade: { con: 85, bri: 110, sat: 85 }, Dramatic: { con: 130, bri: 92, sat: 110 } };
  const ADJ = ['bri', 'con', 'sat', 'gry', 'sep', 'hue'];
  const docColors = () => { const s = new Set(); L().forEach((l) => { if (isT(l)) s.add(hex(l.color).toLowerCase()); else if (!/gradient|url/.test(l.fill)) s.add(hex(l.fill).toLowerCase()); }); return [...s].slice(0, 14); };
  function extra(l, b) {
    const kids = [...b.children], find = (sel) => kids.find((c) => c.querySelector && c.querySelector(sel));
    const colorBlk = find('input[data-p=color]') || find('input[data-p=fill]');
    const isImg = l.type === 'image' && /url\(/.test(l.fill) && !l.icon;
    if (colorBlk) {
      let h = '';
      if (!isT(l) && !isImg && !l.icon) {
        const isG = /gradient/.test(l.fill), g = gradOf(l);
        h += `<div class="grad7"><span class="label" style="margin:0">Fill style</span><div class="seg"><button class="${!isG ? 'on' : ''}" data-act="gMode" data-m="solid">Solid</button><button class="${isG ? 'on' : ''}" data-act="gMode" data-m="grad">Gradient</button></div>`
          + (isG ? `<div class="grad-bar" style="background:${l.fill}"></div><div class="g2f"><label class="lab">From<input type="color" data-g="c1" value="${g.c1}"></label><label class="lab">To<input type="color" data-g="c2" value="${g.c2}"></label></div><label class="lab"><span>Angle <b class="av7">${g.a}°</b></span><input type="range" min="0" max="360" data-g="a" value="${g.a}"></label><div class="chips">${GP.map(([a, c]) => `<button class="gp7" data-act="gPre" data-c1="${a}" data-c2="${c}" style="background:linear-gradient(135deg,${a},${c})" title="${a} to ${c}"></button>`).join('')}<button class="chip" data-act="gSwap">${ic('swapH', 14)}Swap</button></div>` : '') + '</div>';
      }
      const cols = docColors();
      h += `<div><span class="label">Document colors</span><div class="dc7">${cols.map((c) => `<button style="background:${c}" data-act="edColor" data-c="${c}" title="${c}"></button>`).join('')}${window.EyeDropper ? `<button data-act="eyedrop" title="Pick a color from the screen">${ic('wand', 14)}</button>` : ''}</div></div>`;
      colorBlk.insertAdjacentHTML('afterend', h);
    }
    if (isImg) {
      const fit = /contain/.test(l.fill);
      b.insertAdjacentHTML('beforeend', `<div class="grad7"><span class="label" style="margin:0">Adjust image</span><div class="chips">${Object.keys(PRE).map((k) => `<button class="chip" data-act="imgPre" data-k="${k}">${k}</button>`).join('')}</div>`
        + [['bri', 'Brightness', 50, 150], ['con', 'Contrast', 50, 150], ['sat', 'Saturation', 0, 200]].map(([k, n, a, z]) => `<label class="lab">${n}<input type="range" min="${a}" max="${z}" data-f="${k}" value="${l[k] ?? 100}"></label>`).join('')
        + `<div class="seg"><button class="${!fit ? 'on' : ''}" data-act="imgFit" data-v="fill">Fill</button><button class="${fit ? 'on' : ''}" data-act="imgFit" data-v="fit">Fit</button></div><label class="btn secondary sm" style="cursor:pointer">${ic('upload', 16)}Replace image<input type="file" accept="image/*" id="rpl" hidden></label></div>`);
    }
  }
  function layersExtra() {
    $$('#edProps .layerrow').forEach((r) => {
      const l = byId(r.dataset.id); if (!l) return; r.draggable = !(l.locked && l.name === 'Background'); if (msIds().includes(l.id)) r.classList.add('on');
      if (l.gid) r.querySelector('.nm').insertAdjacentHTML('afterbegin', `<span class="gi" title="In a group">${ic('layers', 12)}</span> `);
    });
  }
  function multiProps() {
    const el = $('#edProps'), ls = msL(), g = ls.every((l) => l.gid && l.gid === ls[0].gid), any = ls.some((l) => l.gid);
    const ab = (o, i, rot) => `<button class="chip7" data-act="msAlign" data-o="${o}" title="Align ${o.toLowerCase()}">${rot ? `<span style="display:grid;transform:rotate(90deg)">${ic(i, 16)}</span>` : ic(i, 16)}</button>`;
    el.innerHTML = `<div class="tabs"><button class="on" data-act="edRTab" data-k="design">Design</button><button data-act="edRTab" data-k="layers">Layers</button></div><div class="body">
      <div class="row sp"><b>${ls.length} layers selected</b><span class="badge b-Draft">${g ? 'Group' : 'Multiple'}</span></div>
      <div><span class="label">Align to</span><div class="seg"><button class="${!ED.alignPage ? 'on' : ''}" data-act="msTo" data-v="sel">Selection</button><button class="${ED.alignPage ? 'on' : ''}" data-act="msTo" data-v="page">Page</button></div></div>
      <div><span class="label">Align</span><div class="al7">${ab('Left', 'alL')}${ab('Center', 'alC')}${ab('Right', 'alR')}${ab('Top', 'alL', 1)}${ab('Middle', 'alC', 1)}${ab('Bottom', 'alR', 1)}</div></div>
      <div><span class="label">Spacing and size</span><div class="chips"><button class="chip" data-act="msDist" data-a="x">${ic('swapH', 14)}Space horizontally</button><button class="chip" data-act="msDist" data-a="y">${ic('swapV', 14)}Space vertically</button><button class="chip" data-act="msMatch" data-a="w">Match width</button><button class="chip" data-act="msMatch" data-a="h">Match height</button><button class="chip" data-act="msTidy">Tidy up</button></div></div>
      <button class="btn secondary sm" data-act="${any ? 'msUngroup' : 'msGroup'}">${ic('layers', 16)}${any ? 'Ungroup' : 'Group'}<span class="kbd">${any ? 'Ctrl Shift G' : 'Ctrl G'}</span></button>
      <label class="lab">Opacity (all layers)<input type="range" min="0" max="1" step="0.01" data-m="op" value="${(ls.reduce((s, l) => s + (l.op ?? 1), 0) / ls.length).toFixed(2)}"></label>
      <div class="g2f"><label class="lab">Text color<input type="color" data-m="color" value="${hex((ls.find(isT) || {}).color || '#ffffff')}"></label><label class="lab">Shape fill<input type="color" data-m="fill" value="${hex((ls.find((l) => !isT(l) && !/gradient|url/.test(l.fill)) || {}).fill || '#fd0e35')}"></label></div>
      <div class="row" style="gap:4px"><button class="btn secondary icon sm" data-act="msDup" title="Duplicate (Ctrl D)">${ic('copy', 16)}</button><button class="btn secondary icon sm" data-act="msLock" title="Lock or unlock">${ic('lock', 16)}</button><span class="grow"></span><button class="btn secondary sm" data-act="msDel" style="color:var(--neg)">${ic('trash', 16)}Delete</button></div>
      <div class="note">${ic('wand', 16)}<span><span class="kbd">Shift</span> + click, or drag a box on the canvas, to select several layers. Drag any of them to move all.</span></div></div>`;
  }
  const _ep = edProps;
  edProps = function () {
    if (ED.rtab === 'design' && msIds().length > 1) return multiProps();
    _ep(); const l = curL(), b = $('#edProps .body');
    if (ED.rtab === 'layers') return layersExtra();
    if (l && ED.rtab === 'design' && b) extra(l, b);
  };
  const _pk = ACT.edPick;
  ACT.edPick = (a, e) => {
    if (e && e.target.closest('.tg')) return;
    if (e && (e.shiftKey || e.ctrlKey || e.metaKey)) { const cur = msIds().length ? msIds() : ED.sel ? [ED.sel] : [], id = a.dataset.id; return setSel(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]); }
    _pk(a, e);
  };
  Object.assign(ACT, {
    gMode: (a) => { const l = curL(); if (!l) return; mutate(() => { if (a.dataset.m === 'grad') { const c1 = hex(l.fill); setGrad(l, { a: 135, c1, c2: shade(c1, -0.45) }); } else if (/gradient/.test(l.fill)) l.fill = gradOf(l).c1; }); },
    gPre: (a) => { const l = curL(); if (!l) return; mutate(() => setGrad(l, { ...gradOf(l), c1: a.dataset.c1, c2: a.dataset.c2 })); },
    gSwap: () => { const l = curL(); if (!l) return; const g = gradOf(l); mutate(() => setGrad(l, { ...g, c1: g.c2, c2: g.c1 })); },
    imgPre: (a) => { const l = curL(); if (!l) return; mutate(() => { ADJ.forEach((k) => delete l[k]); Object.assign(l, PRE[a.dataset.k]); }); },
    imgFit: (a) => { const l = curL(); if (!l) return; mutate(() => { l.fill = l.fill.replace(/center\s*\/\s*(cover|contain)(\s+no-repeat)?/, a.dataset.v === 'fit' ? 'center/contain no-repeat' : 'center/cover'); }); },
  });
  document.addEventListener('input', (e) => {
    const t = e.target; if (!t.dataset || !t.closest || !t.closest('#edProps')) return; const l = curL(); if (!l) return;
    if (t.dataset.g) { if (!ED.pre) ED.pre = snap(); const g = gradOf(l); g[t.dataset.g] = t.dataset.g === 'a' ? +t.value : t.value; setGrad(l, g); refreshL(l); const bar = $('#edProps .grad-bar'); bar && (bar.style.background = l.fill); if (t.dataset.g === 'a') { const s = t.closest('label').querySelector('.av7'); s && (s.textContent = t.value + '°'); } }
    else if (t.dataset.f) { if (!ED.pre) ED.pre = snap(); l[t.dataset.f] = +t.value; refreshL(l); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target; if (t.id !== 'rpl' || !t.files[0]) return; const l = curL(); if (!l) return; const r = new FileReader();
    r.onload = () => mutate(() => { l.fill = `url(${r.result}) center/cover`; }); r.readAsDataURL(t.files[0]);
  });

  /* ---------- layer rows and slides: drag to reorder ---------- */
  document.addEventListener('dragstart', (e) => {
    const r = e.target.closest && e.target.closest('#edProps .layerrow'), p = e.target.closest && e.target.closest('#edPages .pg');
    if (r) { e.dataTransfer.setData('text/layer', r.dataset.id); e.dataTransfer.effectAllowed = 'move'; r.classList.add('dragging'); }
    else if (p) { const b = p.querySelector('[data-i]'); e.dataTransfer.setData('text/slide', b.dataset.i); e.dataTransfer.effectAllowed = 'move'; p.classList.add('dragging'); }
  });
  document.addEventListener('dragover', (e) => {
    const t = e.dataTransfer && [...e.dataTransfer.types], r = e.target.closest && e.target.closest('#edProps .layerrow'), p = e.target.closest && e.target.closest('#edPages .pg');
    $$('#edProps .dropT,#edPages .dropT').forEach((x) => x !== r && x !== p && x.classList.remove('dropT'));
    if (r && t.includes('text/layer')) { e.preventDefault(); r.classList.add('dropT'); } else if (p && t.includes('text/slide')) { e.preventDefault(); p.classList.add('dropT'); }
  });
  document.addEventListener('drop', (e) => {
    const t = e.dataTransfer && [...e.dataTransfer.types], r = e.target.closest && e.target.closest('#edProps .layerrow'), p = e.target.closest && e.target.closest('#edPages .pg');
    if (r && t.includes('text/layer')) {
      e.preventDefault(); e.stopImmediatePropagation(); const id = e.dataTransfer.getData('text/layer'), to = r.dataset.id; if (id === to) return;
      mutate(() => { const A = L(), [m] = A.splice(A.findIndex((x) => x.id === id), 1); A.splice(A.findIndex((x) => x.id === to) + 1, 0, m); });
    } else if (p && t.includes('text/slide')) {
      e.preventDefault(); e.stopImmediatePropagation(); const from = +e.dataTransfer.getData('text/slide'), to = +p.querySelector('[data-i]').dataset.i; if (from === to) return;
      mutate(() => { const [m] = ED.d.pages.splice(from, 1); ED.d.pages.splice(to, 0, m); ED.pi = to; ED.sel = null; ED.ms = []; });
    }
  }, true);
  document.addEventListener('dragend', () => $$('#edProps .dragging,#edProps .dropT,#edPages .dragging,#edPages .dropT').forEach((x) => x.classList.remove('dragging', 'dropT')));
  const _pg = edPages; edPages = function () { _pg(); $$('#edPages .pg').forEach((p) => { p.draggable = true; }); };

  /* ---------- wire up on open ---------- */
  const _oe = openEditor;
  openEditor = function (id) {
    _oe(id); const ed = $('.ed'), sc = $('#scaler'); if (!ed || !sc) return;
    Object.assign(ED, { ms: [], grid: 0, alignPage: false });
    sc.insertAdjacentHTML('beforeend', '<div class="gridov" id="gridov"></div><div class="msel" id="msel"></div><div class="marq" id="marq" hidden></div>');
    ed.insertAdjacentHTML('beforeend', '<div class="ftb" id="mtb" hidden></div>');
    const sf = $('#edSafe'); sf && sf.insertAdjacentHTML('afterend', `<button class="btn ghost icon sm" id="edGrid" data-act="edGrid" title="Grid overlay">${ic('grid', 18)}</button>`);
    const sch = $('[data-act=edSchedule]'); sch && sch.insertAdjacentHTML('beforebegin', `<button class="btn secondary sm" data-act="edPreview" title="See how it looks on each network">${ic('eye', 16)}<span class="hide-sm">Preview</span></button>`);
    bindMulti(); edPages();
  };
})();

/* ============================================================
   v7 · Planner and schedule post (Metricool style)
   week / month / list, best times, drag to reschedule, composer
   with per-network captions, live previews and a ready-to-post check
   ============================================================ */
(function () {
  const clone = (o) => JSON.parse(JSON.stringify(o)), pad = (n) => String(n).padStart(2, '0');
  const conn = () => Object.keys(PLATFORMS).filter((k) => S.platforms[k]);
  const LIM = { ig: 2200, li: 3000, x: 280, fb: 63206, tt: 2200, tg: 4096 };
  const hm = (t) => pad(Math.floor(t)) + ':' + pad(Math.round((t % 1) * 60));
  const tmin = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const dparse = (k) => new Date(k + 'T00:00');
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };
  const lenOf = (s) => [...String(s || '')].length;
  const tagsOf = (s) => String(s || '').match(/#[\p{L}\p{N}_]+/gu) || [];
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const refresh = () => { if (/^#\/(planner|overview|studio)?$/.test(location.hash) || !location.hash) route(); };

  /* ---------- best time model (engagement patterns, not your analytics) ---------- */
  const PEAK = { ig: [[12.5, .9], [18.5, 1], [21, .8]], li: [[8.5, .9], [12, 1], [17.5, .8]], x: [[9, .8], [13, .9], [19, 1]], fb: [[13, 1], [19.5, .85]], tt: [[19, 1], [21.5, .9]], tg: [[10, .8], [20, 1]] };
  const DOW = { ig: [.9, .8, .95, 1, .95, .85, .9], li: [.3, 1, 1, .95, .9, .6, .25], x: [.7, .95, 1, 1, .9, .8, .65], fb: [.8, .9, .95, 1, .95, .9, .85], tt: [.85, .85, .9, .95, 1, 1, 1], tg: [.8, .9, .95, .95, 1, .95, .85] };
  function score(net, dow, t) { let s = 0; (PEAK[net] || PEAK.ig).forEach(([c, w]) => { s = Math.max(s, w * Math.exp(-(((t - c) / 2.4) ** 2))); }); return Math.min(1, s * (DOW[net] || DOW.ig)[dow] * (0.92 + 0.08 * hash(net + dow + t))); }
  const nsc = (nets, dow, t) => { const a = nets.length ? nets : conn(); return a.reduce((s, n) => s + score(n, dow, t), 0) / Math.max(1, a.length); };
  function bestTimes(nets, key, n = 3) {
    const dow = dparse(key).getDay(), c = []; for (let t = 7; t <= 22; t += .5) c.push([t, nsc(nets, dow, t)]);
    c.sort((a, b) => b[1] - a[1]); const pick = []; for (const [t, s] of c) { if (pick.every((p) => Math.abs(p[0] - t) >= 2.5)) pick.push([t, s]); if (pick.length === n) break; }
    return pick.sort((a, b) => a[0] - b[0]).map(([t, s]) => ({ t: hm(t), s }));
  }
  const level = (s) => (s > .72 ? 'High' : s > .5 ? 'Good' : 'Low');
  const taken = (nets, key, t, skip) => S.posts.some((p) => p !== skip && p.date === key && p.pf.some((k) => nets.includes(k)) && Math.abs(tmin(p.time) - tmin(t)) < 60);
  function nextSlot(nets, skip) {
    const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes() + 30;
    for (let i = 0; i < 21; i++) { const k = iso(addD(now, i)); for (const b of bestTimes(nets, k, 3)) { if (i === 0 && tmin(b.t) < nowM) continue; if (!taken(nets, k, b.t, skip)) return { date: k, time: b.t }; } }
    return { date: iso(addD(now, 1)), time: '09:00' };
  }

  /* ---------- small helpers ---------- */
  function toastU(msg, undo) {
    const t = document.createElement('div'); t.className = 'toast tu'; t.innerHTML = ic('check', 16) + esc(msg) + (undo ? '<button>Undo</button>' : ''); document.body.append(t);
    const x = setTimeout(() => t.remove(), 5400); undo && t.querySelector('button').addEventListener('click', () => { clearTimeout(x); t.remove(); undo(); });
  }
  const byT = (a, b) => (a.time || '').localeCompare(b.time || '');
  const snip = (p) => { const t = String(p.cap || '').trim().split('\n')[0]; return t || getD(p.d).name; };
  const dlabel = (k) => fmt(dparse(k), { weekday: 'short', day: 'numeric', month: 'short' });

  /* ---------- planner ---------- */
  Object.assign(P, { view: 'week', mo: new Date(), fPf: null, fSt: 'All', best: true, bn: null });
  try { if (localStorage.getItem('uxb.pside') === '0') P.side = false; } catch (e) {}
  const fvis = (p) => (P.fSt === 'All' || p.status === P.fSt) && (!P.fPf || p.pf.some((k) => P.fPf.has(k)));
  const fnets = () => (P.fPf ? [...P.fPf] : conn());
  const stDot = (s) => `<i class="sd7 ${s}"></i>`;
  const postCard = (p) => { const dd = getD(p.d); return `<div class="pc7 ${p.status}" role="button" tabindex="0" draggable="true" data-dragpost="${p.id}" data-act="pedit" data-id="${p.id}" aria-label="${esc(snip(p))}, ${p.time}, ${p.status}"${p.publish && p.publish.lastError ? ` title="${esc(p.publish.lastError)}"` : ''}>
    <div class="pc7h"><b>${p.time}</b>${pfDots(p.pf)}</div>
    <div class="pc7b"><div class="thumbbox" style="width:36px;height:36px;background:transparent">${thumb(dd.pages[0], dd.ratio, 36, 36)}</div><p>${esc(snip(p))}</p></div>
    <div class="pc7f">${stDot(p.status)}<span>${p.status}</span><span class="qa7"><button data-act="pdup" data-id="${p.id}" title="Duplicate as draft" aria-label="Duplicate">${ic('copy', 13)}</button><button data-act="pdel" data-id="${p.id}" title="Delete" aria-label="Delete">${ic('trash', 13)}</button></span></div></div>`; };
  const chip = (p) => `<div class="mc7 ${p.status}" role="button" tabindex="0" draggable="true" data-dragpost="${p.id}" data-act="pedit" data-id="${p.id}" title="${esc(snip(p))}"><span>${p.time}</span><b>${esc(snip(p))}</b></div>`;
  function ghosts(k, ps) {
    if (!P.best || k < iso(new Date()) || ps.length >= 3) return [];
    const nets = fnets(), now = new Date(), nowM = now.getHours() * 60 + now.getMinutes() + 30;
    return bestTimes(nets, k, 3).filter((b) => (k > iso(now) || tmin(b.t) > nowM) && !taken(nets, k, b.t)).slice(0, 2).map((b) => b.t);
  }
  function dayCol(d) {
    const k = iso(d), today = iso(new Date()), ps = S.posts.filter((p) => p.date === k && fvis(p)).sort(byT), gs = ghosts(k, ps);
    return `<div class="day ${k === today ? 'today' : ''} ${k < today ? 'past' : ''}" data-date="${k}">
      <div class="dh"><b>${fmt(d, { weekday: 'short' })}</b><span>${d.getDate()}</span>${ps.length ? `<em class="cn7">${ps.length}</em>` : ''}<button class="add7" data-act="pnew" data-date="${k}" title="New post on ${dlabel(k)}" aria-label="New post on ${dlabel(k)}">${ic('plus', 14)}</button></div>
      ${ps.map(postCard).join('')}${gs.map((t) => `<button class="slot7" data-act="pnew" data-date="${k}" data-time="${t}">${ic('studio', 12)}<span>${t}</span><small>Best</small></button>`).join('')}
      ${!ps.length && !gs.length ? `<button class="slot" data-act="pnew" data-date="${k}" aria-label="New post on ${dlabel(k)}">${ic('plus', 16)}</button>` : ''}</div>`;
  }
  /* ---------- week: an hour grid (Metricool / Notion calendar) ----------
     Hours down the side, days across; each hour cell is tinted by how good it is to post (best times, as a % of the
     week's best slot); posts sit at their time; click a free slot to plan a post there, drag a post to move it. */
  const HH = 56; // px per hour
  const narrow = () => innerWidth <= 760;
  function weekView() {
    const all = [...Array(7)].map((_, i) => addD(P.ws, i)), today = iso(new Date()), now = new Date(), nets = fnets().length ? fnets() : ['ig', 'li', 'fb', 'x']; // no network yet: the usual ones
    if (!P.focus || !all.some((d) => iso(d) === P.focus)) P.focus = all.some((d) => iso(d) === today) ? today : iso(all[0]);
    const days = narrow() ? all.filter((d) => iso(d) === P.focus) : all;
    // heat: each hour's score, relative to the best hour of the week
    const sc = all.map((d) => [...Array(24)].map((_, h) => nsc(nets, d.getDay(), h + 0.5))), max = Math.max(...sc.flat(), 0.01);
    const pct = (d, h) => Math.round((sc[all.findIndex((x) => iso(x) === iso(d))][h] / max) * 100);
    const nowM = now.getHours() * 60 + now.getMinutes();
    const head = (d) => { const k = iso(d), n = S.posts.filter((p) => p.date === k && fvis(p)).length, we = d.getDay() === 0 || d.getDay() === 6;
      return `<div class="cal-dh ${k === today ? 'today' : ''} ${we ? 'we' : ''}"><span class="wd">${fmt(d, { weekday: 'short' })}</span><b>${d.getDate()}</b>${n ? `<em title="${n} post${n > 1 ? 's' : ''}">${n}</em>` : ''}</div>`; };
    const col = (d) => {
      const k = iso(d), we = d.getDay() === 0 || d.getDay() === 6, ps = S.posts.filter((p) => p.date === k && fvis(p)).sort(byT);
      const cells = [...Array(24)].map((_, h) => {
        const past = k < today || (k === today && (h + 1) * 60 <= nowM), v = pct(d, h), t = pad(h) + ':00';
        return `<div class="cal-cell ${past ? 'past' : ''}" data-date="${k}" data-h="${h}" style="--s:${P.best ? (v / 100).toFixed(2) : 0}" ${past ? '' : `data-act="pnew" data-time="${t}" role="button" tabindex="-1" aria-label="New post on ${dlabel(k)} at ${t}"`}>${P.best && !past ? `<span class="pct">${v}%</span>` : ''}${past ? '' : `<span class="plus">${ic('plus', 14)}<i>${t}</i></span>`}</div>`;
      }).join('');
      // posts in the same hour share its width
      const groups = {}; ps.forEach((p) => { (groups[Math.floor(tmin(p.time) / 60)] ||= []).push(p); });
      const cards = ps.map((p) => {
        const g = groups[Math.floor(tmin(p.time) / 60)], i = g.indexOf(p), n = g.length, dd = getD(p.d), m = tmin(p.time);
        const top = Math.min(24 * HH - 50, (m / 60) * HH + 2), w = 100 / n;
        return `<div class="cal-post ${p.status}" role="button" tabindex="0" draggable="true" data-dragpost="${p.id}" data-act="pedit" data-id="${p.id}" style="top:${top}px;left:calc(${(i * w).toFixed(3)}% + 3px);width:calc(${w.toFixed(3)}% - 6px)" aria-label="${esc(snip(p))}, ${p.time}, ${p.status}" title="${esc(snip(p))} · ${p.time}${p.publish && p.publish.lastError ? ' · ' + esc(p.publish.lastError) : ''}">
          ${dd ? `<span class="cp-th">${thumb(dd.pages[0], dd.ratio, 30, 30)}</span>` : ''}<span class="cp-b"><b>${p.time}</b><span>${esc(snip(p))}</span></span><span class="cp-f">${pfDots(p.pf)}</span></div>`;
      }).join('');
      const line = k === today ? `<div class="cal-now" style="top:${(nowM / 60) * HH}px"><i></i></div>` : '';
      return `<div class="cal-col ${k === today ? 'today' : ''} ${we ? 'we' : ''}" data-date="${k}">${cells}${cards}${line}</div>`;
    };
    const strip = narrow() ? `<div class="cal-strip" role="tablist">${all.map((d) => { const k = iso(d), n = S.posts.filter((p) => p.date === k && fvis(p)).length; return `<button role="tab" aria-selected="${k === P.focus}" class="${k === P.focus ? 'on' : ''} ${k === today ? 'today' : ''}" data-act="pfocus" data-date="${k}"><small>${fmt(d, { weekday: 'short' })}</small><b>${d.getDate()}</b>${n ? '<i></i>' : ''}</button>`; }).join('')}</div>` : '';
    return `${strip}<div class="cal ${narrow() ? 'one' : ''}" style="--hh:${HH}px;--days:${days.length}">
      <div class="cal-head"><div class="cal-gut"><small title="${esc(tzLabel(schedTz()))}">${esc((tzLabel(schedTz()).match(/\(([^)]+)\)/) || [, ''])[1])}</small></div>${days.map(head).join('')}</div>
      <div class="cal-body" id="calBody"><div class="cal-grid"><div class="cal-hours">${[...Array(24)].map((_, h) => `<span>${h ? pad(h) + ':00' : ''}</span>`).join('')}</div>${days.map(col).join('')}</div></div></div>`;
  }
  // first look at a week: start at 7:00 (or just before now); after that keep where the user scrolled
  const calScroll = () => { const b = $('#calBody'); if (!b) return; const key = iso(P.ws) + (narrow() ? P.focus : ''); if (P.calKey !== key) { P.calKey = key; const h = iso(new Date()) >= iso(P.ws) && iso(new Date()) <= iso(addD(P.ws, 6)) ? Math.max(0, new Date().getHours() - 2) : 7; b.scrollTop = Math.min(h, 7) * HH; P.calY = b.scrollTop; } else b.scrollTop = P.calY || 0; b.addEventListener('scroll', () => { P.calY = b.scrollTop; }, { passive: true }); };
  // the grid follows the clock: move the "now" line every minute, and switch between day and week when the width crosses the phone size
  let calWide = !narrow();
  addEventListener('resize', () => { if (calWide !== !narrow() && /^#\/planner/.test(location.hash) && P.view === 'week') { calWide = !narrow(); route(); } });
  setInterval(() => { const l = $('.cal-now'); if (l) { const n = new Date(); l.style.top = ((n.getHours() * 60 + n.getMinutes()) / 60) * HH + 'px'; } }, 60_000);
  function monthView() {
    const f = new Date(P.mo.getFullYear(), P.mo.getMonth(), 1), s = monday(f), today = iso(new Date()); let cells = [...Array(42)].map((_, i) => addD(s, i)); if (cells[35].getMonth() !== f.getMonth()) cells = cells.slice(0, 35);
    return `<div class="mhead">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => `<span>${x}</span>`).join('')}</div><div class="mgrid">${cells.map((d) => {
      const k = iso(d), ps = S.posts.filter((p) => p.date === k && fvis(p)).sort(byT);
      return `<div class="day m7 ${d.getMonth() !== f.getMonth() ? 'other' : ''} ${k === today ? 'today' : ''} ${k < today ? 'past' : ''}" data-date="${k}"><div class="dh"><b>${d.getDate()}</b><button class="add7" data-act="pnew" data-date="${k}" title="New post on ${dlabel(k)}" aria-label="New post on ${dlabel(k)}">${ic('plus', 14)}</button></div>${ps.slice(0, 3).map(chip).join('')}${ps.length > 3 ? `<button class="more7" data-act="pday" data-date="${k}">+${ps.length - 3} more</button>` : ''}</div>`;
    }).join('')}</div>`;
  }
  function listView() {
    const ps = S.posts.filter(fvis).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), today = iso(new Date());
    if (!ps.length) return `<div class="empty7">${ic('cal', 28)}<b>No posts match these filters</b><p class="sm-t">Clear a filter or plan something new.</p><button class="btn primary sm" data-act="pnew">${ic('plus', 16)}New post</button></div>`;
    let last = '', out = '';
    ps.forEach((p) => {
      if (p.date !== last) { last = p.date; out += `<div class="l7d">${fmt(dparse(p.date), { weekday: 'long', day: 'numeric', month: 'long' })}${p.date === today ? '<small>Today</small>' : p.date === iso(addD(new Date(), 1)) ? '<small>Tomorrow</small>' : ''}</div>`; }
      const dd = getD(p.d);
      out += `<div class="l7r" role="button" tabindex="0" data-act="pedit" data-id="${p.id}"><span class="tt">${p.time}</span><div class="thumbbox" style="width:40px;height:40px;background:transparent">${thumb(dd.pages[0], dd.ratio, 40, 40)}</div><div style="min-width:0"><p>${esc(snip(p))}</p><small>${esc(dd.name)}</small></div>${pfDots(p.pf)}${badge(p.status)}<span class="ra">${p.status !== 'Published' ? `<button data-act="pnow" data-id="${p.id}" title="Publish now" aria-label="Publish now">${ic('send', 16)}</button>` : ''}<button data-act="pdup" data-id="${p.id}" title="Duplicate as draft" aria-label="Duplicate">${ic('copy', 16)}</button><button data-act="pdel" data-id="${p.id}" title="Delete" aria-label="Delete">${ic('trash', 16)}</button></span></div>`;
    });
    return `<div class="l7">${out}</div>`;
  }
  function heat() {
    const nets = conn(); if (!nets.length) return '<div class="empty7 sm">Connect a network in Settings to see best times.</div>';
    P.bn = nets.includes(P.bn) ? P.bn : nets[0]; const hrs = [8, 10, 12, 14, 16, 18, 20, 22], order = [1, 2, 3, 4, 5, 6, 0], dn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const nextFor = (dow) => { for (let i = 0; i < 7; i++) { const d = addD(new Date(), i); if (d.getDay() === dow) return iso(d); } };
    const top = []; for (let i = 0; i < 7; i++) { const k = iso(addD(new Date(), i)); bestTimes([P.bn], k, 3).forEach((b) => { if (i > 0 || tmin(b.t) > new Date().getHours() * 60 + new Date().getMinutes() + 30) top.push({ k, ...b }); }); }
    top.sort((a, b) => b.s - a.s);
    return `<div class="chips">${nets.map((k) => `<button class="pnet ${P.bn === k ? 'on' : ''}" style="--c:${PLATFORMS[k].c}" data-act="pbn" data-k="${k}"><i></i>${PLATFORMS[k].n}</button>`).join('')}</div>
      <div class="heat7"><small></small>${dn.map((d) => `<small>${d[0]}</small>`).join('')}${hrs.map((h) => `<small class="h">${pad(h)}</small>${order.map((dw) => { const s = score(P.bn, dw, h); return `<button style="--s:${s.toFixed(2)}" data-act="pnew" data-date="${nextFor(dw)}" data-time="${pad(h)}:00" title="${dn[order.indexOf(dw)]} ${pad(h)}:00 · ${level(s)}" aria-label="${dn[order.indexOf(dw)]} ${pad(h)}:00, ${level(s)} engagement"></button>`; }).join('')}`).join('')}</div>
      <div><span class="label">Top slots this week</span><div class="top7">${top.slice(0, 3).map((x) => `<button data-act="pnew" data-date="${x.k}" data-time="${x.t}">${ic('studio', 14)}<b>${dlabel(x.k)}</b>${x.t}<small>${level(x.s)}</small></button>`).join('')}</div></div>
      <p class="xs-t muted">Based on typical engagement patterns for each network. Connect analytics to use your own data.</p>`;
  }
  function side() {
    const tabs = `<div class="tabs">${[['designs', 'Designs'], ['ideas', 'Ideas'], ['best', 'Best times']].map(([k, l]) => `<button class="${P.tray === k ? 'on' : ''}" data-act="tray" data-t="${k}">${l}</button>`).join('')}</div>`;
    let body;
    if (P.tray === 'best') body = heat();
    else if (P.tray === 'ideas') body = `<div class="tray">${S.ideas.map((i) => `<div class="idea"><p>${esc(i.t)}</p><div class="row sp"><span class="xs-t muted">${i.cat}</span><button class="btn secondary sm" data-act="fromTpl" data-tpl="${i.tpl}">Design it</button></div></div>`).join('')}</div>`;
    else {
      const free = S.designs.filter((d) => !S.posts.some((p) => p.d === d.id)), rest = S.designs.filter((d) => S.posts.some((p) => p.d === d.id));
      const card = (d) => { const dd = getD(d.id); return `<div class="dcard" role="button" tabindex="0" draggable="true" data-drag="${d.id}" data-act="pnewd" data-id="${d.id}"><div class="thumbbox" style="width:52px;height:52px;background:transparent">${thumb(dd.pages[0], d.ratio, 48, 48)}</div><div class="grow"><p class="sm-t" style="font-weight:500;line-height:1.3">${esc(d.name)}</p><p class="xs-t muted">${ratioLabel(d.ratio)} · ${d.status}</p></div></div>`; };
      body = `<p class="xs-t muted">Drag a design onto a day, or click it to schedule.</p><div class="tray">${free.map(card).join('') || '<p class="xs-t muted">Every design is scheduled.</p>'}</div>${rest.length ? `<span class="label" style="margin:4px 0 0">Already planned</span><div class="tray">${rest.map(card).join('')}</div>` : ''}`;
    }
    return `<div class="widget pside">${tabs}${body}</div>`;
  }
  PAGES.planner = {
    t: 'Social Media Planner', s: 'Plan, schedule and publish. Drag a post to another day to reschedule it.',
    actions: () => `<div class="row" style="gap:6px"><button class="btn secondary icon" data-act="pnav" data-n="-1" title="Previous" aria-label="Previous">${ic('chevL')}</button><button class="btn secondary" data-act="pnav" data-n="0">Today</button><button class="btn secondary icon" data-act="pnav" data-n="1" title="Next" aria-label="Next">${ic('chevR')}</button></div>
      <div class="tabs" style="min-width:210px">${[['week', 'Week'], ['month', 'Month'], ['list', 'List']].map(([k, l]) => `<button class="${P.view === k ? 'on' : ''}" data-act="pview" data-v="${k}">${l}</button>`).join('')}</div>
      <button class="btn primary" data-act="pnew">${ic('plus', 18)}<span class="hide-sm">New post</span></button>`,
    view: () => {
      const days = [...Array(7)].map((_, i) => addD(P.ws, i)), today = iso(new Date());
      const title = P.view === 'month' ? fmt(P.mo, { month: 'long', year: 'numeric' }) : P.view === 'list' ? 'All posts' : `${fmt(days[0], { day: 'numeric', month: 'long' })} – ${fmt(days[6], { day: 'numeric', month: 'long', year: 'numeric' })}`;
      const inRange = (p) => (P.view === 'week' ? p.date >= iso(days[0]) && p.date <= iso(days[6]) : P.view === 'month' ? p.date.slice(0, 7) === iso(P.mo).slice(0, 7) : true), rs = S.posts.filter((p) => inRange(p) && fvis(p));
      const span = P.view === 'week' ? days.map(iso) : P.view === 'month' ? [...Array(new Date(P.mo.getFullYear(), P.mo.getMonth() + 1, 0).getDate())].map((_, i) => iso(new Date(P.mo.getFullYear(), P.mo.getMonth(), i + 1))) : [], open = span.filter((k) => k >= today && !S.posts.some((p) => p.date === k && fvis(p))).length;
      const stat = (n, l) => `<div class="pstat"><b>${n}</b><span>${l}</span></div>`;
      const stats = P.view === 'list' ? '' : `<div class="pstats">${stat(rs.filter((p) => p.status === 'Scheduled').length, 'Scheduled')}${stat(rs.filter((p) => p.status === 'Draft').length, 'Drafts')}${stat(rs.filter((p) => p.status === 'Published').length, 'Published')}${stat(open, 'Open days left')}</div>`;
      return `<div class="ptool"><b class="ttl">${title}</b>
        <div class="chips">${Object.entries(PLATFORMS).filter(([k]) => S.platforms[k]).map(([k, v]) => `<button class="pnet ${!P.fPf || P.fPf.has(k) ? 'on' : ''}" style="--c:${v.c}" data-act="pfn" data-k="${k}" aria-pressed="${!P.fPf || P.fPf.has(k)}"><i></i>${v.n}</button>`).join('')}</div>
        <select class="field sm" id="pSt" style="width:136px" aria-label="Status filter">${['All', 'Scheduled', 'Draft', 'Approved', 'Published', 'Failed'].map((s) => `<option value="${s}" ${P.fSt === s ? 'selected' : ''}>${s === 'All' ? 'All statuses' : s}</option>`).join('')}</select>
        ${P.view === 'week' ? `<span class="pswitch"><button class="switch ${P.best ? 'on' : ''}" data-act="pbest" role="switch" aria-checked="${P.best}" aria-label="Suggest best times"></button>Best times</span>` : ''}
        <button class="btn secondary sm psidebtn ${P.side === false ? '' : 'on'}" data-act="pside" aria-pressed="${P.side !== false}" title="${P.side === false ? 'Show' : 'Hide'} designs, ideas and best times">${ic('layout', 16)}<span class="hide-sm">Panel</span></button></div>
        ${stats}<div class="pl7 ${P.side === false ? 'noside' : ''}"><div class="widget pcal ${P.view}" style="padding:${P.view === 'week' ? 0 : 10}px">${P.view === 'month' ? monthView() : P.view === 'list' ? listView() : weekView()}</div>${P.side === false ? '' : side()}</div>${P.view === 'week' ? (setTimeout(calScroll, 0), '') : ''}`;
    },
  };
  Object.assign(ACT, {
    pnav: (a) => { const n = +a.dataset.n; if (P.view === 'month') P.mo = n === 0 ? new Date() : new Date(P.mo.getFullYear(), P.mo.getMonth() + n, 1); else P.ws = n === 0 ? monday(new Date()) : addD(P.ws, 7 * n); route(); },
    pview: (a) => { const v = a.dataset.v; if (v === 'month' && P.view !== 'month') P.mo = addD(P.ws, 3); if (v === 'week' && P.view === 'month') { const n = new Date(); P.ws = P.mo.getMonth() === n.getMonth() && P.mo.getFullYear() === n.getFullYear() ? monday(n) : monday(new Date(P.mo.getFullYear(), P.mo.getMonth(), 1)); } P.view = v; route(); },
    pfn: (a) => { const all = conn(), s = P.fPf ? new Set(P.fPf) : new Set(all), k = a.dataset.k; s.has(k) ? s.delete(k) : s.add(k); if (!s.size) s.add(k); P.fPf = all.every((x) => s.has(x)) ? null : s; route(); },
    pbest: () => { P.best = !P.best; route(); },
    pbn: (a) => { P.bn = a.dataset.k; route(); },
    pday: (a) => { P.view = 'week'; P.ws = monday(dparse(a.dataset.date)); P.focus = a.dataset.date; route(); },
    pfocus: (a) => { P.focus = a.dataset.date; route(); },
    pside: () => { P.side = P.side === false; try { localStorage.setItem('uxb.pside', P.side ? '1' : '0'); } catch (e) {} route(); },
    pnew: (a) => openSchedule(null, { date: a && a.dataset && a.dataset.date, time: a && a.dataset && a.dataset.time }),
    pnewd: (a) => openSchedule(getD(a.dataset.id), {}),
    pedit: (a) => { const p = S.posts.find((x) => x.id === a.dataset.id); p && openSchedule(getD(p.d), { post: p }); },
    pdup: (a) => { const p = S.posts.find((x) => x.id === a.dataset.id); if (!p) return; const { publish: _pub, media: _media, ...rest } = clone(p), c = { ...rest, id: 'p' + uid(), status: 'Draft' }; S.posts.push(c); save(); toastU('Duplicated as a draft', () => { S.posts.splice(S.posts.indexOf(c), 1); save(); route(); }); route(); },
    pdel: (a) => { const i = S.posts.findIndex((x) => x.id === a.dataset.id); if (i < 0) return; const [p] = S.posts.splice(i, 1); save(); toastU('Post deleted', () => { S.posts.splice(Math.min(i, S.posts.length), 0, p); save(); route(); }); route(); },
    pnow: (a) => { const p = S.posts.find((x) => x.id === a.dataset.id); if (p) PUB.publishNow(p); },
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'pSt') { P.fSt = e.target.value; route(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList && (e.target.classList.contains('pc7') || e.target.classList.contains('mc7') || e.target.classList.contains('l7r') || e.target.classList.contains('dcard'))) { e.preventDefault(); e.target.click(); } });

  /* drag onto an hour slot of the week grid: a post moves to that day and time (on the half hour under the pointer), a design opens the scheduler there */
  const slotTime = (cell, e) => { const r = cell.getBoundingClientRect(), half = e.clientY - r.top > r.height / 2; return pad(+cell.dataset.h) + (half ? ':30' : ':00'); };
  document.addEventListener('dragover', (e) => { const c = e.target.closest && e.target.closest('.cal-cell'); $$('.cal-cell.over').forEach((x) => x !== c && x.classList.remove('over')); if (c && !c.classList.contains('past')) { e.preventDefault(); c.classList.add('over'); } }, true);
  document.addEventListener('drop', (e) => {
    const c = e.target.closest && e.target.closest('.cal-cell'); if (!c) return; e.preventDefault(); e.stopImmediatePropagation(); $$('.cal-cell.over').forEach((x) => x.classList.remove('over'));
    if (c.classList.contains('past')) return toast('That time has passed. Pick a later slot.');
    const v = e.dataTransfer.getData('text/plain'), k = c.dataset.date, t = slotTime(c, e); if (!v) return;
    if (v.startsWith('post:')) {
      const p = S.posts.find((x) => x.id === v.slice(5)); if (!p || (p.date === k && p.time === t)) return;
      if (p.status === 'Published' || (p.publish && ['published', 'partial', 'publishing'].includes(p.publish.state))) return toast('Published posts can’t be moved. Duplicate the design to post it again.');
      if (p.status === 'Scheduled' && zonedToUtc(k, t, tzValid(p.tz) ? p.tz : schedTz()) < new Date()) return toast(`${dlabel(k)} at ${t} is in the past. Pick a later slot.`);
      const old = { date: p.date, time: p.time }; p.date = k; p.time = t; save();
      toastU('Moved to ' + dlabel(k) + ' at ' + t, () => { Object.assign(p, old); save(); route(); }); route();
    } else { const d = getD(v); d && openSchedule(d, { date: k, time: t }); }
  }, true);
  document.addEventListener('dragend', () => $$('.cal-cell.over, .cal-post.dragging').forEach((x) => x.classList.remove('over', 'dragging')));
  document.addEventListener('dragstart', (e) => { const c = e.target.closest && e.target.closest('.cal-post'); if (c) c.classList.add('dragging'); });

  /* drag: posts between days, designs onto a day */
  document.addEventListener('dragstart', (e) => { const c = e.target.closest && e.target.closest('[data-dragpost]'); if (c) { e.dataTransfer.setData('text/plain', 'post:' + c.dataset.dragpost); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); } });
  document.addEventListener('dragend', () => $$('.pc7.dragging,.mc7.dragging,.day.over').forEach((x) => x.classList.remove('dragging', 'over')));
  document.addEventListener('drop', (e) => {
    const day = e.target.closest && e.target.closest('.day'); if (!day || !day.dataset.date) return; const v = e.dataTransfer.getData('text/plain'); if (!v) return;
    e.preventDefault(); e.stopImmediatePropagation(); $$('.day.over').forEach((x) => x.classList.remove('over')); const k = day.dataset.date;
    if (v.startsWith('post:')) {
      const p = S.posts.find((x) => x.id === v.slice(5)); if (!p || p.date === k) return;
      // a published post already went out: moving it would not publish it again, so don't pretend it does
      if (p.status === 'Published' || (p.publish && ['published', 'partial', 'publishing'].includes(p.publish.state))) return toast('Published posts can’t be moved. Duplicate the design to post it again.');
      if (p.status === 'Scheduled' && zonedToUtc(k, p.time, tzValid(p.tz) ? p.tz : schedTz()) < new Date()) return toast(`${dlabel(k)} at ${p.time} is in the past. Pick a later day.`);
      const old = p.date; p.date = k; save();
      toastU('Moved to ' + dlabel(k) + ' at ' + p.time, () => { p.date = old; save(); route(); }); route();
    } else { const d = getD(v); d && openSchedule(d, { date: k }); }
  }, true);

  /* ---------- network previews ---------- */
  const hl = (s) => esc(s).replace(/(#[\p{L}\p{N}_]+|@[\w.]+)/gu, '<span class="ht">$1</span>');
  const cut = (s, n) => { const a = [...String(s || '')]; return a.length > n ? { t: a.slice(0, n).join(''), more: true } : { t: String(s || ''), more: false }; };
  function pvImg(d, pi, w, maxR) { const pg = d.pages[Math.min(pi, d.pages.length - 1)], [W, H] = RATIOS[d.ratio], hh = Math.round(Math.min(w * H / W, w * maxR)); return `<div class="pvi" style="width:${w}px;height:${hh}px">${thumb(pg, d.ratio, w, 99999)}</div>`; }
  const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));
  const dots = (n, pi) => (n < 2 ? '' : `<div class="car-d" role="tablist">${[...Array(n)].map((_, i) => `<button data-c="pvg" data-i="${i}" class="${i === pi ? 'on' : ''}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>`);
  function pvCar(d, pi, w, maxR, badge) {
    const n = d.pages.length, img = pvImg(d, pi, w, maxR); if (n < 2) return img;
    return `<div class="pvcar" style="width:${w}px">${img}${badge ? `<span class="car-n">${pi + 1}/${n}</span>` : ''}<button class="car-a l" data-c="pvp" data-n="-1" aria-label="Previous slide" ${pi === 0 ? 'disabled' : ''}>${ic('chevL', 16)}</button><button class="car-a r" data-c="pvp" data-n="1" aria-label="Next slide" ${pi === n - 1 ? 'disabled' : ''}>${ic('chevR', 16)}</button></div>`;
  }
  function pvFill(d, i, w, h) { const pg = d.pages[i], [W, H] = RATIOS[d.ratio], k = Math.max(w / W, h / H); return `<div class="pvf" style="width:${w}px;height:${h}px">${thumb(pg, d.ratio, W * k, H * k)}</div>`; }
  function pvGrid(d, w) {
    const n = d.pages.length, k = Math.min(n, 4), cw = Math.floor((w - 2) / 2), sq = cw, cell = (i) => {
      const tall = k === 3 && i === 0, h = k === 2 ? Math.round(cw * 1.45) : tall ? sq * 2 + 2 : sq;
      return `<div class="gc ${tall ? 'tall' : ''}">${pvFill(d, i, cw, h)}${i === 3 && n > 4 ? `<span class="more">+${n - 4}</span>` : ''}</div>`;
    };
    return `<div class="pvgrid" style="width:${w}px">${[...Array(k)].map((_, i) => cell(i)).join('')}</div>`;
  }
  function postPreview(d, net, cap, pi, link, o = {}) {
    const b = brand(), nm = esc(b.name), hd = esc(String(b.handle || '@' + b.name.toLowerCase().replace(/[^a-z0-9]/g, '')).replace('@', '')), av = brandAv(b, 'sm'), W = 300, n = d.pages.length;
    const lk = link ? `<div class="pvlk">${esc(link.replace(/^https?:\/\//, '').slice(0, 46))}</div>` : '', fc = o.fc ? `<div class="pvfc"><b>${hd}</b> ${hl(o.fc)}</div>` : '';
    const globe = `<span class="pvg">Now · ${ic('globe', 11)}</span>`;
    if (net === 'ig' && d.ratio === '9:16') return `<div class="pv7 n-story">${pvCar(d, pi, 200, 2, true)}<span class="bar">${[...Array(n)].map((_, i) => `<i class="${i <= pi ? 'on' : ''}"></i>`).join('')}</span><span class="who">${av}${hd}</span></div>`;
    if (net === 'ig') { const c = cut(cap, 125); return `<div class="pv7 n-ig"><div class="pvh">${av}<div class="who"><b>${hd}</b></div><span class="mo">${ic('more', 16)}</span></div>${pvCar(d, pi, W, 1.25, true)}<div class="pva">${ic('heart', 21)}${ic('comment', 21)}${ic('send', 21)}${dots(n, pi)}<span class="r">${ic('bookmark', 21)}</span></div><div class="pvt"><b>1,248 likes</b><p><b>${hd}</b> ${hl(c.t)}${c.more ? '… <span class="mu">more</span>' : ''}</p></div>${fc}</div>`; }
    if (net === 'li') { const c = cut(cap, 210); return `<div class="pv7 n-li"><div class="pvh">${av}<div class="who"><b>${nm}</b><small>1,204 followers</small><small>${globe}</small></div><span class="mo">${ic('more', 16)}</span></div><div class="pvt"><p>${hl(c.t)}${c.more ? '… <span class="mu">see more</span>' : ''}</p>${lk}</div>${pvCar(d, pi, W, 1.25, false)}${n > 1 ? `<div class="pvdoc"><span>${nm} · carousel</span><b>${pi + 1} / ${n}</b></div><div class="car-bar"><i style="width:${((pi + 1) / n) * 100}%"></i></div>` : ''}<div class="pva act"><span>${ic('thumb', 16)}Like</span><span>${ic('comment', 16)}Comment</span><span>${ic('repeat', 16)}Repost</span><span>${ic('send', 16)}Send</span></div>${o.fc ? `<div class="pvfc" style="padding-top:8px"><b>${nm}</b> ${hl(o.fc)}</div>` : ''}</div>`; }
    if (net === 'x') { const a = [...String(cap || '')], head = a.slice(0, 280).join(''), over = a.slice(280).join(''); return `<div class="pv7 n-x"><div class="pvx">${av}<div class="bd"><div><b>${nm}</b> <span class="mu">@${hd} · now</span></div><div class="pvt" style="padding:0"><p>${hl(head)}${over ? `<span class="ovr">${esc(over)}</span>` : ''}</p>${lk}</div>${n > 1 ? pvGrid(d, 244) : pvImg(d, pi, 244, 1.25)}<div class="pva act">${[['comment', 17], ['repeat', 17], ['heart', 17], ['bars', 17]].map(([i, s]) => `<span>${ic(i, s)}</span>`).join('')}</div></div></div></div>`; }
    if (net === 'fb') { const c = cut(cap, 200); return `<div class="pv7 n-fb"><div class="pvh">${av}<div class="who"><b>${nm}</b><small>${globe}</small></div><span class="mo">${ic('more', 16)}</span></div><div class="pvt"><p>${hl(c.t)}${c.more ? '… <span class="mu">See more</span>' : ''}</p>${lk}</div>${pvCar(d, pi, W, 1.25, true)}<div class="pva act"><span>${ic('thumb', 16)}Like</span><span>${ic('comment', 16)}Comment</span><span>${ic('share', 16)}Share</span></div></div>`; }
    if (net === 'tt') { const c = cut(cap, 90); return `<div class="pv7 n-tt">${pvCar(d, pi, W, 1.6, false)}${n > 1 ? `<div class="car-d seg">${[...Array(n)].map((_, i) => `<button data-c="pvg" data-i="${i}" class="${i === pi ? 'on' : ''}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>` : ''}<div class="cap"><b>@${hd}</b><br>${hl(c.t)}${c.more ? '…' : ''}</div></div>`; }
    const c = cut(cap, 260); return `<div class="pv7 n-tg"><div class="bub">${n > 1 ? pvGrid(d, 280) : pvImg(d, pi, 280, 1.25)}<p>${hl(c.t)}${c.more ? '…' : ''}</p>${lk}</div></div>`;
  }
  window.postPreview = postPreview;
  function openPreview(d, pi) {
    const ns = conn(); if (!ns.length) return toast('Connect a network in Settings first'); let net = ns[0], i = pi || 0;
    const cap = (S.posts.find((p) => p.d === d.id && p.cap) || {}).cap || aiCaption(d);
    modal(`<div class="mh"><h2>Preview</h2><button class="btn ghost icon sm" data-close aria-label="Close">${ic('x')}</button></div><div class="mb" style="align-items:center"><div class="tabs c7t" id="pvT"></div><div class="pvwrap" id="pvB"></div></div>`, {
      onMount: (bg) => {
        const draw = () => {
          $('#pvT', bg).innerHTML = ns.map((k) => `<button class="${net === k ? 'on' : ''}" data-k="${k}" aria-label="${PLATFORMS[k].n}" title="${PLATFORMS[k].n}">${ic('net_' + k, 16)}<span>${PLATFORMS[k].n}</span></button>`).join('');
          $('#pvB', bg).innerHTML = postPreview(d, net, cap, i, '', {}) + '' + '<p class="xs-t muted">Approximate look. Each network may crop or restyle your post.</p>';
        };
        bg.addEventListener('click', (e) => { const t = e.target.closest('#pvT button'), n = e.target.closest('[data-c=pvp]'), g = e.target.closest('[data-c=pvg]'); if (t) { net = t.dataset.k; draw(); } if (n) { i = clampI(i + +n.dataset.n, d.pages.length); draw(); } if (g) { i = clampI(+g.dataset.i, d.pages.length); draw(); } }); draw();
      },
    });
  }
  ACT.edPreview = () => openPreview(ED.d, ED.pi);

  /* ---------- composer ---------- */
  const TAGS = { calendar: ['#Forex', '#EconomicCalendar', '#Trading', '#MarketNews'], article: ['#UXDesign', '#Onboarding', '#ProductDesign', '#UXResearch'], stat: ['#SEO', '#Growth', '#OrganicTraffic', '#Marketing'], launch: ['#Launch', '#DesignTools', '#SocialMedia', '#NewRelease'], features: ['#ProductUpdate', '#Features', '#SaaS'], testimonial: ['#CustomerStories', '#Testimonial', '#SocialProof'], event: ['#AMA', '#LiveEvent', '#Growth', '#Webinar'], quote: ['#Quote', '#Inspiration', '#Design'] };
  function withUtm(u, k, d) { try { const x = new URL(/^https?:\/\//.test(u) ? u : 'https://' + u); x.searchParams.set('utm_source', PLATFORMS[k].n.toLowerCase()); x.searchParams.set('utm_medium', 'social'); x.searchParams.set('utm_campaign', slug(d ? d.name : 'post')); return x.toString(); } catch (e) { return u; } }
  openSchedule = function (d0, o = {}) {
    const ed = o.post || null, inEd = document.body.classList.contains('in-editor'), c0 = conn();
    const st = { d: d0 || (ed ? getD(ed.d) : null), pf: new Set(ed ? ed.pf : c0.slice(0, 3)), cap: ed ? ed.cap || '' : '', caps: ed && ed.caps ? clone(ed.caps) : {}, tab: 'all', fc: ed ? ed.fc || '' : '', fcOpen: !!(ed && ed.fc), link: ed ? ed.link || '' : '', utm: !!(ed && ed.utm), now: false, date: '', time: '', pv: null, pvi: 0, tags: false };
    const tomorrow = iso(addD(new Date(), 1));
    st.date = ed ? ed.date : o.date || tomorrow;
    const defTime = (k) => { const bt = bestTimes([...st.pf], k, 3), n = new Date(), nm = n.getHours() * 60 + n.getMinutes() + 15, f = k === iso(n) ? bt.find((b) => tmin(b.t) > nm) : bt[0]; return (f || bt[bt.length - 1]).t; };
    st.time = ed ? ed.time : o.time || defTime(st.date);
    const html = `<div class="mh"><h2>${ed ? 'Edit post' : 'Schedule post'}</h2><span id="cSt"></span><button class="btn ghost icon sm" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="cp7"><div class="cp7-l">
      <div class="c7s" id="cDes"></div>
      <div class="c7s"><span class="label" style="margin:0">Publish on</span><div class="c7nets" id="cNets"></div></div>
      <div class="c7s"><div class="row sp"><span class="label" style="margin:0">Caption</span></div>
        <div class="c7ed"><div class="tabs c7t" id="cTabs"></div>
          <textarea id="cCap" rows="6" placeholder="Write a caption. Use # for hashtags."></textarea>
          <div class="c7foot"><div class="c7bar"><button class="c7ib" data-c="emoT" title="Emoji" aria-label="Emoji">${ic('smile', 18)}</button><button class="c7ib" data-c="tags" title="Hashtag ideas" aria-label="Hashtag ideas">${ic('hash', 18)}</button><span class="sep"></span><select class="field sm" id="cTone" style="width:118px" aria-label="Tone"><option>Professional</option><option>Friendly</option><option>Bold</option><option>Short</option></select><button class="btn secondary sm" data-c="ai">${ic('studio', 16)}Write with AI</button></div><span class="cnt7" id="cCnt"></span></div>
          <div class="emop" id="cEmo" hidden>${['😀', '😍', '🔥', '✅', '📈', '💡', '👇', '🚀', '✨', '🎯', '👏', '💬'].map((e) => `<button data-c="emo" data-e="${e}" aria-label="Insert ${e}">${e}</button>`).join('')}</div></div>
        <p class="xs-t muted" id="cCustom"></p>
        <div class="chips" id="cTags" hidden></div></div>
      <div class="c7s" id="cFcWrap"></div>
      <div class="c7s"><span class="label" style="margin:0">Link</span><input class="field" id="cLink" placeholder="https://uxboga.com/blog/…" inputmode="url" aria-label="Link"><div class="row" style="gap:8px"><button class="chip" id="cUtm" data-c="utm">UTM tracking</button><span class="xs-t muted" id="cUtmT" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span></div></div>
    </div><div class="cp7-r">
      <div class="c7s"><div class="row sp"><span class="label" style="margin:0">Preview</span><div class="c7pt" id="cPvTabs"></div></div><div class="c7dev"><div class="pvwrap" id="cPv"></div></div></div>
      <div class="c7card"><div class="seg" id="cMode"></div>
        <div id="cWhen" class="c7s" style="gap:10px"><div class="g2f"><label class="lab">Date<input type="date" class="field" id="cD" min="${iso(new Date())}"></label><label class="lab">Time<input type="time" class="field" id="cT" step="300"></label></div><div class="chips" id="cQD"></div><div id="cBT"></div><button class="btn secondary sm" data-c="next">${ic('studio', 16)}Next best slot</button></div>
        <p class="xs-t muted" id="cTz"></p></div>
      <div class="c7s" id="cPub" hidden></div>
      <div class="c7s"><span class="label" style="margin:0">Ready to post?</span><div class="chk7" id="cChk" aria-live="polite"></div></div>
    </div></div><div class="mf" id="cFoot"></div>`;
    modal(html, { wide: true, onMount: (bg, close) => {
      bg.querySelector('.modal').classList.add('xl'); const R = (id) => bg.querySelector('#' + id), nets = () => [...st.pf], capFor = (k) => (st.caps[k] !== undefined ? st.caps[k] : st.cap), linkOf = (k) => (st.link ? (st.utm ? withUtm(st.link, k, st.d) : st.link) : '');
      const tagList = () => [...new Set([...(brand().hashtags || '').split(/\s+/).filter(Boolean), ...((st.d && TAGS[st.d.tpl]) || ['#Design', '#Marketing'])])];
      const when = () => (st.now ? new Date() : new Date(st.date + 'T' + (st.time || '00:00')));

      function drawDes() {
        const d = st.d, el = R('cDes');
        if (!d) { el.innerHTML = `<span class="label" style="margin:0">Choose a design</span><div class="dpick7">${S.designs.map((x) => { const dd = getD(x.id); return `<button class="dp7" data-c="pick" data-id="${x.id}"><div class="thumbbox" style="width:64px;height:76px;background:transparent">${thumb(dd.pages[0], dd.ratio, 64, 76)}</div><span>${esc(x.name)}</span></button>`; }).join('')}</div>`; return; }
        el.innerHTML = `<div class="row" style="gap:12px"><div class="strip7">${d.pages.slice(0, 4).map((pg) => `<div class="thumbbox" style="width:54px;height:66px;background:transparent">${thumb(pg, d.ratio, 54, 66)}</div>`).join('')}${d.pages.length > 4 ? `<span class="more7b">+${d.pages.length - 4}</span>` : ''}</div><div class="grow"><b class="sm-t" style="display:block">${esc(d.name)}</b><span class="xs-t muted">${d.ratio} · ${d.pages.length > 1 ? 'Carousel, ' + d.pages.length + ' slides' : 'Single image'}</span></div><button class="btn ghost sm" data-c="chg">Change</button>${inEd ? '' : `<a class="btn ghost sm" href="#/editor/${d.id}" data-close>Edit design</a>`}</div>`;
      }
      function drawNets() { R('cNets').innerHTML = Object.entries(PLATFORMS).map(([k, v]) => { const on = st.pf.has(k), c = S.platforms[k]; return `<button class="c7net ${on ? 'on' : ''} ${c ? '' : 'off'}" style="--c:${v.c}" data-c="net" data-k="${k}" aria-pressed="${on}" title="${c ? v.n : v.n + ' is not connected'}"><span class="ci">${ic('net_' + k, 20)}${on ? `<i class="ck">${ic('check', 10)}</i>` : ''}${c ? '' : `<i class="pl">${ic('plus', 10)}</i>`}</span><span class="nm">${v.n}</span></button>`; }).join(''); }
      function drawTabBar() {
        const ns = nets(); if (st.tab !== 'all' && !st.pf.has(st.tab)) st.tab = 'all'; const n = st.tab === 'all' ? '' : PLATFORMS[st.tab].n, cn = Object.keys(st.caps).filter((k) => st.pf.has(k)).length;
        R('cTabs').innerHTML = `<button class="${st.tab === 'all' ? 'on' : ''}" data-c="tab" data-k="all">All networks</button>` + ns.map((k) => `<button class="${st.tab === k ? 'on' : ''}" data-c="tab" data-k="${k}"><span class="tni" style="color:${PLATFORMS[k].c}">${ic('net_' + k, 14)}</span>${PLATFORMS[k].n}${st.caps[k] !== undefined ? '<em title="Custom caption"></em>' : ''}</button>`).join('');
        R('cCustom').innerHTML = st.tab === 'all' ? (cn ? `${cn} network${cn > 1 ? 's use' : ' uses'} a custom caption.` : 'Goes to every selected network. Open a network tab to customize it.') : st.caps[st.tab] !== undefined ? `Custom caption for ${n}. <button class="btn link sm" style="height:auto;padding:0 4px" data-c="reset">Use shared caption</button>` : `Using the shared caption. Edit here to customize it for ${n}.`;
      }
      const loadCap = () => { R('cCap').value = st.tab === 'all' ? st.cap : capFor(st.tab); };
      function drawCnt() { const ns = st.tab === 'all' ? nets() : [st.tab]; R('cCnt').innerHTML = ns.map((k) => { const n = lenOf(capFor(k)), l = LIM[k]; return `<span class="${n > l ? 'over' : n > l * .9 ? 'near' : ''}" title="${PLATFORMS[k].n}"><i style="background:${PLATFORMS[k].c}"></i>${n.toLocaleString('en')}/${l.toLocaleString('en')}</span>`; }).join(''); }
      function drawTags() { const t = R('cTags'); t.hidden = !st.tags; if (!st.tags) return; const have = new Set(tagsOf(capFor(st.tab === 'all' ? 'ig' : st.tab) + ' ' + st.fc).map((x) => x.toLowerCase())); t.innerHTML = tagList().map((h) => `<button class="chip ${have.has(h.toLowerCase()) ? 'on' : ''}" data-c="tag" data-h="${esc(h)}">${esc(h)}</button>`).join('') + '<button class="chip" data-c="tagall">+ Add all</button>'; }
      function drawFc() { const ok = st.pf.has('ig') || st.pf.has('li'), w = R('cFcWrap'); w.hidden = !ok; if (!ok) return; w.innerHTML = `<button class="disc7" data-c="fc" aria-expanded="${st.fcOpen}">${ic(st.fcOpen ? 'chevD' : 'chevR', 16)}First comment <small>Instagram and LinkedIn</small></button>${st.fcOpen ? `<textarea class="field" id="cFc" rows="2" placeholder="Put hashtags or a link here to keep the caption clean.">${esc(st.fc)}</textarea>` : ''}`; }
      function drawLink() { R('cUtm').classList.toggle('on', st.utm); const k = st.pv || nets()[0]; R('cUtmT').textContent = st.link && st.utm && k ? withUtm(st.link, k, st.d).replace(/^https?:\/\//, '') : st.utm ? 'Add a link to preview the tracked URL' : ''; }
      function drawPv() {
        const ns = nets(); if (!st.pv || !st.pf.has(st.pv)) st.pv = ns[0];
        R('cPvTabs').innerHTML = ns.map((k) => `<button class="${st.pv === k ? 'on' : ''}" style="--c:${PLATFORMS[k].c}" data-c="pvt" data-k="${k}" title="${PLATFORMS[k].n}" aria-label="${PLATFORMS[k].n} preview">${ic('net_' + k, 17)}</button>`).join('');
        R('cPv').innerHTML = !ns.length ? '<div class="empty7 sm">Select a network to see a preview</div>' : !st.d ? '<div class="empty7 sm">Choose a design to see a preview</div>' : postPreview(st.d, st.pv, capFor(st.pv), st.pvi, linkOf(st.pv), { fc: st.fc })+ (st.d.pages.length > 1 ? `<p class="xs-t muted">Slide ${st.pvi + 1} of ${st.d.pages.length}. Use the arrows or dots to flip through the carousel.</p>` : '');
      }
      function drawWhen() {
        R('cMode').innerHTML = `<button class="${!st.now ? 'on' : ''}" data-c="mode" data-m="s">Schedule</button><button class="${st.now ? 'on' : ''}" data-c="mode" data-m="n">Publish now</button>`;
        R('cTz').textContent = st.now ? 'Goes out as soon as you confirm.' : `Times are in ${tzLabel(schedTz())}, the workspace time zone (Settings → Export & publishing).`;
        R('cWhen').hidden = st.now; if (st.now) return; R('cD').value = st.date; R('cT').value = st.time;
        R('cQD').innerHTML = [['Today', nowIn(schedTz()).date], ['Tomorrow', tomorrow], ['Next Mon', iso(monday(addD(new Date(), 7)))]].map(([l, k]) => `<button class="chip ${st.date === k ? 'on' : ''}" data-c="qd" data-k="${k}">${l}</button>`).join('');
        const bt = bestTimes(nets(), st.date, 3); R('cBT').innerHTML = `<span class="label" style="margin:0 0 6px">Best times on ${fmt(dparse(st.date), { weekday: 'long' })}</span><div class="chips">${bt.map((b) => `<button class="chip bt7 ${st.time === b.t ? 'on' : ''}" data-c="bt" data-t="${b.t}"><b>${b.t}</b><small>${level(b.s)}</small></button>`).join('')}</div>`;
      }
      function checks() {
        const out = [], ns = nets(), w = when(), now = new Date(), tm = pad(w.getHours()) + ':' + pad(w.getMinutes()), k = iso(w);
        if (!st.d) out.push(['err', 'Choose a design']); if (!ns.length) out.push(['err', 'Select at least one network']);
        ns.forEach((n) => { const l = lenOf(capFor(n)); if (l > LIM[n]) out.push(['err', `${PLATFORMS[n].n} caption is ${l.toLocaleString('en')} of ${LIM[n].toLocaleString('en')} characters`]); });
        if (ns.length && ns.some((n) => !capFor(n).trim())) out.push(['warn', 'Some networks have no caption. Posts with text get more engagement']);
        if (st.pf.has('ig') && capFor('ig').trim() && !tagsOf(capFor('ig') + ' ' + st.fc).length) out.push(['warn', 'Instagram: add 3 to 5 hashtags to be found']);
        if (st.d && st.d.ratio === '9:16' && ns.some((n) => ['li', 'x', 'fb'].includes(n))) out.push(['warn', '9:16 is cropped in LinkedIn, X and Facebook feeds']);
        if (st.d && st.pf.has('ig') && st.d.ratio !== '9:16') { const [rw, rh] = RATIOS[st.d.ratio], a = rw / rh; if (a < 0.8 - 1e-3 || a > 1.91 + 1e-3) out.push(['err', 'Instagram only accepts images from 4:5 (portrait) to 1.91:1 (landscape)']); }
        if (st.d && st.d.ratio === '9:16' && st.pf.has('ig')) out.push(['warn', 'Instagram: 9:16 publishes as a Story, and Stories do not show captions']);
        if (st.link && st.pf.has('ig')) out.push(['warn', 'Links in Instagram captions are not clickable. Use link in bio']);
        if (!st.now && st.d) {
          if (!st.date || !st.time) out.push(['err', 'Pick a date and time']); else if (zonedToUtc(st.date, st.time, schedTz()) < now) out.push(['err', 'This time is in the past']);
          else { ns.forEach((n) => { const same = S.posts.filter((p) => p !== ed && p.date === k && p.pf.includes(n)), near = same.find((p) => Math.abs(tmin(p.time) - tmin(tm)) < 60); if (near) out.push(['warn', `${PLATFORMS[n].n} already has a post at ${near.time} that day`]); else if (same.length >= 2) out.push(['warn', `That is the ${same.length + 1}rd post on ${PLATFORMS[n].n} that day`]); });
            if (ns.length && nsc(ns, w.getDay(), w.getHours() + w.getMinutes() / 60) > .72) out.push(['ok', 'High-engagement time for your networks']); }
        }
        if (ns.length && ns.every((n) => capFor(n).trim() && lenOf(capFor(n)) <= LIM[n])) out.push(['ok', 'Caption fits every selected network']);
        const ord = { err: 0, warn: 1, ok: 2 }; return out.sort((a, b) => ord[a[0]] - ord[b[0]]);
      }
      function drawChk() { R('cChk').innerHTML = checks().map(([l, t]) => `<div class="${l}">${ic(l === 'ok' ? 'check' : 'alert', 15)}<span>${esc(t)}</span></div>`).join(''); }
      const live = () => ed && ed.publish && ['published', 'partial', 'publishing'].includes(ed.publish.state);
      function drawPub() {
        const el = R('cPub'), pub = ed && ed.publish, res = pub && pub.results ? Object.entries(pub.results).filter(([k]) => PLATFORMS[k]) : [];
        el.hidden = !res.length && !(pub && pub.lastError); if (el.hidden) return;
        const row = ([k, r]) => `<div class="${r.ok ? (r.warning ? 'warn' : 'ok') : 'err'}">${ic(r.ok ? 'check' : 'alert', 15)}<span><b>${PLATFORMS[k].n}</b> · ${r.ok ? (r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">View post</a>` : 'Published') + (r.warning ? ' · ' + esc(r.warning) : '') : esc(r.error || 'Failed')}</span></div>`;
        el.innerHTML = `<span class="label" style="margin:0">Publishing</span><div class="chk7">${res.map(row).join('') || `<div class="err">${ic('alert', 15)}<span>${esc(pub.lastError)}</span></div>`}</div>`
          + (['failed', 'partial'].includes(pub.state) ? `<div><button class="btn secondary sm" data-c="retry">${ic('refresh', 16)}${pub.state === 'partial' ? 'Retry the failed networks' : 'Retry now'}</button></div>` : '');
      }
      function drawFoot() {
        if (live()) {
          R('cFoot').innerHTML = `<button class="btn ghost sm" data-c="del" style="color:var(--neg)">${ic('trash', 16)}Delete</button><span class="grow xs-t muted" style="text-align:right">${ed.publish.state === 'publishing' ? 'Publishing now…' : 'Already published. Edits here don’t change the live posts.'}</span><button class="btn secondary" data-close>Close</button>`;
          R('cSt').innerHTML = badge(ed.status); return;
        }
        const err = checks().some((c) => c[0] === 'err'), lbl = st.now ? 'Publish now' : `${ed ? 'Update' : 'Schedule'} · ${st.date ? dlabel(st.date) : ''}, ${st.time || ''}`;
        R('cFoot').innerHTML = `${ed ? `<button class="btn ghost sm" data-c="del" style="color:var(--neg)">${ic('trash', 16)}Delete</button>` : ''}<span class="grow"></span><button class="btn secondary" data-c="draft" ${st.d ? '' : 'disabled'}>Save draft</button><button class="btn primary" data-c="go" ${err ? 'disabled' : ''}>${ic(st.now ? 'send' : 'clock', 18)}${lbl}</button>`;
        R('cSt').innerHTML = ed ? badge(ed.status) : '';
      }
      const afterCap = () => { drawTabBar(); drawCnt(); drawTags(); drawPv(); drawChk(); drawFoot(); };
      const afterNets = () => { drawNets(); drawTabBar(); loadCap(); drawCnt(); drawTags(); drawFc(); drawPv(); drawWhen(); drawLink(); drawChk(); drawPub(); drawFoot(); };
      const setCap = (v) => { if (st.tab === 'all') st.cap = v; else st.caps[st.tab] = v; R('cCap').value = v; afterCap(); };
      const addTxt = (t) => { const cur = st.tab === 'all' ? st.cap : capFor(st.tab); setCap(cur + (cur && !/\s$/.test(cur) ? ' ' : '') + t); };
      /* Write with AI: a real caption from the slides' content, in the brand voice (provider from Settings → AI) */
      async function aiWrite(btn) {
        if (!st.d) return toast('Choose a design first');
        const d = st.d, b = brand(), tone = R('cTone').value;
        const texts = d.pages.flatMap((pg) => pg.layers.filter((l) => l.type === 'text' && !l.hidden && String(l.text || '').trim()).sort((x, y) => x.y - y.y || x.x - y.x).map((l) => String(l.text).trim())).slice(0, 80);
        let image; try { const [w, h] = RATIOS[d.ratio], bl = await renderSlide(d, 0, Math.min(1, 900 / Math.max(w, h)), 'jpeg'); image = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(bl); }); } catch (e) { image = undefined; }
        btn && busy(btn, true, 'Writing…');
        try {
          const r = await api('/ai/social-caption', { method: 'POST', body: { brand: b.name, voice: b.voice || '', dos: b.dos || '', donts: b.donts || '', hashtags: b.hashtags || '', cta: b.cta || '', language: b.lang || 'English', tone, design: d.name, texts, networks: nets(), image } });
          setCap(r.caption); toast('Caption written in your brand voice');
        } catch (e) {
          if (/api key|settings → ai/i.test(e.message)) { aiTemplate(); toast('No AI key yet: wrote a starter caption. Add a key in Settings → AI assistant.'); }
          else toast('Could not write the caption: ' + e.message);
        } finally { btn && btn.isConnected && busy(btn, false); }
      }
      /** Starter caption without AI (brand tagline, CTA and hashtags) */
      function aiTemplate() {
        let t = aiCaption(st.d); const tone = R('cTone').value, [first, ...rest] = t.split('\n');
        if (tone === 'Friendly') t = '👋 ' + first.replace(/\.$/, '') + '! Tell us what you think below.\n' + rest.join('\n'); else if (tone === 'Bold') t = first.toUpperCase() + ' 🔥\n' + rest.join('\n'); else if (tone === 'Short') t = first.split('. ')[0] + '.\n\n' + tagList().slice(0, 2).join(' ');
        setCap(t.trim());
      }
      function commit(kind) {
        const d = st.d; if (!d) return; const tz = schedTz(), n = nowIn(tz), status = kind === 'draft' ? 'Draft' : 'Scheduled';
        const rec = { d: d.id, date: kind === 'now' ? n.date : st.date || tomorrow, time: kind === 'now' ? n.time : st.time || '09:00', pf: nets(), status, cap: st.cap, caps: Object.fromEntries(Object.entries(st.caps).filter(([k]) => st.pf.has(k))), fc: st.fc, link: st.link, utm: st.utm, tz };
        const post = ed ? Object.assign(ed, rec) : S.posts[S.posts.push({ id: 'p' + uid(), ...rec }) - 1]; if (kind === 'schedule') d.status = status; save(); close();
        // publishing goes through the API: "now" sends it right away, "schedule" uploads the rendered slides for the scheduler
        if (kind === 'now') PUB.publishNow(post);
        else { toast(kind === 'draft' ? 'Draft saved' : (ed ? 'Updated for ' : 'Scheduled for ') + dlabel(rec.date) + ' at ' + rec.time); if (kind === 'schedule') PUB.prepare(post); }
        refresh();
      }
      R('cLink').value = st.link; R('cTone').value = 'Professional';
      bg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-c]'); if (!b) return; const c = b.dataset.c;
        if (c === 'pick') { st.d = getD(b.dataset.id); st.pvi = 0; drawDes(); drawTags(); drawPv(); drawChk(); drawFoot(); }
        else if (c === 'chg') { st.d = null; drawDes(); drawPv(); drawChk(); drawFoot(); }
        else if (c === 'net') { const k = b.dataset.k; if (!S.platforms[k]) return toast(PLATFORMS[k].n + ' is not connected. Add it in Settings, Connected accounts'); st.pf.has(k) ? st.pf.delete(k) : st.pf.add(k); if (st.tab === k && !st.pf.has(k)) st.tab = 'all'; afterNets(); }
        else if (c === 'tab') { st.tab = b.dataset.k; if (st.tab !== 'all') st.pv = st.tab; drawTabBar(); loadCap(); drawCnt(); drawTags(); drawPv(); }
        else if (c === 'reset') { delete st.caps[st.tab]; loadCap(); afterCap(); }
        else if (c === 'emoT') { R('cEmo').hidden = !R('cEmo').hidden; }
        else if (c === 'emo') { R('cEmo').hidden = true; const ta = R('cCap'), s = ta.selectionStart ?? ta.value.length; ta.setRangeText(b.dataset.e, s, ta.selectionEnd ?? s, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); }
        else if (c === 'tags') { st.tags = !st.tags; drawTags(); }
        else if (c === 'tag') { const h = b.dataset.h, cur = (st.tab === 'all' ? st.cap : capFor(st.tab)); if (!tagsOf(cur).map((x) => x.toLowerCase()).includes(h.toLowerCase())) addTxt(h); }
        else if (c === 'tagall') { const cur = (st.tab === 'all' ? st.cap : capFor(st.tab)).toLowerCase(), add = tagList().filter((h) => !cur.includes(h.toLowerCase())); add.length && addTxt((/\n\n$/.test(cur) || !cur ? '' : '\n\n') + add.join(' ')); }
        else if (c === 'ai') { if (!b.getAttribute('aria-busy')) aiWrite(b); }
        else if (c === 'fc') { st.fcOpen = !st.fcOpen; drawFc(); const f = R('cFc'); f && f.focus(); }
        else if (c === 'utm') { st.utm = !st.utm; drawLink(); drawPv(); }
        else if (c === 'pvt') { st.pv = b.dataset.k; drawPv(); drawLink(); }
        else if (c === 'pvp') { st.pvi = clampI(st.pvi + +b.dataset.n, st.d.pages.length); drawPv(); }
        else if (c === 'pvg') { st.pvi = clampI(+b.dataset.i, st.d.pages.length); drawPv(); }
        else if (c === 'mode') { st.now = b.dataset.m === 'n'; drawWhen(); drawChk(); drawFoot(); }
        else if (c === 'qd') { st.date = b.dataset.k; st.time = defTime(st.date); drawWhen(); drawChk(); drawFoot(); }
        else if (c === 'bt') { st.time = b.dataset.t; drawWhen(); drawChk(); drawFoot(); }
        else if (c === 'next') { const s = nextSlot(nets(), ed); st.date = s.date; st.time = s.time; st.now = false; drawWhen(); drawChk(); drawFoot(); toast('Next free best slot: ' + dlabel(s.date) + ' at ' + s.time); }
        else if (c === 'draft') commit('draft');
        else if (c === 'go') { if (!b.disabled) commit(st.now ? 'now' : 'schedule'); }
        else if (c === 'retry') { close(); PUB.publishNow(ed); }
        else if (c === 'del') { const i = S.posts.indexOf(ed); if (i < 0) return; const [p] = S.posts.splice(i, 1); save(); close(); toastU('Post deleted', () => { S.posts.splice(Math.min(i, S.posts.length), 0, p); save(); refresh(); }); refresh(); }
      });
      bg.addEventListener('input', (e) => {
        const t = e.target;
        if (t.id === 'cCap') { if (st.tab === 'all') st.cap = t.value; else st.caps[st.tab] = t.value; afterCap(); }
        else if (t.id === 'cFc') { st.fc = t.value; drawTags(); drawPv(); drawChk(); }
        else if (t.id === 'cLink') { st.link = t.value.trim(); drawLink(); drawPv(); drawChk(); }
        else if (t.id === 'cD') { if (t.value) { st.date = t.value; drawWhen(); drawChk(); drawFoot(); } }
        else if (t.id === 'cT') { if (t.value) { st.time = t.value; drawWhen(); drawChk(); drawFoot(); } }
      });
      bg.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('.dmenu')) close(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const g = R('cFoot').querySelector('[data-c=go]'); g && !g.disabled && g.click(); } });
      drawDes(); afterNets(); setTimeout(() => { const ta = R('cCap'); ta && ta.focus(); }, 30);
    } });
  };
})();

/* ============================================================
   v9 · every dropdown closes on outside click, Escape and blur
   ============================================================ */
(function () {
  let owner = null;
  const closeAll = () => {
    let any = false;
    $$('.dmenu').forEach((m) => { m.remove(); any = true; });
    $$('.ddm').forEach((m) => { if (!m.hidden) { m.hidden = true; any = true; } });
    const e = $('#cEmo'); if (e && !e.hidden) { e.hidden = true; any = true; }
    const w = $('#wsMenu'); if (w && !w.hidden) { w.hidden = true; any = true; }
    const u = $('#meMenu'); if (u && !u.hidden) { u.hidden = true; any = true; }
    const c = $('#ctx'); if (c) { c.remove(); any = true; }
    return any;
  };
  /* native-select replacement: a second click on the same select toggles it shut */
  addEventListener('mousedown', (e) => {
    const t = e.target, sel = t.closest && t.closest('select'), m = $('.dmenu');
    if (m && !t.closest('.dmenu')) { m.remove(); if (sel && sel === owner) { owner = null; e.preventDefault(); e.stopImmediatePropagation(); return; } }
    if (sel && !sel.disabled) owner = sel;
  }, true);
  addEventListener('pointerdown', (e) => {
    const t = e.target; if (!t.closest) return;
    if (!t.closest('#cEmo') && !t.closest('[data-c=emoT]')) { const x = $('#cEmo'); x && (x.hidden = true); }
    if (!t.closest('.dd')) $$('.ddm').forEach((m) => { m.hidden = true; });
    if (!t.closest('.ws')) { const w = $('#wsMenu'); w && (w.hidden = true); }
  }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && closeAll()) { e.stopImmediatePropagation(); } }, true);
  addEventListener('blur', closeAll);
})();

/* ============================================================
   v10 · swipe a carousel preview with the mouse or a finger
   ============================================================ */
(function () {
  let x0 = null, car = null;
  document.addEventListener('pointerdown', (e) => { car = e.target.closest && e.target.closest('.pvcar'); if (car && !e.target.closest('button')) x0 = e.clientX; else x0 = null; });
  document.addEventListener('pointerup', (e) => {
    if (x0 === null || !car) return; const dx = e.clientX - x0, c = car; x0 = null; car = null; if (Math.abs(dx) < 40) return;
    const b = c.querySelector(`[data-c=pvp][data-n="${dx < 0 ? 1 : -1}"]`); b && !b.disabled && b.click();
  });
})();


renderSide(); route();
if (!initialState) save(); /* first run: store the seeded demo workspace */
persist.watch(() => ({ brands: S.brands, data: S.data, active: S.active, set: S.set }));
if (persist.readOnly) toast('View only: your changes in the Social Media workspace are not saved');

/* ============ Color input v2: custom picker ============ */
/* ---------- Color input v2: custom picker (native inputs stay in the DOM, so every existing handler keeps working) ---------- */
(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const norm = (v) => { const m = String(v).trim().match(HEX); if (!m) return null; let h = m[1].toLowerCase(); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return '#' + h; };
  const rgb2hex = (r, g, b) => '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgb2hsv = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx]; };
  const hsv2rgb = (h, s, v) => { const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; };
  const hueHex = (h) => rgb2hex(...hsv2rgb(h, 1, 1));

  const KEY = 'boga.recentColors';
  let recent = []; try { recent = JSON.parse(localStorage.getItem(KEY) || '[]').filter(norm).slice(0, 10); } catch (e) {}
  const pushRecent = (h) => { recent = [h, ...recent.filter((x) => x !== h)].slice(0, 10); try { localStorage.setItem(KEY, JSON.stringify(recent)); } catch (e) {} };
  const brandColors = () => { try { return [...new Set(brand().colors.map((c) => hex(c.hex).toLowerCase()))]; } catch (e) { return []; } };
  const BASIC = ['#ffffff', '#f1f5f9', '#94a3b8', '#475569', '#0f172a', '#000000'];
  const EYE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>';

  let pop = null, target = null, st = null, orig = '', dirty = false, skipClick = false, cleanup = [];

  function close(commit = true) {
    if (!pop) return;
    const t = target, d = dirty;
    cleanup.forEach((f) => f()); cleanup = [];
    pop.remove(); pop = null; target = null;
    if (t) {
      t.classList.remove('cp-open');
      if (commit && d && t.isConnected) { pushRecent(t.value.toLowerCase()); t.dispatchEvent(new Event('change', { bubbles: true })); }
      if (t.isConnected) t.focus({ preventScroll: true });
    }
  }

  function open(t) {
    close();
    target = t; orig = (norm(t.value) || '#000000'); dirty = false;
    const [r, g, b] = hex2rgb(orig); const [h, s, v] = rgb2hsv(r, g, b); st = { h, s, v };
    pop = document.createElement('div'); pop.className = 'cp'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Color picker');
    const swatches = (label, list) => list.length ? `<div class="cp-sec"><b>${label}</b><div class="cp-sw">${list.map((c) => `<button type="button" class="cp-s" data-c="${c}" style="background:${c}" title="${c.toUpperCase()}" aria-label="${c.toUpperCase()}"></button>`).join('')}</div></div>` : '';
    const bc = brandColors();
    pop.innerHTML = `<div class="cp-sv" tabindex="0" role="slider" aria-label="Saturation and brightness"><i></i></div>
      <div class="cp-hue" tabindex="0" role="slider" aria-label="Hue" aria-valuemin="0" aria-valuemax="360"><i></i></div>
      <div class="cp-row"><span class="cp-prev" title="Before / after"><i style="background:${orig}"></i><i class="cp-new"></i></span><label class="cp-hexw"><span>#</span><input class="cp-hex" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Hex color"></label>${window.EyeDropper ? `<button type="button" class="cp-eye" title="Pick a color from the screen" aria-label="Pick a color from the screen">${EYE}</button>` : ''}</div>
      ${swatches('Brand colors', bc)}${swatches('Neutrals', BASIC.filter((c) => !bc.includes(c)))}${swatches('Recent', recent)}`;
    document.body.appendChild(pop);
    t.classList.add('cp-open');
    place(t);

    const sv = pop.querySelector('.cp-sv'), hu = pop.querySelector('.cp-hue'), hx = pop.querySelector('.cp-hex'), hw = pop.querySelector('.cp-hexw');
    const cur = () => rgb2hex(...hsv2rgb(st.h, st.s, st.v));
    const paint = (skipField) => {
      const c = cur();
      pop.style.setProperty('--cp-h', hueHex(st.h)); pop.style.setProperty('--cp-c', c); pop.style.setProperty('--cp-hc', hueHex(st.h));
      const k = sv.firstElementChild; k.style.left = st.s * 100 + '%'; k.style.top = (1 - st.v) * 100 + '%';
      hu.firstElementChild.style.left = st.h / 360 * 100 + '%';
      pop.querySelector('.cp-new').style.background = c;
      sv.setAttribute('aria-valuetext', `Saturation ${Math.round(st.s * 100)}%, brightness ${Math.round(st.v * 100)}%`);
      hu.setAttribute('aria-valuenow', Math.round(st.h));
      if (!skipField) { hx.value = c.slice(1); hw.classList.remove('bad'); }
      pop.querySelectorAll('.cp-s').forEach((s) => s.classList.toggle('on', s.dataset.c === c));
    };
    const push = (skipField) => { paint(skipField); const c = cur(); if (target && target.isConnected && target.value.toLowerCase() !== c) { target.value = c; dirty = true; target.dispatchEvent(new Event('input', { bubbles: true })); } };
    const setHex = (c, skipField) => { const [R, G, B] = hex2rgb(c); const [H, S, V] = rgb2hsv(R, G, B); st = { h: S && V ? H : st.h, s: S, v: V }; push(skipField); };

    const drag = (el, fn) => {
      el.addEventListener('pointerdown', (e) => { if (e.button) return; e.preventDefault(); el.focus(); el.setPointerCapture(e.pointerId); const mv = (ev) => { const r = el.getBoundingClientRect(); fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)); }; mv(e); el.addEventListener('pointermove', mv); const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); });
    };
    drag(sv, (x, y) => { st.s = x; st.v = 1 - y; push(); });
    drag(hu, (x) => { st.h = x * 360; push(); });
    sv.addEventListener('keydown', (e) => { const n = e.shiftKey ? 0.1 : 0.02, k = e.key || ''; if (!k.startsWith('Arrow')) return; e.preventDefault(); if (k === 'ArrowLeft') st.s = clamp(st.s - n, 0, 1); if (k === 'ArrowRight') st.s = clamp(st.s + n, 0, 1); if (k === 'ArrowUp') st.v = clamp(st.v + n, 0, 1); if (k === 'ArrowDown') st.v = clamp(st.v - n, 0, 1); push(); });
    hu.addEventListener('keydown', (e) => { const n = e.shiftKey ? 20 : 3, k = e.key; if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return; e.preventDefault(); st.h = clamp(st.h + (k === 'ArrowLeft' || k === 'ArrowDown' ? -n : n), 0, 360); push(); });
    hx.addEventListener('input', () => { const c = norm(hx.value); hw.classList.toggle('bad', !c && hx.value.trim() !== ''); if (c) setHex(c, true); });
    hx.addEventListener('blur', () => { hx.value = cur().slice(1); hw.classList.remove('bad'); });
    hx.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); close(); } });
    hx.addEventListener('focus', () => hx.select());
    pop.addEventListener('click', (e) => { const s = e.target.closest('.cp-s'); if (s) setHex(s.dataset.c); const ey = e.target.closest('.cp-eye'); if (ey) new EyeDropper().open().then((r) => { if (pop) setHex(norm(r.sRGBHex)); }).catch(() => {}); });
    pop.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); if (target) { target.value = orig; if (dirty) { target.dispatchEvent(new Event('input', { bubbles: true })); target.dispatchEvent(new Event('change', { bubbles: true })); } } dirty = false; close(false); } });
    ['keyup', 'keypress'].forEach((n) => pop.addEventListener(n, (e) => e.stopPropagation()));

    const outside = (e) => { if (pop && !pop.contains(e.target)) { if (e.target === target) skipClick = true; close(); } };
    const reflow = () => { if (!target || !target.isConnected) return close(false); place(target); };
    document.addEventListener('pointerdown', outside, true); addEventListener('resize', reflow); addEventListener('scroll', reflow, true);
    cleanup.push(() => { document.removeEventListener('pointerdown', outside, true); removeEventListener('resize', reflow); removeEventListener('scroll', reflow, true); });
    paint(); hx.focus({ preventScroll: true });
  }

  function place(t) {
    const r = t.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, vw = innerWidth, vh = innerHeight;
    let top = r.bottom + 8; if (top + h > vh - 8) top = r.top - h - 8; top = clamp(top, 8, Math.max(8, vh - h - 8));
    pop.style.left = clamp(r.left, 8, Math.max(8, vw - w - 8)) + 'px'; pop.style.top = top + 'px';
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('input[type=color]'); if (!t) return;
    e.preventDefault(); if (skipClick) { skipClick = false; return; } if (!t.disabled) open(t);
  }, true);
  document.addEventListener('pointerover', (e) => { const t = e.target.closest && e.target.closest('input[type=color]'); if (t && !t.dataset.ttl) t.title = t.value.toUpperCase() + ' · Click to edit'; else if (t) t.title = t.value.toUpperCase() + ' · Click to edit'; });
})();

/* ============ v12 · dropdown engine + slide filmstrip ============ */
/* ============================================================
   v12 · one dropdown engine (closes on outside click / touch / Esc / scroll / route change)
         + slide filmstrip rebuilt like Canva / Figma
   ============================================================ */
(function () {
  const $1 = (s, r = document) => r.querySelector(s), $A = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const E = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  Object.assign(IC, {
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    slides: '<rect x="7" y="3" width="14" height="11" rx="2"/><path d="M3 8v9a3 3 0 0 0 3 3h12"/>',
    slidePlus: '<rect x="3" y="4" width="14" height="16" rx="2"/><path d="M21 9v6M18 12h6"/>',
    moveL: '<path d="M19 12H5M11 6l-6 6 6 6"/>', moveR: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  });

  /* ---------- 1) native <select> → custom list ---------- */
  let m = null, owner = null, suppress = null, buf = '', bufT = 0;
  const reset = () => { if (owner) { owner.classList.remove('dd-open'); owner.setAttribute('aria-expanded', 'false'); } owner = null; m = null; };
  const closeSel = (refocus) => { if (!m) return; const o = owner; m.remove(); reset(); if (refocus && o && o.isConnected) o.focus({ preventScroll: true }); };
  new MutationObserver(() => { if (m && !m.isConnected) reset(); }).observe(document.body, { childList: true });

  function openSel(sel) {
    closeSel(); owner = sel; sel.classList.add('dd-open'); sel.setAttribute('aria-haspopup', 'listbox'); sel.setAttribute('aria-expanded', 'true');
    const r = sel.getBoundingClientRect(), font = sel.dataset.p === 'font' || sel.dataset.ft === 'font', opts = [...sel.options], search = opts.length > 9;
    m = document.createElement('div'); m.className = 'dmenu' + (search ? ' has-s' : ''); m.setAttribute('role', 'listbox');
    const items = opts.map((o, i) => `<button type="button" role="option" aria-selected="${o.selected}" data-i="${i}" data-t="${E(o.textContent.toLowerCase())}" class="${o.selected ? 'on' : ''}"${o.disabled ? ' disabled' : ''}${font ? ` style="font-family:'${E(o.value)}',sans-serif"` : ''}><span>${E(o.textContent)}</span>${o.selected ? ic('check', 16) : ''}</button>`).join('');
    m.innerHTML = (search ? `<div class="dm-s">${ic('search', 15)}<input type="text" placeholder="Search…" aria-label="Search options" autocomplete="off" spellcheck="false"></div>` : '') + `<div class="dm-l">${items}<div class="dm-e" hidden>No results</div></div>`;
    document.body.append(m); m.style.minWidth = Math.max(r.width, 170) + 'px';
    const below = innerHeight - r.bottom - 14, above = r.top - 14, up = below < 220 && above > below, room = Math.max(160, up ? above : below);
    m.style.maxHeight = Math.min(340, room) + 'px';
    const L = m.querySelector('.dm-l'), h = m.offsetHeight;
    let top = up ? r.top - h - 6 : r.bottom + 6; m.style.top = clamp(top, 8, Math.max(8, innerHeight - h - 8)) + 'px';
    m.style.left = clamp(r.left, 8, Math.max(8, innerWidth - m.offsetWidth - 8)) + 'px';
    const vis = () => $A('button:not([hidden]):not(:disabled)', m), inp = m.querySelector('input'), on = m.querySelector('button.on');
    on && on.scrollIntoView({ block: 'center' });
    (inp || on || vis()[0]).focus({ preventScroll: true });
    const pick = (i) => { const s = owner; if (!s || !s.isConnected) return closeSel(); s.selectedIndex = i; closeSel(true); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); };
    m.onclick = (e) => { const b = e.target.closest('button'); if (b && !b.disabled) pick(+b.dataset.i); };
    if (inp) inp.addEventListener('input', () => { const q = inp.value.toLowerCase().trim(); $A('button', m).forEach((b) => { b.hidden = !!q && !b.dataset.t.includes(q); }); m.querySelector('.dm-e').hidden = vis().length > 0; });
    m.onkeydown = (e) => {
      e.stopPropagation(); const bs = vis(), i = bs.indexOf(document.activeElement), k = e.key;
      if (k === 'ArrowDown') { e.preventDefault(); (bs[i + 1] || bs[bs.length - 1] || inp) && (bs[Math.min(i + 1, bs.length - 1)] || bs[0]).focus(); }
      else if (k === 'ArrowUp') { e.preventDefault(); if (i <= 0 && inp) inp.focus(); else bs[Math.max(i - 1, 0)].focus(); }
      else if (k === 'Home' && !inp) { e.preventDefault(); bs[0].focus(); } else if (k === 'End' && !inp) { e.preventDefault(); bs[bs.length - 1].focus(); }
      else if (k === 'Enter' && document.activeElement === inp && bs[0]) { e.preventDefault(); pick(+bs[0].dataset.i); }
      else if (k === 'Escape') { e.preventDefault(); closeSel(true); }
      else if (k === 'Tab') closeSel();
      else if (!inp && k.length === 1 && !e.ctrlKey && !e.metaKey) { clearTimeout(bufT); buf += k.toLowerCase(); bufT = setTimeout(() => (buf = ''), 600); const hit = bs.find((b) => b.dataset.t.startsWith(buf)); hit && hit.focus(); }
    };
  }
  /* window capture = runs before every older handler */
  /* outside detection on every input type (Safari / touch / mouse), capture phase so nothing can swallow it */
  const outside = (e) => {
    if (!m) return; if (!m.isConnected) return reset();
    const t = e.target; if (!(t instanceof Node) || m.contains(t)) return;
    const s = t.closest && t.closest('select');
    if (s && s === owner) { if (e.type !== 'pointerdown') return; suppress = s; setTimeout(() => { suppress = null; }, 500); }
    closeSel(false);
  };
  ['pointerdown', 'touchstart', 'mousedown', 'click', 'contextmenu'].forEach((n) => addEventListener(n, outside, true));
  document.addEventListener('focusin', (e) => { if (m && !m.contains(e.target) && e.target !== owner) closeSel(false); });
  addEventListener('mousedown', (e) => {
    const s = e.target.closest && e.target.closest('select'); if (!s || s.disabled) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (suppress === s) { suppress = null; return; } openSel(s);
  }, true);
  addEventListener('keydown', (e) => {
    const s = e.target; if (!s || s.tagName !== 'SELECT' || s.disabled) return;
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); openSel(s); }
  }, true);
  addEventListener('resize', () => closeSel(false));
  document.addEventListener('scroll', (e) => { if (m && !m.contains(e.target)) closeSel(false); }, true);

  /* ---------- 2) every other popup: one outside-click rule ---------- */
  const POPUPS = [
    ['.ddm:not([hidden])', '.dd', (x) => { x.hidden = true; }],
    ['#wsMenu:not([hidden])', '.ws', (x) => { x.hidden = true; }],
    ['#meMenu:not([hidden])', '.me', (x) => { x.hidden = true; }],
    ['#cEmo:not([hidden])', '#cEmo,[data-c=emoT]', (x) => { x.hidden = true; }],
    ['#ctx', '#ctx,[data-act=ctxBtn],[data-act=pgMore],[data-act=edMore]', (x) => { x.remove(); }]
  ];
  const closeOthers = (t) => { POPUPS.forEach(([sel, keep, fn]) => { $A(sel).forEach((x) => { if (!(t && t.closest && (x.contains(t) || t.closest(keep)))) fn(x); }); }); };
  addEventListener('pointerdown', (e) => closeOthers(e.target), true);
  addEventListener('hashchange', () => { closeSel(false); closeOthers(null); });
  addEventListener('blur', () => closeOthers(null));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOthers(null); }, true);

  /* ---------- 3) slide filmstrip ---------- */
  let folded = matchMedia('(max-width:700px)').matches; try { const v = localStorage.getItem('boga.pgsFolded'); if (v !== null) folded = v === '1'; } catch (e) {}
  /** Slide title: the biggest visible text (the headline, not the footer URL); the strip shows it on one line with "…", the tooltip has it whole */
  const fullLabel = (pg) => {
    const ts = (pg.layers || []).filter((l) => l.type === 'text' && !l.hidden && String(l.text || '').trim());
    if (!ts.length) return 'Empty slide';
    const t = ts.reduce((b, l) => ((l.size || 0) > (b.size || 0) ? l : b), ts[0]);
    return String(t.text).trim().replace(/\s+/g, ' ');
  };
  const label = (pg) => fullLabel(pg);
  let dragFrom = -1;

  edPages = function () {
    const host = $1('#edPages'); if (!host) return; const d = ED.d, n = d.pages.length, old = $1('.pgs-track', host), sl = old ? old.scrollLeft : 0, stage = host.closest('.ed-stage');
    if (stage) stage.dataset.pgs = folded ? 'c' : 'o';
    const cards = d.pages.map((pg, i) => `<div class="pg ${i === ED.pi ? 'on' : ''}" role="tab" aria-selected="${i === ED.pi}" draggable="true">
        <button class="pg-th" data-act="edPage" data-i="${i}" title="Slide ${i + 1} · ${E(label(pg))}" aria-label="Slide ${i + 1}: ${E(label(pg))}" tabindex="${i === ED.pi ? 0 : -1}">${thumb(pg, d.ratio, 100, 86)}</button>
        <span class="pg-n">${i + 1}</span>
        <div class="pg-act"><button data-act="pgDup" data-i="${i}" title="Duplicate slide" aria-label="Duplicate slide ${i + 1}">${ic('copy', 13)}</button>${n > 1 ? `<button data-act="pgDel" data-i="${i}" title="Delete slide" aria-label="Delete slide ${i + 1}">${ic('trash', 13)}</button>` : ''}<button data-act="pgMore" data-i="${i}" title="More" aria-label="More actions for slide ${i + 1}" aria-haspopup="menu">${ic('more', 13)}</button></div>
        <button class="pg-ins" data-act="pgAddAfter" data-i="${i}" title="Add slide after ${i + 1}" aria-label="Add slide after ${i + 1}">${ic('plus', 13)}</button>
        <span class="pg-lab" title="${E(label(pg))}">${E(label(pg))}</span>
      </div>`).join('');
    host.innerHTML = `<div class="pgs-head">
        <span class="ttl">${ic('slides', 16)}<span class="t">Slides</span><span class="cnt">${n}</span></span><span class="sp"></span>
        <span class="pgs-pager"><button data-act="pgStep" data-n="-1" title="Previous slide (PageUp)" aria-label="Previous slide" ${ED.pi === 0 ? 'disabled' : ''}>${ic('chevL', 16)}</button><span aria-live="polite">${ED.pi + 1} / ${n}</span><button data-act="pgStep" data-n="1" title="Next slide (PageDown)" aria-label="Next slide" ${ED.pi >= n - 1 ? 'disabled' : ''}>${ic('chevR', 16)}</button></span>
        <button class="add" data-act="edAddPage" title="Add slide">${ic('plus', 15)}<span>Add slide</span></button>
        <button class="tb fold" data-act="pgFold" title="${folded ? 'Show slides' : 'Hide slides'}" aria-label="${folded ? 'Show slides' : 'Hide slides'}" aria-expanded="${!folded}">${ic('chevD', 16)}</button>
      </div>
      <div class="pgs-track" role="tablist" aria-label="Slides">${cards}<button class="pg-add" data-act="edAddPage" style="height:86px" title="Add slide">${ic('plus', 16)}<span>New slide</span></button></div>`;
    const tr = $1('.pgs-track', host); if (tr) { tr.scrollLeft = sl; const on = $1('.pg.on', tr); if (on) { const a = on.offsetLeft - 24, b = on.offsetLeft + on.offsetWidth + 24; if (a < tr.scrollLeft) tr.scrollLeft = a; else if (b > tr.scrollLeft + tr.clientWidth) tr.scrollLeft = b - tr.clientWidth; } }
  };

  const addBlank = (at) => { const [w, h] = dim(); mutate(() => { ED.d.pages.splice(at, 0, { id: uid(), bg: '#0b1220', layers: TPL.blank.fn(w, h) }); ED.pi = at; ED.sel = null; }); };
  const dupAt = (i) => mutate(() => { const c = reIdPage(JSON.parse(JSON.stringify(ED.d.pages[i]))); c.id = uid(); ED.d.pages.splice(i + 1, 0, c); ED.pi = i + 1; ED.sel = null; });
  const delAt = (i) => { if (ED.d.pages.length < 2) return toast('A design needs at least one slide'); mutate(() => { ED.d.pages.splice(i, 1); ED.pi = clamp(ED.pi > i ? ED.pi - 1 : Math.min(ED.pi, ED.d.pages.length - 1), 0, ED.d.pages.length - 1); ED.sel = null; }); };
  const moveAt = (i, to) => { if (to < 0 || to >= ED.d.pages.length) return; mutate(() => { const [x] = ED.d.pages.splice(i, 1); ED.d.pages.splice(to, 0, x); ED.pi = to; ED.sel = null; }); };
  const go = (i) => { i = clamp(i, 0, ED.d.pages.length - 1); if (i !== ED.pi) ACT.edPage({ dataset: { i } }); };
  const foldTo = (v) => { folded = v; try { localStorage.setItem('boga.pgsFolded', v ? '1' : '0'); } catch (e) {} edPages(); if (ED.fit) requestAnimationFrame(() => { fitZoom(); }); };

  function slideMenu(btn) {
    const i = +btn.dataset.i, n = ED.d.pages.length, r = btn.getBoundingClientRect();
    $A('#ctx').forEach((x) => x.remove());
    const rows = [['Duplicate', 'copy', () => dupAt(i)], ['Add slide after', 'plus', () => addBlank(i + 1)], '-', ['Move left', 'moveL', () => moveAt(i, i - 1), i === 0], ['Move right', 'moveR', () => moveAt(i, i + 1), i === n - 1], '-', ['Delete', 'trash', () => delAt(i), n < 2, 'dng']];
    const c = document.createElement('div'); c.className = 'ctx'; c.id = 'ctx'; c.setAttribute('role', 'menu');
    c.innerHTML = rows.map((x, k) => (x === '-' ? '<hr>' : `<button role="menuitem" data-k="${k}" class="${x[4] || ''}" ${x[3] ? 'disabled' : ''}><span class="ci">${ic(x[1], 16)}${x[0]}</span></button>`)).join('');
    document.body.append(c); const h = c.offsetHeight, w = c.offsetWidth;
    c.style.minWidth = '190px'; c.style.left = clamp(r.left - w + r.width, 8, innerWidth - w - 8) + 'px'; c.style.top = clamp(r.top - h - 6 > 8 ? r.top - h - 6 : r.bottom + 6, 8, innerHeight - h - 8) + 'px';
    c.onclick = (e) => { const b = e.target.closest('button'); if (b && !b.disabled) { c.remove(); rows[+b.dataset.k][2](); } };
    const f = c.querySelector('button:not(:disabled)'); f && f.focus();
    c.onkeydown = (e) => { e.stopPropagation(); const bs = $A('button:not(:disabled)', c), j = bs.indexOf(document.activeElement); if (e.key === 'ArrowDown') { e.preventDefault(); bs[(j + 1) % bs.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(j - 1 + bs.length) % bs.length].focus(); } else if (e.key === 'Escape') { e.preventDefault(); c.remove(); btn.isConnected && btn.focus(); } };
  }
  Object.assign(ACT, {
    pgDup: (a) => dupAt(+a.dataset.i), pgDel: (a) => delAt(+a.dataset.i), pgAddAfter: (a) => addBlank(+a.dataset.i + 1),
    pgStep: (a) => go(ED.pi + +a.dataset.n), pgFold: () => foldTo(!folded), pgMore: (a) => slideMenu(a), edAddPage: () => addBlank(ED.d.pages.length)
  });

  /* keyboard: roving focus inside the strip, PageUp / PageDown anywhere in the editor */
  document.addEventListener('keydown', (e) => {
    if (!$1('.ed') || !ED.d) return; const t = e.target, tag = (t.tagName || '').toLowerCase();
    if (t.closest && t.closest('#edPages .pgs-track') && t.classList.contains('pg-th')) {
      const i = +t.dataset.i;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); go(i + (e.key === 'ArrowRight' ? 1 : -1)); setTimeout(() => { const b = $1('#edPages .pg.on .pg-th'); b && b.focus(); }); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delAt(i); return; }
    }
    if (['input', 'textarea', 'select'].includes(tag) || t.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'PageDown') { e.preventDefault(); go(ED.pi + 1); } else if (e.key === 'PageUp') { e.preventDefault(); go(ED.pi - 1); }
  });
  /* mouse wheel scrolls the strip sideways */
  document.addEventListener('wheel', (e) => { const tr = e.target.closest && e.target.closest('.pgs-track'); if (tr && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); tr.scrollLeft += e.deltaY; } }, { passive: false });
  /* drag to reorder: drop line shows the side the slide will land on */
  document.addEventListener('dragstart', (e) => { const p = e.target.closest && e.target.closest('#edPages .pg'); if (p) dragFrom = +p.querySelector('[data-i]').dataset.i; });
  document.addEventListener('dragover', (e) => { const p = e.target.closest && e.target.closest('#edPages .pg'); $A('#edPages .dropL,#edPages .dropR').forEach((x) => x !== p && x.classList.remove('dropL', 'dropR')); if (p && dragFrom > -1) { const to = +p.querySelector('[data-i]').dataset.i; p.classList.toggle('dropL', to < dragFrom); p.classList.toggle('dropR', to > dragFrom); } });
  document.addEventListener('dragend', () => { dragFrom = -1; $A('#edPages .dropL,#edPages .dropR').forEach((x) => x.classList.remove('dropL', 'dropR')); });
  document.addEventListener('drop', () => { dragFrom = -1; });
  if ($1('#edPages')) edPages();
})();

/* ============ v12 · slider fill sync ============ */
/* v12 · keep the slider fill in sync (value changes from user input or from code) */
(function(){
  const paint=(r)=>{const mn=+r.min||0,mx=r.max===''?100:+r.max,v=+r.value;const p=mx>mn?Math.min(100,Math.max(0,(v-mn)/(mx-mn)*100)):0;const t=p.toFixed(1)+'%';if(r.style.getPropertyValue('--p')!==t)r.style.setProperty('--p',t);};
  const all=()=>document.querySelectorAll('input[type=range]').forEach(paint);
  let q=0;const sched=()=>{if(q)return;q=requestAnimationFrame(()=>{q=0;all();});};
  document.addEventListener('input',(e)=>{if(e.target.type==='range')paint(e.target);},true);
  new MutationObserver(sched).observe(document.body,{childList:true,subtree:true});
  addEventListener('pointerup',sched,true);all();
})();

/* ============ v13 · responsive editor ============ */
/* v13 · responsive editor behaviour */
(function () {
  const $1 = (s, r = document) => r.querySelector(s), $A = (s, r = document) => [...r.querySelectorAll(s)];
  const mq = { mobile: matchMedia('(max-width:700px)'), narrow: matchMedia('(max-width:1099px)') };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  IC.more2 = IC.more2 || IC.more;

  /* 1) fit the canvas with less padding on small screens */
  fitZoom = function () { const s = $1('#edScroll'); if (!s) return; const [w, h] = dim(), pad = mq.mobile.matches ? 40 : mq.narrow.matches ? 72 : 96; ED.zoom = clamp(Math.min((s.clientWidth - pad) / w, (s.clientHeight - pad) / h), 0.1, 1.5); applyZoom(); drawSel(); };
  let rt = 0; const refit = () => { clearTimeout(rt); rt = setTimeout(() => { if ($1('.ed') && ED.fit) fitZoom(); const b = $1('#ftb'); b && !b.hidden && drawSel(); }, 120); };
  addEventListener('resize', refit); addEventListener('orientationchange', refit);
  if (window.visualViewport) visualViewport.addEventListener('resize', refit);

  /* 2) wrap button labels so CSS can hide them, add the overflow menu, scrim, done button */
  const tidy = () => {
    const top = $1('.ed-top'); if (!top) return;
    $A('.btn', top).forEach((b) => { [...b.childNodes].forEach((n) => { if (n.nodeType === 3 && n.textContent.trim()) { const s = document.createElement('span'); s.className = 'lbl'; s.textContent = n.textContent.trim(); n.replaceWith(s); } }); });
    if (!$1('.ed-more', top)) { const ex = $1('[data-act=edExport]', top); ex && ex.insertAdjacentHTML('beforebegin', `<button class="btn ghost icon sm ed-more" data-act="edMore" title="More" aria-label="More actions" aria-haspopup="menu">${ic('more', 18)}</button>`); }
    const ed = $1('.ed'); if (ed && !$1('.ed-scrim', ed)) { ed.insertAdjacentHTML('beforeend', '<div class="ed-scrim" id="edScrim"></div>'); }
    if (ed && !$1('.ftb-done', ed)) ed.insertAdjacentHTML('beforeend', `<button class="ftb-done" data-act="edDeselect" title="Done" aria-label="Done">${ic('check', 18)}</button>`);
  };
  new MutationObserver(() => { if ($1('.ed') && (!$1('.ed-more') || !$1('.ed-scrim') || $A('.ed-top .btn').some((b) => [...b.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())))) tidy(); }).observe(document.body, { childList: true, subtree: true });

  /* 3) drawers / sheets: scrim, tap-to-close, Esc, tap active tool again to close */
  const panel = () => $1('#edPanel'), props = () => $1('#edProps');
  const anyOpen = () => { const p = panel(), r = props(); return !!(mq.narrow.matches && ((p && p.classList.contains('open')) || (r && r.classList.contains('open')))); };
  const sync = () => { const s = $1('#edScrim'); s && s.classList.toggle('on', anyOpen()); };
  const closeAllSheets = () => { [panel(), props()].forEach((x) => x && x.classList.remove('open')); sync(); };
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  document.addEventListener('click', (e) => { if (e.target.id === 'edScrim') closeAllSheets(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && anyOpen() && !$1('.dmenu,.cp,#ctx')) closeAllSheets(); });
  /* tapping the active tool closes the drawer (like Canva); switching tools while one is open keeps it open */
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-act=edTab]'); if (!b || !mq.narrow.matches) return;
    const p = panel(); if (p && p.classList.contains('open') && b.classList.contains('on')) { e.stopImmediatePropagation(); closeAllSheets(); }
  }, true);
  /* opening one drawer closes the other (tablet) */
  const _tab = ACT.edTab, _props = ACT.edProps;
  ACT.edTab = function (a) { if (mq.narrow.matches) { const r = props(); r && r.classList.remove('open'); } return _tab.apply(this, arguments); };
  ACT.edProps = function () { if (mq.narrow.matches) { const p = panel(); p && p.classList.remove('open'); } return _props.apply(this, arguments); };
  /* picking something on the canvas dismisses the left drawer on phones */
  document.addEventListener('pointerdown', (e) => { if (!mq.mobile.matches) return; if (e.target.closest && e.target.closest('#edScroll')) { const p = panel(); p && p.classList.remove('open'); sync(); } }, true);
  /* swipe a sheet down (from its top edge) / drawer sideways to close */
  let sw = null;
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !anyOpen()) return; const el = e.target.closest && e.target.closest('#edPanel.open,#edProps.open'); if (!el) return;
    const r = el.getBoundingClientRect(); if (mq.mobile.matches ? e.clientY - r.top > 34 : false) return;
    sw = { el, x: e.clientX, y: e.clientY, id: e.pointerId, dy: 0 };
  }, true);
  document.addEventListener('pointermove', (e) => { if (!sw || e.pointerId !== sw.id) return; sw.dy = e.clientY - sw.y; if (sw.dy > 0) { sw.el.style.transition = 'none'; sw.el.style.transform = `translateY(${sw.dy}px)`; } });
  const endSw = (e) => { if (!sw || e.pointerId !== sw.id) return; const el = sw.el, dy = sw.dy; sw = null; el.style.transition = ''; el.style.transform = ''; if (dy > 90) closeAllSheets(); };
  document.addEventListener('pointerup', endSw); document.addEventListener('pointercancel', endSw);

  /* 4) overflow menu for the phone top bar */
  const clickSel = (s) => () => { const b = $1(s); b && b.click(); };
  Object.assign(ACT, {
    edDeselect: () => { try { setSel([]); } catch (e) { ED.sel = null; drawSel(); } },
    edMore: (a) => {
      const old = $1('#ctx'); if (old) old.remove(); if (moreWas) { moreWas = false; return; }
      const r = a.getBoundingClientRect(), rows = [
        ['Zoom in', 'plus', clickSel('.ed-top [data-act=edZoom][data-n="0.1"]')], ['Zoom out', 'minus', clickSel('.ed-top [data-act=edZoom][data-n="-0.1"]')], ['Fit to screen', 'frame', () => ACT.edFit()], '-',
        ['Safe zones', 'frame', clickSel('#edSafe')], ['Grid overlay', 'grid', clickSel('#edGrid')], ['Search actions', 'search', clickSel('.ed-top [data-act=cmdk]')], ['Preview on networks', 'eye', clickSel('.ed-top [data-act=edPreview]')], ['Schedule', 'clock', clickSel('.ed-top [data-act=edSchedule]')]
      ];
      const c = document.createElement('div'); c.className = 'ctx'; c.id = 'ctx'; c.dataset.owner = 'more'; c.setAttribute('role', 'menu');
      c.innerHTML = rows.map((x, k) => (x === '-' ? '<hr>' : `<button role="menuitem" data-k="${k}"><span class="ci">${ic(x[1], 16)}${x[0]}</span></button>`)).join('');
      document.body.append(c); c.style.minWidth = '210px'; const w = c.offsetWidth;
      c.style.left = clamp(r.right - w, 8, innerWidth - w - 8) + 'px'; c.style.top = r.bottom + 6 + 'px';
      c.onclick = (e) => { const b = e.target.closest('button'); if (b) { c.remove(); rows[+b.dataset.k][2](); } };
    }
  });
  /* keep the menu's trigger from being treated as an "outside" click */
  let moreWas = false; addEventListener('pointerdown', (e) => { const b = e.target.closest && e.target.closest('[data-act=edMore]'); moreWas = !!(b && $1('#ctx[data-owner=more]')); }, true);

  /* 5) body flag while the contextual toolbar is visible */
  new MutationObserver(() => { const b = $1('#ftb'); document.body.classList.toggle('ftb-on', !!b && !b.hidden && mq.mobile.matches); }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['hidden'] });

  /* 6) touch gestures on the canvas: pinch to zoom, two fingers to pan, double-tap to edit text */
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return; const sc = e.target.closest && e.target.closest('#edScroll'); if (!sc) return;
    G.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (G.pts.size === 2) {
      /* end any one-finger drag cleanly, then take over */
      G.on = true; const [a, b] = [...G.pts.values()];
      G.syn = true; dispatchEvent(new PointerEvent('pointerup', { pointerId: [...G.pts.keys()][0], pointerType: 'touch', bubbles: true })); G.syn = false; G.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; G.z0 = ED.zoom; G.c0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; G.s0 = { l: sc.scrollLeft, t: sc.scrollTop };
    }
    if (G.on) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  const G = { pts: new Map(), on: false, d0: 1, z0: 1, c0: null, s0: null, tap: { t: 0, x: 0, y: 0, id: null } };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || !G.pts.has(e.pointerId)) return; G.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!G.on || G.pts.size < 2) return; e.stopImmediatePropagation(); e.preventDefault();
    const sc = $1('#edScroll'); if (!sc) return; const [a, b] = [...G.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, r = sc.getBoundingClientRect();
    const nz = clamp(G.z0 * d / G.d0, 0.1, 3), k = nz / G.z0; ED.fit = false; ED.zoom = nz; applyZoom(); drawSel();
    const fx = G.c0.x - r.left, fy = G.c0.y - r.top;
    sc.scrollLeft = (G.s0.l + fx) * k - fx - (c.x - G.c0.x); sc.scrollTop = (G.s0.t + fy) * k - fy - (c.y - G.c0.y);
  }, true);
  const lift = (e) => {
    if (e.pointerType !== 'touch' || G.syn) return; const had = G.pts.has(e.pointerId); G.pts.delete(e.pointerId);
    if (G.on) { if (G.pts.size === 0) G.on = false; e.stopImmediatePropagation(); return; }
    /* double tap on a text layer = edit (iOS does not fire dblclick) */
    const ly = had && e.target.closest && e.target.closest('.ly.text'); const now = Date.now();
    if (ly && now - G.tap.t < 350 && Math.hypot(e.clientX - G.tap.x, e.clientY - G.tap.y) < 24) { G.tap.t = 0; ly.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: e.clientX, clientY: e.clientY })); }
    else if (ly) G.tap = { t: now, x: e.clientX, y: e.clientY };
  };
  addEventListener('pointerup', lift, true); addEventListener('pointercancel', lift, true);

  tidy();
})();

/* ============ v15 · blend modes, text alignment, layer alignment ============ */
(function () {
  Object.assign(IC, {
    aLeft: '<path d="M4 3v18"/><rect x="8" y="6" width="12" height="4" rx="1"/><rect x="8" y="14" width="7" height="4" rx="1"/>',
    aCenterH: '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>',
    aRight: '<path d="M20 3v18"/><rect x="4" y="6" width="12" height="4" rx="1"/><rect x="9" y="14" width="7" height="4" rx="1"/>',
    aTop: '<path d="M3 4h18"/><rect x="6" y="8" width="4" height="12" rx="1"/><rect x="14" y="8" width="4" height="7" rx="1"/>',
    aMiddle: '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>',
    aBottom: '<path d="M3 20h18"/><rect x="6" y="4" width="4" height="12" rx="1"/><rect x="14" y="9" width="4" height="7" rx="1"/>',
    drop: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  });
  /* Same list as Figma (Plus darker has no web equivalent) */
  const BLEND = [['normal', 'Normal'], '-', ['darken', 'Darken'], ['multiply', 'Multiply'], ['color-burn', 'Color burn'], '-', ['lighten', 'Lighten'], ['screen', 'Screen'], ['plus-lighter', 'Plus lighter'], ['color-dodge', 'Color dodge'], '-', ['overlay', 'Overlay'], ['soft-light', 'Soft light'], ['hard-light', 'Hard light'], '-', ['difference', 'Difference'], ['exclusion', 'Exclusion'], '-', ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity']];
  const LAYER_AL = [[['Left', 'aLeft', 'Align left'], ['Center', 'aCenterH', 'Align horizontal centers'], ['Right', 'aRight', 'Align right']], [['Top', 'aTop', 'Align top'], ['Middle', 'aMiddle', 'Align middle'], ['Bottom', 'aBottom', 'Align bottom']]];
  const VA = [['top', 'aTop', 'Align text to the top'], ['middle', 'aMiddle', 'Align text to the middle'], ['bottom', 'aBottom', 'Align text to the bottom']];
  const btn = (act, attrs, on, icon, title) => `<button class="${on ? 'on' : ''}" data-act="${act}" ${attrs} title="${title}" aria-label="${title}">${ic(icon, 18)}</button>`;

  const _epv = edProps;
  edProps = function () {
    const r = _epv.apply(this, arguments);
    const l = curL(), b = $('#edProps .body'), first = b && b.querySelector('[data-act=edAlign]');
    if (!l || ED.rtab !== 'design' || !first) return r; // nothing selected, layers tab, or several layers selected
    // 1) alignment of the layer on the page: icons like Figma's Position → Alignment
    const blk = first.closest('.chips').parentElement;
    blk.innerHTML = `<span class="label">Align to page</span><div class="alrow">${LAYER_AL.map((g) => `<div class="seg">${g.map(([o, i, t]) => btn('edAlign', `data-o="${o}"`, false, i, t)).join('')}</div>`).join('')}</div>`;
    // 2) text: vertical alignment next to the horizontal one
    const al = b.querySelector('[data-act=edAl]');
    if (l.type === 'text' && al) al.parentElement.insertAdjacentHTML('afterend', `<div><span class="label">Vertical alignment</span><div class="seg">${VA.map(([v, i, t]) => btn('edVa', `data-v="${v}"`, (l.va || 'top') === v, i, t)).join('')}</div></div>`);
    // 3) blend mode, under opacity
    const op = b.querySelector('input[data-p=op]');
    if (op) op.closest('label').insertAdjacentHTML('afterend', `<label class="lab">Blend mode<select class="field sm" data-p="blend">${BLEND.map((x) => (x === '-' ? '<option disabled>──────────</option>' : `<option value="${x[0]}" ${(l.blend || 'normal') === x[0] ? 'selected' : ''}>${x[1]}</option>`)).join('')}</select></label>`);
    return r;
  };
  ACT.edVa = (a) => { const l = curL(); if (!l || l.type !== 'text') return; mutate(() => { if (a.dataset.v === 'top') delete l.va; else l.va = a.dataset.v; }); };
  // the Ctrl K palette
})();

/* ============ v16 · image adjustments, gradients with stop opacity, dropdown menus ============ */
(function () {
  const r1 = (n) => Math.round(n * 10) / 10;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  /* ---------- gradients: any number of stops, each with its own opacity (like Figma) ---------- */
  const splitTop = (str) => { const out = []; let d = 0, cur = ''; for (const ch of str) { if (ch === '(') d++; else if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
  const colOf = (v) => {
    v = String(v || '').trim().toLowerCase(); if (v === 'transparent') return { c: '#000000', o: 0 };
    let m = /^#([0-9a-f]{3,8})$/.exec(v);
    if (m) { let h = m[1]; if (h.length <= 4) h = h.split('').map((x) => x + x).join(''); return { c: '#' + h.slice(0, 6), o: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 }; }
    m = /^rgba?\(([^)]*)\)$/.exec(v);
    if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return { c: '#' + p.slice(0, 3).map((n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')).join(''), o: p.length > 3 ? clamp(p[3], 0, 1) : 1 }; }
    return null;
  };
  const cssCol = (c, o) => (o >= 0.999 ? c.toUpperCase() : `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${Math.round(clamp(o, 0, 1) * 1000) / 1000})`);
  /** One CSS gradient → { kind, a (deg), head (radial/conic shape), s: [{ c, o, p }] }, or null */
  function gParse(css) {
    const top = splitTop(String(css || '')); if (top.length !== 1) return null;
    const m = /^(linear|radial|conic)-gradient\(([\s\S]*)\)$/i.exec(top[0]); if (!m) return null;
    const kind = m[1].toLowerCase(), parts = splitTop(m[2]); let a = 180, head = '';
    if (kind === 'linear') {
      const am = /^(-?[\d.]+)deg$/i.exec(parts[0] || ''), to = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 }[parts[0]];
      if (am) { a = +am[1]; parts.shift(); } else if (to != null) { a = to; parts.shift(); }
    } else if (parts[0] && !/^(#|rgba?\(|transparent)/i.test(parts[0])) head = parts.shift();
    const s = parts.map((p) => { const mm = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|transparent)\s*(?:(-?[\d.]+)%)?/i.exec(p); const c = mm && colOf(mm[1]); return c ? { ...c, p: mm[2] != null ? +mm[2] : null } : null; });
    if (s.length < 2 || s.some((x) => !x)) return null;
    s.forEach((x, i) => { if (x.p == null) x.p = (i / (s.length - 1)) * 100; });
    return { kind, a: ((Math.round(a) % 360) + 360) % 360, head, s };
  }
  const gCss = (g, k = 1) => {
    const st = [...g.s].sort((x, y) => x.p - y.p).map((x) => `${cssCol(x.c, x.o * k)} ${r1(x.p)}%`).join(', ');
    return g.kind === 'linear' ? `linear-gradient(${Math.round(g.a)}deg, ${st})` : `${g.kind}-gradient(${g.head ? g.head + ', ' : ''}${st})`;
  };
  const CHECK = 'repeating-conic-gradient(#d4d4d8 0 25%,#fff 0 50%) 0 0/10px 10px';
  /** Overlay above an image fill (Figma: a gradient paint above the image paint) */
  /** Fills above an image (Figma's fill list, top first): { k: 'solid' | 'grad', v: hex or CSS gradient, o: opacity, h: hidden } */
  const ovItemCss = (it) => {
    const o = it.o ?? 1;
    if (it.k === 'solid') { const c = colOf(it.v) || { c: '#000000', o: 1 }, x = cssCol(c.c, c.o * o); return `linear-gradient(${x}, ${x})`; }
    if (o >= 0.999) return it.v; const g = gParse(it.v); return g ? gCss(g, o) : it.v;
  };
  const ovCss = (l) => (l.ovs || []).filter((x) => !x.h).map(ovItemCss).join(', ');

  /* ---------- image adjustments: Figma's sliders, baked into the image pixels ---------- */
  const FXK = [['exposure', 'Exposure'], ['contrast', 'Contrast'], ['saturation', 'Saturation'], ['temperature', 'Temperature'], ['tint', 'Tint'], ['highlights', 'Highlights'], ['shadows', 'Shadows']];
  const FXPRE = { Original: {}, 'B&W': { saturation: -100, contrast: 12 }, Warm: { temperature: 45, saturation: 12, exposure: 4 }, Cool: { temperature: -45, tint: -6 }, Vivid: { saturation: 45, contrast: 18 }, Fade: { contrast: -28, shadows: 35, saturation: -22 }, Dramatic: { contrast: 38, highlights: -30, shadows: -25, exposure: -6 } };
  const OLD_ADJ = ['bri', 'con', 'sat', 'gry', 'sep', 'hue'];
  const fxOn = (l) => !!(l && l.adj && FXK.some(([k]) => l.adj[k]));
  const fxSig = (fx) => FXK.map(([k]) => Math.round((fx && fx[k]) || 0)).join(',');
  const srcOf = (l) => { const m = /url\((['"]?)(data:image\/[^'")]+|https?:[^'")\s]+)\1\)/.exec(l.fill || ''); return m ? m[2] : null; };
  const FX_PREVIEW = 1000, FX_FULL = 2400;

  function fxPixels(p, fx) {
    const v = (k) => clamp((fx[k] || 0) / 100, -1, 1);
    const e = v('exposure'), c = v('contrast'), s = v('saturation'), t = v('temperature'), ti = v('tint'), hl = v('highlights'), sh = v('shadows');
    const gain = Math.pow(2, e * 1.2), gains = [gain * (1 + 0.16 * t + 0.04 * ti), gain * (1 - 0.14 * ti), gain * (1 - 0.16 * t + 0.04 * ti)];
    const [R, G, B] = gains.map((g) => { const a = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) a[i] = i * g; return a; });
    const slope = c >= 0 ? 1 + c * 0.9 : 1 + c * 0.75, T = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let x = i / 255;
      x += sh * 0.3 * 6.75 * x * (1 - x) * (1 - x); // shadows: lifts / deepens the darks
      x += hl * 0.3 * 6.75 * x * x * (1 - x); //       highlights: the brights
      T[i] = ((clamp(x, 0, 1) - 0.5) * slope + 0.5) * 255;
    }
    const S = 1 + s;
    for (let i = 0; i < p.length; i += 4) {
      let r = R[p[i]], g = G[p[i + 1]], b = B[p[i + 2]];
      if (S !== 1) {
        const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = y + (r - y) * S; g = y + (g - y) * S; b = y + (b - y) * S;
        r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
      }
      p[i] = T[r | 0]; p[i + 1] = T[g | 0]; p[i + 2] = T[b | 0];
    }
  }
  const IMGS = new Map();
  function loadImg(src) {
    if (IMGS.has(src)) return IMGS.get(src);
    const pr = new Promise((ok, no) => { const im = new Image(); if (/^https?:/.test(src)) im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = no; im.src = src; });
    IMGS.set(src, pr); if (IMGS.size > 8) IMGS.delete(IMGS.keys().next().value);
    pr.catch(() => IMGS.delete(src)); return pr;
  }
  async function fxBake(src, fx, max) {
    const img = await loadImg(src), nw = img.naturalWidth, nh = img.naturalHeight; if (!nw || !nh) throw new Error('empty image');
    const k = Math.min(1, max / Math.max(nw, nh)), w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h); fxPixels(d.data, fx); x.putImageData(d, 0, 0); // throws for images without CORS
    const alpha = /^data:image\/(png|webp|gif)/i.test(src) || /\.png(\?|$)/i.test(src);
    const blob = await new Promise((r) => c.toBlob(r, alpha ? 'image/png' : 'image/jpeg', 0.92));
    const out = await new Promise((r, j) => { const f = new FileReader(); f.onload = () => r(f.result); f.onerror = j; f.readAsDataURL(blob); });
    return { out, whole: k === 1 };
  }
  // cache: "<layer id>|<values>" → { src, out, full }; the last result per layer shows while the next one renders
  const FXC = new Map(), FXLAST = new Map(), FXP = new Map(), FXR = new Set(), FXL = new Map(), FXT = new Map();
  const put = (key, v) => { FXC.delete(key); FXC.set(key, v); while (FXC.size > 40) FXC.delete(FXC.keys().next().value); };
  function fxPaint(id) { const l = FXL.get(id); if (!l) return; document.querySelectorAll(`.ly[data-id="${id}"]`).forEach((el) => { el.style.cssText = lstyle(l); }); }
  function fxQueue(id, src, fx, full) { FXP.set(id, { src, fx: { ...fx }, sig: fxSig(fx), full }); if (!FXR.has(id)) fxLoop(id); }
  async function fxLoop(id) {
    FXR.add(id);
    try {
      while (FXP.has(id)) {
        const j = FXP.get(id), key = id + '|' + j.sig; FXP.delete(id);
        const c = FXC.get(key); if (c && c.src === j.src && (c.full || !j.full)) continue;
        let r = null; try { r = await fxBake(j.src, j.fx, j.full ? FX_FULL : FX_PREVIEW); } catch (e) { r = null; }
        put(key, { src: j.src, out: r && r.out, full: j.full || !r || r.whole });
        if (r) FXLAST.set(id, key);
        fxPaint(id);
        if (r && !j.full && !r.whole) { // sharp version once the slider rests
          clearTimeout(FXT.get(id));
          FXT.set(id, setTimeout(() => { const l = FXL.get(id); if (l && fxSig(l.adj) === j.sig && srcOf(l) === j.src) fxQueue(id, j.src, j.fx, true); }, 450));
        }
      }
    } finally { FXR.delete(id); }
  }
  /** Processed image for a layer: { src, out } to swap in, { fail } when the pixels can't be read, or null while it renders */
  function fxUse(l) {
    const src = srcOf(l); if (!src) return null;
    FXL.set(l.id, l);
    const key = l.id + '|' + fxSig(l.adj), c = FXC.get(key);
    if (c && c.src === src) return c.out ? { src, out: c.out } : { fail: true };
    fxQueue(l.id, src, l.adj, false);
    const p = FXC.get(FXLAST.get(l.id));
    return p && p.src === src && p.out ? { src, out: p.out } : null;
  }
  /** Export and publishing: every adjusted image at full resolution first */
  fxReady = async (pg) => {
    for (const l of (pg && pg.layers) || []) {
      if (!fxOn(l) || l.type === 'text' || l.icon) continue;
      const src = srcOf(l); if (!src) continue;
      const key = l.id + '|' + fxSig(l.adj), c = FXC.get(key);
      if (c && c.src === src && c.full) continue;
      let r = null; try { r = await fxBake(src, l.adj, FX_FULL); } catch (e) { r = null; }
      put(key, { src, out: r && r.out, full: true }); if (r) FXLAST.set(l.id, key);
    }
  };
  // when the pixels can't be read (an image from another site without CORS), CSS filters come close
  const fxFallback = (fx) => { const v = (k) => (fx[k] || 0) / 100; return `brightness(${r1(Math.pow(2, v('exposure') * 1.2) * 100)}%) contrast(${r1(100 + v('contrast') * 80)}%) saturate(${r1(100 + v('saturation') * 100)}%)` + (v('temperature') > 0 ? ` sepia(${r1(v('temperature') * 30)}%)` : ''); };

  const _ls16 = lstyle;
  lstyle = function (l) {
    migrateLayer(l);
    let s = _ls16(l);
    if (l.type === 'text' || l.icon || typeof l.fill !== 'string') return s;
    let bg = l.fill;
    if (fxOn(l) && /url\(/.test(bg)) {
      const u = fxUse(l);
      if (u && u.out) bg = bg.replace(u.src, () => u.out);
      else if (u && u.fail && !/filter:/.test(s)) s += `filter:${fxFallback(l.adj)};`;
    }
    if (l.ovs && l.ovs.some((x) => !x.h)) bg = `${ovCss(l)}, ${bg}`;
    if (bg !== l.fill) { const k = `background:${l.fill};`, i = s.indexOf(k); if (i >= 0) s = s.slice(0, i) + `background:${bg};` + s.slice(i + k.length); }
    return s;
  };

  /* ---------- dropdown menus (Figma style): grouped list, check on the current value, live preview on hover ---------- */
  const DD = {};
  let ddOpen = null;
  const ddBtn = (key, label, icon, style) => `<button type="button" class="dd8b" data-act="dd8" data-k="${key}" aria-haspopup="listbox"${style ? ` style="${style}"` : ''}>${icon ? ic(icon, 16) : ''}<span class="v">${esc(label)}</span>${ic('chevD', 14)}</button>`;
  function ddClose(apply) {
    if (!ddOpen) return; const o = ddOpen; ddOpen = null;
    o.menu.remove(); removeEventListener('pointerdown', o.out, true); removeEventListener('keydown', o.key, true); removeEventListener('resize', o.out2); o.anchor.classList.remove('open'); o.anchor.setAttribute('aria-expanded', 'false');
    if (!apply && o.spec.preview) o.spec.preview(null);
  }
  function ddOpenMenu(anchor, spec) {
    if (ddOpen && ddOpen.anchor === anchor) return ddClose();
    ddClose();
    const m = document.createElement('div'); m.className = 'dd8m'; m.setAttribute('role', 'listbox');
    m.innerHTML = spec.items.map((it) => (it === '-' ? '<div class="sep" role="separator"></div>' : `<button type="button" role="option" data-v="${esc(String(it[0]))}" class="${String(it[0]) === String(spec.cur) ? 'on' : ''}" aria-selected="${String(it[0]) === String(spec.cur)}"${it[2] ? ` style="${it[2]}"` : ''}${it[3] ? ' disabled' : ''}><span class="ck">${ic('check', 14)}</span><span class="t">${esc(it[1])}</span></button>`)).join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(), mw = Math.max(r.width, spec.minW || 190), below = innerHeight - r.bottom - 12, above = r.top - 12;
    m.style.minWidth = mw + 'px'; m.style.left = clamp(r.left, 8, innerWidth - mw - 8) + 'px';
    const h = m.scrollHeight;
    if (below >= Math.min(h, 260) || below >= above) { m.style.top = r.bottom + 6 + 'px'; m.style.maxHeight = below + 'px'; } else { m.style.bottom = innerHeight - r.top + 6 + 'px'; m.style.maxHeight = above + 'px'; }
    const opts = () => [...m.querySelectorAll('button:not([disabled])')];
    let act = m.querySelector('button.on') || opts()[0];
    const focus = (b) => { opts().forEach((x) => x.classList.toggle('hl', x === b)); act = b; if (b) { b.scrollIntoView({ block: 'nearest' }); spec.preview && spec.preview(b.dataset.v); } };
    if (act) { act.classList.add('hl'); act.scrollIntoView({ block: 'center' }); }
    m.addEventListener('pointerover', (e) => { const b = e.target.closest('button:not([disabled])'); if (b && b !== act) focus(b); });
    m.addEventListener('pointerleave', () => { spec.preview && spec.preview(null); });
    m.addEventListener('click', (e) => { const b = e.target.closest('button:not([disabled])'); if (!b) return; ddClose(true); spec.pick(b.dataset.v); });
    const out = (e) => { if (!m.contains(e.target) && !anchor.contains(e.target)) ddClose(); };
    const key = (e) => {
      const list = opts(), i = list.indexOf(act);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ddClose(); anchor.focus(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); focus(list[clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, list.length - 1)]); }
      else if (e.key === 'Enter' || e.key === ' ') { if (!act) return; e.preventDefault(); e.stopPropagation(); const v = act.dataset.v; ddClose(true); spec.pick(v); anchor.focus(); }
      else if (e.key === 'Tab') ddClose();
    };
    const out2 = () => ddClose();
    addEventListener('pointerdown', out, true); addEventListener('keydown', key, true); addEventListener('resize', out2);
    anchor.classList.add('open'); anchor.setAttribute('aria-expanded', 'true');
    ddOpen = { menu: m, anchor, spec, out, key, out2 };
  }
  ACT.dd8 = (a) => { const s = DD[a.dataset.k]; s && ddOpenMenu(a, s); };
  // the panel re-renders on every change: a menu left open would point at a removed button
  const _edp = edProps; edProps = function () { if (ddOpen && !document.body.contains(ddOpen.anchor)) ddClose(); return _edp.apply(this, arguments); };

  /* layer property menus: picking records one undo step; hovering previews on the canvas */
  const preview = (prop, conv = (v) => v) => (v) => {
    const l = curL(); if (!l) return; const el = elOf(l.id); if (!el) return;
    el.style.cssText = lstyle(v == null ? l : { ...l, [prop]: conv(v) });
  };
  const setProp = (prop, conv = (v) => v, after) => (v) => {
    const l = curL(); if (!l) return; const val = conv(v);
    if (RT.apply(prop, val)) return; // mixed text: selected characters, or every run
    if (l[prop] === val || (prop === 'blend' && val === 'normal' && !l.blend)) { refreshL(l); return; }
    mutate(() => { if (prop === 'blend' && val === 'normal') delete l.blend; else l[prop] = val; }, () => { edAll(); if (after) after(curL()); });
  };
  const BLEND = [['normal', 'Normal'], '-', ['darken', 'Darken'], ['multiply', 'Multiply'], ['color-burn', 'Color burn'], '-', ['lighten', 'Lighten'], ['screen', 'Screen'], ['plus-lighter', 'Plus lighter'], ['color-dodge', 'Color dodge'], '-', ['overlay', 'Overlay'], ['soft-light', 'Soft light'], ['hard-light', 'Hard light'], '-', ['difference', 'Difference'], ['exclusion', 'Exclusion'], '-', ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity']];
  const WEIGHTS = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold']];
  const textFit = (l) => { if (l && l.type === 'text') { fitText(l); drawSel(); } };

  /* ---------- image fit (Figma's Fill / Fit / Crop / Tile) ---------- */
  const imgPart = (fill) => { // [start, end) of the image's position/size after url(…)
    const i = fill.indexOf('url('); if (i < 0) return null; let d = 0, j = i;
    for (; j < fill.length; j++) { const ch = fill[j]; if (ch === '(') d++; else if (ch === ')') { d--; if (!d) break; } }
    let k = j + 1, dd = 0; for (; k < fill.length; k++) { const ch = fill[k]; if (ch === '(') dd++; else if (ch === ')') dd--; else if (ch === ',' && !dd) break; }
    return [j + 1, k];
  };
  const FITS = { fill: 'center/cover no-repeat', fit: 'center/contain no-repeat', stretch: 'center/100% 100% no-repeat', tile: '0 0/auto repeat' };
  const fitOf = (fill) => { const p = imgPart(fill || ''); const t = p ? fill.slice(p[0], p[1]) : ''; return /contain/.test(t) ? 'fit' : /100% 100%/.test(t) ? 'stretch' : /(^|\s)repeat\b/.test(t) && !/no-repeat/.test(t) ? 'tile' : /px/.test(t) ? 'crop' : 'fill'; };
  const setFit = (fill, mode) => { const p = imgPart(fill); return p ? fill.slice(0, p[0]) + ' ' + FITS[mode] + fill.slice(p[1]) : fill; };
  const FIT_ITEMS = (cur) => [['fill', 'Fill'], ['fit', 'Fit'], ['stretch', 'Stretch'], ['tile', 'Tile'], ...(cur === 'crop' ? ['-', ['crop', 'Crop (from Figma)']] : [])];

  /* ---------- panel pieces ---------- */
  const gEd = (target, g, note) => `<div class="ge8" data-gt="${target}">
      <div class="ge8-bar"><div class="ge8-grad" style="background:${gCss({ ...g, kind: 'linear', a: 90 })},${CHECK}"></div>${g.s.map((x, i) => `<button type="button" class="ge8-h" data-gi="${i}" style="left:${x.p}%;--c:${cssCol(x.c, x.o)}" title="Drag to move this color"></button>`).join('')}</div>
      ${note ? `<p class="xs-t muted">${note}</p>` : ''}
      ${g.kind === 'linear' ? `<label class="lab"><span>Angle <b class="av7">${g.a}°</b></span><input type="range" min="0" max="360" data-ga value="${g.a}"></label>` : ''}
      <div class="ge8-rows"><div class="ge8-hd"><span>Color</span><span>Position</span><span>Opacity</span><span></span></div>${g.s.map((x, i) => `<div class="ge8-row"><input type="color" data-gs="${i}:c" value="${x.c}"><label class="u8"><input class="field sm" type="number" min="0" max="100" data-gs="${i}:p" value="${Math.round(x.p)}"><i>%</i></label><label class="u8"><input class="field sm" type="number" min="0" max="100" data-gs="${i}:o" value="${Math.round(x.o * 100)}"><i>%</i></label><button type="button" class="btn ghost icon sm" data-act="geDel" data-i="${i}" title="Remove this color" ${g.s.length <= 2 ? 'disabled' : ''}>${ic('minus', 14)}</button></div>`).join('')}</div>
      <div class="chips"><button type="button" class="chip" data-act="geAdd">${ic('plus', 14)}Add color</button><button type="button" class="chip" data-act="geSwap">${ic('swapH', 14)}Reverse</button></div>
    </div>`;
  const OV_PRE = [['Fade to black', 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 100%)'], ['Fade to white', 'linear-gradient(180deg, rgba(255,255,255,0) 0%, #FFFFFF 100%)'], ['Top shade', 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 45%)'], ['Brand tint', null], ['Blue', 'linear-gradient(180deg, rgba(37,99,235,0) 30%, #1D4ED8 100%)']];
  const ovPresets = () => OV_PRE.map(([n, css]) => [n, css || `linear-gradient(180deg, ${cssCol(hex(edKit().colors[0] || '#fd0e35'), 0)} 0%, ${cssCol(hex(edKit().colors[0] || '#fd0e35'), 0.9)} 100%)`]);

  const swatch = (it) => (it.k === 'solid' ? `linear-gradient(90deg, ${cssCol((colOf(it.v) || { c: '#000000' }).c, 1)} 50%, ${cssCol((colOf(it.v) || { c: '#000000' }).c, it.o ?? 1)} 50%),${CHECK}` : `${it.v},${CHECK}`);
  const ovName = (it) => { if (it.k === 'solid') return String(it.v).replace('#', '').toUpperCase(); const g = gParse(it.v); return g && g.kind !== 'linear' ? g.kind[0].toUpperCase() + g.kind.slice(1) : 'Linear'; };
  function fillPanel(l) {
    const list = l.ovs || [], mode = fitOf(l.fill);
    const rows = list.map((it, i) => {
      const open = ED.ovOpen === i, g = it.k === 'grad' && gParse(it.v);
      let ed = '';
      if (open) {
        ed = `<div class="fl8-ed"><div class="seg"><button type="button" class="${it.k === 'solid' ? 'on' : ''}" data-act="ovKind" data-i="${i}" data-k="solid">Solid</button><button type="button" class="${it.k === 'grad' ? 'on' : ''}" data-act="ovKind" data-i="${i}" data-k="grad">Gradient</button></div>`
          + (it.k === 'solid'
            ? `<div class="fl8-solid"><input type="color" data-ovc="${i}" value="${(colOf(it.v) || { c: '#000000' }).c}"><span class="xs-t muted">Opacity is set in the row above.</span></div>`
            : (g ? gEd('ov:' + i, g, g.kind !== 'linear' ? 'Gradient from Figma: its shape is kept, colors are editable.' : '') : '<p class="xs-t muted">This gradient can’t be edited here.</p>')
              + `<div class="chips">${ovPresets().map(([n, c]) => `<button type="button" class="gp7" data-act="ovPre" data-i="${i}" data-c="${esc(c)}" style="background:${c},${CHECK}" title="${n}"></button>`).join('')}</div>`)
          + '</div>';
      }
      return `<div class="fl8-row${open ? ' open' : ''}${it.h ? ' off' : ''}"><button type="button" class="fl8-sw" data-act="ovOpen" data-i="${i}" style="background:${swatch(it)}" title="Edit fill"></button><button type="button" class="fl8-n" data-act="ovOpen" data-i="${i}">${esc(ovName(it))}</button><label class="u8"><input class="field sm" type="number" min="0" max="100" data-ovo="${i}" value="${Math.round((it.o ?? 1) * 100)}"><i>%</i></label><button type="button" class="btn ghost icon sm" data-act="ovEye" data-i="${i}" data-tip="${it.h ? 'Show fill' : 'Hide fill'}">${ic(it.h ? 'eyeOff' : 'eye', 15)}</button><button type="button" class="btn ghost icon sm" data-act="ovDel" data-i="${i}" data-tip="Remove fill">${ic('minus', 15)}</button></div>${ed}`;
    }).join('');
    return `<div class="fl8"><div class="row sp"><span class="label" style="margin:0">Fill</span><button type="button" class="btn ghost icon sm" data-act="ovAdd" data-tip="Add fill above the image">${ic('plus', 16)}</button></div>
      ${rows}<div class="fl8-row"><span class="fl8-sw img">${ic('image', 15)}</span><span class="fl8-n">Image</span>${ddBtn('fit', FIT_ITEMS(mode).find((x) => x !== '-' && x[0] === mode)[1])}</div></div>`;
  }
  function imagePanel(l) {
    const fx = l.adj || {}, any = fxOn(l);
    return `<div class="im8"><div class="row sp"><span class="label" style="margin:0">Image adjustments</span>${any ? `<button type="button" class="btn link sm" data-act="fxReset">Reset</button>` : ''}</div>
      <div class="chips">${Object.keys(FXPRE).map((k) => `<button type="button" class="chip${fxSig(fx) === fxSig(FXPRE[k]) ? ' on' : ''}" data-act="fxPre" data-k="${k}">${k}</button>`).join('')}</div>
      ${FXK.map(([k, n]) => `<label class="fx8" title="Double-click to reset"><span>${n}</span><input type="range" class="ctr ${k}" min="-100" max="100" data-fx="${k}" value="${fx[k] || 0}"><b>${fx[k] || 0}</b></label>`).join('')}
      <label class="btn secondary sm" style="cursor:pointer">${ic('upload', 16)}Replace image<input type="file" accept="image/*" id="rpl" hidden></label></div>`;
  }

  const _ep16 = edProps;
  edProps = function () {
    const r = _ep16.apply(this, arguments);
    const l = curL(), b = $('#edProps .body');
    if (!l || ED.rtab !== 'design' || !b || !b.querySelector('input[data-p=name]')) return r;
    if (ED.ovFor !== l.id) { ED.ovFor = l.id; ED.ovOpen = -1; }
    // blend mode, font and weight: menus instead of native selects
    const bs = b.querySelector('select[data-p=blend]');
    if (bs) {
      DD.blend = { items: BLEND, cur: l.blend || 'normal', pick: setProp('blend'), preview: preview('blend') };
      bs.closest('label').outerHTML = `<div class="lab">Blend mode${ddBtn('blend', BLEND.find((x) => x !== '-' && x[0] === (l.blend || 'normal'))[1], 'drop')}</div>`;
    }
    const fs = b.querySelector('select[data-p=font]');
    if (fs) {
      DD.font = { items: [...FONTS, ...(FONTS.includes(l.font) ? [] : [l.font])].map((f) => [f, f, `font-family:'${f}',sans-serif`]), cur: l.font, pick: setProp('font', (v) => v, textFit), preview: preview('font'), minW: 220 };
      fs.outerHTML = ddBtn('font', l.font, null, `font-family:'${l.font}',sans-serif`);
    }
    const ws = b.querySelector('select[data-p=weight]');
    if (ws) {
      DD.weight = { items: WEIGHTS.map(([w, n]) => [w, `${n} · ${w}`, `font-weight:${w}`]), cur: l.weight, pick: setProp('weight', (v) => +v, textFit), preview: preview('weight', (v) => +v) };
      ws.outerHTML = ddBtn('weight', (WEIGHTS.find(([w]) => w == l.weight) || [l.weight, String(l.weight)])[1]);
    }
    // shapes: gradient fill with stops and opacity
    const gm = b.querySelector('[data-act=gMode]');
    if (gm && /gradient/.test(l.fill)) {
      const blk = gm.closest('.grad7'), g = gParse(l.fill);
      [...blk.children].slice(2).forEach((c) => c.remove());
      blk.insertAdjacentHTML('beforeend', g ? gEd('fill', g, g.kind !== 'linear' ? 'Gradient from Figma: its shape is kept, colors are editable.' : '') : `<div class="grad-bar" style="background:${l.fill}"></div><p class="xs-t muted">Several gradients on one layer: pick Solid, then Gradient, to start a new one.</p>`);
    }
    // images: Figma-like Fill list (gradient above the image) and image adjustments
    const pre = b.querySelector('[data-act=imgPre]');
    if (pre) {
      const blk = pre.closest('.grad7'), mode = fitOf(l.fill);
      DD.fit = { items: FIT_ITEMS(mode), cur: mode, pick: (v) => { const x = curL(); if (!x || v === 'crop' || v === fitOf(x.fill)) return; mutate(() => { x.fill = setFit(x.fill, v); }); } };
      // Figma's order: Appearance (opacity, blend), then Fill and the image itself
      const after = b.querySelector('[data-k=blend]'), html = fillPanel(l) + imagePanel(l);
      blk.remove(); if (after) after.closest('.lab').insertAdjacentHTML('afterend', html); else b.insertAdjacentHTML('beforeend', html);
      // the plain color picker and document colors don't apply to an image
      [b.querySelector('input[data-p=fill]'), b.querySelector('.dc7')].forEach((x) => { const c = x && x.closest('.body > *'); c && c.remove(); });
    }
    return r;
  };

  /* ---------- actions ---------- */
  const fresh = () => { edProps(); edPages(); };
  const gTarget = (el) => (el.closest('.ge8') || {}).dataset?.gt;
  const ovAt = (l, t) => (String(t).startsWith('ov:') ? (l.ovs || [])[+t.slice(3)] : null);
  const gGet = (l, t) => { const it = ovAt(l, t); return gParse(it ? it.v : l.fill); };
  const gSet = (l, t, g) => { const css = gCss(g), it = ovAt(l, t); if (it) it.v = css; else l.fill = css; };
  const paintEd = (l, t, g) => { // live update of the editor's bar while dragging or typing
    const ed = $(`#edProps .ge8[data-gt="${t}"]`); if (!ed) return;
    ed.querySelector('.ge8-grad').style.background = `${gCss({ ...g, kind: 'linear', a: 90 })},${CHECK}`;
    ed.querySelectorAll('.ge8-h').forEach((h, i) => { const x = g.s[i]; if (x) { h.style.left = x.p + '%'; h.style.setProperty('--c', cssCol(x.c, x.o)); } });
    const it = ovAt(l, t); if (it) { const sw = $(`#edProps .fl8-sw[data-i="${t.slice(3)}"]`); sw && (sw.style.background = swatch(it)); }
  };
  Object.assign(ACT, {
    geDel: (a) => { const l = curL(), t = gTarget(a); if (!l) return; const g = gGet(l, t); if (!g || g.s.length <= 2) return; g.s.splice(+a.dataset.i, 1); mutate(() => gSet(l, t, g), () => { edAll(); }); },
    geAdd: (a) => {
      const l = curL(), t = gTarget(a); if (!l) return; const g = gGet(l, t); if (!g) return;
      const s = [...g.s].sort((x, y) => x.p - y.p); let gap = 0, at = 0; s.slice(1).forEach((x, i) => { if (x.p - s[i].p > gap) { gap = x.p - s[i].p; at = i; } });
      const A = s[at], B = s[at + 1], mix = (u, v) => Math.round((u + v) / 2), ca = hexRgb(A.c), cb = hexRgb(B.c);
      g.s.push({ c: '#' + ca.map((n, i) => mix(n, cb[i]).toString(16).padStart(2, '0')).join(''), o: (A.o + B.o) / 2, p: (A.p + B.p) / 2 });
      mutate(() => gSet(l, t, g));
    },
    geSwap: (a) => { const l = curL(), t = gTarget(a); if (!l) return; const g = gGet(l, t); if (!g) return; g.s.forEach((x) => { x.p = 100 - x.p; }); mutate(() => gSet(l, t, g)); },
    // like Figma: "+" adds a fill on top (black at 20%), click a row to edit it
    ovAdd: () => { const l = curL(); if (!l) return; ED.ovOpen = 0; mutate(() => { l.ovs = [{ k: 'solid', v: '#000000', o: 0.2 }, ...(l.ovs || [])]; }); },
    ovOpen: (a) => { const i = +a.dataset.i; ED.ovOpen = ED.ovOpen === i ? -1 : i; edProps(); },
    ovEye: (a) => { const l = curL(), it = l && (l.ovs || [])[+a.dataset.i]; if (!it) return; mutate(() => { if (it.h) delete it.h; else it.h = true; }); },
    ovDel: (a) => { const l = curL(); if (!l || !l.ovs) return; const i = +a.dataset.i; ED.ovOpen = -1; mutate(() => { l.ovs.splice(i, 1); if (!l.ovs.length) delete l.ovs; }); },
    ovPre: (a) => { const l = curL(), it = l && (l.ovs || [])[+a.dataset.i]; if (!it) return; mutate(() => { it.k = 'grad'; it.v = a.dataset.c; delete it.h; }); },
    ovKind: (a) => {
      const l = curL(), it = l && (l.ovs || [])[+a.dataset.i]; if (!it || it.k === a.dataset.k) return;
      mutate(() => {
        if (a.dataset.k === 'grad') { const c = (colOf(it.v) || { c: '#000000' }).c; it.v = `linear-gradient(180deg, ${cssCol(c, 0)} 0%, ${cssCol(c, 1)} 100%)`; }
        else { const g = gParse(it.v), st = g && [...g.s].sort((x, y) => y.o - x.o)[0]; it.v = st ? st.c : '#000000'; }
        it.k = a.dataset.k;
      });
    },
    fxPre: (a) => { const l = curL(); if (!l) return; mutate(() => { OLD_ADJ.forEach((k) => delete l[k]); const v = FXPRE[a.dataset.k]; if (Object.keys(v).length) l.adj = { ...v }; else delete l.adj; }); },
    fxReset: () => { const l = curL(); if (!l) return; mutate(() => { delete l.adj; OLD_ADJ.forEach((k) => delete l[k]); }); },
  });
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  document.addEventListener('input', (e) => {
    const t = e.target; if (!t.closest || !t.closest('#edProps')) return; const l = curL(); if (!l) return;
    if (t.dataset.fx !== undefined) {
      if (!ED.pre) ED.pre = snap();
      const k = t.dataset.fx, v = Math.round(clamp(+t.value || 0, -100, 100)), fx = { ...(l.adj || {}) };
      if (v) fx[k] = v; else delete fx[k];
      if (Object.keys(fx).length) l.adj = fx; else delete l.adj;
      OLD_ADJ.forEach((x) => delete l[x]);
      const n = t.parentElement.querySelector('b'); n && (n.textContent = v);
      refreshL(l); return;
    }
    if (t.dataset.ovo !== undefined || t.dataset.ovc !== undefined) {
      const it = (l.ovs || [])[+(t.dataset.ovo ?? t.dataset.ovc)]; if (!it) return; if (!ED.pre) ED.pre = snap();
      if (t.dataset.ovo !== undefined) it.o = clamp(+t.value || 0, 0, 100) / 100; else it.v = t.value;
      refreshL(l); const sw = $(`#edProps .fl8-sw[data-i="${t.dataset.ovo ?? t.dataset.ovc}"]`); sw && (sw.style.background = swatch(it));
      const n = sw && sw.parentElement.querySelector('.fl8-n'); if (n && it.k === 'solid') n.textContent = ovName(it);
      return;
    }
    const gt = gTarget(t); if (!gt || (t.dataset.ga === undefined && t.dataset.gs === undefined)) return;
    const g = gGet(l, gt); if (!g) return;
    if (!ED.pre) ED.pre = snap();
    if (t.dataset.ga !== undefined) { g.a = +t.value; const s = t.closest('label').querySelector('.av7'); s && (s.textContent = t.value + '°'); }
    else { const [i, f] = t.dataset.gs.split(':'), x = g.s[+i]; if (!x) return; if (f === 'c') x.c = t.value; else if (f === 'p') x.p = clamp(+t.value || 0, 0, 100); else x.o = clamp(+t.value || 0, 0, 100) / 100; }
    gSet(l, gt, g); refreshL(l); paintEd(l, gt, g);
  });
  // double-click an adjustment slider: back to 0
  document.addEventListener('dblclick', (e) => {
    const t = e.target.closest && e.target.closest('#edProps input[data-fx]'); if (!t) return;
    t.value = 0; t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // drag a color stop along the bar
  document.addEventListener('pointerdown', (e) => {
    const h = e.target.closest && e.target.closest('#edProps .ge8-h'); if (!h) return;
    const l = curL(), gt = gTarget(h); if (!l || !gt) return; const g = gGet(l, gt); if (!g) return;
    e.preventDefault(); const bar = h.parentElement.getBoundingClientRect(), i = +h.dataset.gi, pre = snap(); let moved = false;
    const mv = (ev) => { moved = true; g.s[i].p = Math.round(clamp((ev.clientX - bar.left) / bar.width * 100, 0, 100)); gSet(l, gt, g); refreshL(l); paintEd(l, gt, g); const n = $(`#edProps input[data-gs="${i}:p"]`); n && (n.value = g.s[i].p); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) { commit(pre); fresh(); } else { const c = $(`#edProps input[data-gs="${i}:c"]`); c && c.click(); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
})();

/* ============ v17 · properties panel in sections, rotation row (rotate 90°, flip), tooltips ============ */
(function () {
  Object.assign(IC, {
    rot90: '<path d="M12 3.5 20.5 12 12 20.5 3.5 12Z"/><path d="M15 2.5a9 9 0 0 1 4.5 3.5"/><path d="M19.5 2.5V6H16"/>',
    flipH: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 6 3 18h6Z"/><path d="M15 6l6 12h-6Z"/>',
    flipV: '<path d="M3 12h18" stroke-dasharray="2 2"/><path d="M6 9 18 3v6Z"/><path d="M6 15l12 6v-6Z"/>',
  });
  const SECTIONS = [['pos', 'Position'], ['text', 'Text'], ['look', 'Appearance'], ['fill', 'Fill'], ['image', 'Image'], ['stroke', 'Stroke'], ['fx', 'Effects'], ['more', 'More']];
  const KEY = 'boga.studio.closedSections';
  let closed;
  try { closed = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { closed = new Set(); }
  const saveClosed = () => { try { localStorage.setItem(KEY, JSON.stringify([...closed])); } catch (e) { /* private mode */ } };
  const has = (el, sel) => !!(el.matches && (el.matches(sel) || el.querySelector(sel)));
  const kindOf = (el) => {
    if (has(el, 'input[data-p=name]') || (el.matches('.note.warn') && has(el, '[data-act=edLock]'))) return 'head';
    if (has(el, '[data-act=edDel]')) return 'foot';
    if (has(el, '[data-act=edAlign]') || has(el, 'input[data-p=x]')) return 'pos';
    if (has(el, '[data-k=fx][data-act=xt]')) return 'drop'; // old Flip block: the rotation row replaces it
    if (has(el, 'textarea[data-p=text]') || has(el, '[data-k=font]') || has(el, 'input[data-p=size]') || has(el, '[data-act=edAl]') || has(el, '[data-act=edVa]') || has(el, '[data-k=b][data-act=xt]') || has(el, 'input[data-p=ls]')) return 'text';
    if (el.matches('.im8')) return 'image';
    if (has(el, 'input[data-p=color]') || has(el, '.dc7') || has(el, 'input[data-p=fill]') || el.matches('.grad7,.fl8')) return 'fill';
    if (has(el, 'input[data-p=op]') || has(el, 'input[data-p=r]') || has(el, '[data-k=blend]')) return 'look';
    if (has(el, 'input[data-p=stroke]') || has(el, '[data-k=nostroke]')) return 'stroke';
    if (has(el, 'input[data-p=shb]') || has(el, 'input[data-p=bl]')) return 'fx';
    return 'more';
  };
  const tipBtn = (attrs, on, icon, tip, kbd) => `<button type="button" class="${on ? 'on' : ''}" ${attrs} data-tip="${tip}"${kbd ? ` data-kbd="${kbd}"` : ''} aria-label="${tip}">${ic(icon, 18)}</button>`;

  const _ep17 = edProps;
  edProps = function () {
    const r = _ep17.apply(this, arguments);
    const l = curL(), b = $('#edProps .body');
    if (!l || ED.rtab !== 'design' || !b || !b.querySelector('input[data-p=name]') || b.classList.contains('sec9')) return r;
    // rotation row, like Figma: angle, rotate 90°, flip horizontal / vertical
    const rotIn = b.querySelector('input[data-p=rot]'), rotLab = rotIn && rotIn.closest('label');
    // the effects block is one wrapper: sort its parts one by one
    b.querySelectorAll(':scope > .xt').forEach((x) => { [...x.children].forEach((c) => x.before(c)); x.remove(); });
    const groups = {}; [...b.children].forEach((el) => { const k = kindOf(el); (groups[k] = groups[k] || []).push(el); });
    (groups.drop || []).forEach((el) => el.remove());
    const pos = groups.pos || [];
    if (rotLab) {
      rotLab.classList.add('rot9-in');
      const row = document.createElement('div'); row.className = 'rot9';
      row.innerHTML = `<span class="label">Rotation</span><div class="rot9-r"><div class="seg">${tipBtn('data-act="edRot90"', false, 'rot90', 'Rotate 90° right')}${tipBtn('data-act="xt" data-k="fx"', l.fx === true, 'flipH', 'Flip horizontal', '⇧H')}${tipBtn('data-act="xt" data-k="fy"', l.fy === true, 'flipV', 'Flip vertical', '⇧V')}</div></div>`;
      row.querySelector('.rot9-r').prepend(rotLab); pos.push(row);
    }
    // alignment buttons: same tooltips as the rotation row
    b.querySelectorAll('[data-act=edAlign][title],[data-act=edVa][title]').forEach((x) => { x.dataset.tip = x.title; x.removeAttribute('title'); });
    b.classList.add('sec9'); b.innerHTML = '';
    (groups.head || []).forEach((el) => b.append(el));
    SECTIONS.forEach(([k, title]) => {
      const els = k === 'pos' ? pos : groups[k]; if (!els || !els.length) return;
      const s = document.createElement('section'); s.className = 'ps9' + (closed.has(k) ? ' closed' : ''); s.dataset.sec = k;
      s.innerHTML = `<div class="ps9-h"><button type="button" class="ps9-t" data-act="psTog" data-k="${k}" aria-expanded="${!closed.has(k)}">${title}${ic('chevD', 14)}</button><span class="ps9-a"></span></div><div class="ps9-b"></div>`;
      const body = s.querySelector('.ps9-b'), act = s.querySelector('.ps9-a');
      els.forEach((el) => body.append(el));
      // section titles replace the blocks' own headings; their buttons move up next to the title
      const fh = body.querySelector('.fl8 > .row.sp, .im8 > .row.sp');
      if (fh) { fh.querySelectorAll('button').forEach((x) => act.append(x)); fh.remove(); }
      body.querySelectorAll(':scope > div > .label:first-child').forEach((lb) => { const t = lb.textContent.trim().toLowerCase(); if (t === title.toLowerCase() || (k === 'stroke' && t === 'border')) lb.remove(); });
      const blur = body.querySelector('input[data-p=bl]'); if (blur && blur.closest('label').firstChild.nodeType === 3) blur.closest('label').firstChild.textContent = 'Layer blur';
      b.append(s);
    });
    const foot = groups.foot || [];
    if (foot.length) { const f = document.createElement('div'); f.className = 'ps9-foot'; foot.forEach((el) => f.append(el)); b.append(f); }
    return r;
  };
  ACT.psTog = (a) => {
    const k = a.dataset.k, s = a.closest('.ps9'); if (!s) return;
    const now = !s.classList.contains('closed'); s.classList.toggle('closed', now); a.setAttribute('aria-expanded', String(!now));
    if (now) closed.add(k); else closed.delete(k); saveClosed();
  };
  ACT.edRot90 = () => { const l = curL(); if (!l || l.locked) return; mutate(() => { let v = Math.round(((l.rot || 0) + 90) % 360); if (v > 180) v -= 360; l.rot = v; }); };

  // Figma's shortcuts: Shift H / Shift V flip the selection
  addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('in-editor') || ED.editing || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, tag = (t.tagName || '').toLowerCase(); if (['input', 'textarea', 'select'].includes(tag) || t.isContentEditable || $('.modal-bg')) return;
    const k = String(e.key || '').toLowerCase(); if (k !== 'h' && k !== 'v') return;
    const p = curP(), ids = ED.ms && ED.ms.length > 1 ? ED.ms : ED.sel ? [ED.sel] : [];
    const ls = p.layers.filter((l) => ids.includes(l.id) && !l.locked); if (!ls.length) return;
    e.preventDefault(); const f = k === 'h' ? 'fx' : 'fy';
    // several layers flip as one block (like Figma): positions mirror inside the selection's box too
    const x0 = Math.min(...ls.map((l) => l.x)), y0 = Math.min(...ls.map((l) => l.y)), x1 = Math.max(...ls.map((l) => l.x + l.w)), y1 = Math.max(...ls.map((l) => l.y + l.h));
    mutate(() => ls.forEach((l) => {
      flipLayer(l, f);
      if (ls.length > 1) { if (f === 'fx') l.x = Math.round(x0 + x1 - l.x - l.w); else l.y = Math.round(y0 + y1 - l.y - l.h); }
    }));
    toast(k === 'h' ? 'Flipped horizontally' : 'Flipped vertically');
  });

  // tooltips (fixed, so the scrolling panel doesn't clip them)
  let tip = null;
  const hide = () => { tip && tip.remove(); tip = null; };
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]'); if (!el) return hide();
    if (tip && tip.dataset.for === el.dataset.tip) return; hide();
    tip = document.createElement('div'); tip.className = 'tip9'; tip.dataset.for = el.dataset.tip;
    tip.innerHTML = `${esc(el.dataset.tip)}${el.dataset.kbd ? `<kbd>${esc(el.dataset.kbd)}</kbd>` : ''}`; document.body.append(tip);
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    const below = r.bottom + 8 + h < innerHeight; tip.classList.toggle('up', !below);
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    tip.style.top = (below ? r.bottom + 8 : r.top - 8 - h) + 'px';
    tip.style.setProperty('--ax', (r.left + r.width / 2 - parseFloat(tip.style.left)) + 'px');
  });
  document.addEventListener('pointerdown', hide, true); addEventListener('scroll', hide, true);
})();

/* ============ v19 · fonts from Google Fonts, groups in the Layers panel (like Figma) ============ */
(function () {
  /* fonts a design uses that the studio doesn't load (Figma imports): fetched from Google Fonts, one weight at a time
     (a request for a weight the family doesn't have fails, the others still load); exports embed them too */
  const BUILTIN = new Set(FONTS), asked = new Set();
  function loadFont(family, weight) {
    if (!family || BUILTIN.has(family)) return; const key = family + '|' + (weight || 400); if (asked.has(key)) return; asked.add(key);
    const ln = document.createElement('link'); ln.rel = 'stylesheet'; ln.dataset.studioFont = family;
    ln.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weight || 400}&display=swap`;
    ln.onload = () => document.fonts && document.fonts.ready.then(() => { const p = ED.d && curP(); p && p.layers.forEach((l) => { if (l.type === 'text' && l.font === family) refreshL(l); }); });
    document.head.appendChild(ln);
  }
  RT.loadFont = loadFont;
  const _ls19 = lstyle;
  lstyle = function (l) {
    if (l && l.type === 'text' && l.font && !BUILTIN.has(l.font)) loadFont(l.font, l.weight);
    let st = _ls19(l);
    if (l && l.bbl > 0 && l.type !== 'text') st += `backdrop-filter:blur(${l.bbl}px);-webkit-backdrop-filter:blur(${l.bbl}px);`; // background blur (frosted glass)
    return st;
  };

  /* Layers tab: grouped layers sit under their group (Figma's group row: name, expand, select the whole group) */
  Object.assign(IC, { grp9: '<rect x="4" y="4" width="16" height="16" rx="1.5" stroke-dasharray="2.5 2.5"/>' });
  ED.lgOpen = ED.lgOpen || new Set();
  const byIdP = (id) => curP().layers.find((l) => l.id === id);
  const _ep19 = edProps;
  edProps = function () {
    const r = _ep19.apply(this, arguments);
    if (ED.rtab === 'design') { // Effects: background blur, next to the layer blur
      const l = curL(), lb = l && l.type !== 'text' && $('#edProps .ps9[data-sec=fx] input[data-p=bl]');
      if (lb) lb.closest('label').insertAdjacentHTML('afterend', `<label class="lab">Background blur<input type="range" min="0" max="40" data-p="bbl" value="${l.bbl || 0}"></label>`);
    }
    if (ED.rtab !== 'layers') return r;
    const b = $('#edProps .body'); if (!b) return r;
    const rows = [...b.querySelectorAll(':scope > .layerrow[data-id]')], sel = new Set(ED.ms && ED.ms.length > 1 ? ED.ms : ED.sel ? [ED.sel] : []);
    for (let i = 0; i < rows.length;) {
      const l = byIdP(rows[i].dataset.id), g = l && l.gid; let j = i;
      while (g && j + 1 < rows.length && (byIdP(rows[j + 1].dataset.id) || {}).gid === g) j++;
      if (g && j > i) {
        const kids = rows.slice(i, j + 1), ids = kids.map((x) => x.dataset.id), allSel = ids.every((id) => sel.has(id)), open = ED.lgOpen.has(g) || (!allSel && ids.some((id) => sel.has(id)));
        const box = document.createElement('div'); box.className = 'lg9' + (open ? ' open' : ''); box.dataset.g = g;
        box.innerHTML = `<div class="layerrow lg9-h${allSel ? ' on' : ''}" data-act="lgPick" data-g="${g}"><button type="button" class="lg9-tw" data-act="lgTog" data-g="${g}" aria-label="${open ? 'Collapse' : 'Expand'} group" aria-expanded="${open}">${ic('chevD', 13)}</button>${ic('grp9', 15, 'faint')}<span class="nm">${esc(l.gn || 'Group')}</span><span class="lg9-n">${ids.length}</span></div><div class="lg9-kids"></div>`;
        kids[0].before(box); const k = box.querySelector('.lg9-kids'); kids.forEach((x) => { x.querySelector('.gi')?.remove(); k.append(x); });
      }
      i = j + 1;
    }
    return r;
  };
  ACT.lgTog = (a) => { const g = a.dataset.g; if (ED.lgOpen.has(g)) ED.lgOpen.delete(g); else ED.lgOpen.add(g); edProps(); };
  ACT.lgPick = (a, e) => {
    if (e && e.target.closest('.lg9-tw')) return;
    const ids = curP().layers.filter((l) => l.gid === a.dataset.g && !l.hidden).map((l) => l.id); if (!ids.length) return;
    if (ids.length > 1) { ED.ms = ids; ED.sel = null; } else { ED.ms = []; ED.sel = ids[0]; } // same as a Shift selection
    drawSel(); edProps();
  };
})();

/* ============ v20 · mixed text styles (runs), like Figma ============ */
(function () {
  /* l.runs = [{ s, e, font?, weight?, size?, color?, it?, ul?, ls?, lh? }] over l.text (sorted, no overlap);
     l.rt = the text the runs were made for: when the text changes, the runs follow the edit */
  const KEYS = ['font', 'weight', 'size', 'color', 'it', 'ul', 'ls', 'lh'];
  const NUM = new Set(['weight', 'size', 'ls', 'lh']), BOOL = new Set(['it', 'ul']);
  const eq = (k, a, b) => (BOOL.has(k) ? !!a === !!b : a === b);
  const sameStyle = (a, b) => KEYS.every((k) => (k in a) === (k in b) && eq(k, a[k], b[k]));
  function remap(l, ot, nt) {
    let p = 0; const mx = Math.min(ot.length, nt.length); while (p < mx && ot[p] === nt[p]) p++;
    let q = 0; while (q < mx - p && ot[ot.length - 1 - q] === nt[nt.length - 1 - q]) q++;
    const oe = ot.length - q, ne = nt.length - q, d = nt.length - ot.length;
    l.runs = l.runs.map((r) => {
      let s = r.s <= p ? r.s : r.s >= oe ? r.s + d : ne, e = r.e < p ? r.e : r.e >= oe ? r.e + d : ne;
      if (r.e === p && r.s < p) e = ne; // typing right after a styled word continues its style
      return { ...r, s, e };
    });
  }
  function normalize(l) {
    const len = String(l.text || '').length;
    let runs = (l.runs || []).map((r) => ({ ...r, s: Math.max(0, Math.min(len, r.s)), e: Math.max(0, Math.min(len, r.e)) })).filter((r) => r.e > r.s);
    runs.forEach((r) => KEYS.forEach((k) => { if (k in r && (r[k] == null || eq(k, r[k], l[k]))) delete r[k]; }));
    runs = runs.filter((r) => KEYS.some((k) => k in r)).sort((a, b) => a.s - b.s);
    const out = []; runs.forEach((r) => { const last = out[out.length - 1]; if (last && last.e >= r.s && sameStyle(last, r)) last.e = Math.max(last.e, r.e); else out.push(r); });
    if (out.length) { l.runs = out; l.rt = l.text; } else { delete l.runs; delete l.rt; }
  }
  function syncRuns(l) {
    if (!l || l.type !== 'text') return;
    if (!l.runs || !l.runs.length) { delete l.runs; delete l.rt; return; }
    const nt = String(l.text ?? ''), ot = l.rt ?? nt; if (ot !== nt) remap(l, ot, nt);
    normalize(l);
  }
  function applyRange(l, s, e, key, value) {
    syncRuns(l); const out = [], covered = [];
    for (const r of l.runs || []) {
      if (r.e <= s || r.s >= e) { out.push(r); continue; }
      if (r.s < s) out.push({ ...r, e: s });
      const a = Math.max(r.s, s), b = Math.min(r.e, e); out.push({ ...r, s: a, e: b, [key]: value }); covered.push([a, b]);
      if (r.e > e) out.push({ ...r, s: e });
    }
    covered.sort((x, y) => x[0] - y[0]); let pos = s;
    covered.forEach(([a, b]) => { if (a > pos) out.push({ s: pos, e: a, [key]: value }); pos = Math.max(pos, b); });
    if (pos < e) out.push({ s: pos, e, [key]: value });
    l.runs = out; l.rt = l.text; normalize(l);
  }
  const styleAt = (l, i) => { const r = (l.runs || []).find((x) => x.s <= i && i < x.e); const o = {}; KEYS.forEach((k) => { o[k] = r && k in r ? r[k] : l[k]; }); return o; };
  function valuesIn(l, s, e, key) {
    syncRuns(l); const vals = new Set(), len = String(l.text || '').length; if (!len || e <= s) { vals.add(BOOL.has(key) ? !!l[key] : l[key]); return vals; }
    const cuts = new Set([s, e]); (l.runs || []).forEach((r) => { if (r.s > s && r.s < e) cuts.add(r.s); if (r.e > s && r.e < e) cuts.add(r.e); });
    [...cuts].sort((a, b) => a - b).slice(0, -1).forEach((c) => { const v = styleAt(l, c)[key]; vals.add(BOOL.has(key) ? !!v : v); });
    return vals;
  }
  const runCss = (l, r) => {
    let c = '';
    if ('font' in r) { c += `font-family:'${r.font}',sans-serif;`; RT.loadFont(r.font, r.weight || l.weight); }
    if ('weight' in r) { c += `font-weight:${r.weight};`; if (!('font' in r)) RT.loadFont(l.font, r.weight); }
    if ('size' in r) c += `font-size:${r.size}px;`;
    if ('color' in r) c += `color:${r.color};`;
    if ('it' in r) c += `font-style:${r.it ? 'italic' : 'normal'};`;
    if ('ul' in r) c += `text-decoration:${r.ul ? 'underline' : 'none'};`;
    if ('ls' in r) c += `letter-spacing:${r.ls}px;`;
    if ('lh' in r) c += `line-height:${r.lh};`;
    return c;
  };
  textHTML = (l) => {
    syncRuns(l); if (!l.runs) return esc(l.text);
    const t = String(l.text); let h = '', pos = 0;
    l.runs.forEach((r) => { if (r.s > pos) h += esc(t.slice(pos, r.s)); h += `<span style="${runCss(l, r)}">${esc(t.slice(r.s, r.e))}</span>`; pos = r.e; });
    return h + esc(t.slice(pos));
  };

  /* selected characters: tracked while editing (double-click), kept after the edit so the panel can style them */
  const activeSel = (l) => { const t = ED.tsel; return t && l && t.id === l.id && t.e > t.s && t.e <= String(l.text || '').length ? t : null; };
  const offsetIn = (el, node, o) => { const r = document.createRange(); r.selectNodeContents(el); r.setEnd(node, o); return r.toString().length; };
  document.addEventListener('selectionchange', () => {
    if (!ED.editing) return; const el = elOf(ED.editing), sel = getSelection(); if (!el || !sel.rangeCount) return;
    const r = sel.getRangeAt(0); if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return;
    const a = offsetIn(el, r.startContainer, r.startOffset), b = offsetIn(el, r.endContainer, r.endOffset);
    ED.tselLive = { id: ED.editing, s: Math.min(a, b), e: Math.max(a, b) };
  });
  // leaving the text (click in the panel): remember the selection before the edit closes and the panel redraws
  document.addEventListener('blur', (e) => { if (ED.editing && e.target === elOf(ED.editing)) { const t = ED.tselLive; ED.tsel = t && t.id === ED.editing && t.e > t.s ? { ...t } : null; } }, true);
  document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('#edScroll, .ed-panel')) ED.tsel = null; }, true);
  const setCaret = (el, s, e) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, pos = 0, rs = null; const r = document.createRange();
    while ((n = walk.nextNode())) { const len = n.textContent.length; if (!rs && s <= pos + len) { r.setStart(n, s - pos); rs = 1; } if (e <= pos + len) { r.setEnd(n, e - pos); break; } pos += len; }
    if (rs) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  };
  const after = () => { edAll(); const x = curL(); if (x) { fitText(x); drawSel(); } };
  const toggleVal = (l, key, s, e) => { const v = [...valuesIn(l, s, e, key)]; return key === 'weight' ? (v.every((w) => w >= 600) ? 400 : 700) : !v.every(Boolean); };

  // Ctrl/Cmd B, I, U while typing: style the selected characters (like Figma)
  document.addEventListener('keydown', (e) => {
    if (!ED.editing || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = String(e.key || '').toLowerCase(), key = { b: 'weight', i: 'it', u: 'ul' }[k]; if (!key) return;
    const el = elOf(ED.editing), l = curP().layers.find((x) => x.id === ED.editing), t = ED.tselLive; if (!el || !l || !t || t.id !== l.id || t.e <= t.s) return;
    e.preventDefault(); e.stopImmediatePropagation();
    l.text = el.innerText.replace(/\n$/, ''); applyRange(l, t.s, t.e, key, toggleVal(l, key, t.s, t.e));
    el.innerHTML = textHTML(l); setCaret(el, t.s, t.e); fitText(l); drawSel();
  }, true);

  RT.apply = (prop, val) => {
    const l = curL(); if (!l || l.type !== 'text' || !KEYS.includes(prop)) return false;
    const sel = activeSel(l);
    if (sel) { mutate(() => applyRange(l, sel.s, sel.e, prop, val), after); return true; }
    if (l.runs) { mutate(() => { l[prop] = val; l.runs.forEach((r) => delete r[prop]); normalize(l); }, after); return true; } // whole text: replaces the mixed values
    return false;
  };
  // panel number / color fields (and the toolbar's font): selection first, else the whole text
  document.addEventListener('input', (e) => {
    const t = e.target; if (!t.dataset || !t.closest) return;
    const p = t.closest('#edProps') ? t.dataset.p : t.closest('#ftb') ? t.dataset.ft : null; if (!p || !KEYS.includes(p) || t.value === '') return;
    const l = curL(); if (!l || l.type !== 'text') return;
    const val = NUM.has(p) ? +t.value : t.value, sel = activeSel(l);
    if (sel) { e.stopImmediatePropagation(); if (!ED.pre) ED.pre = snap(); applyRange(l, sel.s, sel.e, p, val); refreshL(l); fitText(l); drawSel(); return; }
    if (l.runs) { l.runs.forEach((r) => delete r[p]); normalize(l); }
  }, true);
  const _xt = ACT.xt;
  ACT.xt = (a) => {
    const l = curL(), k = a.dataset.k, key = { b: 'weight', it: 'it', ul: 'ul' }[k];
    if (l && l.type === 'text' && key && (activeSel(l) || l.runs)) {
      const sel = activeSel(l), [s0, e0] = sel ? [sel.s, sel.e] : [0, String(l.text).length], v = toggleVal(l, key, s0, e0);
      return mutate(() => { if (sel) applyRange(l, s0, e0, key, v); else { l[key] = v; l.runs.forEach((r) => delete r[key]); normalize(l); } }, after);
    }
    return _xt(a);
  };
  const _sz = ACT.ftSz;
  ACT.ftSz = (a) => {
    const l = curL(); if (!l || !l.runs) return _sz(a);
    const f = 1 + 0.1 * a.dataset.n; mutate(() => { l.size = Math.max(8, Math.round(l.size * f)); l.runs.forEach((r) => { if (r.size) r.size = Math.max(6, Math.round(r.size * f)); }); }, after);
  };
  ACT.rtAll = () => { ED.tsel = null; edProps(); };

  /* panel: "Mixed" where the text (or the selection) has several values, like Figma */
  const WN = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold' };
  /** Shows the values of the selection (or "Mixed") in the panel without rebuilding it (keeps the focus) */
  function decorate(l, b) {
    b.querySelectorAll('.rt9, .mx9').forEach((x) => x.remove()); b.querySelectorAll('[data-act=xt].mx').forEach((x) => x.classList.remove('mx'));
    const sel = activeSel(l), [s0, e0] = sel ? [sel.s, sel.e] : [0, String(l.text).length], one = (k) => { const v = valuesIn(l, s0, e0, k); return v.size > 1 ? null : [...v][0]; };
    if (!l.runs && !sel) return;
    const fv = one('font'), wv = one('weight');
    const fb = b.querySelector('.dd8b[data-k=font]'); if (fb) { fb.querySelector('.v').textContent = fv ?? 'Mixed'; fb.style.fontFamily = fv ? `'${fv}',sans-serif` : ''; }
    const wb = b.querySelector('.dd8b[data-k=weight] .v'); if (wb) wb.textContent = wv == null ? 'Mixed' : WN[wv] || wv;
    ['size', 'lh', 'ls'].forEach((k) => { const i = b.querySelector(`input[data-p=${k}]`); if (!i) return; const v = one(k); if (v == null) { i.value = ''; i.placeholder = 'Mixed'; } else i.value = Math.round(v * 100) / 100; });
    const ci = b.querySelector('input[data-p=color]'), cv = one('color');
    if (ci) { if (cv) ci.value = hex(cv); else ci.closest('div')?.querySelector('.label')?.insertAdjacentHTML('beforeend', ' <span class="mx9">Mixed</span>'); }
    [['b', 'weight'], ['it', 'it'], ['ul', 'ul']].forEach(([k, key]) => { const bt = b.querySelector(`[data-act=xt][data-k=${k}]`); if (!bt) return; const v = one(key); bt.classList.toggle('on', key === 'weight' ? v >= 600 : !!v); bt.classList.toggle('mx', v == null); });
    if (sel) {
      const host = b.querySelector('.ps9[data-sec=text] .ps9-b') || b;
      host.insertAdjacentHTML('afterbegin', `<div class="note rt9">${ic('type', 16)}<span>Styling <b>${sel.e - sel.s}</b> selected character${sel.e - sel.s > 1 ? 's' : ''}. <button type="button" class="btn link sm" data-act="rtAll">Style all the text</button></span></div>`);
    }
  }
  const _ep20 = edProps;
  edProps = function () {
    const r = _ep20.apply(this, arguments);
    const l = curL(), b = $('#edProps .body');
    if (!l || l.type !== 'text' || ED.rtab !== 'design' || !b || !b.querySelector('input[data-p=name]')) return r;
    if (ED.tsel && ED.tsel.id !== l.id) ED.tsel = null;
    decorate(l, b); return r;
  };
  // the edit closed because a panel control took the focus: the panel was kept, refresh its values in place
  document.addEventListener('focusout', (e) => {
    if (!e.target.matches || !e.target.matches('#poster .ly.text') || !e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('#edProps')) return;
    setTimeout(() => { const l = curL(), b = $('#edProps .body'); if (l && l.type === 'text' && b && !ED.editing) decorate(l, b); });
  });
})();

/* ============ v21 · drag and drop from the left panel onto the canvas ============ */
(function () {
  /* Items that can be dragged: the same buttons that add on click. Dropping places the new layer at the pointer;
     colors, fonts and suggestions dropped on a layer change that layer. */
  const SRC = 'button[data-act="edShape"],button[data-act="edText"],button[data-act="edSugg"],button[data-act="edImg"],button[data-act="edLogo"],button[data-act="edAsset"],button[data-act="edFont"],button[data-act="edColor"],button[data-act="edTpl"],button[data-act="edClip"],button[data-act="edIcon"],button[data-act="edCombo"],[data-act="edBTpl"],[data-act="edTpl"]';
  const ONTO = new Set(['edColor', 'edFont', 'edSugg']); // act on the layer under the pointer when there is one
  const PLACE = new Set(['edShape', 'edText', 'edSugg', 'edLogo', 'edAsset', 'edClip', 'edIcon']);
  const clamp9 = (n, a, b) => Math.max(a, Math.min(b, n));
  let drag = null, hold = null, ghost = null, hl = null, suppress = 0;

  /* a new layer lands at the drop point (one undo step: addLayer places it before the history entry is made) */
  const _add = addLayer;
  addLayer = function (l) {
    const at = ED.dropAt;
    if (at && l && !l.locked) {
      ED.dropAt = null; const [W, H] = dim();
      if (l.w < W - 1 || l.h < H - 1) {
        l.x = Math.round(clamp9(at.x - l.w / 2, Math.min(0, W - l.w), Math.max(0, W - l.w)));
        l.y = Math.round(clamp9(at.y - l.h / 2, Math.min(0, H - l.h), Math.max(0, H - l.h)));
      }
    }
    return _add(l);
  };

  /* several layers added at once (text combos): the block is centered on the drop point, in the same history step */
  const _mut = mutate;
  mutate = function (fn, redraw) {
    const at = ED.dropGrp; if (!at) return _mut(fn, redraw); ED.dropGrp = null;
    return _mut(() => {
      const before = new Set(curP().layers.map((l) => l.id)); fn();
      const add = curP().layers.filter((l) => !before.has(l.id)); if (!add.length) return;
      const [W, H] = dim(), x0 = Math.min(...add.map((l) => l.x)), y0 = Math.min(...add.map((l) => l.y)), x1 = Math.max(...add.map((l) => l.x + l.w)), y1 = Math.max(...add.map((l) => l.y + l.h));
      const fit = (want, lo, hi) => Math.round(lo <= hi ? clamp9(want, lo, hi) : want); // keep the block inside the page when it fits
      const dx = fit(at.x - (x0 + x1) / 2, -x0, W - x1), dy = fit(at.y - (y0 + y1) / 2, -y0, H - y1);
      add.forEach((l) => { l.x += dx; l.y += dy; });
    }, redraw);
  };

  const canvasPoint = (x, y) => {
    const po = $('#poster'); if (!po) return null; const r = po.getBoundingClientRect(), z = ED.zoom || 1;
    return { x: (x - r.left) / z, y: (y - r.top) / z };
  };
  const overStage = (x, y) => { const s = $('#edScroll'); if (!s) return false; const r = s.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  const layerAt = (x, y) => {
    const el = document.elementsFromPoint(x, y).find((e) => e.classList && e.classList.contains('ly') && e.closest('#poster'));
    const l = el && curP().layers.find((q) => q.id === el.dataset.id);
    return l && !(l.locked && l.name === 'Background') ? l : null;
  };
  const clearHl = () => { if (hl) { hl.classList.remove('dnd-over'); hl = null; } };
  const setHl = (el) => { if (hl === el) return; clearHl(); if (el) { el.classList.add('dnd-over'); hl = el; } };

  function begin(btn, e) {
    const r = btn.getBoundingClientRect();
    drag = { btn, act: btn.dataset.act, x0: e.clientX, y0: e.clientY, on: false, w: Math.min(r.width, 150) };
  }
  function start() {
    const { btn } = drag; drag.on = true;
    ghost = btn.cloneNode(true); ghost.removeAttribute('id'); ghost.className = (btn.className + ' dnd9-ghost').trim(); ghost.removeAttribute('data-act');
    ghost.style.width = drag.w + 'px'; ghost.style.height = 'auto'; ghost.querySelectorAll('img').forEach((i) => { i.draggable = false; });
    document.body.appendChild(ghost); document.body.classList.add('dnd9');
    btn.classList.add('dnd9-src');
    if (ED.ms && ED.ms.length) { /* keep selection */ }
    ED.dndHint = true;
  }
  function move(e) {
    if (!drag) return;
    if (!drag.on) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return; start(); }
    e.preventDefault();
    ghost.style.transform = `translate(${e.clientX + 12}px,${e.clientY + 12}px)`;
    const inside = overStage(e.clientX, e.clientY), st = $('#edScroll'); st && st.classList.toggle('dnd9-over', inside);
    const l = inside && ONTO.has(drag.act) ? layerAt(e.clientX, e.clientY) : null;
    setHl(l ? elOf(l.id) : null);
    if (inside) {
      if (drag.act === 'edText' || drag.act === 'edSugg' || drag.act === 'edShape') { /* new layer: show where it lands */ }
    }
  }
  function end(e, cancel) {
    removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', cancelUp, true); removeEventListener('keydown', esc, true);
    const d = drag; drag = null; clearTimeout(hold);
    if (!d || !d.on) return;
    suppress = Date.now() + 400; // the click that follows the drop must not add a second layer
    document.body.classList.remove('dnd9'); d.btn.classList.remove('dnd9-src'); ghost && ghost.remove(); ghost = null; clearHl();
    const st = $('#edScroll'); st && st.classList.remove('dnd9-over'); ED.dndHint = false;
    if (cancel || !e || !overStage(e.clientX, e.clientY)) return;
    const pt = canvasPoint(e.clientX, e.clientY); if (!pt) return;
    const [W, H] = dim(), act = d.act, fn = ACT[act]; if (!fn) return;
    const target = ONTO.has(act) ? layerAt(e.clientX, e.clientY) : null;
    if (act === 'edColor') {
      if (target) { ED.sel = target.id; ED.ms = []; return fn(d.btn); }
      return ACT.edBg(d.btn); // dropped on the page itself: background color
    }
    if (act === 'edFont') { if (!target || target.type !== 'text') return toast('Drop the font on a text layer'); ED.sel = target.id; ED.ms = []; return fn(d.btn); }
    if (act === 'edSugg') { if (target && target.type === 'text') { ED.sel = target.id; ED.ms = []; } else { ED.sel = null; ED.ms = []; } }
    const at = { x: clamp9(pt.x, 0, W), y: clamp9(pt.y, 0, H) };
    if (PLACE.has(act)) ED.dropAt = at; else if (act === 'edCombo') ED.dropGrp = at;
    try { fn(d.btn); } finally { setTimeout(() => { ED.dropAt = null; ED.dropGrp = null; }, 0); }
  }
  const up = (e) => end(e, false), cancelUp = (e) => end(e, true), esc = (e) => { if (e.key === 'Escape' && drag && drag.on) { e.stopPropagation(); end(null, true); } };

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || drag || !document.body.classList.contains('in-editor')) return;
    const btn = e.target.closest && e.target.closest(SRC); if (!btn || !btn.closest('#edPanel')) return;
    if (btn.closest('.ed-panel.agent')) return;
    const go = () => { begin(btn, e); addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', cancelUp, true); addEventListener('keydown', esc, true); };
    if (e.pointerType === 'touch') { // long press, so the panel can still be scrolled with a finger
      const x = e.clientX, y = e.clientY; const cancelHold = (ev) => { if (Math.hypot(ev.clientX - x, ev.clientY - y) > 8) { clearTimeout(hold); removeEventListener('pointermove', cancelHold, true); } };
      addEventListener('pointermove', cancelHold, true);
      hold = setTimeout(() => { removeEventListener('pointermove', cancelHold, true); go(); drag.x0 = x - 7; drag.y0 = y; }, 320);
      addEventListener('pointerup', () => { clearTimeout(hold); removeEventListener('pointermove', cancelHold, true); }, { once: true, capture: true });
      return;
    }
    go();
  }, true);
  document.addEventListener('touchmove', (e) => { if (drag && drag.on) e.preventDefault(); }, { passive: false });
  document.addEventListener('dragstart', (e) => { if (e.target.closest && e.target.closest('#edPanel') && e.target.closest(SRC)) e.preventDefault(); }, true); // no native image drag
  document.addEventListener('click', (e) => { if (suppress > Date.now() && e.target.closest && e.target.closest('#edPanel')) { e.stopPropagation(); e.preventDefault(); suppress = 0; } }, true);

  /* image files dragged from the desktop onto the canvas */
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  document.addEventListener('dragover', (e) => { if (!hasFiles(e) || !document.body.classList.contains('in-editor') || !overStage(e.clientX, e.clientY)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; $('#edScroll').classList.add('dnd9-over'); });
  document.addEventListener('dragleave', (e) => { if (e.target === $('#edScroll')) $('#edScroll').classList.remove('dnd9-over'); });
  document.addEventListener('drop', (e) => {
    if (!hasFiles(e) || !document.body.classList.contains('in-editor') || !overStage(e.clientX, e.clientY)) return;
    e.preventDefault(); $('#edScroll').classList.remove('dnd9-over');
    const f = [...e.dataTransfer.files].find((x) => /^image\//.test(x.type)); if (!f) return toast('Drop an image file (PNG, JPG or SVG)');
    const pt = canvasPoint(e.clientX, e.clientY), [W, H] = dim(); ED.dropAt = pt && { x: clamp9(pt.x, 0, W), y: clamp9(pt.y, 0, H) };
    const inp = document.createElement('input'); inp.type = 'file'; inp.id = 'upl'; inp.hidden = true; document.body.appendChild(inp);
    const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(() => { inp.remove(); ED.dropAt = null; }, 4000);
  });
})();

/* ============ v14 · connected accounts, publishing and Figma sync (API) ============ */
(function () {
  const net = (k) => (PLATFORMS[k] ? PLATFORMS[k].n : k);
  const brandPath = () => '/social/brands/' + encodeURIComponent(S.active);
  const refreshViews = () => {
    if (document.body.classList.contains('in-editor')) return;
    if (/^#\/(planner|overview|studio|settings)?$/.test(location.hash.split('?')[0]) || !location.hash) { const y = scrollY; route(); scrollTo(0, y); }
  };
  const li = (x) => `<li>${esc(x)}</li>`;

  /* ---------- connected accounts ---------- */
  const connOf = (k) => CONN.list && CONN.brand === S.active && CONN.list.find((c) => c.net === k);
  async function connected(k, name) { toast(`${net(k)} connected${name ? ' as ' + name : ''}`); await CONN.load(); CONN.changed = false; refreshViews(); }

  function setupDialog(c) {
    modal(`<div class="mh"><h2>Set up ${esc(c.name)}</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>
      <div class="mb"><p class="sm-t muted">${esc(c.name)} needs a developer app before accounts can connect. An admin sets it up once for the whole workspace.</p>
      <div class="how"><b>Steps</b><ol>${c.setup.map(li).join('')}</ol></div>
      ${(c.domains || []).length ? `<label class="lab">${c.domains.length > 1 ? 'Domains' : 'Domain'} (App Domains)${c.domains.map((v) => `<div class="row"><input class="field grow" readonly value="${esc(v)}"><button class="btn secondary" data-copy="${esc(v)}">${ic('copy', 16)}Copy</button></div>`).join('')}</label>` : ''}
      ${c.siteUrl ? `<label class="lab">Site URL (platform Website)${((v) => `<div class="row"><input class="field grow" readonly value="${esc(v)}"><button class="btn secondary" data-copy="${esc(v)}">${ic('copy', 16)}Copy</button></div>`)(c.siteUrl)}</label>` : ''}
      ${(c.callbackUrls || (c.callbackUrl ? [c.callbackUrl] : [])).length ? `<label class="lab">Callback URL${(c.callbackUrls || [c.callbackUrl]).length > 1 ? 's (Valid OAuth Redirect URIs)' : ''}${(c.callbackUrls || [c.callbackUrl]).map((v) => `<div class="row"><input class="field grow" readonly value="${esc(v)}"><button class="btn secondary" data-copy="${esc(v)}">${ic('copy', 16)}Copy</button></div>`).join('')}</label>` : ''}
      ${c.missing.length ? `<div class="note">${ic('settings', 16)}<span>Add ${c.missing.map((m) => `<span class="kbd">${esc(m)}</span>`).join(' ')} to the API's <span class="kbd">.env</span>, then restart the API. The Connect button signs in right away after that.</span></div>` : `<div class="note">${ic('alert', 16)}<span>The keys are set. If ${esc(c.name)} says the URL's domain isn't included in the app's domains, or the redirect URI isn't allowed, add the values above in the app's settings, save, then click Check again.</span></div>`}</div>
      <div class="mf"><button class="btn secondary" data-close>Close</button><button class="btn primary" id="suRe">${ic('refresh', 16)}Check again</button></div>`, {
      onMount: (bg, close) => bg.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-copy]'); if (b) { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy).then(() => toast('Callback URL copied')); return; }
        if (!e.target.closest('#suRe')) return;
        // keys added and the API restarted: carry on with Connect; else say what the API still doesn't see
        const w = window.open('', 'boga-connect', 'width=620,height=760'), n = (await CONN.load()) && connOf(c.net);
        if (n && n.configured) {
          close(); refreshViews();
          try { const { url } = await api(`${brandPath()}/connections/${c.net}/auth-url`); if (w && !w.closed) { w.location.href = url; w.focus(); } else location.href = url; } catch (er) { w && w.close(); toast(er.message); }
        } else { w && w.close(); toast(n ? `The API still doesn't see ${n.missing.join(', ')}. Save the .env and restart the API.` : 'Could not reach the API'); }
      }),
    });
  }

  function telegramDialog(c) {
    modal(`<div class="mh"><h2>Connect Telegram</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>
      <div class="mb"><div class="how"><b>Before you start</b><ol>${c.setup.map(li).join('')}</ol></div>
      <label class="lab">Bot token<input class="field" id="tgTok" type="password" autocomplete="off" placeholder="123456789:AA…"></label>
      <label class="lab">Channel or group<input class="field" id="tgChat" placeholder="@yourchannel or -100…"></label>
      <div class="note warn" id="tgErr" hidden></div></div>
      <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="tgGo">Connect</button></div>`, {
      onMount: (bg, close) => {
        const go = async () => {
          const btn = $('#tgGo', bg); if (btn.disabled) return; btn.disabled = true; btn.textContent = 'Checking…';
          try {
            const r = await api(`${brandPath()}/connections/tg`, { method: 'POST', body: { botToken: $('#tgTok', bg).value, chat: $('#tgChat', bg).value } });
            close(); connected('tg', r.account.handle || r.account.name);
          } catch (e) { const er = $('#tgErr', bg); er.hidden = false; er.innerHTML = ic('alert', 16) + `<span>${esc(e.message)}</span>`; btn.disabled = false; btn.textContent = 'Connect'; }
        };
        bg.addEventListener('click', (e) => { if (e.target.closest('#tgGo')) go(); });
        bg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('field')) { e.preventDefault(); go(); } });
        setTimeout(() => { const t = $('#tgTok', bg); t && t.focus(); }, 30);
      },
    });
  }

  ACT.pfConnect = async (a) => {
    const k = a.dataset.k, c = connOf(k) || ((await CONN.load()) && connOf(k));
    if (!c) return toast('Could not reach the API');
    if (!c.configured) return setupDialog(c);
    if (c.kind === 'token') return telegramDialog(c);
    // open the window during the click (popup blockers), then send it to the network's sign-in page
    const w = window.open('', 'boga-connect', 'width=620,height=760');
    try {
      const { url } = await api(`${brandPath()}/connections/${k}/auth-url`);
      if (w && !w.closed) { w.location.href = url; w.focus(); } else location.href = url;
    } catch (e) { w && w.close(); toast(e.message); }
  };

  ACT.pfSetup = async (a) => { const c = connOf(a.dataset.k) || ((await CONN.load()) && connOf(a.dataset.k)); if (c) setupDialog(c); };
  ACT.pfDisconnect = (a) => {
    const k = a.dataset.k, c = connOf(k), who = c && c.account ? c.account.handle || c.account.name : net(k);
    modal(`<div class="mh"><h2>Disconnect ${net(k)}?</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>
      <div class="mb"><p class="sm-t muted">${esc(who)} won't receive posts from ${esc(brand().name)} anymore, and its tokens are deleted. Scheduled posts for ${net(k)} will fail until you connect it again.</p></div>
      <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="dcGo">Disconnect</button></div>`, {
      onMount: (bg, close) => bg.addEventListener('click', async (e) => {
        if (!e.target.closest('#dcGo')) return;
        try { await api(`${brandPath()}/connections/${k}`, { method: 'DELETE' }); close(); toast(net(k) + ' disconnected'); await CONN.load(); CONN.changed = false; refreshViews(); } catch (er) { toast(er.message); }
      }),
    });
  };

  // the sign-in window reports back (app/(social)/social-media/connected)
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'boga:connected') return;
    if (e.data.net === 'figma') return figConnected(e.data);
    if (e.data.ok) connected(e.data.net, e.data.name); else toast(`${net(e.data.net)}: ${e.data.error || 'connection failed'}`);
  });
  try { // same, when the popup was blocked and the whole tab went through the sign-in
    const m = JSON.parse(sessionStorage.getItem('boga.connected') || 'null');
    if (m) { sessionStorage.removeItem('boga.connected'); setTimeout(() => (m.net === 'figma' ? figConnected(m) : m.ok ? connected(m.net, m.name) : toast(`${net(m.net)}: ${m.error || 'connection failed'}`)), 400); }
  } catch (e) {}

  /* ---------- Figma (Settings → Figma): Connect Figma (OAuth), default file, teams ---------- */
  const figSettings = () => S.set.sec === 'figma' && /^#\/settings/.test(location.hash);
  const figDone = (st, msg) => { FIG.set(st); if (msg) toast(msg); if (figSettings()) rerender(); };
  Object.assign(ACT, {
    figCopy: (a) => { const v = a.dataset.v; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast('Redirect URL copied'), () => toast(v)); },
    figConnect: () => FIG.connect(),
    figSaveTok: async () => {
      const i = $('#figTok'), v = i && i.value.trim(), b = $('[data-act=figSaveTok]'); if (!v) return toast('Paste a Figma token first');
      b.disabled = true; b.textContent = 'Checking…';
      try { const st = await api('/social/figma/token', { method: 'PUT', body: { token: v } }); figDone(st, 'Figma connected as ' + ((st.user && st.user.handle) || 'your account')); }
      catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Save token'; }
    },
    figSetup: () => figSetup(),
    figPickDefault: () => openFigma({ pickDefault: true }),
    figClearDefault: async () => { try { figDone(await api('/social/figma/default', { method: 'DELETE' }), 'Default file removed'); } catch (e) { toast(e.message); } },
    figAddTeam: async () => {
      const i = $('#figTeam'), v = i && i.value.trim(); if (!v) return toast('Paste a team page link first');
      try { figDone(await api('/social/figma/teams', { method: 'POST', body: { ref: v } }), 'Team added'); } catch (e) { toast(e.message); }
    },
    figRmTeam: async (a) => { try { figDone(await api('/social/figma/teams/' + encodeURIComponent(a.dataset.id), { method: 'DELETE' }), 'Team removed'); } catch (e) { toast(e.message); } },
    figDisconnect: () => modal(`<div class="mh"><h2>Disconnect Figma?</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>
      <div class="mb"><p class="sm-t muted">The Figma sign-in is deleted from the server. Imported designs stay as they are; re-sync and imports work again after you connect. Your default file and recent files are kept.</p></div>
      <div class="mf"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="fdGo">Disconnect</button></div>`, {
      onMount: (bg, close) => bg.addEventListener('click', async (e) => {
        if (!e.target.closest('#fdGo')) return;
        try { figDone(await api('/social/figma/connection', { method: 'DELETE' }), 'Figma disconnected'); close(); } catch (er) { toast(er.message); }
      }),
    }),
  });
  // Connect Figma came back (popup or same tab): load the account, then anything waiting on it (import window, settings)
  const figConnected = (m) => {
    if (!m.ok) return toast(`Figma: ${m.error || 'connection failed'}`);
    FIG.load().then((st) => { if (st && st.connected) toast(`Figma connected${m.name ? ' as ' + m.name : ''}`); if (figSettings()) rerender(); return st; });
  };

  /* ---------- publishing ---------- */
  const fnv = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const designHash = (d) => fnv(d.ratio + JSON.stringify(d.pages.map((p) => [p.bg, p.layers])));
  const toDataUrl = (blob) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
  const plain = (p) => { const { publish, media, ...rest } = p; return JSON.parse(JSON.stringify(rest)); };
  /** Slides for publishing: lossless PNG at the design's size (at most 2160 px), the API encodes the JPEG once */
  async function render(d, post) {
    // live calendar slides show the events of the day the post goes out
    if (LIVE && post) d = await LIVE.forPost(d, post);
    return renderPages(d);
  }
  async function renderPages(d) {
    const [w, h] = RATIOS[d.ratio], sc = Math.min(1, 2160 / Math.max(w, h)), out = []; for (let i = 0; i < d.pages.length; i++) out.push(await toDataUrl(await renderSlide(d, i, sc, 'png'))); return out;
  }
  function merge(st) {
    const p = S.posts.find((x) => x.id === st.id); if (!p) return false;
    const before = JSON.stringify([p.status, p.publish, p.media]);
    p.status = st.status; if (st.publish) p.publish = st.publish; if (st.media) p.media = st.media;
    if (st.status === 'Published') { const d = S.designs.find((x) => x.id === p.d); if (d) d.status = 'Published'; }
    return before !== JSON.stringify([p.status, p.publish, p.media]);
  }
  const summary = (st) => {
    const r = Object.entries((st.publish && st.publish.results) || {}), ok = r.filter(([, x]) => x.ok).map(([k]) => net(k)), bad = r.filter(([, x]) => !x.ok).map(([k]) => net(k));
    const state = st.publish && st.publish.state;
    return state === 'published' ? `Published to ${ok.join(', ')}` : state === 'partial' ? `Published to ${ok.join(', ')}. ${bad.join(', ')} failed: open the post to see why` : `Publishing failed${st.publish && st.publish.lastError ? ': ' + st.publish.lastError : ''}`;
  };
  const busy = new Set(), unready = new Set();
  PUB = {
    renderPages,
    /** Scheduled post: upload its slides so the API can publish it on time, even with the studio closed */
    async prepare(post) {
      const d = getD(post.d); if (!d || busy.has(post.id)) return; busy.add(post.id);
      try { const st = await api(`${brandPath()}/posts/${encodeURIComponent(post.id)}/media`, { method: 'PUT', body: { post: plain(post), images: await render(d, post), hash: designHash(d) } }); if (merge(st)) save(); }
      catch (e) { toast('Could not prepare the post for publishing: ' + e.message); }
      finally { busy.delete(post.id); }
    },
    async publishNow(post) {
      const d = getD(post.d); if (!d) return; if (busy.has(post.id)) return toast('Already publishing this post');
      busy.add(post.id); toast(`Publishing to ${post.pf.map(net).join(', ')}…`);
      try {
        const st = await api(`${brandPath()}/posts/${encodeURIComponent(post.id)}/publish`, { method: 'POST', body: { post: plain(post), images: await render(d, post), hash: designHash(d) } });
        merge(st); save(); toast(summary(st));
      } catch (e) { toast('Publishing failed: ' + e.message); }
      finally { busy.delete(post.id); refreshViews(); }
    },
    /** Results of scheduled posts (published by the API), and re-render of slides whose design changed */
    async poll() {
      if (document.hidden) return;
      const b = S.active, list = await api(`${brandPath()}/publish-state`).catch(() => null); if (!list || S.active !== b) return;
      let changed = false; list.forEach((st) => { changed = merge(st) || changed; });
      if (changed) { save(); refreshViews(); }
      S.posts.filter((p) => p.status === 'Scheduled' && p.media && p.publish && p.publish.state === 'pending').forEach((p) => { const d = getD(p.d); if (d && p.media.hash && p.media.hash !== designHash(d)) PUB.prepare(p); });
      // scheduled posts without rendered slides (created before the API had them, or a failed upload): render once per session
      if (persist.readOnly) return;
      S.posts.filter((p) => p.status === 'Scheduled' && !p.media && !unready.has(p.id) && p.pf && p.pf.length && zonedToUtc(p.date, p.time || '09:00', tzValid(p.tz) ? p.tz : schedTz()) > new Date())
        .forEach((p) => { unready.add(p.id); PUB.prepare(p); });
    },
  };

  /* ---------- Figma: version checks and re-sync of linked slides ---------- */
  const linked = (d) => d.pages.map((pg, i) => ({ i, f: pg.figma || (i === 0 && d.figma) })).filter((x) => x.f);
  const fontsOpt = () => (S.set.fonts ? { fonts: { heading: brand().fonts.heading, body: brand().fonts.body } } : { keepFonts: true });
  const checked = {};
  FIGSYNC = {
    async check(d) {
      const keys = [...new Set(linked(d).map((x) => x.f.fileKey).filter(Boolean))];
      for (const k of keys) {
        if (checked[k] && Date.now() - checked[k].at < 60000) continue;
        checked[k] = { at: Date.now() };
        try { checked[k] = { at: Date.now(), ...(await api('/social/figma/version?fileKey=' + encodeURIComponent(k))) }; } catch (e) { continue; }
        let changed = false;
        linked(d).forEach(({ f }) => { if (f.fileKey === k) { const s = f.version && f.version !== checked[k].version ? 'Changed in Figma' : 'In sync'; if (f.sync !== s) { f.sync = s; changed = true; } } });
        if (changed) { save(); if (ED.d === d && ED.tab === 'figma') edPanel(); autoSync(d); }
      }
    },
    async resync(d, i) {
      const pg = d.pages[i], f = pg && (pg.figma || (i === 0 && d.figma));
      if (!f || !f.fileKey) return toast('This slide was linked in the demo. Import it again from Figma to link it.');
      toast(`Re-syncing slide ${i + 1} from Figma…`);
      try {
        const r = await api('/social/figma/import', { method: 'POST', body: { fileKey: f.fileKey, ids: [f.node], ...fontsOpt() } });
        const fr = r.frames[0]; if (!fr || fr.error) throw new Error(fr ? fr.error : 'Frame not found');
        const meta = { ...f, file: r.file, version: r.version, lastModified: r.lastModified, sync: 'In sync', at: Date.now() };
        ensureRatio(fr.ratio); const apply = () => { pg.bg = fr.page.bg; pg.layers = fr.ratio !== d.ratio ? fitPage(fr.page.layers, [fr.width, fr.height], RATIOS[d.ratio]) : fr.page.layers; pg.figma = meta; if (i === 0 && d.figma) d.figma = { ...meta }; };
        if (ED.d === d) { ED.sel = null; mutate(apply); } else apply();
        save(); toast(`Slide ${i + 1} updated from Figma` + (fr.warnings.length ? ` (${fr.warnings.length} note${fr.warnings.length > 1 ? 's' : ''})` : ''));
        if (ED.d === d && ED.tab === 'figma') edPanel();
      } catch (e) { toast('Re-sync failed: ' + e.message); }
    },
  };
  // Settings → Figma → Re-sync: "When I open a linked design", or "Every day"
  function autoSync(d) {
    const mode = S.set.sync; if (mode !== 'open' && mode !== 'daily') return;
    linked(d).forEach(({ f, i }) => { if (f.sync === 'Changed in Figma' && f.fileKey && (mode === 'open' || !f.at || Date.now() - f.at > 864e5)) FIGSYNC.resync(d, i); });
  }
  const oe = openEditor;
  openEditor = function () { const r = oe.apply(this, arguments); if (ED.d && S.set.sync !== 'manual') FIGSYNC.check(ED.d); return r; };

  /* ---------- keep everything current ---------- */
  let polledBrand = null;
  const r0 = route;
  route = function () {
    if (CONN.brand !== S.active && !CONN.pending) CONN.load().then(() => { if (CONN.changed) { CONN.changed = false; refreshViews(); } });
    if (polledBrand !== S.active) { polledBrand = S.active; setTimeout(() => PUB.poll(), 300); }
    return r0.apply(this, arguments);
  };
  CONN.load().then(() => { if (CONN.changed) { CONN.changed = false; refreshViews(); } });
  FIG.load();
  polledBrand = S.active; setTimeout(() => PUB.poll(), 1500);
  setInterval(() => PUB.poll(), 20000);
})();

/* ============ v23 · live data templates: any calendar design, real economic data ============ */
/* A slide becomes a template without being redesigned: the API (Claude, or a layout heuristic)
   finds which text layers are each row's time, currency, event, values and impact, and the date.
   That reading is stored on the page (pg.live.map); the studio then fills only those texts with
   events from TradingView or Forex Factory, hides the rows it has no event for, and refreshes
   them on its own. Colours, fonts, positions and every other layer stay exactly as designed. */
(function () {
  const IMP = { high: 3, medium: 2, low: 1 };
  const IMP_WORD = { en: { high: 'High', medium: 'Medium', low: 'Low' }, ar: { high: 'عالي', medium: 'متوسط', low: 'منخفض' } };
  const CTRY = [['US', 'USD'], ['EU', 'EUR'], ['GB', 'GBP'], ['JP', 'JPY'], ['DE', 'DE'], ['CA', 'CAD'], ['AU', 'AUD'], ['NZ', 'NZD'], ['CH', 'CHF'], ['CN', 'CNY']];
  const SOURCES = [['tradingview', 'TradingView · with actual values'], ['forexfactory', 'Forex Factory · forecasts only']];
  const EVERY = [[1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [60, '1 hour']];
  const ROLES = [['time', 'Time'], ['currency', 'Currency'], ['country', 'Country'], ['flag', 'Flag'], ['event', 'Event'], ['value', 'Value'], ['actual', 'Actual'], ['forecast', 'Forecast'], ['previous', 'Previous'], ['impact', 'Impact']];
  const VAL_ONLY = /^[^{}]*(\{(actual|forecast|previous|value)\}[^{}]*)+$/;
  const defaults = () => ({ v: 1, src: 'tradingview', day: 'publish', date: '', impact: ['high', 'medium'], countries: ['US', 'EU', 'GB', 'JP', 'DE', 'CA', 'AU', 'CN'], lang: 'en', pick: null, values: true, every: 15, paused: false, map: null, orig: {}, at: 0 });
  const livePages = (d) => (d && d.pages ? d.pages.filter((pg) => pg.live && pg.live.map) : []);
  const pad2 = (n) => String(n).padStart(2, '0');

  /* ---------- data ---------- */
  const feed = new Map(); // "date|tz|countries|src" → { at, p }
  function fetchDay(cfg, date) {
    const tz = schedTz(), k = [date, tz, cfg.countries.join(','), cfg.src].join('|'), hit = feed.get(k);
    if (hit && Date.now() - hit.at < 60_000) return hit.p;
    const qs = new URLSearchParams({ date, tz, countries: cfg.countries.join(','), source: cfg.src });
    const p = api('/social/calendar/events?' + qs).catch((e) => { feed.delete(k); throw e; });
    feed.set(k, { at: Date.now(), p }); return p;
  }
  const addDay = (date, n) => { const [y, m, d] = date.split('-').map(Number), x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10); };
  /** Which day a page shows: the post's day when rendering a post, otherwise its setting */
  function dayFor(cfg, d, post) {
    const day = dayOf(cfg, d, post);
    return isWeek(cfg) ? weekOf(day) : day;
  }
  function dayOf(cfg, d, post) {
    const today = nowIn(schedTz()).date, wk = isWeek(cfg);
    if (cfg.day === 'today') return today;
    if (cfg.day === 'tomorrow') return addDay(today, wk ? 7 : 1); // weekly slides: next week
    if (cfg.day === 'fixed' && /^\d{4}-\d{2}-\d{2}$/.test(cfg.date)) return cfg.date;
    if (post && post.date) return post.date;
    // "the day it's published": the next scheduled post of this design, else today
    const next = S.posts.filter((p) => p.d === d.id && p.status === 'Scheduled' && p.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    return next ? next.date : today;
  }
  /** Weekly slides show Monday to Friday: on a Saturday or Sunday that's the coming week */
  const weekOf = (date) => { const wd = new Date(date + 'T12:00:00Z').getUTCDay(); return wd === 6 ? addDay(date, 2) : wd === 0 ? addDay(date, 1) : date; };
  const isWeek = (cfg) => cfg.map && cfg.map.layout === 'week' && cfg.map.week;
  const weekDays = (date) => { const [y, m, d] = date.split('-').map(Number), at = new Date(Date.UTC(y, m - 1, d, 12)), mon = new Date(at.getTime() - ((at.getUTCDay() + 6) % 7) * 864e5); return [0, 1, 2, 3, 4].map((i) => new Date(mon.getTime() + i * 864e5).toISOString().slice(0, 10)); };
  /** What a page needs: the events of its day, or of the whole week for a weekly layout */
  async function dataFor(cfg, date) {
    if (!isWeek(cfg)) { const r = await fetchDay(cfg, date); return { ...r, byDay: null }; }
    const days = weekDays(date), rs = await Promise.all(days.map((x) => fetchDay(cfg, x)));
    return { source: rs[0].source, errors: rs.flatMap((r) => r.errors || []), events: rs.flatMap((r) => r.events), byDay: Object.fromEntries(days.map((x, i) => [x, rs[i].events])) };
  }
  /** Events for the rows: the hand-picked ones of that day, else the most important (then in time order) */
  function choose(events, cfg, n) {
    if (cfg.pick && cfg.pick.length) { const set = new Set(cfg.pick), mine = events.filter((e) => set.has(e.id)); if (mine.length) return mine.slice(0, n); }
    const ok = events.filter((e) => cfg.impact.includes(e.impact));
    return ok.map((e, i) => ({ e, i })).sort((a, b) => IMP[b.e.impact] - IMP[a.e.impact] || a.i - b.i).slice(0, n).sort((a, b) => a.i - b.i).map((x) => x.e);
  }
  const hhmm = (iso) => { const p = tzParts(Date.parse(iso), schedTz()); return pad2(+p.hour % 24) + ':' + p.minute; };
  /** The design's own way of writing times ("13:30", "1.30 PM", "01:30 pm"), read from its first row */
  function timeFmt(text) {
    const m = /(\d{1,2})([:.h])(\d{2})(\s*)(am|pm)?/i.exec(String(text || '')); if (!m) return null;
    return { sep: m[2], pad: m[1].length === 2, h12: !!m[5], space: m[4] || (m[5] ? ' ' : ''), upper: !!m[5] && m[5] === m[5].toUpperCase() };
  }
  function timeIn(iso, f) {
    const p = tzParts(Date.parse(iso), schedTz()), h = +p.hour % 24;
    if (!f) return pad2(h) + ':' + p.minute;
    if (!f.h12) return (f.pad ? pad2(h) : h) + f.sep + p.minute;
    const ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
    return (f.pad ? pad2(h12) : h12) + f.sep + p.minute + f.space + (f.upper ? ap : ap.toLowerCase());
  }
  /** Country flag (vector, so it stays sharp at any size) */
  const flagOf = (e) => { const cc = String(e.country || '').toLowerCase(); return /^[a-z]{2}$/.test(cc) ? `url('https://flagcdn.com/${cc}.svg') center/cover no-repeat` : null; }; // single quotes: layer styles sit in a double-quoted attribute
  /** "United States" / "الولايات المتحدة"; the euro area has no region code of its own */
  const countryName = (cc, lang) => {
    if (cc === 'EU') return lang === 'ar' ? 'منطقة اليورو' : 'Euro Area';
    try { return new Intl.DisplayNames([lang === 'ar' ? 'ar' : 'en'], { type: 'region' }).of(cc) || cc; } catch (x) { return cc || ''; }
  };
  function values(e, cfg) {
    const v = (x) => (x == null || x === '' ? '—' : x), sym = cfg.map.impactSymbol;
    return {
      time: timeIn(e.at, cfg.map.timeFmt), currency: e.currency || e.country, country: e.country, countryName: countryName(e.country, cfg.lang), event: cfg.lang === 'ar' ? (e.translated ? e.ar : (cfg.evAr && cfg.evAr[e.en]) || e.ar) : e.en,
      actual: v(e.actual), forecast: v(e.forecast), previous: v(e.previous), value: v(e.actual ?? e.forecast ?? e.previous),
      impact: sym ? Array(IMP[e.impact]).fill(sym).join(cfg.map.impactSep || '') : IMP_WORD[cfg.lang === 'ar' ? 'ar' : 'en'][e.impact],
    };
  }
  /** Values for day / week / time zone placeholders; the week is Monday to Friday of the post's day */
  function dateValues(date, lang) {
    const [y, m, d] = date.split('-').map(Number), at = new Date(Date.UTC(y, m - 1, d, 12)), loc = lang === 'ar' ? 'ar' : 'en-GB';
    const f = (o, t = at) => new Intl.DateTimeFormat(loc === 'en-GB' && o.month === 'short' ? 'en-US' : loc, { timeZone: 'UTC', ...o }).format(t);
    const ws = new Date(at.getTime() - ((at.getUTCDay() + 6) % 7) * 864e5), we = new Date(ws.getTime() + 4 * 864e5);
    return {
      weekday: f({ weekday: 'long' }), wd: f({ weekday: 'short' }), day: f({ day: 'numeric' }), month: f({ month: 'long' }), mon: f({ month: 'short' }), year: f({ year: 'numeric' }),
      weekStartDay: f({ day: 'numeric' }, ws), weekStartMon: f({ month: 'short' }, ws), weekStartMonth: f({ month: 'long' }, ws),
      weekEndDay: f({ day: 'numeric' }, we), weekEndMon: f({ month: 'short' }, we), weekEndMonth: f({ month: 'long' }, we),
      tz: tzShort() || schedTz(),
    };
  }
  /* ---------- whole-slide language ---------- */
  const AR_RE = /[\u0600-\u06FF]/;
  /** Offline fallback when no Claude key is set: the words calendar posts use most */
  const DICT_AR = [['economic calendar', 'المفكرة الاقتصادية'], ['high impact', 'عالية التأثير'], ['key events', 'أهم الأحداث'], ['this week', 'هذا الأسبوع'], ['times in', 'التوقيت'], ['actual', 'الفعلي'], ['forecast', 'المتوقع'], ['previous', 'السابق'], ['news', 'الأخبار'], ['today', 'اليوم'], ['tomorrow', 'غداً'], ['impact', 'التأثير'], ['event', 'الحدث'], ['events', 'الأحداث'], ['time', 'الوقت'], ['currency', 'العملة'], ['week', 'الأسبوع'], ['weekly', 'أسبوعي'], ['outlook', 'نظرة عامة'], ['calendar', 'المفكرة'], ['market', 'السوق'], ['markets', 'الأسواق']];
  function dictAr(t) {
    let out = t, hit = false;
    [...DICT_AR].sort((a, b) => b[0].length - a[0].length).forEach(([en, ar]) => { out = out.replace(new RegExp(`(^|[^\\p{L}{])${en}(?=$|[^\\p{L}}])`, 'giu'), (m, pre) => { hit = true; return pre + ar; }); });
    return hit ? out : null;
  }
  /** Texts of a page that follow the language: fixed texts, text templates and row templates with words in them */
  function i18nItems(pg) {
    const cfg = pg.live, map = cfg.map, items = [];
    const words = (t) => /\p{L}{2,}/u.test(String(t || '').replace(/\{\w+\}/g, ''));
    (map.texts || []).forEach((t) => { const src = t.template || (cfg.orig[t.layerId] || {}).text; if (src && (t.translate || t.template) && words(src)) items.push({ id: 't:' + t.layerId, text: src }); });
    const seen = new Set();
    map.rows.forEach((r) => r.fields.forEach((f) => { if (words(f.template) && !['event', 'currency', 'country', 'flag', 'time', 'impact'].includes(f.role) && !seen.has(f.template)) { seen.add(f.template); items.push({ id: 'f:' + f.template, text: f.template }); } }));
    if (map.date && words(map.date.template.replace(/\{\w+\}/g, ''))) items.push({ id: 'd:' + map.date.layerId, text: map.date.template });
    if (map.week) { [['w:line', map.week.list.lineTemplate], ['w:group', map.week.groupHeader && map.week.groupHeader.template], ['w:day', map.week.dayHeader.template]].forEach(([id, t]) => { if (t && words(t)) items.push({ id, text: t }); }); }
    return items;
  }
  /** Arabic names the built-in rules don't know (new indicators): Claude translates them once per page */
  const arPending = new Map(); // English name → request in flight (refreshes running at once share it)
  async function arabicNames(cfg, events) {
    cfg.evAr = cfg.evAr || {};
    const waiting = events.filter((e) => !e.translated && !(e.en in cfg.evAr) && arPending.has(e.en));
    if (waiting.length) { await Promise.all([...new Set(waiting.map((e) => arPending.get(e.en)))]); waiting.forEach((e) => { const v = arPending.get(e.en + '\u0000v'); if (v) cfg.evAr[e.en] = v; }); }
    const todo = [...new Set(events.filter((e) => !e.translated && !(e.en in cfg.evAr)).map((e) => e.en))].slice(0, 100);
    if (!todo.length) return;
    let done; const p = new Promise((ok) => (done = ok)); todo.forEach((t) => arPending.set(t, p));
    try {
      const r = await api('/social/calendar/translate', { method: 'POST', body: { items: todo.map((t, i) => ({ id: 'e' + i, text: t })), to: 'ar' } });
      const got = new Map((r.items || []).filter((x) => x.translated).map((x) => [x.id, x.text]));
      todo.forEach((t, i) => { if (got.has('e' + i)) { cfg.evAr[t] = got.get('e' + i); arPending.set(t + '\u0000v', cfg.evAr[t]); } });
    } catch (e) { /* keep the English name */ } finally { todo.forEach((t) => arPending.delete(t)); done(); }
  }
  /** Makes sure the page has its texts in `lang`; Claude when a key is set, the small dictionary otherwise */
  async function ensureI18n(pg, lang) {
    const cfg = pg.live; if (!cfg || lang === (cfg.srcLang || 'en')) return true;
    cfg.i18n = cfg.i18n || {}; const have = cfg.i18n[lang] = cfg.i18n[lang] || {};
    const todo = i18nItems(pg).filter((i) => !(i.id in have)); if (!todo.length) return true;
    let r = { engine: 'none', items: [] };
    try { r = await api('/social/calendar/translate', { method: 'POST', body: { items: todo, to: lang, brand: brand().name } }); } catch (e) { /* offline: dictionary */ }
    const got = new Map((r.items || []).filter((i) => i.translated).map((i) => [i.id, i.text]));
    todo.forEach((i) => { have[i.id] = got.get(i.id) ?? (lang === 'ar' ? dictAr(i.text) : null) ?? i.text; });
    cfg.i18nEngine = r.engine === 'claude' ? 'claude' : 'dictionary';
    return true;
  }
  const tr = (cfg, id, src) => (cfg.lang !== (cfg.srcLang || 'en') && cfg.i18n && cfg.i18n[cfg.lang] && cfg.i18n[cfg.lang][id]) || src;
  /** Latin-only fonts can't draw Arabic: use the brand's Arabic font for Arabic texts */
  const AR_OK = /cairo|tajawal|noto (sans|kufi|naskh) arabic|ibm plex sans arabic|almarai|amiri|changa|readex|vazir|rubik/i;
  const arFont = (f) => (AR_OK.test(f || '') ? f : brand().fonts.arabic || 'Cairo');
  const fill = (tpl, vals) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));

  /* Keeping the layout: a text that was one line stays one line (shrunk up to 72%, then it may wrap) */
  const mctx = document.createElement('canvas').getContext('2d');
  const textW = (l, text, size) => { mctx.font = `${l.it ? 'italic ' : ''}${l.weight || 400} ${size}px '${l.font}', sans-serif`; return Math.max(...String(text).split('\n').map((t) => mctx.measureText(t).width + (l.ls || 0) * [...t].length)); };
  function fitSize(l, o, text) {
    const size = o.size || l.size; if (!size || !l.w || String(o.text || '').includes('\n')) return size;
    if (textW(l, o.text || '', size) > (o.w || l.w) * 1.02) return size; // the original already wrapped: leave it
    const w = textW(l, text, size); return w <= l.w ? size : Math.max(Math.round(size * 0.72), Math.floor(size * (l.w / w) * 0.98));
  }
  /** The design's own currency colours, learned from its original rows: { USD: '#2b6cb0', … } */
  function badgeOf(pg, row, curId) {
    const c = pg.layers.find((l) => l.id === curId); if (!c) return null;
    const x = c.x + c.w / 2, y = c.y + c.h / 2;
    return pg.layers.find((l) => l.type !== 'text' && row.layerIds.includes(l.id) && x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h && l.w < c.w * 3) || null;
  }
  function palette(pg, cfg) {
    const pal = {};
    cfg.map.rows.forEach((row) => { const f = row.fields.find((x) => x.role === 'currency'); if (!f) return; const b = badgeOf(pg, row, f.layerId), o = cfg.orig[f.layerId], ob = b && cfg.orig[b.id]; if (b && o && ob && typeof ob.fill === 'string') pal[String(o.text).trim().toUpperCase()] = ob.fill; });
    return new Set(Object.values(pal)).size > 1 ? pal : null; // one colour for every currency: the design doesn't colour-code
  }

  /** Writes the events into a page's mapped layers. Returns true when something changed. */
  /** Logo lockups (an icon right next to a short brand text, or texts the analysis calls brand): id → designed box of the group */
  function lockups(pg, cfg) {
    const out = new Map(), G = cfg.geo || {}, box = (l) => ({ x: (G[l.id] || l).x, y: l.y, w: l.w, h: l.h });
    const brandIds = new Set((cfg.map.texts || []).filter((t) => t.kind === 'brand').map((t) => t.layerId));
    pg.layers.filter((t) => t.type === 'text' && !t.lvw && (brandIds.has(t.id) || /logo|brand/i.test(t.name || ''))).forEach((t) => {
      const b = box(t), icons = pg.layers.filter((o) => o !== t && o.type !== 'text' && !o.locked && o.w < 160 && o.h < 160 && o.y < b.y + b.h && o.y + o.h > b.y && (Math.abs(box(o).x + o.w - b.x) < 40 || Math.abs(b.x + b.w - box(o).x) < 40));
      if (!icons.length && !brandIds.has(t.id)) return;
      const all = [t, ...icons], x0 = Math.min(...all.map((o) => box(o).x)), x1 = Math.max(...all.map((o) => box(o).x + o.w));
      all.forEach((o) => out.set(o.id, { x0, x1 }));
    });
    return out;
  }
  /* ---------- weekly layouts: day blocks rebuilt from the first day and group ---------- */
  const flagEmoji = (cc) => (/^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '');
  /** Spacing of the designed day blocks, measured once when the slide is bound */
  function weekMetrics(pg, wk) {
    const byId = new Map(pg.layers.map((l) => [l.id, l])), dh = byId.get(wk.dayHeader.layerId), list = byId.get(wk.list.layerId), gh = wk.groupHeader && byId.get(wk.groupHeader.layerId), bar = wk.dayBar && byId.get(wk.dayBar), box = wk.container && byId.get(wk.container);
    const slots = wk.slotLayerIds.map((id) => byId.get(id)).filter(Boolean), top = bar ? bar.y : dh.y, headEnd = bar ? bar.y + bar.h : dh.y + dh.h;
    const days = slots.filter((l) => l.type === 'text' && l.y > dh.y + 4 && Math.abs(l.x - dh.x) < 30 && Math.abs((l.size || 0) - (dh.size || 0)) < 2).sort((a, b) => a.y - b.y);
    const nextDayTop = days[0] ? (slots.find((s) => s.type !== 'text' && s.y <= days[0].y && s.y + s.h >= days[0].y + days[0].h) || days[0]).y : null;
    const lists = slots.filter((l) => l.type === 'text' && Math.abs(l.x - list.x) < 30 && Math.abs((l.size || 0) - (list.size || 0)) < 2).sort((a, b) => a.y - b.y);
    const heads = gh ? slots.filter((l) => l.type === 'text' && Math.abs(l.x - gh.x) < 30 && Math.abs((l.size || 0) - (gh.size || 0)) < 2).sort((a, b) => a.y - b.y) : [];
    const gh2 = heads.find((h) => h.y > list.y && (nextDayTop == null || h.y < nextDayTop));
    const lastBefore = lists.filter((l) => nextDayTop == null || l.y < nextDayTop).pop() || list;
    const bottom = Math.max(...slots.map((l) => l.y + l.h)), lineH = (list.size || 18) * (list.lh || 1.2);
    return {
      top, headEnd: headEnd - top, dhOff: dh.y - top, firstGap: (gh ? gh.y : list.y) - headEnd, ghToList: gh ? list.y - (gh.y + gh.h) : 0, ghH: gh ? gh.h : 0, lineH,
      groupGap: gh2 ? gh2.y - (list.y + list.h) : Math.round(lineH), dayGap: nextDayTop != null ? nextDayTop - (lastBefore.y + lastBefore.h) : Math.round(lineH * 1.6),
      limit: box ? box.y + box.h - Math.max(16, box.y + box.h - bottom) : (pg.layers[0] ? pg.layers[0].h - 40 : 1300),
      listW: box ? Math.round(box.x + box.w - list.x - 20) : list.w,
      proto: { dh: JSON.parse(JSON.stringify(dh)), list: JSON.parse(JSON.stringify(list)), ...(gh ? { gh: JSON.parse(JSON.stringify(gh)) } : {}), ...(bar ? { bar: JSON.parse(JSON.stringify(bar)) } : {}) },
      anchor: box ? box.id : wk.slotLayerIds[0],
    };
  }
  /** Rebuilds the day blocks with the week's events; returns true when the slide changed */
  function applyWeek(pg, byDay, cfg) {
    const wk = cfg.map.week, m = cfg.wkm || (cfg.wkm = weekMetrics(pg, wk)), before = JSON.stringify(pg.layers.filter((l) => l.lvw));
    const keep = new Set(pg.live ? choose(Object.values(byDay || {}).flat(), cfg, 999).map((e) => e.id) : []);
    pg.layers = pg.layers.filter((l) => !l.lvw);
    wk.slotLayerIds.forEach((id) => { const l = pg.layers.find((x) => x.id === id); if (l) l.hidden = true; });
    const out = [], P = m.proto, lineTpl = tr(cfg, 'w:line', wk.list.lineTemplate), ghTpl = wk.groupHeader ? tr(cfg, 'w:group', wk.groupHeader.template) : '', dayTpl = tr(cfg, 'w:day', wk.dayHeader.template);
    const add = (proto, id, o) => { const l = { ...JSON.parse(JSON.stringify(proto)), ...o, id, lvw: 1 }; delete l.hidden; out.push(l); cfg.geo[id] = cfg.geo[id] || { x: proto.x, align: proto.align, dir: proto.dir, font: proto.font }; cfg.geo[id].x = proto.x; return l; };
    const days = Object.keys(byDay || {}).sort();
    // fit the whole week: the same number of events per day at most, keeping each day's most important ones
    const byImp = (list) => list.map((e, i) => ({ e, i })).sort((a, b) => IMP[b.e.impact] - IMP[a.e.impact] || a.i - b.i);
    const ranked = Object.fromEntries(days.map((day) => [day, byImp((byDay[day] || []).filter((e) => keep.has(e.id)))]));
    let picked = !!(cfg.pick && cfg.pick.length);
    const caps = Object.fromEntries(days.map((day) => [day, picked ? ranked[day].length : ranked[day].length ? 1 : 0]));
    const pickDay = (day) => ranked[day].slice(0, caps[day]).sort((a, b) => a.i - b.i).map((x) => x.e);
    const height = () => {
      let h = 0, last = 0;
      days.forEach((day) => { const evs = pickDay(day); if (!evs.length) return; const groups = new Set(evs.map((e) => e.country || e.currency)).size; h += m.headEnd + m.firstGap + groups * (m.ghH + m.ghToList) + (groups - 1) * m.groupGap + evs.length * m.lineH + m.dayGap; last = m.dayGap; });
      return h - last;
    };
    // events picked by hand are all shown when they fit; when they don't, the week is shared out like the automatic pick
    if (picked && m.top + height() > m.limit) { picked = false; days.forEach((day) => { caps[day] = ranked[day].length ? 1 : 0; }); }
    // fewer days if even one event each doesn't fit
    for (let k = days.length - 1; !picked && k >= 0 && m.top + height() > m.limit; k--) caps[days[k]] = 0;
    // then add the most important remaining event, whichever day it is on, while the week still fits
    for (let more = !picked; more;) {
      more = false;
      const next = days.filter((day) => caps[day] && caps[day] < ranked[day].length).map((day) => ({ day, e: ranked[day][caps[day]].e })).sort((a, b) => IMP[b.e.impact] - IMP[a.e.impact] || a.e.at.localeCompare(b.e.at));
      for (const c of next) { caps[c.day]++; if (m.top + height() <= m.limit) { more = true; break; } caps[c.day]--; }
    }
    const ghFlag = /^\s*\{flag\}/.test(ghTpl), ghRest = ghTpl.replace(/^\s*\{flag\}\s*/, '');
    let y = m.top, n = 0; const shown = [];
    for (const day of days) {
      const evs = pickDay(day); if (!evs.length) continue;
      if (y + m.headEnd + m.firstGap + m.ghH + m.ghToList + m.lineH > m.limit) break;
      if (P.bar) add(P.bar, `lvw-${n}-bar`, { y });
      add(P.dh, `lvw-${n}-day`, { y: y + m.dhOff, w: P.bar ? Math.round(P.bar.w - (P.dh.x - P.bar.x) * 2) : P.dh.w, text: fill(dayTpl, dateValues(day, cfg.lang)) });
      y += m.headEnd + m.firstGap;
      const groups = []; evs.forEach((e) => { const k = e.country || e.currency; let g = groups.find((x) => x.k === k); if (!g) groups.push(g = { k, e, list: [] }); g.list.push(e); });
      groups.forEach((g, j) => {
        if (y + m.ghH + m.ghToList + m.lineH > m.limit) return;
        if (P.gh) {
          // a flag at the start of the heading is drawn as a picture (emoji flags show as letters on Windows and on the export server)
          const fs = P.gh.size || 20, flag = ghFlag && flagOf(g.e), fw = Math.round(fs * 1.1), fh = Math.round(fs * 0.78), gap = Math.round(fs * 0.4);
          const vals = { flag: flagEmoji(g.e.country), country: g.e.country || '', countryName: countryName(g.e.country, cfg.lang), currency: g.e.currency || '' };
          if (flag) add({ type: 'image', name: 'Flag', x: P.gh.x, y: 0, w: fw, h: fh, rot: 0, op: 1, r: Math.max(2, Math.round(fs * 0.12)), fill: flag, stroke: 'rgba(255,255,255,0.35)', sw: 1 }, `lvw-${n}-f${j}`, { y: Math.round(y + (Math.min(P.gh.h, fs * (P.gh.lh || 1.2)) - fh) / 2) });
          const gx = flag ? P.gh.x + fw + gap : P.gh.x;
          add(flag ? { ...P.gh, x: gx } : P.gh, `lvw-${n}-g${j}`, { y, w: Math.max(P.gh.w - (gx - P.gh.x), m.listW - (gx - P.list.x)), text: fill(flag ? ghRest : ghTpl, vals) });
          y += m.ghH + m.ghToList;
        }
        const room = Math.max(1, Math.floor((m.limit - y) / m.lineH)), lines = g.list.slice(0, room).map((e) => {
          shown.push(e.id);
          let v = values(e, cfg), t = fill(lineTpl, { ...v, tz: tzShort() || schedTz(), flag: flagEmoji(e.country) });
          // a line never wraps: long names are shortened, the time stays
          while (textW(P.list, t, P.list.size) > m.listW && v.event.length > 14) { v = { ...v, event: v.event.replace(/\s*\S+…?$/, '') + '…' }; t = fill(lineTpl, { ...v, tz: tzShort() || schedTz(), flag: flagEmoji(e.country) }); }
          return t;
        });
        const h = Math.round(lines.length * m.lineH);
        add(P.list, `lvw-${n}-l${j}`, { y, h, w: m.listW, text: lines.join('\n') });
        y += h + m.groupGap;
      });
      y += m.dayGap - m.groupGap; n++;
    }
    cfg.shown = shown; // what the slide actually lists (the panel's ticks and count)
    cfg.room = Math.max(0, Math.floor((m.limit - (n ? y - m.dayGap : m.top)) / m.lineH)); // event lines that still fit
    if (!out.length) { add(P.dh, 'lvw-0-day', { y: m.top + m.dhOff, text: cfg.lang === 'ar' ? 'لا توجد أحداث هذا الأسبوع' : 'No events this week' }); }
    const at = pg.layers.findIndex((l) => l.id === m.anchor); pg.layers.splice(at >= 0 ? at + 1 : pg.layers.length, 0, ...out);
    return JSON.stringify(out) !== before;
  }
  function applyPage(pg, events, date, byDay) {
    const cfg = pg.live, map = cfg.map; let byId = new Map(pg.layers.map((l) => [l.id, l])), changed = false;
    // pages bound before whole-slide language: their current layout is the designed one
    if (!cfg.geo) { cfg.geo = {}; pg.layers.forEach((l) => { cfg.geo[l.id] = { x: l.x, align: l.align, dir: l.type === 'text' && !AR_RE.test(String(l.text || '')) ? (l.dir === 'rtl' ? 'ltr' : l.dir) : l.dir, font: (cfg.orig[l.id] && cfg.orig[l.id].font) || l.font }; }); }
    if (!cfg.srcLang) cfg.srcLang = map.rows.some((r) => r.fields.some((f) => f.role === 'event' && AR_RE.test(String((cfg.orig[f.layerId] || {}).text || '')))) ? 'ar' : 'en';
    const set = (id, k, v) => { const l = byId.get(id); if (l && l[k] !== v) { l[k] = v; changed = true; } };
    const shown = (id) => !!(cfg.orig[id] && cfg.orig[id].hidden);
    if (isWeek(cfg)) { changed = applyWeek(pg, byDay || { [date]: events }, cfg) || changed; byId = new Map(pg.layers.map((l) => [l.id, l])); }
    const list = choose(events, cfg, map.rows.length), pal = palette(pg, cfg);
    map.rows.forEach((row, i) => {
      const e = list[i];
      if (!e) { row.layerIds.forEach((id) => set(id, 'hidden', true)); return; }
      row.layerIds.forEach((id) => set(id, 'hidden', shown(id)));
      const vals = values(e, cfg), empty = e.actual == null && e.forecast == null && e.previous == null;
      row.fields.forEach((f) => {
        if (f.role === 'flag') {
          const fl = flagOf(e), l = byId.get(f.layerId); if (!fl || !l) return;
          set(f.layerId, 'fill', fl);
          // a square flag picture is a round flag cropped with its corners: keep the new one round
          if (Math.abs(l.w - l.h) <= Math.max(l.w, l.h) * 0.12) set(f.layerId, 'r', Math.round(Math.min(l.w, l.h) / 2));
          return;
        }
        // speeches and auctions have no figures: hide their value line instead of printing dashes
        if (VAL_ONLY.test(f.template) && (!cfg.values || empty)) return set(f.layerId, 'hidden', true);
        const text = fill(tr(cfg, 'f:' + f.template, f.template), vals), l = byId.get(f.layerId), o = cfg.orig[f.layerId] || {};
        set(f.layerId, 'text', text);
        if (l && l.type === 'text' && f.maxW && o.w) set(f.layerId, 'w', textW(l, text, o.size || l.size) > o.w ? f.maxW : o.w);
        if (l && l.type === 'text' && o.size && f.role !== 'impact') set(f.layerId, 'size', fitSize(l, o, text));
        if (pal && f.role === 'currency') { const b = badgeOf(pg, row, f.layerId), col = pal[vals.currency] || CUR_COLOR[vals.currency]; if (b && col) set(b.id, 'fill', col); }
      });
    });
    const dv = dateValues(date, cfg.lang);
    if (map.tz) set(map.tz.layerId, 'text', fill(map.tz.template, dv));
    if (map.date) set(map.date.layerId, 'text', fill(tr(cfg, 'd:' + map.date.layerId, map.date.template), dv));
    // every other text: day / week / time zone templates, and the language of fixed texts
    (map.texts || []).forEach((t) => {
      const o = cfg.orig[t.layerId]; if (!o || o.text == null) return;
      const src = t.template || o.text, txt = (t.translate || t.template) ? tr(cfg, 't:' + t.layerId, src) : src;
      set(t.layerId, 'text', t.template || txt !== src ? fill(txt, dv) : o.text);
    });
    // direction, fonts and (for a slide designed left-to-right shown in Arabic) the mirrored layout
    const W = (pg.layers[0] && pg.layers[0].w) || 1080, mirror = cfg.lang === 'ar' && (cfg.srcLang || 'en') !== 'ar' && cfg.mirror !== false;
    const lock = mirror ? lockups(pg, cfg) : new Map();
    pg.layers.forEach((l) => {
      const g = cfg.geo && cfg.geo[l.id]; if (!g) return;
      if (l.locked && l.w >= W * 0.98) return;
      const u = lock.get(l.id); // a logo moves as one block and keeps its own order
      set(l.id, 'x', !mirror ? g.x : u ? Math.round((W - u.x1 + (g.x - u.x0)) * 10) / 10 : Math.round((W - g.x - l.w) * 10) / 10);
      if (u && l.type === 'text') { set(l.id, 'align', g.align); if (g.font) set(l.id, 'font', g.font); return; }
      if (l.type !== 'text') return;
      set(l.id, 'align', mirror ? ({ left: 'right', right: 'left' }[g.align || 'left'] || g.align) : g.align);
      const ar = AR_RE.test(String(l.text || ''));
      set(l.id, 'dir', ar ? 'rtl' : (g.dir || 'ltr'));
      if (g.font) set(l.id, 'font', ar ? arFont(g.font) : g.font);
    });
    return changed;
  }
  const sigOf = (events, cfg, n) => choose(events, cfg, n).map((e) => [e.id, e.actual, e.forecast, e.previous].join('~')).join('|');

  /** Refreshes every live page of a design. `silent`: no toast on failure (background updates). */
  async function refresh(d, { silent = true, force = false } = {}) {
    let changed = false, err = null;
    for (const pg of livePages(d)) {
      const cfg = pg.live; if (cfg.paused && !force) continue;
      try {
        const date = dayFor(cfg, d), r = await dataFor(cfg, date);
        if (cfg.lang === 'ar') await arabicNames(cfg, r.events);
        cfg.feed = { date, source: r.source, count: r.events.length, errors: r.errors || [], week: !!r.byDay };
        cfg.events = r.events; // shown in the panel; not needed for rendering
        changed = applyPage(pg, r.events, date, r.byDay) || changed; cfg.at = Date.now(); cfg.err = '';
      } catch (e) { err = e; pg.live.err = e.message; }
    }
    if (changed) { d.upd = 'Just now'; save(); }
    if (ED.d === d && $('.ed')) { if (changed && !ED.editing) { edStage(); edPages(); } if (ED.tab === 'data') edPanel(); }
    if (err && !silent) toast('Live data: ' + err.message);
    return changed;
  }

  /** The design as a post published on its day would show it (a copy: the design itself is untouched) */
  async function forPost(d, post) {
    if (!livePages(d).length) return d;
    const c = JSON.parse(JSON.stringify(d));
    c.liveUsed = [];
    for (const [i, pg] of c.pages.entries()) {
      if (!pg.live || !pg.live.map) continue;
      try {
        const date = dayFor(pg.live, c, post), r = await dataFor(pg.live, date); applyPage(pg, r.events, date, r.byDay);
        c.liveUsed.push({ page: i, date, source: r.source, events: r.events.length, shown: choose(r.events, pg.live, pg.live.map.rows.length).map((e) => `${hhmm(e.at)} ${e.currency || e.country} ${e.en}`) });
      } catch (e) { c.liveUsed.push({ page: i, error: e.message }); /* keep the last data */ }
    }
    return c;
  }
  LIVE = { forPost, refresh };

  const tzShort = () => (tzLabel(schedTz()).match(/\(([^)]+)\)/) || [, ''])[1];
  /* ---------- reading a slide ---------- */
  const layersIn = (pg) => pg.layers.map((l) => ({ id: l.id, type: l.type, name: l.name, text: l.type === 'text' ? String(l.text ?? '') : undefined, x: +l.x || 0, y: +l.y || 0, w: +l.w || 0, h: +l.h || 0, size: l.size, weight: l.weight, color: typeof l.color === 'string' ? l.color : undefined, locked: !!l.locked, hidden: !!l.hidden }));
  async function preview(d, i) {
    const [w, h] = RATIOS[d.ratio], s = Math.min(1, 1000 / Math.max(w, h));
    try { const b = await renderSlide(d, i, s, 'jpeg'); return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); } catch (e) { return undefined; }
  }
  async function analyze(d, i, engine) {
    const pg = d.pages[i], [w, h] = RATIOS[d.ratio];
    return api('/social/calendar/analyze', { method: 'POST', body: { layers: layersIn(pg), w, h, engine, image: engine === 'heuristic' ? undefined : await preview(d, i) } });
  }
  /** Binds the mapping to the page (undoable) and fills it with live data */
  function bind(pg, map, keep) {
    const cfg = { ...defaults(), ...(keep || {}), map, orig: {} };
    const ids = new Set([...map.rows.flatMap((r) => r.layerIds), ...(map.date ? [map.date.layerId] : []), ...(map.tz ? [map.tz.layerId] : []), ...(map.texts || []).map((t) => t.layerId), ...(map.week ? map.week.slotLayerIds : [])]);
    const t0 = map.rows[0] && map.rows[0].fields.find((f) => f.role === 'time'), tl = t0 && pg.layers.find((l) => l.id === t0.layerId);
    if (tl && !map.timeFmt) map.timeFmt = timeFmt((keep && keep.orig && keep.orig[tl.id] && keep.orig[tl.id].text) || tl.text);
    // "★ ★ ★" keeps its spaces, so filled stars still line up with an empty track behind them
    const i0 = map.rows[0] && map.rows[0].fields.find((f) => f.role === 'impact'), il = i0 && pg.layers.find((l) => l.id === i0.layerId);
    if (il && map.impactSymbol && map.impactSep == null) { const t = String((keep && keep.orig && keep.orig[il.id] && keep.orig[il.id].text) || il.text || ''), a = t.indexOf(map.impactSymbol), b = t.indexOf(map.impactSymbol, a + map.impactSymbol.length); map.impactSep = a >= 0 && b > a ? t.slice(a + map.impactSymbol.length, b) : ''; }
    pg.layers.forEach((l) => { if (ids.has(l.id)) cfg.orig[l.id] = { hidden: !!l.hidden, text: l.text, dir: l.dir, size: l.size, fill: l.fill, font: l.font, w: l.w, r: l.r }; });
    roomFor(pg, cfg);
    if (keep && keep.orig) Object.entries(keep.orig).forEach(([id, o]) => { cfg.orig[id] = { ...(cfg.orig[id] || {}), ...o }; }); // re-analysis keeps the first originals
    // a design written in Arabic stays Arabic
    const evText = map.rows.flatMap((r) => r.fields.filter((f) => f.role === 'event')).map((f) => (pg.layers.find((l) => l.id === f.layerId) || {}).text || '').join(' ');
    cfg.srcLang = keep && keep.srcLang ? keep.srcLang : /[\u0600-\u06FF]/.test(evText) ? 'ar' : 'en';
    cfg.lang = keep && keep.lang ? keep.lang : cfg.srcLang;
    // the designed layout of every layer: mirroring for right-to-left always starts from it
    cfg.geo = (keep && keep.geo) || {};
    pg.layers.forEach((l) => { if (!cfg.geo[l.id]) cfg.geo[l.id] = { x: l.x, align: l.align, dir: l.dir, font: l.font }; });
    if (keep && keep.i18n) cfg.i18n = keep.i18n;
    if (map.layout === 'week' && map.week) { cfg.wkm = weekMetrics(pg, map.week); cfg.pick = null; const ll = pg.layers.find((l) => l.id === map.week.list.layerId); if (ll && !map.timeFmt) map.timeFmt = timeFmt(ll.text); }
    pg.live = cfg;
  }
  /** Free space to the right of each left-aligned data text (up to the next element in its row, or its card's edge):
      long live names use it before they shrink, so they don't wrap in a box sized for a short sample */
  function roomFor(pg, cfg) {
    const byId = new Map(pg.layers.map((l) => [l.id, l]));
    cfg.map.rows.forEach((row) => row.fields.forEach((f) => {
      const l = byId.get(f.layerId); if (!l || l.type !== 'text' || (l.align && l.align !== 'left') || l.dir === 'rtl' || ['time', 'currency', 'impact'].includes(f.role)) return;
      const top = l.y, bot = l.y + l.h, right = l.x + l.w;
      const side = row.layerIds.map((id) => byId.get(id)).filter((o) => o && o.id !== l.id && o.x >= right - 1 && o.y < bot && o.y + o.h > top && !(o.type !== 'text' && o.x <= l.x));
      const card = row.layerIds.map((id) => byId.get(id)).find((o) => o && o.type !== 'text' && o.x <= l.x && o.x + o.w >= right && o.y <= top && o.y + o.h >= bot);
      const limit = Math.min(...side.map((o) => o.x - 16), card ? card.x + card.w - 20 : pg.layers[0] && pg.layers[0].w ? pg.layers[0].w - 40 : Infinity);
      if (Number.isFinite(limit) && limit - l.x > l.w) f.maxW = Math.round(limit - l.x);
    }));
  }
  function unbind(pg) {
    const cfg = pg.live; if (!cfg) return;
    pg.layers = pg.layers.filter((l) => !l.lvw);
    pg.layers.forEach((l) => { const g = cfg.geo && cfg.geo[l.id]; if (!g) return; l.x = g.x; if (l.type === 'text') { if (g.align) l.align = g.align; if (g.dir) l.dir = g.dir; else delete l.dir; if (g.font) l.font = g.font; } });
    pg.layers.forEach((l) => { const o = cfg.orig[l.id]; if (!o) return; if (o.hidden) l.hidden = true; else delete l.hidden; if (o.text != null && l.type === 'text') l.text = o.text; if (o.dir) l.dir = o.dir; else delete l.dir; if (o.size) l.size = o.size; if (o.w) l.w = o.w; if (o.r !== undefined && l.type !== 'text') l.r = o.r; if (o.font) l.font = o.font; if (o.fill !== undefined && l.type !== 'text') l.fill = o.fill; });
    delete pg.live;
  }

  /* quick detection when the panel opens on an unbound slide (layout heuristic, no AI cost) */
  const peek = new Map(); // page signature → result | promise
  const pageSig = (pg) => JSON.stringify(pg.layers.map((l) => [l.id, l.text, Math.round(l.x), Math.round(l.y)]));
  function peekPage(d, i) {
    const k = pageSig(d.pages[i]); if (peek.has(k)) return peek.get(k);
    const p = analyze(d, i, 'heuristic').then((r) => (peek.set(k, r), (ED.d === d && ED.tab === 'data' && edPanel()), r)).catch(() => (peek.delete(k), null));
    peek.set(k, p); return p;
  }

  /* ---------- Brand Kit template ---------- */
  function brandCalendar(w, h, style, lang, rows) {
    const b = brand(), col = (n, f) => ((b.colors.find((c) => c.name === n) || {}).hex || f);
    const primary = col('Primary', '#FD0E35'), dark = col('Dark', '#0B1220'), light = col('Light', '#F8FAFC');
    const S7 = {
      dark: { bg: `radial-gradient(ellipse 120% 60% at 15% 100%, ${primary}66 0%, transparent 65%), ${dark}`, fg: '#FFFFFF', muted: 'rgba(255,255,255,.72)', card: 'rgba(255,255,255,.06)', line: 'rgba(255,255,255,.08)', accent: primary },
      light: { bg: light, fg: dark, muted: 'rgba(15,23,42,.62)', card: 'rgba(15,23,42,.045)', line: 'rgba(15,23,42,.08)', accent: primary },
      brand: { bg: `linear-gradient(160deg, ${primary}, ${shade(primary, -0.35)})`, fg: '#FFFFFF', muted: 'rgba(255,255,255,.8)', card: 'rgba(0,0,0,.16)', line: 'rgba(255,255,255,.14)', accent: '#FFFFFF' },
    }[style];
    const L = tplCalendar(w, h, lang, EVENTS_DEFAULT.slice(0, rows));
    const head = b.fonts.heading || 'Plus Jakarta Sans', body = b.fonts.body || 'Inter', ar = lang === 'ar' ? (b.fonts.arabic || 'Cairo') : null;
    L.forEach((l) => {
      if (l.name === 'Background') { l.fill = S7.bg; return; }
      if (/^Row \d/.test(l.name)) { l.fill = S7.card; l.stroke = S7.line; return; }
      if (l.type !== 'text') return;
      if (l.name === 'Kicker') { l.text = lang === 'ar' ? 'المفكرة الاقتصادية' : 'ECONOMIC CALENDAR'; l.color = S7.accent; }
      else if (l.name === 'Headline') { l.text = lang === 'ar' ? 'أهم الأحداث' : 'Key events'; l.color = S7.fg; l.size = Math.round(l.size * 0.82); }
      else if (l.name === 'Impact') l.color = S7.accent;
      else if (l.name === 'Footer') { l.text = b.website || b.handle || b.name; l.color = S7.muted; }
      else if (l.name === 'Date') l.color = S7.muted;
      else if (l.name !== 'Currency label') l.color = S7.fg;
      l.font = ar && l.name !== 'Time' ? ar : ['Kicker', 'Headline'].includes(l.name) ? head : body;
    });
    return L;
  }

  /* ---------- panel ---------- */
  const tab = () => ED.liveTab || 'slide';
  const stamp = (cfg) => (cfg && cfg.at ? `<span class="lv-ok" title="Data from ${esc(cfg.feed ? cfg.feed.source : '')}"><i></i>Updated ${esc(new Date(cfg.at).toLocaleTimeString('en-GB', { timeZone: schedTz() }))} ${esc(tzShort())}</span>` : '');
  const sec = (title, body, extra = '') => `<section class="lv-sec"><div class="lv-sec-h"><b>${title}</b>${extra}</div>${body}</section>`;
  const field = (label, body) => `<div class="lv-f"><span class="lv-l">${label}</span>${body}</div>`;
  const seg = (act, cur, opts) => `<div class="seg lv-seg">${opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-act="${act}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  const flagImg = (cc) => (/^[A-Z]{2}$/.test(cc || '') ? `<img class="lv-flag" src="https://flagcdn.com/${cc.toLowerCase()}.svg" alt="" loading="lazy">` : '');
  function evRow(e, on, cfg) {
    const name = cfg.lang === 'ar' ? (e.translated ? e.ar : (cfg.evAr && cfg.evAr[e.en]) || e.ar) : e.en;
    const fig = [['A', e.actual, 'Actual'], ['F', e.forecast, 'Forecast'], ['P', e.previous, 'Previous']].filter(([, v]) => v != null && v !== '').map(([k, v, t]) => `<span class="fg${k === 'A' ? ' a' : ''}" title="${t}"><em>${k}</em>${esc(v)}</span>`).join('');
    return `<button class="lv-ev ${on ? 'on' : ''}" data-act="lvPick" data-id="${esc(e.id)}" data-ev="${esc(e.id)}" aria-pressed="${on}" title="${esc(name)}${on ? ' · on the slide' : ''}">
      <span class="cbx ${on ? 'on' : ''}">${on ? ic('check', 12) : ''}</span>
      <span class="lv-evb"><span class="r1"><span class="n">${esc(name)}</span><span class="st i${IMP[e.impact]}">${'★'.repeat(IMP[e.impact])}</span></span>
        <span class="r2"><b class="t">${timeIn(e.at, cfg.map && cfg.map.timeFmt)}</b><span class="cc">${flagImg(e.country)}${esc(e.currency || e.country)}</span>${fig ? `<span class="fgs">${fig}</span>` : ''}</span></span></button>`;
  }
  /** The period picker's month grid (Monday first). Weekly slides pick a whole row: Monday to Friday light up together. */
  function calPop(wk, shownDate) {
    const ym = ED.lvCal.ym || shownDate.slice(0, 7), [y, m] = ym.split('-').map(Number), today = nowIn(schedTz()).date;
    const first = new Date(Date.UTC(y, m - 1, 1, 12)), start = addDay(first.toISOString().slice(0, 10), -((first.getUTCDay() + 6) % 7));
    const selW = wk ? weekDays(shownDate) : null, rows = [];
    for (let r = 0; r < 6; r++) {
      const mon = addDay(start, r * 7); if (r === 5 && mon.slice(0, 7) !== ym) break;
      const on = wk && selW[0] === mon;
      rows.push(`<div class="lv-cal-w ${wk ? 'wk' : ''} ${on ? 'on' : ''}">${[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const dd = addDay(mon, i), cls = [dd.slice(0, 7) !== ym && 'out', dd === today && 'today', i > 4 && 'we', !wk && dd === shownDate && 'sel', wk && on && i < 5 && 'in'].filter(Boolean).join(' ');
        return `<button class="${cls}" data-act="lvCalPick" data-d="${wk ? mon : dd}" aria-label="${esc(fmt(new Date(dd + 'T12:00'), { weekday: 'long', day: 'numeric', month: 'long' }))}">${+dd.slice(8)}</button>`;
      }).join('')}</div>`);
    }
    const monthName = fmt(first, { month: 'long', year: 'numeric' }), tw = wk ? weekOf(today) : today;
    return `<div class="lv-cal" role="dialog" aria-label="Choose a ${wk ? 'week' : 'day'}">
      <div class="lv-cal-h"><button class="lv-pa" data-act="lvCalM" data-n="-1" aria-label="Previous month">${ic('chevL', 15)}</button><b>${esc(monthName)}</b><button class="lv-pa" data-act="lvCalM" data-n="1" aria-label="Next month">${ic('chevR', 15)}</button></div>
      <div class="lv-cal-dw">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => `<span class="${i > 4 ? 'we' : ''}">${x}</span>`).join('')}</div>${rows.join('')}
      <div class="lv-cal-f"><button data-act="lvCalPick" data-d="${tw}">${wk ? 'This week' : 'Today'}</button><button data-act="lvCalPick" data-d="${wk ? addDay(tw, 7) : addDay(today, 1)}">${wk ? 'Next week' : 'Tomorrow'}</button></div></div>`;
  }
  /** The figures switch, only when the slide prints figures (rows with {actual} {forecast} {previous} {value}), named after them */
  function figSw(map, cfg) {
    const kinds = new Set(); (map.rows || []).forEach((r) => r.fields.forEach((f) => (String(f.template || '').match(/\{(actual|forecast|previous|value)\}/g) || []).forEach((m) => kinds.add(m.slice(1, -1)))));
    if (!kinds.size) return '';
    const names = { actual: 'Actual', forecast: 'Forecast', previous: 'Previous', value: 'Value' }, list = ['actual', 'forecast', 'previous', 'value'].filter((k) => kinds.has(k)).map((k) => names[k]);
    const title = list.length > 1 ? list.slice(0, -1).join(', ') + ' & ' + list[list.length - 1].toLowerCase() : list[0];
    return `<div class="lv-swr"><div class="grow"><b>${title}</b><p>Show the figures line. Events without figures hide it.</p></div>${sw(cfg.values, 'lvVals', '', title)}</div>`;
  }
  /** "Oct 19 – 23, 2026" / "Tue, Oct 20, 2026" */
  function periodLabel(date, wk) {
    if (!wk) return fmt(new Date(date + 'T12:00'), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const w = weekDays(date), a = new Date(w[0] + 'T12:00'), b = new Date(w[4] + 'T12:00');
    return a.getMonth() === b.getMonth() ? `${fmt(a, { month: 'short', day: 'numeric' })} – ${b.getDate()}, ${b.getFullYear()}` : `${fmt(a, { month: 'short', day: 'numeric' })} – ${fmt(b, { month: 'short', day: 'numeric' })}, ${b.getFullYear()}`;
  }
  /* ---------- star pictures → editable stars ---------- */
  /* A rating drawn as a picture can't follow the data. Claude reads one of them (symbol, colours);
     each picture's own pixels give the exact size, spacing and position of its symbols; then every
     row's picture is replaced by two aligned text layers: the empty "track" behind, the filled ones in front. */
  /** Per row, the pictures that draw its rating: one wide picture, or one small picture per symbol (Figma exports) */
  function ratingGroups(pg, map) {
    const byId = new Map(pg.layers.map((l) => [l.id, l])), mapped = new Set(map.rows.flatMap((r) => r.fields.map((f) => f.layerId)));
    const W = (pg.layers[0] && pg.layers[0].w) || 1080;
    return map.rows.map((row) => {
      const own = row.layerIds.map((id) => byId.get(id)).filter(Boolean), texts = own.filter((l) => l.type === 'text');
      const card = own.find((l) => l.type !== 'text' && l.w > W * 0.5);
      const band = card ? [card.y, card.y + card.h] : [Math.min(...texts.map((l) => l.y)) - 24, Math.max(...texts.map((l) => l.y + l.h)) + 24];
      const ev = row.fields.find((f) => f.role === 'event'), evL = ev && byId.get(ev.layerId), minX = evL ? evL.x + 40 : W * 0.4;
      const pics = pg.layers.filter((l) => l.type !== 'text' && l !== card && !mapped.has(l.id) && !l.hidden && /url\(/.test(String(l.fill || '')) && l.w < W * 0.5 && l.h <= band[1] - band[0] + 4 && l.y >= band[0] - 4 && l.y + l.h <= band[1] + 4 && l.x >= minX);
      const wide = pics.filter((l) => l.w >= l.h * 1.6);
      const sym = pics.filter((l) => Math.abs(l.w - l.h) <= Math.max(l.w, l.h) * 0.4).sort((x, y) => x.x - y.x);
      const layers = sym.length >= 2 ? sym : wide.length ? [wide[0]] : null;
      return layers ? { row, card, layers } : null;
    }).filter(Boolean);
  }
  const ratingPictures = (pg, map) => ratingGroups(pg, map);
  async function pictureOf(l) {
    const m = /url\((['"]?)(.*?)\1\)/.exec(String(l.fill || '')); if (!m) throw new Error('This layer has no picture');
    const src = m[2].startsWith('data:') ? m[2] : URL.createObjectURL(await (await fetch(new URL(m[2], location.href))).blob());
    return loadImg(src);
  }
  /** Symbols found in a rating picture: boxes and colours, in layer coordinates */
  function readPixels(img, l) {
    const W = img.naturalWidth, H = img.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, W, H).data;
    const px = (i, j) => { const k = (j * W + i) * 4; return [d[k], d[k + 1], d[k + 2], d[k + 3]]; };
    const bg = [px(0, 0), px(W - 1, 0), px(0, H - 1), px(W - 1, H - 1)].reduce((a, p) => a.map((v, n) => v + p[n] / 4), [0, 0, 0, 0]);
    const ink = bg[3] < 40 ? (p) => p[3] > 60 : (p) => p[3] > 40 && Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 70;
    const cols = Array.from({ length: W }, (_, i) => { let n = 0; for (let j = 0; j < H; j++) if (ink(px(i, j))) n++; return n; });
    const groups = []; let s = -1;
    cols.forEach((n, i) => { if (n > 1 && s < 0) s = i; if ((n <= 1 || i === W - 1) && s >= 0) { if (i - s >= Math.max(3, W * 0.02)) groups.push([s, i]); s = -1; } });
    const sx = l.w / W, sy = l.h / H;
    return groups.map(([a, b]) => {
      let y0 = H, y1 = 0, r = 0, g = 0, bl = 0, n = 0;
      for (let i = a; i < b; i++) for (let j = 0; j < H; j++) { const p = px(i, j); if (!ink(p)) continue; y0 = Math.min(y0, j); y1 = Math.max(y1, j); r += p[0]; g += p[1]; bl += p[2]; n++; }
      const col = [r / n, g / n, bl / n], hex = '#' + col.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      const mx = Math.max(...col), mn = Math.min(...col);
      return { x0: l.x + a * sx, x1: l.x + b * sx, y0: l.y + y0 * sy, y1: l.y + y1 * sy, color: hex, score: (mx - mn) + mx * 0.3 };
    });
  }
  /** Filled vs empty by colour: the most vivid group of symbols is "filled" */
  function splitColors(gs) {
    const sorted = [...gs].sort((a, b) => b.score - a.score), top = sorted[0].score;
    const filled = gs.filter((g) => g.score >= top - Math.max(40, top * 0.25));
    const empty = gs.filter((g) => !filled.includes(g));
    return { filled: filled.length, filledColor: filled[0].color, emptyColor: empty.length ? empty[0].color : filled[0].color + '55' };
  }
  /** Two text layers that draw the rating exactly over the picture's symbols */
  function ratingLayers(l, gs, info) {
    const n = Math.max(gs.length, 1), sym = info.symbol || '★', font = 'Inter';
    const gh = gs.reduce((a, g) => a + (g.y1 - g.y0), 0) / n, cy = gs.reduce((a, g) => a + (g.y0 + g.y1) / 2, 0) / n;
    const pitch = n > 1 ? (gs[n - 1].x0 + gs[n - 1].x1 - gs[0].x0 - gs[0].x1) / 2 / (n - 1) : gh * 1.3;
    mctx.font = `400 100px '${font}', sans-serif`; const mt = mctx.measureText(sym), glyphH = (mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent) || 72, glyphW = (mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight) || mt.width;
    const size = Math.max(8, Math.round((gh / glyphH) * 100)), k = size / 100, adv = mt.width * k, ls = Math.round((pitch - adv) * 10) / 10;
    const x = Math.round(gs[0].x0 - (adv - glyphW * k) / 2 - Math.max(0, mt.actualBoundingBoxLeft || 0) * 0), y = Math.round(cy - size / 2);
    const w = Math.round(n * pitch + size), o = { size, weight: 400, font, align: 'left', ls, lh: 1, dir: 'ltr' };
    const track = Tx(x, y, w, sym.repeat(info.total || n), { ...o, name: 'Rating track', color: info.emptyColor });
    const filled = Tx(x, y, w, sym.repeat(Math.max(1, info.filled)), { ...o, name: 'Rating', color: info.filledColor });
    track.h = filled.h = size; return [track, filled];
  }
  /** Symbols of one row's rating, in layer coordinates (one picture per symbol, or one picture for all) */
  async function readGroup(layers) {
    if (layers.length === 1) { const img = await pictureOf(layers[0]); return { gs: readPixels(img, layers[0]), imgs: [img] }; }
    const gs = [], imgs = [];
    for (const l of layers) {
      const img = await pictureOf(l); imgs.push(img); const parts = readPixels(img, l); if (!parts.length) continue;
      const big = parts.reduce((a, g) => ((g.x1 - g.x0) * (g.y1 - g.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? g : a));
      gs.push({ x0: Math.min(...parts.map((g) => g.x0)), x1: Math.max(...parts.map((g) => g.x1)), y0: Math.min(...parts.map((g) => g.y0)), y1: Math.max(...parts.map((g) => g.y1)), color: big.color, score: big.score });
    }
    return { gs, imgs };
  }
  /** The row's rating as one picture, for Claude */
  function composite(layers, imgs) {
    const x0 = Math.min(...layers.map((l) => l.x)), y0 = Math.min(...layers.map((l) => l.y)), x1 = Math.max(...layers.map((l) => l.x + l.w)), y1 = Math.max(...layers.map((l) => l.y + l.h)), k = 2;
    const c = document.createElement('canvas'); c.width = Math.ceil((x1 - x0) * k) + 8; c.height = Math.ceil((y1 - y0) * k) + 8; const x = c.getContext('2d');
    x.fillStyle = '#7f7f7f'; x.fillRect(0, 0, c.width, c.height); // neutral backdrop: black and white stars both show
    layers.forEach((l, i) => x.drawImage(imgs[i], (l.x - x0) * k + 4, (l.y - y0) * k + 4, l.w * k, l.h * k));
    return c.toDataURL('image/png');
  }
  async function editableStars(btn) {
    if (!canEdit()) return; const pg = curP(), cfg = pg.live; if (!cfg || !cfg.map) return;
    const groups = ratingGroups(pg, cfg.map); if (!groups.length) return addStars(btn);
    btn && busy(btn, true, 'Reading the stars…');
    try {
      const reads = []; for (const g of groups) reads.push({ g, ...(await readGroup(g.layers)) });
      const first = reads.find((r) => r.gs.length); if (!first) throw new Error('No symbols found in the pictures');
      // Claude reads the symbol and colours on the first row; the pixels give every row's geometry
      let ai = null, note = '';
      try { const r = await api('/social/calendar/rating', { method: 'POST', body: { image: composite(first.g.layers, first.imgs) } }); ai = r.rating && r.rating.isRating ? r.rating : null; if (!r.rating) note = 'Colours read from the pictures (add a Claude key in Settings → AI assistant to let Claude read them).'; } catch (e) { note = 'Colours read from the pictures.'; }
      const repl = reads.filter((r) => r.gs.length).map(({ g, gs }) => {
        const px = splitColors(gs), info = { symbol: ai ? ai.symbol : '★', total: gs.length, filled: px.filled, filledColor: ai ? ai.filledColor : px.filledColor, emptyColor: ai ? ai.emptyColor : px.emptyColor };
        return { ids: g.layers.map((l) => l.id), layers: ratingLayers(g.layers[0], gs, info) };
      });
      mutate(() => {
        if (pg.live) unbind(pg);
        repl.forEach(({ ids, layers }) => { const i = pg.layers.findIndex((x) => x.id === ids[0]); pg.layers = pg.layers.filter((x) => !ids.includes(x.id)); pg.layers.splice(Math.min(i, pg.layers.length), 0, ...layers); });
        ED.sel = null;
      });
      toast(`${repl.length} star ratings are now editable${ai ? ' (read by Claude)' : ''}. ${note}`.trim());
      peek.clear(); await ACT.lvAnalyze();
    } catch (e) { btn && btn.isConnected && busy(btn, false); toast('Could not convert the stars: ' + e.message); }
  }
  /** No rating on the slide at all: add editable stars at the end of each row's card */
  async function addStars(btn) {
    const pg = curP(), cfg = pg.live, byId = new Map(pg.layers.map((l) => [l.id, l])), W = (pg.layers[0] && pg.layers[0].w) || 1080;
    const accent = (brand().colors.find((c) => c.name === 'Primary') || {}).hex || '#FD0E35';
    const adds = cfg.map.rows.map((row) => {
      const own = row.layerIds.map((id) => byId.get(id)).filter(Boolean), card = own.find((l) => l.type !== 'text' && l.w > W * 0.5), t = own.find((l) => l.type === 'text');
      if (!card || !t) return null; const size = Math.round(Math.min(card.h * 0.38, (t.size || 28) * 1.1)), pitch = Math.round(size * 1.35), w = pitch * 3, x = Math.round(card.x + card.w - 28 - w), y = Math.round(card.y + card.h / 2 - size / 2);
      const gs = [0, 1, 2].map((i) => ({ x0: x + i * pitch, x1: x + i * pitch + size, y0: y, y1: y + size * 0.95 }));
      return { after: card.id, layers: ratingLayers(card, gs, { symbol: '★', total: 3, filled: 2, filledColor: accent, emptyColor: 'rgba(127,127,127,.35)' }) };
    }).filter(Boolean);
    if (!adds.length) return toast('Add a ★★★ text to the first row, then re-analyze');
    mutate(() => { if (pg.live) unbind(pg); adds.forEach(({ after, layers }) => { const i = pg.layers.findIndex((l) => l.id === after); pg.layers.splice(i + 1, 0, ...layers); }); });
    toast(`Added live stars to ${adds.length} rows`); peek.clear(); await ACT.lvAnalyze();
  }

  /** What a mapped layer shows: its original text, or a preview of a picture (flags) */
  function mapChip(f, cfg, byId) {
    const l = byId.get(f.layerId) || {}, o = cfg.orig[f.layerId] || {};
    if (l.type !== 'text') {
      const fill = typeof l.fill === 'string' ? l.fill : '';
      return `<span class="tx pic" title="${f.role === 'flag' ? 'Country flag: changes with each event' : esc(l.name || 'Picture')}"><i style="background:${esc(fill)};border-radius:${f.role === 'flag' ? '50%' : '4px'}"></i>${f.role === 'flag' ? 'Country flag' : esc(l.name || 'Picture')}</span>`;
    }
    const t = o.text || l.text || '';
    return `<span class="tx" title="${esc(t)}">${esc(t.slice(0, 28))}</span>`;
  }
  function bound(pg) {
    const cfg = pg.live, map = cfg.map, events = cfg.events || [], tz = schedTz();
    const list = choose(events, cfg, isWeek(cfg) ? 999 : map.rows.length), chosen = new Set(list.map((e) => e.id));
    const visible = events.filter((e) => cfg.impact.includes(e.impact) || chosen.has(e.id));
    const r1 = map.rows[0], byId = new Map(pg.layers.map((l) => [l.id, l]));
    const wk = isWeek(cfg), shownDate = (cfg.feed && cfg.feed.date) || dayFor(cfg, ED.d);
    const dayHint = wk
      ? ({ publish: 'The week of each post, Mon–Fri', today: 'The current week', tomorrow: 'The following week', fixed: 'A week you choose' })[cfg.day]
      : ({ publish: 'The day of each post', today: 'Always today', tomorrow: 'Always tomorrow', fixed: 'A day you choose' })[cfg.day];
    const unit = wk ? 'week' : 'day';
    const period = `<div class="lv-period"><button class="lv-pa" data-act="lvShift" data-n="-1" aria-label="Previous ${unit}" title="Previous ${unit}">${ic('chevL', 16)}</button>
        <button class="lv-pd ${ED.lvCal && ED.lvCal.open ? 'on' : ''}" data-act="lvCal" title="Choose a ${unit}" aria-haspopup="dialog" aria-expanded="${!!(ED.lvCal && ED.lvCal.open)}">${ic('cal', 15)}<span>${esc(periodLabel(shownDate, wk))}</span>${ic('chevD', 14)}</button>
        <button class="lv-pa" data-act="lvShift" data-n="1" aria-label="Next ${unit}" title="Next ${unit}">${ic('chevR', 16)}</button>${ED.lvCal && ED.lvCal.open ? calPop(wk, shownDate) : ''}</div>`;
    const feedNote = cfg.err ? `<p class="lv-note err">${ic('alert', 14)}<span>${esc(cfg.err)}</span></p>` : cfg.feed ? `<p class="lv-src">${cfg.feed.count} events ${wk ? 'this week' : 'that day'} · ${cfg.feed.source === 'tradingview' ? 'TradingView' : 'Forex Factory'}${cfg.feed.errors.length ? ' (fallback)' : ''} · ${esc(tzShort())}</p>` : '';
    const ctry = cfg.countries.length, onSlide = wk ? new Set(cfg.shown || []) : chosen;
    // the list: what's on the slide first in mind, grouped by day on weekly slides
    let evHtml = '';
    if (visible.length) {
      if (wk) {
        const byDay = new Map(); visible.forEach((e) => { const p = tzParts(Date.parse(e.at), tz), k = `${p.year}-${p.month}-${p.day}`; (byDay.get(k) || byDay.set(k, []).get(k)).push(e); });
        evHtml = [...byDay].sort((x, y) => x[0].localeCompare(y[0])).map(([k, evs]) => { const n = evs.filter((e) => onSlide.has(e.id)).length; return `<div class="lv-evd"><b>${esc(fmt(new Date(k + 'T12:00'), { weekday: 'long', day: 'numeric', month: 'short' }))}</b><span>${n ? `${n} on the slide` : 'none on the slide'}</span></div>` + evs.map((e) => evRow(e, onSlide.has(e.id), cfg)).join(''); }).join('');
      } else evHtml = visible.map((e) => evRow(e, onSlide.has(e.id), cfg)).join('');
    } else evHtml = cfg.events ? `<p class="lv-empty">No event matches these filters${wk ? ' this week' : ' that day'}.</p>` : '<div class="skel" style="height:36px"></div><div class="skel" style="height:36px"></div><div class="skel" style="height:36px"></div>';
    return sec('Data', field('Source', `<select class="field sm" id="lvSrc">${SOURCES.map(([v, l]) => `<option value="${v}" ${cfg.src === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)
        + field(wk ? 'Week' : 'Day', seg('lvDay', cfg.day, [['publish', 'Auto'], ['today', wk ? 'This' : 'Today'], ['tomorrow', wk ? 'Next' : 'Tomorrow'], ['fixed', 'Pick']]) + period + `<p class="lv-hint">${dayHint}</p>`)
        + field('Language', seg('lvLang', cfg.lang, [['en', 'English'], ['ar', 'العربية']])
          + (cfg.lang === (cfg.srcLang || 'en') ? '' : `<p class="lv-hint lv-langnote">${!map.texts ? 'Re-analyze the slide to translate its titles too.' : cfg.i18nEngine === 'claude' ? 'Whole slide translated by Claude.' : 'Translated with the built-in dictionary.'}</p>`)
          + (cfg.lang === 'ar' && (cfg.srcLang || 'en') !== 'ar' ? `<div class="lv-swr lv-rtl"><div class="grow"><b>Right-to-left</b><p>Mirror the layout for Arabic.</p></div>${sw(cfg.mirror !== false, 'lvMirror', '', 'Right-to-left layout')}</div>` : '')))
      + sec('Filters', field('Impact', `<div class="lv-imps">${['high', 'medium', 'low'].map((k) => `<button class="lv-impb i${IMP[k]} ${cfg.impact.includes(k) ? 'on' : ''}" data-act="lvImp" data-k="${k}" aria-pressed="${cfg.impact.includes(k)}"><span class="st">${'★'.repeat(IMP[k])}</span>${IMP_WORD.en[k]}</button>`).join('')}</div>`)
        + field(`Countries <em>${ctry}/${CTRY.length}</em>${ctry < CTRY.length ? '<button class="btn link sm lv-all" data-act="lvCtyAll">All</button>' : ''}`, `<div class="lv-ctys">${CTRY.map(([k, l]) => `<button class="lv-cty ${cfg.countries.includes(k) ? 'on' : ''}" data-act="lvCty" data-k="${k}" aria-pressed="${cfg.countries.includes(k)}" title="${esc(countryName(k, 'en'))} · ${l}">${k === 'GB' ? 'UK' : k}</button>`).join('')}</div>`))
      + sec('Events', feedNote + (wk && cfg.room != null && cfg.room < 1 && visible.length > onSlide.size ? `<p class="lv-full">${ic('alert', 14)}<span>The slide is full. Untick an event to add another.</span></p>` : '') + `<div class="lv-evs ${wk && cfg.room != null && cfg.room < 1 ? 'full' : ''}">${evHtml}</div>`,
        `<span class="lv-count" title="Events on the slide">${onSlide.size} on the slide</span>${cfg.pick ? '<button class="btn link sm lv-auto" data-act="lvAuto">Auto-pick</button>' : '<span class="lv-tag">Auto</span>'}`)
      + sec('Updates', `<div class="lv-sw">
          ${figSw(map, cfg)}
          <div class="lv-swr"><div class="grow"><b>Update automatically</b><p>While the studio is open, and before each scheduled post.</p></div>${sw(!cfg.paused, 'lvPause', '', 'Update automatically')}</div>
        </div>` + field('Check for new data every', `<select class="field sm" id="lvEvery" ${cfg.paused ? 'disabled' : ''}>${EVERY.map(([v, l]) => `<option value="${v}" ${+cfg.every === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)
        + `<button class="btn secondary lv-wide" data-act="lvRefresh">${ic('refresh', 16)}Refresh now</button>`)
      + `<details class="lv-sec lv-how"${ED.liveHow ? ' open' : ''}><summary><b>How we read this slide</b><span class="lv-tag ${map.engine === 'claude' ? 'ai' : ''}">${map.engine === 'claude' ? 'Claude' : 'Layout'}</span></summary>
        <div class="lv-how-b">
          ${map.reason || map.note ? `<p class="lv-hint">${esc(map.reason || '')}${map.note ? ' ' + esc(map.note) : ''}</p>` : ''}
          ${map.needs && map.needs.note ? `<p class="lv-note">${ic('wand', 14)}<span>${esc(map.needs.note)}</span></p>` : ''}
          <div class="lv-maps" role="table" aria-label="Fields read on the slide">
            <div class="lv-map lv-map-h" role="row"><span role="columnheader">On the slide</span><span role="columnheader">Reads as</span></div>
            ${isWeek(cfg) ? [['Day heading', map.week.dayHeader.layerId, 'Day'], ...(map.week.groupHeader ? [['Group heading', map.week.groupHeader.layerId, 'Country']] : []), ['Events list', map.week.list.layerId, 'Event lines']].map(([n2, id, lab]) => `<div class="lv-map" role="row"><span class="tx" title="${esc((cfg.orig[id] || {}).text || '')}">${esc(String((cfg.orig[id] || {}).text || n2).split('\n')[0].slice(0, 28))}</span><span class="lv-fixed live">${lab}</span></div>`).join('') + `<p class="lv-hint">Every day of the week is rebuilt from the first day block, one group per country, with the design's spacing. Each line: <code>${esc(map.week.list.lineTemplate)}</code></p>` : ''}
            ${r1 ? r1.fields.map((f, n) => `<div class="lv-map" role="row">${mapChip(f, cfg, byId)}<select class="field sm" data-lvrole="${n}" aria-label="Field type">${ROLES.map(([v, l]) => `<option value="${v}" ${f.role === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`).join('') : ''}
            ${map.date ? `<div class="lv-map" role="row"><span class="tx" title="${esc((cfg.orig[map.date.layerId] || {}).text || '')}">${esc(((cfg.orig[map.date.layerId] || {}).text || '').slice(0, 28))}</span><span class="lv-fixed">Date</span></div>` : ''}
            ${map.tz ? `<div class="lv-map" role="row"><span class="tx">${esc(((cfg.orig[map.tz.layerId] || {}).text || '').split('\n')[0].slice(0, 28))}</span><span class="lv-fixed">Time zone</span></div>` : ''}
          </div>
          ${(map.texts || []).length ? `<div class="lv-maps"><div class="lv-map lv-map-h"><span>Other texts</span><span>Behaviour</span></div>${map.texts.map((t) => `<div class="lv-map"><span class="tx" title="${esc((cfg.orig[t.layerId] || {}).text || '')}">${esc(String((cfg.orig[t.layerId] || {}).text || '').replace(/\n/g, ' · ').slice(0, 30))}</span><span class="lv-fixed ${t.template ? 'live' : t.translate ? 'tr' : ''}">${t.template ? 'Updates' : t.translate ? 'Translated' : 'Stays the same'}</span></div>`).join('')}</div>` : ''}
          ${r1 && !r1.fields.some((f) => f.role === 'impact') && !(map.needs && map.needs.impact === 'notNeeded' && !ratingPictures(pg, map).length) ? (ratingPictures(pg, map).length
            ? `<div class="lv-fixcard">${ic('alert', 16)}<div><b>Impact isn't live: the stars are pictures</b><p>AI turns them into editable stars that follow each event's impact, with the same size, spacing and colours.</p></div><button class="btn primary sm" data-act="lvStars">${ic('wand', 15)}Make stars editable with AI</button></div>`
            : `<div class="lv-fixcard">${ic('alert', 16)}<div><b>Impact isn't on this slide</b><p>Add live stars at the end of each row. They follow each event's impact; edit their colours like any text.</p></div><button class="btn primary sm" data-act="lvStars">${ic('wand', 15)}Add live stars</button></div>`) : ''}
          <p class="lv-hint lv-foot">Based on row 1: the other ${map.rows.length - 1} rows follow it. Change colours, fonts and layout freely; after moving or adding text, re-analyze.</p>
          <div class="lv-row"><button class="btn secondary sm" data-act="lvAnalyze">${ic('refresh', 14)}Re-analyze</button><button class="btn ghost sm lv-danger" data-act="lvRemove">Remove live data</button></div>
        </div>
      </details>`;
  }
  const importCard = () => `<div class="lv-or"><span>or bring your own</span></div>
    <div class="lv-imp" data-act="lvPickFile" tabindex="0" role="button" aria-label="Import an image, SVG or HTML design">
      <span class="ico">${ic('upload', 20)}</span>
      <span class="grow"><b>Import an image</b><small>A screenshot or exported design (PNG, JPG). SVG and HTML work too. Everything becomes editable layers.</small></span>
      <input type="file" id="lvFile" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg,text/html,.html,.htm" hidden>
    </div>
    <p class="lv-hint">Designing in Figma? Import it from the <button class="btn link sm lv-inl" data-act="edTab" data-k="figma">Figma tab</button>, then come back. You can also drop a file on this panel.</p>`;
  function unboundSlide(d, i) {
    const r = peek.get(pageSig(d.pages[i])), found = r && !(r instanceof Promise) ? r : null; if (!found) peekPage(d, i);
    const card = !found ? '<div class="lv-card"><div class="skel" style="height:14px;width:55%"></div><div class="skel" style="height:12px;width:85%;margin-top:10px"></div></div>'
      : found.isCalendar ? `<div class="lv-card ok"><span class="lv-ic">${ic('check', 16)}</span><div><b>${found.layout === 'week' ? 'Weekly calendar found' : 'Calendar design found'}</b><p>${found.layout === 'week' ? 'Day blocks with event lists. We keep your design and fill the whole week.' : `${found.rows.length} rows. We keep your design and make its text live.`}</p></div></div>`
        : `<div class="lv-card"><span class="lv-ic muted">${ic('chart', 16)}</span><div><b>No calendar found yet</b><p>Claude can still look for one, or build a template from your Brand Kit.</p></div></div>`;
    return `${card}<div class="lv-cta"><button class="btn primary lv-go" data-act="lvAnalyze">${ic('wand', 18)}Analyze &amp; Build Template</button><p class="lv-hint c">Nothing is replaced. Only the text becomes live.</p></div>${importCard()}`;
  }
  function unboundBrand(d) {
    const b = brand(), [w, h] = RATIOS[d.ratio], st = ED.liveStyle || 'dark', rows = ED.liveRows || 5;
    return `<div class="lv-card"><span class="lv-dots">${b.colors.slice(0, 5).map((c) => `<i style="background:${esc(c.hex)}"></i>`).join('')}</span><div><b>${esc(b.name)} Brand Kit</b><p>${esc(b.fonts.heading)} · ${esc(b.fonts.body)}<br>${w}×${h} · up to 5 rows</p></div></div>
      ${field('Style', seg('lvStyle', st, [['dark', 'Dark'], ['light', 'Light'], ['brand', 'Brand']]))}
      ${field('Rows', seg('lvRows', String(rows), [['3', '3'], ['4', '4'], ['5', '5']]))}
      <div class="lv-cta"><button class="btn primary lv-go" data-act="lvBuild">${ic('wand', 18)}Analyze &amp; Build Template</button><p class="lv-hint c">Replaces this slide with a new template. You can undo it.</p></div>${importCard()}`;
  }
  function livePanel(p) {
    const d = ED.d, pg = curP(), cfg = pg.live && pg.live.map ? pg.live : null;
    let h = `<header class="lv-head"><div class="row sp"><h3>Live data</h3>${stamp(cfg)}</div><p>${cfg ? 'This slide is a live template: its texts follow the economic calendar.' : 'Make this slide live without changing it, or build a new template from your Brand Kit.'}</p></header>`;
    if (cfg) h += bound(pg);
    else h += `<div class="seg lv-tabs">${[['slide', 'layers', 'This slide'], ['brand', 'palette', 'Brand Kit']].map(([v, i, l]) => `<button class="${tab() === v ? 'on' : ''}" data-act="lvTab" data-v="${v}">${ic(i, 15)}${l}</button>`).join('')}</div>` + (tab() === 'slide' ? unboundSlide(d, ED.pi) : unboundBrand(d));
    const y = p.scrollTop, old = $('.lv-evs', p), ey = old ? old.scrollTop : ED.lvEvsTop || 0;
    p.innerHTML = h; p.scrollTop = y; p.classList.add('lv-panel');
    // the events box keeps its own scroll; after a tick the clicked card stays exactly where it was
    const box = $('.lv-evs', p);
    if (box) {
      box.scrollTop = ey;
      if (ED.lvAnchor) {
        const c = box.querySelector(`.lv-ev[data-ev="${CSS.escape(ED.lvAnchor.id)}"]`);
        if (c) {
          // the box scrolls on wide screens; on phones the panel (a bottom sheet) does
          let sc = box; while (sc && sc.scrollHeight <= sc.clientHeight + 1) sc = sc.parentElement;
          if (sc) sc.scrollTop += c.getBoundingClientRect().top - ED.lvAnchor.top;
        }
      }
      box.addEventListener('scroll', () => { ED.lvEvsTop = box.scrollTop; }, { passive: true });
    }
    const how = $('.lv-how', p); how && how.addEventListener('toggle', () => { ED.liveHow = how.open; });
    if (cfg && !cfg.events) refresh(d, { force: true });
  }
  const _pn23 = edPanel;
  edPanel = function () {
    const p = $('#edPanel');
    if (p) p.classList.remove('lv-panel');
    if (ED.tab === 'data' && p && ED.d) { p.classList.remove('agent'); return livePanel(p); }
    return _pn23();
  };

  /* ---------- importing a design (image → Claude, SVG / HTML → read in the browser) ---------- */
  const STUDIO_FONTS = ['Inter', 'Plus Jakarta Sans', 'Poppins', 'Montserrat', 'DM Sans', 'Space Grotesk', 'Playfair Display', 'Cairo', 'Tajawal'];
  const readAs = (file, how) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Could not read the file')); r[how](file); });
  const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('This file is not a picture the browser can open')); i.src = src; });
  /** The canvas to rebuild on: the slide's size, or the picture's own proportions for a single-slide design */
  function targetSize(d, iw, ih) {
    const [w, h] = RATIOS[d.ratio];
    if (d.pages.length > 1 || Math.abs(w / h - iw / ih) < 0.02) return { W: w, H: h, ratio: d.ratio };
    const std = Object.keys(RATIOS).find((r) => !isCustom(r) && Math.abs(RATIOS[r][0] / RATIOS[r][1] - iw / ih) < 0.02);
    if (std) return { W: RATIOS[std][0], H: RATIOS[std][1], ratio: std };
    const W = 1080, H = Math.round(1080 * ih / iw), r = ensureRatio(`${W}x${H}`); return { W, H, ratio: r };
  }
  function crop(img, x, y, w, h) {
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }
  /** Claude's layer list (picture pixels) → studio layers on a W×H canvas */
  function toLayers(design, img, iw, ih, W, H) {
    const k = Math.min(W / iw, H / ih), ox = (W - iw * k) / 2, oy = (H - ih * k) / 2, R1 = (n) => Math.round(n * 10) / 10;
    const nx = img.naturalWidth / iw, ny = img.naturalHeight / ih; // the picture sent was downscaled; crop from the original
    const L = [BG(W, H, design.background || '#ffffff')];
    design.layers.forEach((l) => {
      const x = R1(l.x * k + ox), y = R1(l.y * k + oy), w = R1(l.w * k), h = R1(l.h * k);
      if (l.kind === 'text') {
        const size = Math.max(6, Math.round((l.size || l.h * 0.8) * k)), lines = String(l.text).split('\n').length;
        const room = Math.max(6, size * 0.25), tw = Math.max(w, size) + room, tx = l.align === 'center' ? x - room / 2 : l.align === 'right' ? x - room : x;
        const rating = /^[★☆●○•◆◇■□]+$/.test(String(l.text).trim()); // filled and empty ratings must line up
        L.push(Tx(rating ? x : tx, y, tw, String(l.text), { name: l.name || 'Text', size, weight: l.weight || 400, color: l.color || '#111111', align: rating ? 'left' : l.align || 'left', font: STUDIO_FONTS.includes(l.font) ? l.font : 'Inter', ls: R1((l.letterSpacing || 0) * k), lh: Math.min(2, Math.max(0.9, Math.round((h / lines / size) * 100) / 100)), dir: /[؀-ۿ]/.test(l.text) ? 'rtl' : 'ltr' }));
        L[L.length - 1].h = h;
      } else if (l.kind === 'image' && design.layers.filter((t) => t.kind === 'text' && t.x >= l.x && t.y >= l.y && t.x + t.w <= l.x + l.w && t.y + t.h <= l.y + l.h).length >= 2) {
        return; // a crop over several texts would copy them as pixels behind the new layers
      } else if (l.kind === 'image') {
        L.push(Im(x, y, w, h, `url(${crop(img, l.x * nx, l.y * ny, l.w * nx, l.h * ny)}) center/100% 100% no-repeat`, { name: l.name || 'Image', r: R1((l.radius || 0) * k) }));
      } else {
        const o = { name: l.name || 'Shape', r: l.kind === 'ellipse' ? 0 : R1((l.radius || 0) * k), ...(l.stroke ? { stroke: l.stroke, sw: 2 } : {}) };
        L.push((l.kind === 'ellipse' ? El : Rc)(x, y, w, h, l.fill || 'rgba(0,0,0,.08)', o));
      }
    });
    return L;
  }
  /* SVG: texts become text layers, everything else stays a sharp vector picture underneath */
  async function svgLayers(src, W0, H0) {
    const doc = new DOMParser().parseFromString(src, 'image/svg+xml'), svg = doc.documentElement;
    if (svg.nodeName.toLowerCase() !== 'svg') throw new Error('This SVG file could not be read');
    svg.querySelectorAll('script,foreignObject').forEach((n) => n.remove());
    [...svg.querySelectorAll('*')].forEach((n) => [...n.attributes].forEach((a) => /^on/i.test(a.name) && n.removeAttribute(a.name)));
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number), iw = vb.length === 4 ? vb[2] : parseFloat(svg.getAttribute('width')) || W0, ih = vb.length === 4 ? vb[3] : parseFloat(svg.getAttribute('height')) || H0;
    const host = document.createElement('div'); host.style.cssText = `position:fixed;left:-99999px;top:0;width:${iw}px;height:${ih}px;visibility:hidden`;
    svg.setAttribute('width', iw); svg.setAttribute('height', ih); host.innerHTML = new XMLSerializer().serializeToString(svg); document.body.append(host);
    try {
      const live = host.querySelector('svg'), base = live.getBoundingClientRect(), texts = [];
      live.querySelectorAll('text').forEach((t) => {
        const r = t.getBoundingClientRect(), cs = getComputedStyle(t), txt = (t.textContent || '').trim(); if (!txt || !r.width) return;
        const anchor = t.getAttribute('text-anchor') || cs.textAnchor;
        texts.push({ kind: 'text', name: txt.slice(0, 20), x: r.left - base.left, y: r.top - base.top, w: r.width + 4, h: r.height, text: txt, size: parseFloat(cs.fontSize) || 16, weight: parseInt(cs.fontWeight, 10) || 400, color: cs.fill && cs.fill !== 'none' ? cs.fill : cs.color, align: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left', font: STUDIO_FONTS.find((f) => cs.fontFamily.includes(f)) || 'Inter', letterSpacing: parseFloat(cs.letterSpacing) || 0 });
        t.remove();
      });
      const rest = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(live)).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
      return { iw, ih, texts, rest };
    } finally { host.remove(); }
  }
  /* HTML: laid out in a sandboxed frame (no scripts), then every box and text is read back */
  async function htmlLayers(src, W, H) {
    const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-same-origin'); f.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;height:${H}px;border:0;visibility:hidden`;
    document.body.append(f);
    try {
      // measure with the same web fonts the studio draws with
      const fonts = $$('link[href*="fonts.googleapis.com/css"]').map((l) => `<link rel="stylesheet" href="${esc(l.href)}">`).join('');
      const page = /<head[^>]*>/i.test(src) ? src.replace(/<head[^>]*>/i, (m) => m + fonts) : fonts + src;
      await new Promise((ok) => { f.onload = ok; f.srcdoc = page; setTimeout(ok, 4000); });
      const doc = f.contentDocument, win = f.contentWindow; if (!doc || !doc.body) throw new Error('This HTML file could not be read');
      // load every face the document uses before reading sizes
      const fams = new Set([...doc.querySelectorAll('*')].map((el) => win.getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim()));
      await Promise.all([...fams].flatMap((fam) => [400, 500, 600, 700, 800].map((w) => doc.fonts.load(`${w} 16px "${fam}"`).catch(() => null))));
      await Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
      const L = [], body = win.getComputedStyle(doc.body), root = win.getComputedStyle(doc.documentElement);
      const bg = body.backgroundImage !== 'none' ? body.backgroundImage : body.backgroundColor !== 'rgba(0, 0, 0, 0)' ? body.backgroundColor : root.backgroundColor !== 'rgba(0, 0, 0, 0)' ? root.backgroundColor : '#ffffff';
      L.push(BG(W, H, bg));
      const walk = (el) => {
        if (el.nodeType !== 1 || ['SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TITLE'].includes(el.tagName)) return;
        const cs = win.getComputedStyle(el), r = el.getBoundingClientRect();
        if (cs.display === 'none' || cs.visibility === 'hidden' || r.width < 1 || r.height < 1) return;
        const rad = parseFloat(cs.borderTopLeftRadius) || 0, op = parseFloat(cs.opacity);
        if (el.tagName === 'IMG' && el.currentSrc) L.push(Im(r.left, r.top, r.width, r.height, `url(${el.currentSrc}) center/${cs.objectFit === 'contain' ? 'contain' : 'cover'} no-repeat`, { name: el.alt || 'Image', r: rad }));
        else if (el !== doc.body && el !== doc.documentElement) {
          const hasBg = cs.backgroundImage !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)', bw = parseFloat(cs.borderTopWidth) || 0;
          if (hasBg || bw) L.push(Rc(r.left, r.top, r.width, r.height, cs.backgroundImage !== 'none' ? `${cs.backgroundImage}, ${cs.backgroundColor}` : hasBg ? cs.backgroundColor : 'transparent', { name: el.className ? String(el.className).split(' ')[0] : el.tagName.toLowerCase(), r: Math.min(rad, r.height / 2), op: Number.isFinite(op) ? op : 1, ...(bw ? { stroke: cs.borderTopColor, sw: bw } : {}) }));
        }
        // text written directly in this element becomes one text layer
        const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
        if (own.length && ![...el.children].some((c) => win.getComputedStyle(c).display !== 'inline')) {
          const range = doc.createRange(); range.selectNodeContents(el); const tr = range.getBoundingClientRect(), txt = el.innerText.trim();
          if (txt && tr.width) {
            const size = parseFloat(cs.fontSize) || 16, lh = cs.lineHeight === 'normal' ? 1.2 : parseFloat(cs.lineHeight) / size;
            const room = Math.max(6, size * 0.25), lw = tr.width + room, lx = cs.textAlign === 'center' ? tr.left - room / 2 : ['right', 'end'].includes(cs.textAlign) ? tr.left - room : tr.left;
            L.push(Tx(lx, tr.top, lw, txt, { name: txt.slice(0, 20), size, weight: parseInt(cs.fontWeight, 10) || 400, color: cs.color, align: ['center', 'right'].includes(cs.textAlign) ? cs.textAlign : cs.textAlign === 'end' ? 'right' : 'left', font: (cs.fontFamily.split(',')[0] || 'Inter').replace(/["']/g, '').trim(), ls: parseFloat(cs.letterSpacing) || 0, lh: Math.round(lh * 100) / 100, dir: cs.direction === 'rtl' ? 'rtl' : 'ltr', ...(cs.textTransform === 'uppercase' ? { up: true } : {}), ...(cs.fontStyle === 'italic' ? { it: true } : {}) }));
            L[L.length - 1].h = tr.height;
          }
          return;
        }
        [...el.children].forEach(walk);
      };
      walk(doc.body);
      return L;
    } finally { f.remove(); }
  }
  async function importDesign(file) {
    if (!canEdit()) return; const d = ED.d, i = ED.pi, pg = d.pages[i];
    const kind = /svg/.test(file.type) || /\.svg$/i.test(file.name) ? 'svg' : /html/.test(file.type) || /\.html?$/i.test(file.name) ? 'html' : /^image\//.test(file.type) ? 'image' : null;
    if (!kind) return toast('Choose a PNG, JPG, SVG or HTML file');
    if (file.size > 15e6) return toast('That file is over 15 MB');
    let closeWait = () => {};
    const wait = (t) => { closeWait(); closeWait = modal(`<div class="mh"><h2>Importing ${esc(file.name)}</h2></div><div class="mb"><div class="lv-progress"><i class="spin"></i><span>${t}</span></div></div>`); };
    try {
      let layers, size, note = '';
      if (kind === 'html') {
        const [w, h] = RATIOS[d.ratio]; size = { W: w, H: h, ratio: d.ratio }; wait('Reading the layout…');
        layers = await htmlLayers(await readAs(file, 'readAsText'), w, h);
      } else if (kind === 'svg') {
        wait('Reading the SVG…'); const s = await svgLayers(await readAs(file, 'readAsText'), 1080, 1080);
        size = targetSize(d, s.iw, s.ih); const k = Math.min(size.W / s.iw, size.H / s.ih), ox = (size.W - s.iw * k) / 2, oy = (size.H - s.ih * k) / 2;
        layers = [BG(size.W, size.H, '#ffffff'), Im(ox, oy, s.iw * k, s.ih * k, `url('${s.rest}') center/100% 100% no-repeat`, { name: 'Artwork' })];
        s.texts.forEach((t) => { const sz = Math.round(t.size * k), room = Math.max(6, sz * 0.25), x0 = t.x * k + ox - (t.align === 'center' ? room / 2 : t.align === 'right' ? room : 0); const l = Tx(x0, t.y * k + oy, t.w * k + room, t.text, { name: t.name, size: sz, weight: t.weight, color: t.color, align: t.align, font: t.font, ls: t.letterSpacing * k }); l.h = t.h * k; layers.push(l); });
      } else {
        const src = await readAs(file, 'readAsDataURL'), img = await loadImg(src);
        // send a picture Claude reads well (long side ≤ 1568 px), crop images from the original
        const s0 = Math.min(1, 1568 / Math.max(img.naturalWidth, img.naturalHeight)), iw = Math.round(img.naturalWidth * s0), ih = Math.round(img.naturalHeight * s0);
        const c = document.createElement('canvas'); c.width = iw; c.height = ih; c.getContext('2d').drawImage(img, 0, 0, iw, ih);
        size = targetSize(d, iw, ih); wait('Claude is rebuilding your design as layers. This takes about a minute…');
        try {
          const r = await api('/social/calendar/import', { method: 'POST', body: { image: c.toDataURL('image/jpeg', 0.9), imgW: iw, imgH: ih } });
          layers = toLayers(r.design, img, iw, ih, size.W, size.H);
        } catch (e) {
          if (!/claude key/i.test(e.message)) throw e;
          // no key: keep the picture so the slide can still be used, and say what's missing
          layers = [BG(size.W, size.H, '#ffffff'), Im(0, 0, size.W, size.H, `url(${src}) center/contain no-repeat`, { name: file.name.slice(0, 20), locked: true })];
          note = 'Added as a picture. Add a Claude key in Settings → AI assistant to turn it into editable layers.';
        }
      }
      closeWait();
      mutate(() => { if (pg.live) unbind(pg); if (size.ratio !== d.ratio) d.ratio = size.ratio; pg.layers = layers; pg.bg = layers[0].fill; ED.sel = null; }, () => { edAll(); fitZoom && fitZoom(); });
      toast(note || `Imported ${layers.length - 1} layers. Checking it for a calendar…`);
      if (!note) { peek.clear(); const r = await peekPage(d, i); if (r && r.isCalendar) ACT.lvAnalyze(); else edPanel(); }
    } catch (e) { closeWait(); toast('Import failed: ' + e.message); }
  }
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('lv-imp')) { e.preventDefault(); ACT.lvPickFile(e.target, e); } });
  document.addEventListener('change', (e) => { const t = e.target; if (t.id === 'lvFile' && t.files && t.files[0]) { const f = t.files[0]; t.value = ''; importDesign(f); } });
  // drop a file on the Live data panel
  document.addEventListener('dragover', (e) => { const p = e.target.closest && e.target.closest('#edPanel.lv-panel'); if (p && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); p.classList.add('drop'); } }, true);
  document.addEventListener('dragleave', (e) => { const p = e.target.closest && e.target.closest('#edPanel.lv-panel'); if (p && !p.contains(e.relatedTarget)) p.classList.remove('drop'); }, true);
  document.addEventListener('drop', (e) => {
    const p = e.target.closest && e.target.closest('#edPanel.lv-panel'); if (!p) return; p.classList.remove('drop');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return;
    e.preventDefault(); e.stopImmediatePropagation(); importDesign(f);
  }, true);

  /* ---------- actions ---------- */
  const cfgNow = () => curP().live;
  const reapply = () => { const d = ED.d; return d ? refresh(d, { force: true }) : Promise.resolve(); };
  const busyWith = (sel, label) => { const b = $(sel); b && busy(b, true, label); return () => b && b.isConnected && busy(b, false); };
  Object.assign(ACT, {
    lvTab: (a) => { ED.liveTab = a.dataset.v; edPanel(); },
    lvStyle: (a) => { ED.liveStyle = a.dataset.v; edPanel(); },
    lvRows: (a) => { ED.liveRows = +a.dataset.v; edPanel(); },
    lvPickFile: (a, e) => { if (e && e.target && e.target.id === 'lvFile') return; e && e.preventDefault(); const i = $('#lvFile'); i && i.click(); },
    lvAnalyze: async () => {
      if (!canEdit()) return; const d = ED.d, i = ED.pi, pg = d.pages[i], done = busyWith('[data-act=lvAnalyze]', 'Analyzing…');
      try {
        const keep = pg.live && pg.live.map ? pg.live : null;
        if (keep) unbind(pg); // read the original texts, not the live ones
        const map = await analyze(d, i, 'auto');
        if (!map.isCalendar || (!map.rows.length && !(map.layout === 'week' && map.week))) { if (keep) bind(pg, keep.map, keep); done(); edPanel(); return toast(map.note || map.reason || 'No calendar found on this slide'); }
        mutate(() => bind(pg, map, keep));
        await refresh(d, { silent: false, force: true });
        // what the slide still needs: star pictures become editable stars right away (once)
        const needsStars = map.rows[0] && !map.rows[0].fields.some((f) => f.role === 'impact') && ratingGroups(pg, map).length && (!map.needs || map.needs.impact !== 'notNeeded');
        if (needsStars && !ED.liveAutoStars) { ED.liveAutoStars = true; toast('Making the star pictures editable…'); try { await editableStars(null); } finally { ED.liveAutoStars = false; } return; }
        if (pg.live && pg.live.lang !== (pg.live.srcLang || 'en')) { await ensureI18n(pg, pg.live.lang); await refresh(d, { force: true }); }
        toast(`${map.engine === 'claude' ? 'Claude' : 'Layout'} read the slide: ${map.layout === 'week' ? 'weekly layout' : map.rows.length + ' rows'}${(map.texts || []).filter((t) => t.template).length ? ', live dates' : ''}${(map.texts || []).some((t) => t.translate) ? ', translatable titles' : ''}. The slide is now live.`);
      } catch (e) { done(); toast('Could not analyze the slide: ' + e.message); }
    },
    lvBuild: async () => {
      if (!canEdit()) return; const d = ED.d, pg = curP(), [w, h] = RATIOS[d.ratio], done = busyWith('[data-act=lvBuild]', 'Building…');
      try {
        const lang = ED.lang === 'ar' ? 'ar' : 'en', layers = brandCalendar(w, h, ED.liveStyle || 'dark', lang, ED.liveRows || 5);
        const map = await api('/social/calendar/analyze', { method: 'POST', body: { layers: layersIn({ layers }), w, h, engine: 'heuristic' } });
        mutate(() => { pg.layers = layers; pg.bg = layers[0].fill; ED.sel = null; delete pg.live; if (map.isCalendar) bind(pg, map, { lang }); d.tpl = 'calendar'; });
        toast('Template built from your Brand Kit with live data');
        await refresh(d, { silent: false, force: true });
      } catch (e) { done(); toast('Could not build the template: ' + e.message); }
    },
    lvStars: (a) => { if (!a.getAttribute('aria-busy')) editableStars(a); },
    lvRemove: () => { const pg = curP(); if (!pg.live) return; mutate(() => unbind(pg)); toast('Live data removed. The slide keeps its original text.'); },
    lvRefresh: async () => { const done = busyWith('[data-act=lvRefresh]', 'Checking…'); feed.clear(); await refresh(ED.d, { silent: false, force: true }); done(); },
    lvDay: (a) => { const c = cfgNow(); c.day = a.dataset.v; c.pick = null; save(); reapply(); },
    lvLang: async (a) => {
      const pg = curP(), c = pg.live, lang = a.dataset.v; if (c.lang === lang) return;
      $$('[data-act=lvLang]').forEach((b) => (b.disabled = true)); const tag = $('.lv-langnote'); tag && (tag.textContent = 'Translating the slide…');
      await ensureI18n(pg, lang); c.lang = lang; save(); reapply();
    },
    lvMirror: () => { const c = cfgNow(); c.mirror = c.mirror === false; save(); reapply(); },
    lvImp: (a) => { const c = cfgNow(), k = a.dataset.k; c.impact = c.impact.includes(k) ? c.impact.filter((x) => x !== k) : [...c.impact, k]; if (!c.impact.length) c.impact = [k]; c.pick = null; save(); reapply(); },
    lvCty: (a) => { const c = cfgNow(), k = a.dataset.k; c.countries = c.countries.includes(k) ? c.countries.filter((x) => x !== k) : [...c.countries, k]; if (!c.countries.length) c.countries = [k]; c.pick = null; save(); reapply(); },
    lvPick: async (a) => {
      if (ED.lvPicking) return; // one change at a time: each one re-renders the slide
      ED.lvAnchor = { id: a.dataset.id, top: a.getBoundingClientRect().top };
      const c = cfgNow(), wk = isWeek(c), n = wk ? 999 : c.map.rows.length, cur = wk ? [...(c.shown || [])] : choose(c.events || [], c, n).map((e) => e.id), id = a.dataset.id, adding = !cur.includes(id);
      const next = adding ? [...cur, id] : cur.filter((x) => x !== id);
      if (next.length > n) { toast(`This design has ${n} rows: untick an event first`); return; }
      if (!next.length) { toast('Keep at least one event on the slide, or use Auto-pick'); return; }
      if (wk && adding && c.room != null && c.room < 1) { toast('The slide is full: untick an event to make room'); return; }
      const order = new Map((c.events || []).map((e, i) => [e.id, i])), prev = c.pick;
      c.pick = next.sort((x, y) => order.get(x) - order.get(y)); save();
      ED.lvPicking = true;
      try {
        await reapply();
        // a weekly slide has limited room: an event that doesn't fit is not added
        if (wk && adding && !c.pick.every((x) => (c.shown || []).includes(x))) { c.pick = prev; save(); await reapply(); toast('No room left on the slide: untick an event first'); }
      } finally { ED.lvPicking = false; setTimeout(() => { ED.lvAnchor = null; }, 400); }
    },
    lvAuto: () => { cfgNow().pick = null; save(); reapply(); },
    lvCtyAll: () => { const c = cfgNow(); c.countries = CTRY.map(([k]) => k); c.pick = null; save(); reapply(); },
    /** ‹ › steps the shown day or week (and switches to Pick); the middle button opens the date picker */
    lvShift: (a) => { const c = cfgNow(), base = (c.feed && c.feed.date) || dayFor(c, ED.d); c.date = addDay(base, +a.dataset.n * (isWeek(c) ? 7 : 1)); c.day = 'fixed'; c.pick = null; save(); reapply(); },
    lvCal: () => { const c = cfgNow(), d0 = (c.feed && c.feed.date) || dayFor(c, ED.d); ED.lvCal = ED.lvCal && ED.lvCal.open ? { open: false } : { open: true, ym: d0.slice(0, 7) }; edPanel(); },
    lvCalM: (a) => { const [y, m] = ED.lvCal.ym.split('-').map(Number), x = new Date(Date.UTC(y, m - 1 + +a.dataset.n, 1)); ED.lvCal.ym = x.toISOString().slice(0, 7); edPanel(); },
    lvCalPick: (a) => { const c = cfgNow(); c.date = a.dataset.d; c.day = 'fixed'; c.pick = null; ED.lvCal = { open: false }; save(); reapply(); edPanel(); },
    lvVals: () => { const c = cfgNow(); c.values = !c.values; save(); reapply(); },
    lvPause: () => { const c = cfgNow(); c.paused = !c.paused; save(); if (!c.paused) reapply(); else edPanel(); },
  });
  // the period picker closes on a click elsewhere or Escape
  document.addEventListener('click', (e) => { if (ED.lvCal && ED.lvCal.open && e.target.isConnected && !e.target.closest('.lv-period')) { ED.lvCal = { open: false }; edPanel(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ED.lvCal && ED.lvCal.open) { ED.lvCal = { open: false }; edPanel(); } });
  document.addEventListener('change', (e) => {
    const t = e.target; if (!ED.d || ED.tab !== 'data' || !curP().live) return; const c = cfgNow();
    if (t.id === 'lvSrc') { c.src = t.value; save(); reapply(); }
    else if (t.id === 'lvEvery') { c.every = +t.value; save(); edPanel(); }
    else if (t.id === 'lvDate' && t.value) { c.date = t.value; c.day = 'fixed'; c.pick = null; save(); reapply(); }
    else if (t.dataset && t.dataset.lvrole != null) {
      // one fix applies to the same layer position in every row
      const n = +t.dataset.lvrole, role = t.value;
      mutate(() => c.map.rows.forEach((r) => { const f = r.fields[n]; if (f) { f.role = role; f.template = `{${role}}`; } }));
      reapply();
    }
  });

  /* ---------- automatic updates ---------- */
  async function tick() {
    if (document.hidden || persist.readOnly) return;
    const now = Date.now();
    for (const d of S.designs) {
      const due = livePages(d).some((pg) => !pg.live.paused && now - (pg.live.at || 0) >= (pg.live.every || 15) * 60_000);
      if (due) await refresh(d);
      // scheduled posts on another day than the preview: re-send their slides when that day's data changes
      if (!livePages(d).length || !PUB) continue;
      for (const p of S.posts.filter((x) => x.d === d.id && x.status === 'Scheduled' && x.publish && x.publish.state === 'pending')) {
        try {
          const sigs = [];
          for (const pg of livePages(d)) { const r = await dataFor(pg.live, dayFor(pg.live, d, p)); sigs.push(sigOf(r.events, pg.live, isWeek(pg.live) ? 999 : pg.live.map.rows.length)); }
          const sig = sigs.join('#'); if (p.liveSig !== sig) { const first = p.liveSig == null; p.liveSig = sig; save(); if (!first) PUB.prepare(p); }
        } catch (e) { /* next tick */ }
      }
    }
  }
  setInterval(() => { tick(); }, 60_000);
  setTimeout(() => { tick(); }, 4000);
  const _oe23 = openEditor;
  openEditor = function (id) { _oe23(id); const d = ED.d; if (d && livePages(d).some((pg) => Date.now() - (pg.live.at || 0) > 60_000)) refresh(d); };
})();

/* ============ headless: slides rendered by the API (live calendar posts with no studio tab open) ============ */
/* The server opens /social-media/render in a headless browser, boots this engine with that post's brand,
   design and settings, and calls renderPost: the same live data mapping and the same export renderer as
   "Schedule" in the studio, so the published file is identical to a studio export. */
if (headless) {
  /** Fonts the slides use, loaded before the live texts are measured (fitSize) and rendered */
  async function fontsFor(d) {
    const box = document.createElement('div'); box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;left:-99999px;top:0;opacity:0;pointer-events:none';
    box.innerHTML = d.pages.map((pg) => `<div class="poster" style="position:relative">${posterHTML(pg)}</div>`).join('');
    document.body.appendChild(box);
    const links = $$('link[data-studio-font]');
    await Promise.all(links.map((ln) => (ln.sheet ? null : new Promise((r) => { ln.addEventListener('load', r, { once: true }); ln.addEventListener('error', r, { once: true }); setTimeout(r, 8000); }))));
    if (document.fonts) { await document.fonts.ready; await new Promise((r) => setTimeout(r, 50)); await document.fonts.ready; }
    box.remove();
  }
  headless({
    async renderPost(designId, postId) {
      const d = getD(designId), post = S.posts.find((p) => p.id === postId);
      if (!d) throw new Error('Design not found'); if (!post) throw new Error('Post not found');
      await fontsFor(d);
      const live = LIVE ? await LIVE.forPost(d, post) : d;
      await fontsFor(live); // Arabic events may switch a text to the brand's Arabic font
      return { images: await PUB.renderPages(live), live: live.liveUsed || [] };
    },
  });
}

/* ============ All brands in one workspace ============
   Overview, planner and studio render with the designs, posts and ideas of every brand (merged for the render only),
   and each item is marked with its brand. Clicking or dragging an item first makes its brand the active one, so every
   existing action (open, edit, reschedule, delete…) works on the right brand. Creating asks which brand. */
{
  const MERGE = ['designs', 'posts', 'ideas', 'articles', 'platforms'];
  /** Runs a page render with every brand's data in S.designs, S.posts… (read-only: writes go nowhere) */
  const asAll = (fn) => {
    if (!allOn()) return fn();
    const m = { designs: [], posts: [], ideas: [], articles: [], platforms: {} };
    S.brands.forEach((b) => { const d = S.data[b.id]; if (!d) return; m.designs.push(...(d.designs || [])); m.posts.push(...(d.posts || [])); m.ideas.push(...(d.ideas || []).slice(0, 2)); Object.entries(d.platforms || {}).forEach(([k, v]) => { if (v) m.platforms[k] = v; }); });
    const saved = MERGE.map((k) => Object.getOwnPropertyDescriptor(S, k));
    MERGE.forEach((k) => Object.defineProperty(S, k, { get: () => m[k], set: () => {}, configurable: true }));
    try { return fn(); } finally { MERGE.forEach((k, i) => Object.defineProperty(S, k, saved[i])); }
  };
  /** Which brand a design or a post belongs to */
  const ownerOf = (id) => { if (!id) return null; for (const b of S.brands) { const d = S.data[b.id]; if (d && ((d.designs || []).some((x) => x.id === id) || (d.posts || []).some((x) => x.id === id))) return b; } return null; };
  /** Marks the items of the page with their brand: a small avatar, and data-brand for the click / drag hand-off */
  const decorate = () => {
    if (!allOn()) return;
    $$('#view [data-id], #view [data-drag], #view [data-dragpost]').forEach((el) => {
      const b = ownerOf(el.dataset.dragpost || el.dataset.drag || el.dataset.id); if (!b) return;
      el.dataset.brand = b.id;
      const box = el.matches('.card.dc') ? el.querySelector('.pv') : el.matches('.pc7, .mc7, .l7r, .dcard, .li') ? el : null;
      if (box && !box.querySelector(':scope > .bmark')) box.insertAdjacentHTML('afterbegin', `<span class="bmark" title="${esc(b.name)}">${brandAv(b, 'xs')}</span>`);
    });
  };
  const brandsStrip = () => `<div class="widget"><div class="wtitle">${ic('layers', 24)}All brands<span class="sp"></span><button class="btn ghost sm" data-act="manageBrands">Manage</button></div>
    <div class="ab-grid">${S.brands.map((b) => { const d = S.data[b.id] || { designs: [], posts: [] }, sch = d.posts.filter((p) => p.status === 'Scheduled').length, dr = d.designs.filter((x) => x.status === 'Draft').length;
      return `<button class="ab-card" data-act="switchBrand" data-id="${b.id}">${brandAv(b, 'md')}<span class="grow"><b>${esc(b.name)}</b><small>${sch} scheduled · ${dr} draft${dr === 1 ? '' : 's'}</small></span>${ic('chevR', 16)}</button>`; }).join('')}</div></div>`;
  const wrap = (page, extra) => { const P0 = PAGES[page]; if (!P0) return; const v = P0.view; P0.view = () => { if (!allOn()) return v(); const html = asAll(v); setTimeout(decorate, 0); return (extra ? extra() : '') + html; }; };
  wrap('overview', brandsStrip); wrap('planner'); wrap('studio');
  // the item's brand becomes the active one before its action runs
  const handOff = (e) => { if (!allOn()) return; const el = e.target.closest && e.target.closest('[data-brand]'); if (el && el.dataset.brand !== S.active && S.data[el.dataset.brand]) S.active = el.dataset.brand; };
  document.addEventListener('click', handOff, true);
  document.addEventListener('dragstart', handOff, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter') handOff(e); }, true);
  /** Creating something in All brands: pick the brand first */
  const pickBrand = (title, then) => modal(`<div class="mh"><h2>${title}</h2><button class="btn ghost icon sm" data-close>${ic('x')}</button></div>
    <div class="mb" style="gap:8px">${S.brands.map((b) => `<button class="ab-card" data-pick="${b.id}">${brandAv(b, 'md')}<span class="grow"><b>${esc(b.name)}</b><small>${esc(b.industry || 'Brand')}</small></span>${ic('chevR', 16)}</button>`).join('')}</div>`,
    { onMount: (bg, close) => bg.addEventListener('click', (e) => { const p = e.target.closest('[data-pick]'); if (!p) return; S.active = p.dataset.pick; save(); close(); then(); }) });
  const ask = (name, title) => { const f = ACT[name]; if (!f) return; ACT[name] = (a, e) => { if (!allOn() || (a && a.closest && a.closest('[data-brand]'))) return f(a, e); pickBrand(title, () => f(a, e)); }; };
  ask('newDesign', 'New design for which brand?'); ask('fromTpl', 'Design it for which brand?'); ask('pnew', 'New post for which brand?'); ask('figma', 'Import from Figma into which brand?');
  // pages that belong to one brand say which one
  // pages that belong to one brand: brand tabs to choose which brand they show, without leaving All brands
  const brandTabs = (page) => `<div class="ab-tabs" role="tablist" aria-label="Brand">${S.brands.map((b) => `<button role="tab" aria-selected="${b.id === S.active}" class="ab-tab ${b.id === S.active ? 'on' : ''}" data-act="kitBrand" data-id="${b.id}">${brandAv(b, 'sm')}<span>${esc(b.name)}</span></button>`).join('')}<span class="ab-tabs-h">${page === 'settings' ? 'Settings of the selected brand' : 'Brand kit of the selected brand'}</span></div>`;
  ['brand', 'settings'].forEach((page) => { const P0 = PAGES[page]; if (!P0) return; const v = P0.view; P0.view = () => (allOn() ? brandTabs(page) : '') + v(); });
  ACT.kitBrand = (a) => { if (a.dataset.id === S.active) return; S.active = a.dataset.id; save(); route(); };
}

/* ============ first paint, with every renderer installed ============ */
/* The page was first drawn halfway through boot, before the later sections replaced textHTML / lstyle
   (mixed text runs, text effects, image adjustments, Google Fonts…). Draw it again so the canvas,
   thumbnails and exports all use the same renderer, also when the editor is opened from a link or a reload. */
renderSide(); route();

/* ============ unmount ============ */
const destroy = () => {
  if (mounted !== destroy) return;
  mounted = null;
  persist.dispose();
  runtime.destroy();
  EVENTS.splice(0, EVENTS.length, ...EVENTS_DEFAULT.map((e) => ({ ...e })));
};
mounted = destroy;
return destroy;
}

