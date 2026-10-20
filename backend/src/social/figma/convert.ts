/**
 * Figma REST nodes → studio layers.
 *
 * The studio canvas takes the frame's own size, at scale 1: every layer keeps the position and size it has in
 * Figma (only frames over MAX_SIDE px are scaled down). Sizes of the standard ratios (1080×1080, 1080×1350,
 * 1080×1920) use their usual names; anything else is a custom canvas named "<w>x<h>".
 * Positions come from each node's absolute box, so children of groups (and groups imported on their own) land
 * exactly where they are in Figma, whatever coordinate space their transforms use.
 * Text, rectangles and ellipses become editable layers (fills, gradients, blend modes, strokes,
 * corner radius, strokes, rotation, opacity); anything the studio can't express (vectors, boolean
 * operations, masks, shadows on shapes, clipped content) is rendered by Figma and placed as an image.
 * Frames that hold text are never flattened: their effects are drawn by the studio (simplified when needed)
 * and only the shapes that cross their clip are rendered by Figma, cut to the frame's box.
 *
 * Fills that need pixels are emitted as placeholders and resolved by the caller:
 *   {{raster:<nodeId>}}  rendered node      {{image:<imageRef>}}  image fill
 *
 * Image fills keep Figma's image adjustments (exposure, contrast, saturation, temperature, tint, highlights,
 * shadows) as `adj` (-100…100, applied by the studio) and the colors and gradients above the image as `ovs`
 * (Figma's fill list, top first, each with its own opacity). Flipped layers stay editable (`fx` / `fy` flags).
 */

export type Ratio = "1:1" | "4:5" | "9:16";
export const RATIOS: Record<Ratio, [number, number]> = { "1:1": [1080, 1080], "4:5": [1080, 1350], "9:16": [1080, 1920] };
/** Largest canvas side the studio accepts (bigger frames are scaled down to it) */
export const MAX_SIDE = 4000;

/** Canvas for a frame: its own size (scale 1), named after the standard ratio when it is one. */
export function canvasOf(fw: number, fh: number) {
  const k = Math.min(1, MAX_SIDE / Math.max(fw, fh, 1));
  const W = Math.max(1, Math.round(fw * k)), H = Math.max(1, Math.round(fh * k));
  const std = (Object.keys(RATIOS) as Ratio[]).find((r) => RATIOS[r][0] === W && RATIOS[r][1] === H);
  return { W, H, k, key: std || `${W}x${H}` };
}

/** Figma blend mode → CSS mix-blend-mode (PASS_THROUGH and NORMAL are the default) */
const BLEND: Record<string, string> = {
  MULTIPLY: "multiply", DARKEN: "darken", LINEAR_BURN: "multiply", COLOR_BURN: "color-burn", LIGHTEN: "lighten", SCREEN: "screen",
  LINEAR_DODGE: "plus-lighter", COLOR_DODGE: "color-dodge", OVERLAY: "overlay", SOFT_LIGHT: "soft-light", HARD_LIGHT: "hard-light",
  DIFFERENCE: "difference", EXCLUSION: "exclusion", HUE: "hue", SATURATION: "saturation", COLOR: "color", LUMINOSITY: "luminosity",
};

/** Families the studio loads (app/layout.tsx); anything else is swapped */
export const STUDIO_FONTS = ["Poppins", "Cairo", "Inter", "Plus Jakarta Sans", "Montserrat", "DM Sans", "Space Grotesk", "Playfair Display", "Tajawal", "Georgia"];

type M = [[number, number, number], [number, number, number]];
const I: M = [[1, 0, 0], [0, 1, 0]];
const mul = (a: M, b: M): M => [
  [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1], a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2]],
  [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1], a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2]],
];
const apply = (m: M, x: number, y: number) => [m[0][0] * x + m[0][1] * y + m[0][2], m[1][0] * x + m[1][1] * y + m[1][2]];
const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const nearestRatio = (w: number, h: number): Ratio => {
  const a = h / w;
  return (Object.keys(RATIOS) as Ratio[]).reduce((best, r) => (Math.abs(Math.log(a / (RATIOS[r][1] / RATIOS[r][0]))) < Math.abs(Math.log(a / (RATIOS[best][1] / RATIOS[best][0]))) ? r : best), "4:5");
};

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0");
export function rgba(c: { r: number; g: number; b: number; a?: number }, opacity = 1) {
  const a = (c.a ?? 1) * opacity;
  if (a >= 0.999) return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`.toUpperCase();
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${r3(a)})`;
}

const visiblePaints = (p?: any[]) => (p || []).filter((x) => x && x.visible !== false && (x.opacity ?? 1) > 0);

/** One Figma paint → one CSS background layer */
function paintCss(p: any, w: number, h: number): string | null {
  const op = p.opacity ?? 1;
  const stops = () => (p.gradientStops || []).map((s: any) => `${rgba(s.color, op)} ${r1(s.position * 100)}%`).join(", ");
  switch (p.type) {
    case "SOLID": return rgba(p.color, op);
    case "GRADIENT_LINEAR": {
      const [a, b] = p.gradientHandlePositions || [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }];
      const deg = (Math.atan2((b.y - a.y) * h, (b.x - a.x) * w) * 180) / Math.PI + 90;
      return `linear-gradient(${r1(deg)}deg, ${stops()})`;
    }
    case "GRADIENT_RADIAL":
    case "GRADIENT_DIAMOND": {
      const [c] = p.gradientHandlePositions || [{ x: 0.5, y: 0.5 }];
      return `radial-gradient(ellipse at ${r1(c.x * 100)}% ${r1(c.y * 100)}%, ${stops()})`;
    }
    case "GRADIENT_ANGULAR": {
      const [c, e] = p.gradientHandlePositions || [{ x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }];
      const deg = (Math.atan2((e.y - c.y) * h, (e.x - c.x) * w) * 180) / Math.PI + 90;
      return `conic-gradient(from ${r1(deg)}deg at ${r1(c.x * 100)}% ${r1(c.y * 100)}%, ${stops()})`;
    }
    case "IMAGE": {
      if (!p.imageRef) return null;
      const t = p.imageTransform as number[][] | undefined; // cropped / stretched image: node space → image space
      if (t && Math.abs(t[0][1]) < 1e-4 && Math.abs(t[1][0]) < 1e-4 && t[0][0] > 0 && t[1][1] > 0) {
        return `url({{image:${p.imageRef}}}) ${r1((-t[0][2] / t[0][0]) * w)}px ${r1((-t[1][2] / t[1][1]) * h)}px/${r1(w / t[0][0])}px ${r1(h / t[1][1])}px no-repeat`;
      }
      const size = p.scaleMode === "FIT" ? "center/contain no-repeat" : p.scaleMode === "TILE" ? "0 0/auto repeat" : p.scaleMode === "STRETCH" ? "center/100% 100% no-repeat" : "center/cover no-repeat";
      return `url({{image:${p.imageRef}}}) ${size}`;
    }
    default: return null;
  }
}

/** All visible fills → one CSS `background` value (Figma lists bottom→top, CSS top→bottom) */
export function fillsCss(fills: any[] | undefined, w: number, h: number): string | null {
  const layers = visiblePaints(fills).map((p) => paintCss(p, w, h)).filter(Boolean) as string[];
  if (!layers.length) return null;
  if (layers.length === 1) return layers[0];
  const css = layers.reverse();
  // a plain color can only be the bottom layer in CSS: wrap the others as flat gradients
  return css.map((c, i) => (i < css.length - 1 && !/gradient|url\(/.test(c) ? `linear-gradient(${c}, ${c})` : c)).join(", ");
}

/** Figma's image adjustments → studio `adj` (-100…100); only the ones that are set */
const FX_KEYS = ["exposure", "contrast", "saturation", "temperature", "tint", "highlights", "shadows"];
export function imageFx(p: any): Record<string, number> | undefined {
  const f = p?.filters || {}, out: Record<string, number> = {};
  FX_KEYS.forEach((k) => { const v = Math.round((+f[k] || 0) * 100); if (v) out[k] = Math.max(-100, Math.min(100, v)); });
  return Object.keys(out).length ? out : undefined;
}

/** A fill above an image, as the studio's fill list item: { k: "solid" | "grad", v, o } */
export type Overlay = { k: "solid" | "grad"; v: string; o: number };

/**
 * Fills of a node with one image: the image (and what's under it) as `fill`, its adjustments as `adj`, and the colors
 * and gradients painted above it as `ovs` (editable, top first). Anything else above the image stays in `fill`.
 */
export function imageFills(fills: any[] | undefined, w: number, h: number): { fill: string | null; adj?: Record<string, number>; ovs?: Overlay[] } {
  const paints = visiblePaints(fills), imgs = paints.filter((p) => p.type === "IMAGE");
  if (imgs.length !== 1) return { fill: fillsCss(fills, w, h) };
  const i = paints.indexOf(imgs[0]), above = paints.slice(i + 1), adj = imageFx(imgs[0]);
  if (above.length && above.every((p) => p.type === "SOLID" || /^GRADIENT_/.test(p.type))) {
    const ovs = above.map((p): Overlay => p.type === "SOLID"
      ? { k: "solid", v: rgba({ ...p.color, a: 1 }), o: r3((p.color.a ?? 1) * (p.opacity ?? 1)) }
      : { k: "grad", v: paintCss({ ...p, opacity: 1 }, w, h)!, o: r3(p.opacity ?? 1) }).reverse();
    return { fill: fillsCss(paints.slice(0, i + 1), w, h), adj, ovs };
  }
  return { fill: fillsCss(paints, w, h), adj };
}

export interface ConvertOut {
  bg: string;
  layers: any[];
  rasters: { id: string; w: number; h: number }[];
  images: { ref: string; w: number; h: number }[];
  warnings: string[];
  /** "1:1" | "4:5" | "9:16", or "<w>x<h>" for a custom canvas */
  ratio: string;
  width: number;
  height: number;
  scale: number;
}

const RASTER_TYPES = new Set(["VECTOR", "BOOLEAN_OPERATION", "STAR", "LINE", "REGULAR_POLYGON", "POLYGON"]);
const CONTAINERS = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE", "SECTION"]);
const hasEffects = (n: any) => (n.effects || []).some((e: any) => e.visible !== false);
/** Visible text somewhere inside: such frames stay editable layers instead of one picture */
const hasText = (n: any): boolean => n.visible !== false && (n.type === "TEXT" ? !!String(n.characters || "").trim() : (n.children || []).some(hasText));
/** Clip box of a container, in Figma's absolute coordinates; r: its corner radius */
type Clip = { x: number; y: number; w: number; h: number; r: number };
const cut = (a: Clip | undefined, b: Clip): Clip => {
  if (!a) return b;
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y), r: Math.max(a.r, b.r) };
};
/** A group or instance drawn only with vectors (a logo, an icon): one image, like it looks in Figma */
const vectorOnly = (n: any): boolean => {
  const kids = (n.children || []).filter((c: any) => c.visible !== false);
  return kids.length > 0 && kids.every((c: any) => RASTER_TYPES.has(c.type) || ((c.type === "GROUP" || c.type === "BOOLEAN_OPERATION" || CONTAINERS.has(c.type)) && !visiblePaints(c.fills).length && vectorOnly(c)));
};

export function convertFrame(frame: any, uid: () => string, fontFor: (family: string, size: number) => string = defaultFont): ConvertOut {
  // groups have no box of their own: their size is the bounding box of their content
  const bb0 = frame.absoluteBoundingBox, useBox = frame.type === "GROUP" && bb0;
  const fw = useBox ? bb0.width : frame.size?.x ?? bb0.width, fh = useBox ? bb0.height : frame.size?.y ?? bb0.height;
  const { W, H, k, key: ratio } = canvasOf(fw, fh), offX = 0, offY = 0;
  const fbb = frame.absoluteBoundingBox || { x: 0, y: 0, width: fw, height: fh };
  const warn = new Set<string>(), layers: any[] = [], rasters: ConvertOut["rasters"] = [], images: ConvertOut["images"] = [];

  if (k < 1) warn.add(`The frame is ${Math.round(fw)}×${Math.round(fh)}: scaled down to ${W}×${H} (the studio canvas stops at ${MAX_SIDE}px)`);

  const isGroup = frame.type === "GROUP"; // a group imported on its own: transparent, like Figma exports it
  const fF = imageFills(frame.fills, W, H), frameFill = fF.fill;
  const paints = visiblePaints(frame.fills), solid = paints.find((p) => p.type === "SOLID");
  const firstStop = paints.find((p) => p.gradientStops?.length)?.gradientStops[0]?.color;
  const bg = solid ? rgba(solid.color, solid.opacity ?? 1) : firstStop ? rgba(firstStop) : "#FFFFFF";
  layers.push({ id: uid(), type: "rect", name: "Background", x: 0, y: 0, w: W, h: H, rot: 0, op: 1, fill: frameFill || (isGroup ? "transparent" : "#FFFFFF"), r: 0, locked: true, ...(fF.adj ? { adj: fF.adj } : {}), ...(fF.ovs ? { ovs: fF.ovs } : {}) });
  visiblePaints(frame.fills).filter((p) => p.type === "IMAGE").forEach((p) => images.push({ ref: p.imageRef, w: W, h: H }));

  /** Axis-aligned box of a node on the studio canvas (for rasterized nodes) */
  const boxOf = (n: any) => {
    const b = n.absoluteRenderBounds || n.absoluteBoundingBox;
    return b ? { x: (b.x - fbb.x) * k + offX, y: (b.y - fbb.y) * k + offY, w: b.width * k, h: b.height * k } : null;
  };

  /**
   * Effects the studio draws itself: one drop shadow (no spread on shapes), one layer blur and one background blur. `ok` is false when the
   * node has others (inner shadow, background blur, several shadows): shapes are then rendered by Figma.
   */
  const effectsOf = (n: any, isText: boolean) => {
    const fx = (n.effects || []).filter((e: any) => e.visible !== false), out: Record<string, any> = {};
    const drops = fx.filter((e: any) => e.type === "DROP_SHADOW"), blurs = fx.filter((e: any) => e.type === "LAYER_BLUR"), bgs = fx.filter((e: any) => e.type === "BACKGROUND_BLUR");
    const ok = drops.length <= 1 && blurs.length <= 1 && bgs.length <= (isText ? 0 : 1) && drops.length + blurs.length + bgs.length === fx.length && (isText || !drops[0]?.spread);
    const d = drops[0];
    if (d) {
      const c = d.color || { r: 0, g: 0, b: 0, a: 0.25 };
      Object.assign(out, { shx: r1((d.offset?.x || 0) * k), shy: r1((d.offset?.y || 0) * k), shb: r1(Math.max(0, d.radius || 0) * k), shc: rgba({ ...c, a: 1 }), sha: r3(c.a ?? 1) });
    }
    if (blurs[0]) out.bl = r1(((blurs[0].radius || 0) * k) / 2);
    if (bgs[0] && !isText) out.bbl = r1(((bgs[0].radius || 0) * k) / 2); // frosted glass: blurs what is behind the layer
    return { ok, props: out };
  };
  /**
   * Blend mode of a layer. Figma also sets blend modes on fills: when every visible fill and stroke uses the same one
   * (and the layer itself doesn't), it is the layer's blend in the studio, which looks the same.
   */
  const blendOf = (n: any): Record<string, string> => {
    const paints = [...visiblePaints(n.fills), ...visiblePaints(n.strokes)], pb = paints.length && paints.every((p) => p.blendMode && p.blendMode === paints[0].blendMode) ? paints[0].blendMode : null;
    const mode = BLEND[n.blendMode] ? n.blendMode : pb && BLEND[pb] ? pb : null, b = mode && BLEND[mode];
    if (!BLEND[n.blendMode] && paints.some((p) => BLEND[p.blendMode]) && !b) warn.add("Fills with different blend modes use Normal");
    if (mode === "LINEAR_BURN") warn.add("“Linear burn” is approximated with Multiply");
    return b ? { blend: b } : {};
  };
  /**
   * A node rendered by Figma, placed as an image. Inside a clipping frame the image is cut to the frame's box
   * (the picture keeps its full size, offset in the layer), so content that overflows stays hidden like in Figma.
   */
  const raster = (n: any, op: number, clip?: Clip) => {
    const b = boxOf(n), a = n.absoluteRenderBounds || n.absoluteBoundingBox;
    if (!b || !a || b.w < 0.5 || b.h < 0.5) return;
    const c = clip ? cut(clip, { x: a.x, y: a.y, w: a.width, h: a.height, r: 0 }) : null;
    if (c && (c.w < 0.5 || c.h < 0.5)) return; // entirely outside the frame
    rasters.push({ id: n.id, w: b.w, h: b.h });
    const base = { id: uid(), type: "image", name: String(n.name || "Image").slice(0, 40), rot: 0, op: r3(op), ...blendOf(n) };
    // rounded frame: the studio has one radius per layer, so the picture takes the frame's radius when it covers
    // the frame along at least three of its sides (a full-bleed or banner picture), not when it only sits in a corner
    const edges = c ? [Math.abs(c.x - clip!.x), Math.abs(c.y - clip!.y), Math.abs(c.x + c.w - clip!.x - clip!.w), Math.abs(c.y + c.h - clip!.y - clip!.h)].filter((d) => d < 1).length : 0;
    const r = edges >= 3 ? r1(clip!.r * k) : 0;
    if (!c || (c.w >= a.width - 0.5 && c.h >= a.height - 0.5)) {
      layers.push({ ...base, x: r1(b.x), y: r1(b.y), w: r1(b.w), h: r1(b.h), fill: `url({{raster:${n.id}}}) center/100% 100% no-repeat`, r });
      return;
    }
    layers.push({
      ...base, x: r1((c.x - fbb.x) * k + offX), y: r1((c.y - fbb.y) * k + offY), w: r1(c.w * k), h: r1(c.h * k), r,
      fill: `url({{raster:${n.id}}}) ${r1((a.x - c.x) * k)}px ${r1((a.y - c.y) * k)}px/${r1(a.width * k)}px ${r1(a.height * k)}px no-repeat`,
    });
  };

  /**
   * Rotated box of a node: studio layers rotate around their center. The center comes from the absolute bounding
   * box (exact for any parent: frames, groups, nested groups; a rotated node's box has the same center), the
   * rotation from the transform; the transform alone is the fallback when Figma sends no box.
   */
  const placed = (n: any, m: M) => {
    const b = n.absoluteBoundingBox;
    const w = n.size?.x ?? b?.width ?? 0, h = n.size?.y ?? b?.height ?? 0;
    const [cx, cy] = b ? [b.x + b.width / 2 - fbb.x, b.y + b.height / 2 - fbb.y] : apply(m, w / 2, h / 2);
    // a mirrored transform is a rotation then a horizontal flip: m = R(θ)·diag(-1, 1)
    const flip = mirrored(m), rot = ((flip ? Math.atan2(-m[1][0], -m[0][0]) : Math.atan2(m[1][0], m[0][0])) * 180) / Math.PI;
    return { x: r1(cx * k + offX - (w * k) / 2), y: r1(cy * k + offY - (h * k) / 2), w: r1(w * k), h: r1(h * k), rot: r1(Math.abs(rot) < 0.05 ? 0 : rot), ...(flip ? { fx: true } : {}) };
  };
  const mirrored = (m: M) => m[0][0] * m[1][1] - m[0][1] * m[1][0] < 0;

  const overflows = (n: any) => {
    const b = n.absoluteBoundingBox;
    return b && (n.children || []).some((c: any) => {
      const a = c.visible !== false && c.absoluteBoundingBox;
      return a && (a.x < b.x - 1 || a.y < b.y - 1 || a.x + a.width > b.x + b.width + 1 || a.y + a.height > b.y + b.height + 1);
    });
  };
  const hasImageInside = (n: any): boolean => visiblePaints(n.fills).some((p) => p.type === "IMAGE") || (n.children || []).some(hasImageInside);

  const shape = (n: any, m: M, op: number, type: "rect" | "ellipse" | "image", fx: Record<string, any> = {}) => {
    const g = placed(n, m), F = imageFills(n.fills, g.w, g.h), fill = F.fill;
    const stroke = visiblePaints(n.strokes).find((p) => p.type === "SOLID");
    if (!fill && !stroke) return;
    const radii = n.rectangleCornerRadii as number[] | undefined;
    if (radii && new Set(radii).size > 1) warn.add("Shapes with different corner radii use a single radius");
    const r = (radii ? Math.max(...radii) : n.cornerRadius || 0) * k;
    visiblePaints(n.fills).filter((p) => p.type === "IMAGE").forEach((p) => images.push({ ref: p.imageRef, w: g.w, h: g.h }));
    const isImage = visiblePaints(n.fills).some((p) => p.type === "IMAGE");
    // the studio draws borders inside the box: grow it for centered / outside strokes so the size stays exact
    const sw = Math.max(1, (n.strokeWeight || 1) * k), grow = !stroke ? 0 : n.strokeAlign === "OUTSIDE" ? sw : n.strokeAlign === "CENTER" ? sw / 2 : 0;
    layers.push({
      id: uid(), type: isImage ? "image" : type, name: String(n.name || (type === "ellipse" ? "Circle" : "Shape")).slice(0, 40), ...g,
      x: r1(g.x - grow), y: r1(g.y - grow), w: r1(g.w + grow * 2), h: r1(g.h + grow * 2), op: r3(op), ...blendOf(n),
      fill: fill || "transparent", r: r1(r ? r + grow : 0), ...(F.adj ? { adj: F.adj } : {}), ...(F.ovs ? { ovs: F.ovs } : {}),
      ...(stroke ? { stroke: rgba(stroke.color, stroke.opacity ?? 1), sw: r1(sw) } : {}), ...fx,
    });
  };

  const text = (n: any, m: M, op: number) => {
    const s = n.style || {}, g = placed(n, m);
    let chars = String(n.characters ?? "");
    if (s.textCase === "UPPER") chars = chars.toUpperCase();
    else if (s.textCase === "LOWER") chars = chars.toLowerCase();
    else if (s.textCase === "TITLE") chars = chars.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
    const fill = visiblePaints(n.fills)[0];
    if (fill && fill.type !== "SOLID") warn.add("Gradient text uses its first color");
    const color = fill ? rgba(fill.type === "SOLID" ? fill.color : fill.gradientStops?.[0]?.color ?? { r: 0, g: 0, b: 0 }, fill.opacity ?? 1) : "#000000";
    if (s.italic) warn.add("Italic text is shown upright");
    const E = effectsOf(n, true);
    if (!E.ok) warn.add("Some text effects (inner shadows, background blurs, extra shadows) were left out");
    const size = (s.fontSize || 16) * k;
    const family = String(s.fontFamily || "Inter");
    const font = fontFor(family, size);
    if (font !== family) warn.add(`Font “${family}” isn't available, swapped to ${font}`);
    else if (!STUDIO_FONTS.includes(family)) warn.add(`Font “${family}” is loaded from Google Fonts (a fallback font shows if it isn't there)`);
    const lh = s.lineHeightPx && s.fontSize ? s.lineHeightPx / s.fontSize : 1.2;
    const align = ({ CENTER: "center", RIGHT: "right" } as Record<string, string>)[s.textAlignHorizontal] || "left";
    // auto-width text gets a little slack (font metrics differ), growing from the side it is aligned to
    const slack = n.textAutoResize === "WIDTH_AND_HEIGHT" ? g.w * 0.04 + 2 : 0;
    const va = ({ CENTER: "middle", BOTTOM: "bottom" } as Record<string, string>)[s.textAlignVertical];
    layers.push({
      id: uid(), type: "text", name: chars.replace(/\s+/g, " ").slice(0, 20) || String(n.name || "Text").slice(0, 20), ...g,
      x: r1(g.x - (align === "center" ? slack / 2 : align === "right" ? slack : 0)), w: r1(g.w + slack), op: r3(op), ...blendOf(n), ...(va ? { va } : {}),
      text: chars, size: r1(size), weight: s.fontWeight || 400, font, color, align, lh: r3(lh), ls: r1((s.letterSpacing || 0) * k),
      ...(/[֐-ࣿ]/.test(chars) ? { dir: "rtl" } : {}), ...E.props,
    });
    // mixed styles (Figma: characterStyleOverrides + styleOverrideTable) → runs over the text: [{ s, e, ...style }]
    const ov: number[] = n.characterStyleOverrides || [], table = n.styleOverrideTable || {}, runs: any[] = [];
    let text2 = chars;
    for (let i = 0; i < ov.length;) {
      const id = ov[i] || 0; let j = i; while (j + 1 < ov.length && (ov[j + 1] || 0) === id) j++;
      const st = id && table[id];
      if (st) {
        const r: any = { s: i, e: j + 1 };
        if (st.fontWeight && st.fontWeight !== (s.fontWeight || 400)) r.weight = st.fontWeight;
        const rsize = st.fontSize ? st.fontSize * k : size;
        if (st.fontSize && Math.abs(rsize - size) > 0.05) r.size = r1(rsize);
        if (st.fontFamily && st.fontFamily !== family) { const f2 = fontFor(st.fontFamily, rsize); r.font = f2; if (f2 !== st.fontFamily) warn.add(`Font “${st.fontFamily}” isn't available, swapped to ${f2}`); }
        if (st.italic != null && !!st.italic !== !!s.italic) r.it = !!st.italic;
        if (st.textDecoration && (st.textDecoration === "UNDERLINE") !== (s.textDecoration === "UNDERLINE")) r.ul = st.textDecoration === "UNDERLINE";
        if (st.letterSpacing != null && st.letterSpacing !== s.letterSpacing) r.ls = r1(st.letterSpacing * k);
        if (st.lineHeightPx && (st.fontSize || s.fontSize)) { const l2 = r3(st.lineHeightPx / (st.fontSize || s.fontSize)); if (Math.abs(l2 - lh) > 0.005) r.lh = l2; }
        const f0 = visiblePaints(st.fills)[0];
        if (f0 && f0.type === "SOLID") { const c2 = rgba(f0.color, f0.opacity ?? 1); if (c2 !== color) r.color = c2; }
        if (st.textCase === "UPPER") text2 = text2.slice(0, i) + text2.slice(i, j + 1).toUpperCase() + text2.slice(j + 1);
        else if (st.textCase === "LOWER") text2 = text2.slice(0, i) + text2.slice(i, j + 1).toLowerCase() + text2.slice(j + 1);
        if (Object.keys(r).length > 2) runs.push(r);
      }
      i = j + 1;
    }
    if (runs.length || text2 !== chars) { const L = layers[layers.length - 1]; L.text = text2; if (runs.length) { L.runs = runs; L.rt = text2; } }
  };

  /** Layers made from one Figma group or nested frame share a `gid`: they select and move together in the studio */
  const gnames = new Map<string, string>();
  const tag = (from: number, gid: string) => { for (let i = from; i < layers.length; i++) layers[i].gid ??= gid; };

  /** Where a node stands against the clip of the frames around it: inside, partly outside, or hidden */
  const against = (n: any, clip?: Clip): "in" | "part" | "out" => {
    const a = n.absoluteRenderBounds || n.absoluteBoundingBox;
    if (!clip || !a) return "in";
    const c = cut(clip, { x: a.x, y: a.y, w: a.width, h: a.height, r: 0 });
    if (c.w < 0.5 || c.h < 0.5) return "out";
    return c.w >= a.width - 0.5 && c.h >= a.height - 0.5 ? "in" : "part";
  };

  /**
   * m: transform of the node's coordinate parent (frames/components define one, groups don't); gid: enclosing group;
   * clip: box of the clipping frames around the node (Figma coordinates). Shapes that cross it are rendered by Figma and cut to it.
   */
  const walk = (n: any, m: M, op: number, gid?: string, clip?: Clip) => {
    if (!n || n.visible === false) return;
    if (n.isMask) { warn.add("Masks are approximated"); return; }
    const rel: M = (n.relativeTransform as M) || [[1, 0, n.absoluteBoundingBox ? n.absoluteBoundingBox.x - fbb.x : 0], [0, 1, n.absoluteBoundingBox ? n.absoluteBoundingBox.y - fbb.y : 0]];
    const mm = mul(m, rel), o = op * (n.opacity ?? 1);
    if (o <= 0.001) return;
    const kids: any[] = n.children || [];
    const where = against(n, clip);
    if (where === "out") return;
    const R = () => raster(n, op, clip);

    if (BLEND[n.blendMode] && (n.type === "GROUP" || CONTAINERS.has(n.type)) && kids.length) return R(); // blended as a whole
    if ((n.type === "GROUP" || CONTAINERS.has(n.type)) && vectorOnly(n) && !visiblePaints(n.fills).length) return R(); // logo / icon
    if (n.type === "GROUP") {
      if (kids.some((c) => c.isMask)) return R(); // masked group: let Figma render it
      const g = gid || uid(), from = layers.length;
      if (!gid) gnames.set(g, String(n.name || "Group").slice(0, 40));
      kids.forEach((c) => walk(c, m, o, g, clip)); // group children are positioned in the group's parent space
      tag(from, g);
      return;
    }
    if (n.type === "TEXT") return text(n, mm, o); // text stays editable, even when a frame cuts part of it
    if (where === "part" && !CONTAINERS.has(n.type)) return R(); // a shape crossing its frame's edge: cut like in Figma
    if (clip?.r && !CONTAINERS.has(n.type) && hasImageInside(n)) return R(); // a picture in a rounded frame: rounded like the frame
    if (RASTER_TYPES.has(n.type) || (mirrored(mm) && !["RECTANGLE", "ELLIPSE"].includes(n.type))) return R();
    if (n.type === "ELLIPSE") {
      if (n.arcData && (n.arcData.endingAngle - n.arcData.startingAngle < 6.28 || n.arcData.innerRadius > 0)) return R();
      const E = effectsOf(n, false); return E.ok ? shape(n, mm, o, "ellipse", E.props) : R();
    }
    if (n.type === "RECTANGLE") { const E = effectsOf(n, false); return E.ok ? shape(n, mm, o, "rect", E.props) : R(); }
    if (CONTAINERS.has(n.type)) {
      const clips = n.clipsContent !== false, name = String(n.name || "Frame").slice(0, 40);
      const radius = n.cornerRadius || (n.rectangleCornerRadii ? Math.max(...n.rectangleCornerRadii) : 0);
      const E = effectsOf(n, false), fx = hasEffects(n);
      const flat = kids.some((c) => c.isMask) || fx || (clips && (overflows(n) || (radius > 0 && kids.some(hasImageInside))));
      // frames with text stay editable: their effects are drawn by the studio and their clip is applied to what crosses it
      if (flat && (!hasText(n) || kids.some((c) => c.isMask))) return R();
      if (fx && !E.ok) warn.add(`“${name}”: some effects were simplified so its texts stay editable`);
      const g = gid || uid(), from = layers.length;
      if (!gid) gnames.set(g, name);
      shape(n, mm, o, "rect", fx ? E.props : {});
      const b = n.absoluteBoundingBox, inner = clips && b ? cut(clip, { x: b.x, y: b.y, w: b.width, h: b.height, r: radius }) : clip;
      kids.forEach((c) => walk(c, mm, o, g, inner));
      tag(from, g);
      return;
    }
    warn.add(`Unsupported layers (${String(n.type).toLowerCase()}) were skipped`);
  };

  (frame.children || []).forEach((c: any) => walk(c, I, 1));
  // a "group" of one layer is just a layer
  const count = new Map<string, number>(); layers.forEach((l) => l.gid && count.set(l.gid, (count.get(l.gid) || 0) + 1));
  layers.forEach((l) => { if (l.gid && count.get(l.gid)! < 2) delete l.gid; else if (l.gid) l.gn = gnames.get(l.gid); }); // gn: the group's name
  if (hasEffects(frame)) warn.add("Frame shadows were left out");
  return { bg, layers, rasters, images, warnings: [...warn], ratio, width: W, height: H, scale: k };
}

/** Missing families: serif → Playfair Display, display sizes → Plus Jakarta Sans, the rest → Inter */
export function defaultFont(family: string, size: number) {
  if (STUDIO_FONTS.includes(family)) return family;
  if (/serif|garamond|times|georgia|playfair|merriweather|lora/i.test(family) && !/sans/i.test(family)) return "Playfair Display";
  if (/arab|naskh|kufi|tajawal|cairo/i.test(family)) return "Cairo";
  return size >= 28 ? "Plus Jakarta Sans" : "Inter";
}

/** Figma link → file key and optional node id ("12-34" in URLs, "12:34" in the API) */
export function parseFigmaUrl(input: string): { fileKey: string; nodeId?: string } | null {
  let u: URL;
  try { u = new URL(input.trim()); } catch { return /^[A-Za-z0-9]{10,}$/.test(input.trim()) ? { fileKey: input.trim() } : null; }
  if (!/(^|\.)figma\.com$/.test(u.hostname)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  const i = parts.findIndex((p) => ["file", "design", "proto"].includes(p));
  if (i < 0 || !parts[i + 1]) return null;
  const b = parts.indexOf("branch");
  const fileKey = b > i && parts[b + 1] ? parts[b + 1] : parts[i + 1];
  const node = u.searchParams.get("node-id");
  return { fileKey, nodeId: node ? decodeURIComponent(node).replace(/-/g, ":") : undefined };
}
