/* Post templates: (w, h) => layers. Pure data, no DOM. */
/* ---------- Constants ---------- */
export const RATIOS = { '1:1': [1080, 1080], '4:5': [1080, 1350], '9:16': [1080, 1920] };
export const PLATFORMS = {
  ig: { n: 'Instagram', c: '#e1306c', s: 'IG' }, li: { n: 'LinkedIn', c: '#0a66c2', s: 'in' },
  x: { n: 'X', c: '#64748b', s: 'X' }, fb: { n: 'Facebook', c: '#1877f2', s: 'f' },
  tt: { n: 'TikTok', c: '#14b8a6', s: 'Tk' }, tg: { n: 'Telegram', c: '#229ed9', s: 'Tg' },
};
export const FONTS = ['Poppins', 'Cairo', 'Inter', 'Plus Jakarta Sans', 'Montserrat', 'DM Sans', 'Space Grotesk', 'Playfair Display', 'Tajawal', 'Georgia'];
export const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------- Layer builders ---------- */
export const Tx = (x, y, w, text, o = {}) => ({ id: uid(), type: 'text', name: o.name || text.slice(0, 20), x, y, w, h: Math.round((o.size || 40) * (o.lh || 1.15) * (o.lines || 1)), rot: 0, op: 1, text, size: 40, weight: 600, font: 'Poppins', color: '#fff', align: 'left', lh: 1.15, ls: 0, ...o });
export const Rc = (x, y, w, h, fill, o = {}) => ({ id: uid(), type: 'rect', name: 'Shape', x, y, w, h, rot: 0, op: 1, fill, r: 0, ...o });
export const El = (x, y, w, h, fill, o = {}) => ({ ...Rc(x, y, w, h, fill, o), type: 'ellipse', name: o.name || 'Circle' });
export const Im = (x, y, w, h, fill, o = {}) => ({ ...Rc(x, y, w, h, fill, o), type: 'image', name: o.name || 'Image' });
export const BG = (w, h, fill) => Rc(0, 0, w, h, fill, { name: 'Background', locked: true });

/* ---------- Live data (the old Calendar Studio idea, now one template) ---------- */
export const EVENTS = [
  { id: 'e1', t: '13:30', cur: 'USD', imp: 3, en: 'Core CPI m/m', ar: 'مؤشر أسعار المستهلك الأساسي', on: 1 },
  { id: 'e2', t: '13:30', cur: 'USD', imp: 3, en: 'CPI y/y', ar: 'مؤشر أسعار المستهلك سنويًا', on: 1 },
  { id: 'e3', t: '15:00', cur: 'USD', imp: 3, en: 'Fed Chair Powell speaks', ar: 'تصريحات رئيس الفيدرالي', on: 1 },
  { id: 'e4', t: '09:00', cur: 'EUR', imp: 2, en: 'German ZEW Sentiment', ar: 'مؤشر ZEW الألماني', on: 1 },
  { id: 'e5', t: '12:00', cur: 'GBP', imp: 3, en: 'BoE Gov Bailey speaks', ar: 'تصريحات محافظ بنك إنجلترا', on: 1 },
  { id: 'e6', t: '02:30', cur: 'JPY', imp: 1, en: 'Machinery Orders m/m', ar: 'طلبات الآلات شهريًا', on: 0 },
];
/** Pristine copy: the editor toggles EVENTS[i].on, and the studio restores it when it unmounts */
export const EVENTS_DEFAULT = EVENTS.map((e) => ({ ...e }));
export const CUR_COLOR = { USD: '#2b6cb0', EUR: '#3b4cca', GBP: '#b83280', JPY: '#c53030', CAD: '#dd6b20' };

/* ---------- Post templates: (w,h) => layers ---------- */
export function tplCalendar(w, h, lang = 'en', evs = EVENTS.filter((e) => e.on)) {
  const ar = lang === 'ar', f = ar ? 'Cairo' : 'Poppins', al = ar ? 'right' : 'left', P = 76, dir = ar ? 'rtl' : 'ltr';
  const X = (x, wd) => (ar ? w - x - wd : x);
  const list = evs.slice(0, 5), top = Math.round(h * 0.33), rh = Math.round((h - top - 190) / 5);
  const L = [
    BG(w, h, 'radial-gradient(ellipse 120% 60% at 15% 92%, rgba(38,150,76,.55) 0%, rgba(3,5,4,0) 65%), radial-gradient(ellipse 80% 40% at 90% 40%, rgba(38,150,76,.22) 0%, rgba(3,5,4,0) 70%), #030504'),
    Tx(X(P, 700), 96, 700, ar ? 'عالية التأثير' : 'HIGH IMPACT', { name: 'Kicker', size: 30, weight: 600, color: '#22A24C', font: f, align: al, ls: ar ? 0 : 6, dir }),
    Tx(X(P, 900), 140, 900, ar ? 'الأخبار' : 'NEWS', { name: 'Headline', size: 132, weight: 700, font: f, align: al, lh: 1, dir, ls: ar ? 0 : -2 }),
    Tx(X(P, 700), top - 62, 700, ar ? 'الثلاثاء ١٣ أكتوبر ٢٠٢٦' : 'Tuesday, 13 October 2026', { name: 'Date', size: 26, weight: 400, color: '#D6D6D6', font: f, align: al, dir }),
  ];
  list.forEach((e, i) => {
    const y = top + i * rh, cw = 120;
    L.push(Rc(P, y, w - P * 2, rh - 14, 'rgba(255,255,255,.055)', { name: 'Row ' + (i + 1), r: 22, stroke: 'rgba(255,255,255,.08)', sw: 2 }));
    L.push(Tx(X(P + 30, 130), y + (rh - 14) / 2 - 18, 130, e.t, { name: 'Time', size: 32, weight: 600, font: 'Poppins', align: al, dir: 'ltr' }));
    L.push(Rc(X(P + 180, cw), y + (rh - 14) / 2 - 22, cw, 44, CUR_COLOR[e.cur] || '#2b6cb0', { name: 'Currency', r: 22 }));
    L.push(Tx(X(P + 180, cw), y + (rh - 14) / 2 - 15, cw, e.cur, { name: 'Currency label', size: 24, weight: 600, align: 'center', font: 'Poppins' }));
    L.push(Tx(X(P + 330, w - P * 2 - 330 - 150), y + (rh - 14) / 2 - 18, w - P * 2 - 330 - 150, ar ? e.ar : e.en, { name: 'Event', size: 30, weight: 500, font: f, align: al, dir }));
    L.push(Tx(X(w - P - 130 - 20, 130), y + (rh - 14) / 2 - 17, 130, '★'.repeat(e.imp), { name: 'Impact', size: 28, weight: 400, color: '#22A24C', align: ar ? 'left' : 'right', font: 'Poppins', ls: 2, dir: 'ltr' }));
  });
  L.push(Tx(0, h - 120, w, 'mypowerfunds.com', { name: 'Footer', size: 28, weight: 500, color: '#D6D6D6', align: 'center', font: 'Poppins' }));
  return L;
}
export function tplQuote(w, h) {
  return [
    BG(w, h, '#fd0e35'),
    El(w * 0.55, -w * 0.25, w * 0.9, w * 0.9, 'rgba(255,255,255,.1)', { name: 'Glow' }),
    Tx(80, 110, 200, '“', { name: 'Quote mark', size: 300, weight: 700, font: 'Plus Jakarta Sans', lh: 1 }),
    Tx(80, h * 0.3, w - 160, 'Great design is a conversation, not a broadcast.', { name: 'Quote', size: 84, weight: 700, font: 'Plus Jakarta Sans', lh: 1.08, lines: 4, ls: -2 }),
    Rc(80, h - 250, 90, 8, '#fff', { name: 'Rule', r: 4 }),
    Tx(80, h - 215, w - 160, 'Boğa Growth Team', { name: 'Author', size: 34, weight: 600, font: 'Plus Jakarta Sans' }),
    Tx(80, h - 168, w - 160, 'Weekly Insights · uxboga.com', { name: 'Source', size: 26, weight: 400, color: 'rgba(255,255,255,.8)', font: 'Inter' }),
  ];
}
export function tplArticle(w, h) {
  const ih = Math.round(h * 0.44);
  return [
    BG(w, h, '#0b1220'),
    Im(60, 60, w - 120, ih, 'linear-gradient(135deg,#fd0e35 0%,#7c1d6f 55%,#1e293b 100%)', { name: 'Cover image', r: 36 }),
    Rc(96, 96, 230, 52, 'rgba(255,255,255,.2)', { name: 'Tag', r: 26 }),
    Tx(96, 106, 230, 'NEW ON THE BLOG', { name: 'Tag label', size: 20, weight: 600, align: 'center', font: 'Inter', ls: 1.5 }),
    Tx(60, ih + 110, w - 120, 'Why most onboarding flows lose users in the first 60 seconds', { name: 'Title', size: 66, weight: 700, font: 'Plus Jakarta Sans', lh: 1.08, lines: 3, ls: -1.5 }),
    Tx(60, ih + 340, w - 120, 'A teardown of 12 apps, and the fixes that moved activation by 31%.', { name: 'Excerpt', size: 30, weight: 400, color: '#94a3b8', font: 'Inter', lh: 1.4, lines: 2 }),
    Rc(60, h - 160, 330, 84, '#fd0e35', { name: 'Button', r: 42 }),
    Tx(60, h - 160 + 24, 330, 'Read the article', { name: 'Button label', size: 28, weight: 600, align: 'center', font: 'Inter' }),
    Tx(w - 60 - 260, h - 160 + 26, 260, 'uxboga.com', { name: 'URL', size: 26, weight: 500, color: '#94a3b8', align: 'right', font: 'Inter' }),
  ];
}
export function tplStat(w, h) {
  const bars = [0.35, 0.5, 0.42, 0.68, 0.8, 1], bw = 90, gap = 22, bx = 80, base = h - 150, mh = Math.min(380, h * 0.28);
  const L = [
    BG(w, h, '#f8fafc'),
    Tx(80, 90, w - 160, 'Organic traffic, last 90 days', { name: 'Label', size: 32, weight: 500, color: '#64748b', font: 'Inter' }),
    Tx(80, 150, w - 160, '+38%', { name: 'Big number', size: 250, weight: 700, color: '#0f172a', font: 'Plus Jakarta Sans', lh: 1, ls: -8 }),
    Tx(80, 150 + 270, w - 240, 'More people found us on Google after we rebuilt our top 20 articles.', { name: 'Caption', size: 36, weight: 500, color: '#334155', font: 'Inter', lh: 1.35, lines: 3 }),
  ];
  bars.forEach((b, i) => L.push(Rc(bx + i * (bw + gap), base - mh * b, bw, mh * b, i === 5 ? '#fd0e35' : '#e2e8f0', { name: 'Bar ' + (i + 1), r: 14 })));
  L.push(Tx(w - 80 - 300, base - 30, 300, 'uxboga.com', { name: 'URL', size: 26, weight: 500, color: '#64748b', align: 'right', font: 'Inter' }));
  return L;
}
export function tplLaunch(w, h) {
  return [
    BG(w, h, 'linear-gradient(160deg,#0b1220 0%,#1e1b4b 100%)'),
    El(w * 0.45, h * 0.12, w * 0.7, w * 0.7, 'radial-gradient(circle,#fd0e35 0%,rgba(253,14,53,0) 68%)', { name: 'Glow', op: 0.85 }),
    Rc(80, 110, 250, 54, 'rgba(255,255,255,.12)', { name: 'Chip', r: 27 }),
    Tx(80, 122, 250, 'LAUNCH · 2026', { name: 'Chip label', size: 22, weight: 600, align: 'center', font: 'Inter', ls: 2 }),
    Tx(80, h * 0.3, w - 160, 'Meet the new Boğa Studio', { name: 'Headline', size: 108, weight: 700, font: 'Plus Jakarta Sans', lh: 1.02, lines: 3, ls: -3 }),
    Tx(80, h * 0.3 + 380, w - 160, 'Design, schedule and publish social posts, all from your admin.', { name: 'Sub', size: 34, weight: 400, color: '#cbd5e1', font: 'Inter', lh: 1.4, lines: 2 }),
    Rc(80, h - 190, 300, 84, '#fff', { name: 'Button', r: 42 }),
    Tx(80, h - 190 + 24, 300, 'Try it now', { name: 'Button label', size: 28, weight: 600, align: 'center', color: '#0b1220', font: 'Inter' }),
  ];
}
export function tplFeatures(w, h) {
  const L = [BG(w, h, '#ffffff'), Tx(70, 80, w - 140, 'Everything in one workspace', { name: 'Headline', size: 74, weight: 700, color: '#0f172a', font: 'Plus Jakarta Sans', lh: 1.05, lines: 2, ls: -2 })];
  const items = [['Design', '#fd0e35'], ['Plan', '#0f172a'], ['Publish', '#6366f1'], ['Measure', '#16a34a']], cw = (w - 140 - 24) / 2, ch = (h - 400) / 2 - 12;
  items.forEach((it, i) => {
    const x = 70 + (i % 2) * (cw + 24), y = 330 + Math.floor(i / 2) * (ch + 24);
    L.push(Rc(x, y, cw, ch, it[1], { name: it[0] + ' card', r: 36 }));
    L.push(Tx(x + 36, y + ch - 96, cw - 72, it[0], { name: it[0], size: 48, weight: 700, font: 'Plus Jakarta Sans' }));
  });
  return L;
}
export function tplTestimonial(w, h) {
  return [
    BG(w, h, '#fff1f2'),
    El(w - 340, -120, 460, 460, '#ffc0c5', { name: 'Blob' }),
    Tx(80, 150, w - 160, '“Our posts now take 6 minutes, not 2 hours.”', { name: 'Quote', size: 78, weight: 700, color: '#1e293b', font: 'Plus Jakarta Sans', lh: 1.1, lines: 4, ls: -2 }),
    El(80, h - 260, 100, 100, '#fd0e35', { name: 'Avatar' }),
    Tx(204, h - 250, w - 280, 'Salma Ben Ali', { name: 'Name', size: 34, weight: 700, color: '#0f172a', font: 'Plus Jakarta Sans' }),
    Tx(204, h - 205, w - 280, 'Head of Content, Nuba Capital', { name: 'Role', size: 26, weight: 400, color: '#64748b', font: 'Inter' }),
  ];
}
export function tplEvent(w, h) {
  return [
    BG(w, h, 'linear-gradient(180deg,#fd0e35 0%,#b33c3e 100%)'),
    Tx(70, h * 0.2, w - 140, 'LIVE', { name: 'Kicker', size: 40, weight: 700, font: 'Inter', ls: 8 }),
    Tx(70, h * 0.2 + 70, w - 140, 'Growth AMA with the Boğa team', { name: 'Headline', size: 112, weight: 700, font: 'Plus Jakarta Sans', lh: 1.02, lines: 4, ls: -3 }),
    Rc(70, h * 0.66, w - 140, 150, 'rgba(255,255,255,.16)', { name: 'Info card', r: 32 }),
    Tx(110, h * 0.66 + 36, w - 220, 'Thu 22 Oct · 18:00 GMT+1', { name: 'When', size: 44, weight: 600, font: 'Inter' }),
    Tx(110, h * 0.66 + 92, w - 220, 'Instagram Live · Free', { name: 'Where', size: 28, weight: 400, color: 'rgba(255,255,255,.85)', font: 'Inter' }),
  ];
}
export const TPL = {
  calendar: { name: 'Economic calendar', cat: 'Live data', fn: (w, h) => tplCalendar(w, h, 'en'), live: 1 },
  article: { name: 'Blog article promo', cat: 'Blog', fn: tplArticle },
  quote: { name: 'Bold quote', cat: 'Quotes', fn: tplQuote },
  stat: { name: 'Big number', cat: 'Data', fn: tplStat },
  launch: { name: 'Product launch', cat: 'Announcements', fn: tplLaunch },
  event: { name: 'Event story', cat: 'Announcements', fn: tplEvent },
  testimonial: { name: 'Testimonial', cat: 'Quotes', fn: tplTestimonial },
  features: { name: 'Feature grid', cat: 'Announcements', fn: tplFeatures },
};
/* Figma frames the demo "imports" (each maps to a layer builder) */
export const FIGMA_FRAMES = [
  { id: '12:34', name: 'Launch / Hero', fn: 'launch', ratio: '4:5' },
  { id: '12:41', name: 'Feature grid', fn: 'features', ratio: '1:1' },
  { id: '12:58', name: 'Testimonial', fn: 'testimonial', ratio: '1:1' },
  { id: '13:02', name: 'Story / Event', fn: 'event', ratio: '9:16', warn: 'Font “Sora” missing, swapped to Plus Jakarta Sans' },
];
