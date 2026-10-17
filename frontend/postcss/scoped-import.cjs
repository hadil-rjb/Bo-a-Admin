/**
 * PostCSS: `@import "<pkg>/<file>.css" layer(<name>) scope(<selector>);`
 *
 * Inlines the stylesheet with every rule scoped to `:where(<selector>)` (zero specificity, so the
 * rules keep their original weight) inside `@layer <name>`. The syntax mirrors the CSS Cascade 6
 * `@import … scope()` proposal. Used for Tailwind's preflight, which only the Blog Admin was built
 * on (see app/globals.css); it is read from the installed tailwindcss, so it never drifts.
 *
 * Root-level selectors become the scope root itself: `html`/`:host` → the root, `*` and bare
 * pseudo-elements → the root and its descendants.
 */
const fs = require("fs");
const postcss = require("postcss");

const IMPORT = /^["']([^"']+\.css)["']\s+layer\(([^)]+)\)\s+scope\((.+)\)\s*$/;

function scopeSelector(sel) {
  const s = sel.trim();
  if (s === "html" || s === ":host") return ["&"];
  if (s === "*") return ["&", "*"];
  if (s.startsWith("::")) return ["&" + s, s];
  return [s];
}

const plugin = () => ({
  postcssPlugin: "scoped-import",
  Once(root, { result }) {
    root.walkAtRules("import", (rule) => {
      const m = rule.params.match(IMPORT);
      if (!m) return;
      const [, spec, layer, scope] = m;
      const file = require.resolve(spec, { paths: [process.cwd()] });
      result.messages.push({ type: "dependency", plugin: "scoped-import", file, parent: result.opts.from });
      const sheet = postcss.parse(fs.readFileSync(file, "utf8"), { from: file });
      sheet.walkRules((r) => {
        if (r.parent.type === "root" || (r.parent.type === "atrule" && r.parent.parent.type === "root" && r.parent.name === "supports")) {
          r.selectors = r.selectors.flatMap(scopeSelector);
        }
      });
      const wrapper = postcss.rule({ selector: `:where(${scope})` });
      sheet.each((node) => { if (node.type !== "comment") wrapper.append(node.clone()); });
      rule.replaceWith(postcss.atRule({ name: "layer", params: layer, nodes: [wrapper] }));
    });
  },
});
plugin.postcss = true;
module.exports = plugin;
