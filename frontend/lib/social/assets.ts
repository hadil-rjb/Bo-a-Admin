/**
 * Studio images as hosted assets instead of data URLs inside the design.
 *
 * Images enter a design in many ways (upload, replace image, image adjustments, imports, drag and drop,
 * the agent) and all of them produce `data:image/...;base64` strings somewhere in a layer. Rather than
 * changing each one, persist.ts runs these helpers on the designs it is about to sync: every raster
 * data URL is uploaded once (POST /api/media/assets) and replaced by the asset's URL, in the copy being
 * sent and in the studio's live state. The workspace, the local copy and the undo snapshots stay small.
 *
 * SVG data URLs stay inline: they are small, and the API only hosts raster images.
 */

/** Raster data URLs; tiny ones (a 1 px texture) stay inline */
const DATA_IMAGE = /data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+/g;
const MIN_LENGTH = 2048;

/** data URL → asset URL, for this page's lifetime: an undo that brings a data URL back costs no upload */
const uploads = new Map<string, Promise<string>>();

type Upload = (dataUrl: string) => Promise<string>;

/** Every string under `v`, in place: `fn` returns the new value */
function eachString(v: unknown, fn: (s: string) => string) {
  if (Array.isArray(v)) {
    v.forEach((x, i) => (typeof x === "string" ? (v[i] = fn(x)) : eachString(x, fn)));
  } else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const x = o[k];
      if (typeof x === "string") o[k] = fn(x);
      else eachString(x, fn);
    }
  }
}

/** Raster data URLs found under `roots` */
export function findDataImages(roots: unknown[]): Set<string> {
  const found = new Set<string>();
  const scan = (s: string) => {
    if (s.length >= MIN_LENGTH && s.includes("data:image/")) for (const m of s.matchAll(DATA_IMAGE)) if (m[0].length >= MIN_LENGTH) found.add(m[0]);
    return s;
  };
  roots.forEach((r) => eachString(r, scan));
  return found;
}

/**
 * Uploads the data URLs (each once) and resolves to the ones that are now hosted: data URL → asset URL.
 * A failed upload is left out (the image stays inline and is tried again on the next sync).
 */
export async function uploadDataImages(urls: Set<string>, upload: Upload): Promise<Map<string, string>> {
  const done = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (u) => {
      let p = uploads.get(u);
      if (!p) {
        p = upload(u);
        uploads.set(u, p);
        p.catch(() => uploads.delete(u));
      }
      try {
        done.set(u, await p);
      } catch (e) {
        console.warn("[assets] an image could not be uploaded, it stays in the design for now", e);
      }
    }),
  );
  return done;
}

/** Replaces hosted data URLs under `roots`, in place. Returns how many strings changed. */
export function replaceDataImages(roots: unknown[], map: Map<string, string>): number {
  if (!map.size) return 0;
  let n = 0;
  const swap = (s: string) => {
    if (s.length < MIN_LENGTH || !s.includes("data:image/")) return s;
    const out = s.replace(DATA_IMAGE, (m) => map.get(m) ?? m);
    if (out !== s) n++;
    return out;
  };
  roots.forEach((r) => eachString(r, swap));
  return n;
}
