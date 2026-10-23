/* ============================================================
   Vector paths for the studio's `path` layers. Pure data, no DOM.

   A path is a list of segments in absolute coordinates, using only
   M (move), L (line), C (cubic curve) and Z (close):
     { c: 'M', p: [x, y] }   { c: 'L', p: [x, y] }
     { c: 'C', p: [x1, y1, x2, y2, x, y] }   { c: 'Z', p: [] }
   parse() turns any SVG path data (relative commands, H/V, S/T, Q, A)
   into that form, so every other function only handles four commands.

   For editing, a path is also seen as nodes: subpaths of anchor points,
   each with optional incoming and outgoing handles (toNodes / fromNodes).
   ============================================================ */

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/** SVG path data → absolute M / L / C / Z segments */
export function parse(d) {
  const out = [], toks = String(d || '').match(/[a-df-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lc = null; // lc: last control point, for S / T
  const num = () => +toks[i++], has = () => i < toks.length && !/^[a-z]$/i.test(toks[i]);
  while (i < toks.length) {
    if (/^[a-z]$/i.test(toks[i])) cmd = toks[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { out.push({ c: 'Z', p: [] }); x = sx; y = sy; lc = null; cmd = ''; continue; }
    if (!has()) { cmd = ''; continue; }
    if (C === 'M') { x = ox + num(); y = oy + num(); sx = x; sy = y; out.push({ c: 'M', p: [x, y] }); cmd = rel ? 'l' : 'L'; lc = null; continue; }
    if (C === 'L') { x = ox + num(); y = oy + num(); out.push({ c: 'L', p: [x, y] }); lc = null; continue; }
    if (C === 'H') { x = ox + num(); out.push({ c: 'L', p: [x, y] }); lc = null; continue; }
    if (C === 'V') { y = oy + num(); out.push({ c: 'L', p: [x, y] }); lc = null; continue; }
    if (C === 'C') {
      const p = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()];
      out.push({ c: 'C', p }); lc = [p[2], p[3], 'C']; x = p[4]; y = p[5]; continue;
    }
    if (C === 'S') {
      const r = lc && lc[2] === 'C' ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y];
      const p = [r[0], r[1], ox + num(), oy + num(), ox + num(), oy + num()];
      out.push({ c: 'C', p }); lc = [p[2], p[3], 'C']; x = p[4]; y = p[5]; continue;
    }
    if (C === 'Q' || C === 'T') {
      const q = C === 'Q' ? [ox + num(), oy + num()] : lc && lc[2] === 'Q' ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y];
      const ex = ox + num(), ey = oy + num();
      out.push({ c: 'C', p: [x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y), ex + (2 / 3) * (q[0] - ex), ey + (2 / 3) * (q[1] - ey), ex, ey] });
      lc = [q[0], q[1], 'Q']; x = ex; y = ey; continue;
    }
    if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), large = num(), sweep = num(), ex = ox + num(), ey = oy + num();
      arcToCubics(x, y, rx, ry, rot, large, sweep, ex, ey).forEach((p) => out.push({ c: 'C', p }));
      x = ex; y = ey; lc = null; continue;
    }
    i++; // unknown command: skip its argument
  }
  return out;
}

/** SVG elliptical arc → cubic curves (SVG spec F.6.5, split into ≤ 90° pieces) */
export function arcToCubics(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
  const f = (phi * Math.PI) / 180, cf = Math.cos(f), sf = Math.sin(f);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cf * dx + sf * dy, y1p = -sf * dx + cf * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const k = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * y1p) / ry, cyp = (-k * ry * x1p) / rx;
  const cx = cf * cxp - sf * cyp + (x1 + x2) / 2, cy = sf * cxp + cf * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9), step = dt / n, out = [];
  const kk = (4 / 3) * Math.tan(step / 4);
  const pt = (t) => [cx + rx * Math.cos(t) * cf - ry * Math.sin(t) * sf, cy + rx * Math.cos(t) * sf + ry * Math.sin(t) * cf];
  const dv = (t) => [-rx * Math.sin(t) * cf - ry * Math.cos(t) * sf, -rx * Math.sin(t) * sf + ry * Math.cos(t) * cf];
  for (let j = 0; j < n; j++) {
    const a = t1 + j * step, b = a + step, p0 = pt(a), p3 = j === n - 1 ? [x2, y2] : pt(b), d0 = dv(a), d3 = dv(b);
    out.push([p0[0] + kk * d0[0], p0[1] + kk * d0[1], p3[0] - kk * d3[0], p3[1] - kk * d3[1], p3[0], p3[1]]);
  }
  return out;
}

const fmt = (n) => { const r = Math.round(n * 100) / 100; return Object.is(r, -0) ? '0' : String(r); };
/** Segments → path data (2 decimals) */
export const toD = (segs) => segs.map((s) => s.c + (s.p.length ? s.p.map(fmt).join(' ') : '')).join('');

/** Applies (x, y) → [x, y] to every point (a copy) */
export const mapPts = (segs, fn) => segs.map((s) => { const p = []; for (let i = 0; i < s.p.length; i += 2) p.push(...fn(s.p[i], s.p[i + 1])); return { c: s.c, p }; });
/** Scales by (sx, sy) around 0, 0 */
export const scale = (segs, sx, sy) => mapPts(segs, (x, y) => [x * sx, y * sy]);
/** Applies an affine matrix (a, b, c, d, e, f) as in SVG / DOMMatrix */
export const transform = (segs, m) => mapPts(segs, (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);

/** Tight bounds (curve extrema included): { x, y, w, h }, or null for an empty path */
export function bounds(segs) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0;
  const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  const ext = (a, b, c, d) => { // t values where a cubic's derivative is 0
    const A = -a + 3 * b - 3 * c + d, B = 2 * (a - 2 * b + c), Cc = b - a, ts = [];
    if (Math.abs(A) < 1e-12) { if (Math.abs(B) > 1e-12) ts.push(-Cc / B); }
    else { const disc = B * B - 4 * A * Cc; if (disc >= 0) { const r = Math.sqrt(disc); ts.push((-B + r) / (2 * A), (-B - r) / (2 * A)); } }
    return ts.filter((t) => t > 0 && t < 1);
  };
  const at = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
  let sx = 0, sy = 0;
  for (const s of segs) {
    if (s.c === 'M') { cx = sx = s.p[0]; cy = sy = s.p[1]; add(cx, cy); }
    else if (s.c === 'L') { cx = s.p[0]; cy = s.p[1]; add(cx, cy); }
    else if (s.c === 'C') {
      const [a, b, c, d, e, f] = s.p;
      [...ext(cx, a, c, e), ...ext(cy, b, d, f)].forEach((t) => add(at(cx, a, c, e, t), at(cy, b, d, f, t)));
      cx = e; cy = f; add(cx, cy);
    } else if (s.c === 'Z') { cx = sx; cy = sy; }
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/* ---------- nodes: the editable view of a path ---------- */
/** Segments → [{ closed, pts: [{ x, y, in: [x, y] | null, out: [x, y] | null }] }] */
export function toNodes(segs) {
  const subs = []; let cur = null;
  for (const s of segs) {
    if (s.c === 'M') { cur = { closed: false, pts: [{ x: s.p[0], y: s.p[1], in: null, out: null }] }; subs.push(cur); continue; }
    if (!cur) { cur = { closed: false, pts: [{ x: 0, y: 0, in: null, out: null }] }; subs.push(cur); }
    if (s.c === 'L') cur.pts.push({ x: s.p[0], y: s.p[1], in: null, out: null });
    else if (s.c === 'C') { // a control point sitting on its anchor is no handle
      const a = cur.pts[cur.pts.length - 1], on = (x, y, n) => Math.abs(x - n[0]) < 1e-6 && Math.abs(y - n[1]) < 1e-6;
      a.out = on(s.p[0], s.p[1], [a.x, a.y]) ? null : [s.p[0], s.p[1]];
      cur.pts.push({ x: s.p[4], y: s.p[5], in: on(s.p[2], s.p[3], [s.p[4], s.p[5]]) ? null : [s.p[2], s.p[3]], out: null });
    }
    else if (s.c === 'Z') {
      cur.closed = true;
      // a closing segment drawn explicitly back to the start: merge the duplicate end point into the first one
      const a = cur.pts[0], z = cur.pts[cur.pts.length - 1];
      if (cur.pts.length > 1 && Math.abs(a.x - z.x) < 1e-6 && Math.abs(a.y - z.y) < 1e-6) { a.in = z.in; cur.pts.pop(); }
      cur = null;
    }
  }
  return subs.filter((sp) => sp.pts.length);
}
/** Nodes → segments */
export function fromNodes(subs) {
  const out = [];
  for (const sp of subs) {
    const P = sp.pts; if (!P.length) continue;
    out.push({ c: 'M', p: [P[0].x, P[0].y] });
    const seg = (a, b) => (a.out || b.in ? { c: 'C', p: [...(a.out || [a.x, a.y]), ...(b.in || [b.x, b.y]), b.x, b.y] } : { c: 'L', p: [b.x, b.y] });
    for (let i = 1; i < P.length; i++) out.push(seg(P[i - 1], P[i]));
    if (sp.closed) { if (P.length > 1 && (P[P.length - 1].out || P[0].in)) out.push(seg(P[P.length - 1], P[0])); out.push({ c: 'Z', p: [] }); }
  }
  return out;
}
/** Moves an anchor with its handles */
export function moveNode(n, dx, dy) { n.x += dx; n.y += dy; if (n.in) { n.in[0] += dx; n.in[1] += dy; } if (n.out) { n.out[0] += dx; n.out[1] += dy; } }

/** The segment from node i to the next one, as 4 cubic points (lines included), or null past the end */
export function segPts(sp, i) {
  const P = sp.pts, j = i + 1 < P.length ? i + 1 : sp.closed ? 0 : -1; if (j < 0) return null;
  const a = P[i], b = P[j];
  // a straight segment gets its controls at thirds, so t runs evenly along it (splitting at t = .3 lands 30% along)
  if (!a.out && !b.in) return [[a.x, a.y], [a.x + (b.x - a.x) / 3, a.y + (b.y - a.y) / 3], [a.x + (2 * (b.x - a.x)) / 3, a.y + (2 * (b.y - a.y)) / 3], [b.x, b.y]];
  return [[a.x, a.y], a.out ? [...a.out] : [a.x, a.y], b.in ? [...b.in] : [b.x, b.y], [b.x, b.y]];
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Inserts a node at t on the segment after node i (de Casteljau: the curve keeps its shape). Returns the new index. */
export function splitSeg(sp, i, t) {
  const q = segPts(sp, i); if (!q) return -1;
  const P = sp.pts, j = i + 1 < P.length ? i + 1 : 0, curve = !!(P[i].out || P[j].in);
  const ab = lerp(q[0], q[1], t), bc = lerp(q[1], q[2], t), cd = lerp(q[2], q[3], t), abc = lerp(ab, bc, t), bcd = lerp(bc, cd, t), m = lerp(abc, bcd, t);
  const node = { x: m[0], y: m[1], in: curve ? abc : null, out: curve ? bcd : null };
  if (curve) { P[i].out = ab; P[j].in = cd; }
  P.splice(i + 1, 0, node);
  return i + 1;
}
/** Closest point of the path to (x, y): { s (subpath), i (segment start node), t, d (distance) } */
export function nearest(subs, x, y) {
  let best = null;
  subs.forEach((sp, s) => sp.pts.forEach((_, i) => {
    const q = segPts(sp, i); if (!q) return;
    for (let k = 0; k <= 40; k++) {
      const t = k / 40, u = 1 - t;
      const px = u * u * u * q[0][0] + 3 * u * u * t * q[1][0] + 3 * u * t * t * q[2][0] + t * t * t * q[3][0];
      const py = u * u * u * q[0][1] + 3 * u * u * t * q[1][1] + 3 * u * t * t * q[2][1] + t * t * t * q[3][1];
      const d = Math.hypot(px - x, py - y); if (!best || d < best.d) best = { s, i, t, d };
    }
  }));
  return best;
}

/* ---------- shapes, drawn in a w × h box ---------- */
const ring = (n, w, h, r, a0 = -Math.PI / 2) => Array.from({ length: n }, (_, i) => { const a = a0 + (i * 2 * Math.PI) / n; return [w / 2 + (w / 2) * r * Math.cos(a), h / 2 + (h / 2) * r * Math.sin(a)]; });
const poly = (pts) => [{ c: 'M', p: pts[0] }, ...pts.slice(1).map((p) => ({ c: 'L', p })), { c: 'Z', p: [] }];
/** Regular polygon with n sides, pointing up, fitted to the box */
export function polygon(n, w, h) { return fit(poly(ring(Math.max(3, Math.round(n)), w, h, 1)), w, h); }
/** Star with n points; `inner` is the inner radius as a share of the outer one */
export function star(n, inner, w, h) {
  n = Math.max(3, Math.round(n)); const o = ring(n, w, h, 1), i = ring(n, w, h, Math.max(0.05, Math.min(1, inner)), -Math.PI / 2 + Math.PI / n);
  return fit(poly(o.flatMap((p, k) => [p, i[k]])), w, h);
}
/** Arrow pointing right: `shaft` is the shaft's thickness and `head` the head's length, as shares of the box */
export function arrow(w, h, shaft = 0.36, head = 0.4) {
  const t = (h * Math.max(0.05, Math.min(1, shaft))) / 2, hx = w * (1 - Math.max(0.05, Math.min(0.95, head)));
  return poly([[0, h / 2 - t], [hx, h / 2 - t], [hx, 0], [w, h / 2], [hx, h], [hx, h / 2 + t], [0, h / 2 + t]]);
}
/** Horizontal line across the box, at mid height */
export const line = (w, h) => [{ c: 'M', p: [0, h / 2] }, { c: 'L', p: [w, h / 2] }];
/** Stretches a path so its bounds fill the w × h box (odd polygons and stars don't reach every side) */
export function fit(segs, w, h) {
  const b = bounds(segs); if (!b || !b.w || !b.h) return segs;
  return mapPts(segs, (x, y) => [((x - b.x) * w) / b.w, ((y - b.y) * h) / b.h]);
}
/** Parametric shapes: the path for `shape` ({ k: 'poly' | 'star' | 'arrow' | 'line', … }) in a w × h box */
export function shapePath(shape, w, h) {
  const s = shape || {};
  if (s.k === 'poly') return polygon(s.n || 6, w, h);
  if (s.k === 'star') return star(s.n || 5, s.r ?? 0.45, w, h);
  if (s.k === 'arrow') return arrow(w, h, s.t ?? 0.36, s.hd ?? 0.4);
  if (s.k === 'line') return line(w, h);
  return null;
}
