// Guards the shared stylesheet against one kind of conflict that layers can't prevent: a Tailwind
// utility generated from Blog Admin code whose name is also a Social Media Studio class name
// (utilities sit above the studio's component layer). Run after `next build`.
//   npm run check:css
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Harmless overlaps (the utility sets what the studio's own rule already sets):
//   .grid { display: grid }        studio: .grid { display: grid; gap: 16px }
//   .grow { flex-grow: 1 }         studio: .grow { flex: 1 }
const ALLOWED = new Set(["grid", "grow"]);

const cssDir = path.join(root, process.env.NEXT_DIST_DIR || ".next", "static/css");
if (!fs.existsSync(cssDir)) {
  console.error("No build output: run `npm run build` first.");
  process.exit(1);
}
const utilities = new Set();
for (const f of fs.readdirSync(cssDir, { recursive: true }).filter((f) => String(f).endsWith(".css"))) {
  postcss.parse(fs.readFileSync(path.join(cssDir, String(f)), "utf8")).walkAtRules("layer", (layer) => {
    if (layer.params.trim() !== "utilities") return;
    layer.walkRules((r) => r.selectors.forEach((s) => {
      const m = s.match(/^\.((?:\\.|[\w-])+)/);
      if (m) utilities.add(m[1].replace(/\\/g, ""));
    }));
  });
}

const studio = new Set();
postcss.parse(fs.readFileSync(path.join(root, "styles/studio.css"), "utf8")).walkRules((r) =>
  r.selectors.forEach((s) => (s.match(/\.([A-Za-z_][\w-]*)/g) || []).forEach((c) => studio.add(c.slice(1)))),
);
const engine = fs.readFileSync(path.join(root, "studio/engine.js"), "utf8");
for (const m of engine.matchAll(/class(?:Name)?\s*=\s*\\?["'`]([^"'`]*)/g)) m[1].split(/\s+/).forEach((c) => /^[a-z][\w-]*$/i.test(c) && studio.add(c));
for (const m of engine.matchAll(/classList\.(?:add|remove|toggle|contains)\('([^']+)'/g)) studio.add(m[1]);

const clashes = [...utilities].filter((c) => studio.has(c) && !ALLOWED.has(c));
if (clashes.length) {
  console.error(`Tailwind utilities that are also studio class names: ${clashes.join(", ")}\n` +
    "Rename the studio class, or check the utility sets the same values and add it to ALLOWED.");
  process.exit(1);
}
console.log(`OK: ${utilities.size} utilities, ${studio.size} studio classes, no clashes.`);
