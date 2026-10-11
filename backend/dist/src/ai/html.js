"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.words = void 0;
exports.cleanHtml = cleanHtml;
/** Liste blanche stricte : le HTML généré est affiché dans l'éditeur, il ne doit jamais contenir de script ou d'attribut actif. */
const ALLOWED = new Set(["h2", "h3", "h4", "p", "ul", "ol", "li", "strong", "b", "em", "i", "a", "blockquote", "br", "hr", "code", "pre", "table", "thead", "tbody", "tr", "th", "td"]);
function cleanHtml(html, slugs) {
    let out = html
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<(script|style|iframe|object|embed|svg|math|form|noscript|template|textarea|select)\b[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (m, t, attrs) => {
        const tag = t.toLowerCase();
        if (!ALLOWED.has(tag))
            return "";
        if (m.startsWith("</"))
            return `</${tag}>`;
        if (tag === "a") {
            const h = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
            const href = (h?.[1] ?? h?.[2] ?? "").trim();
            if (!/^(https?:\/\/|mailto:|\/|#)/i.test(href))
                return "<a>";
            return `<a href="${href.replace(/"/g, "&quot;")}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ""}>`;
        }
        return `<${tag}>`;
    })
        .replace(/<a>([\s\S]*?)<\/a>/g, "$1");
    if (slugs)
        out = out.replace(/<a href="\/blog\/([^"#?]+)[^"]*">([\s\S]*?)<\/a>/g, (m, s, txt) => (slugs.has(s) ? m : txt));
    return out.trim();
}
const words = (html) => html.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
exports.words = words;
