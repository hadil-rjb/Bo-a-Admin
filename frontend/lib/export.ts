import type { Article } from "./types";
export function exportArticlesCsv(A: Article[]) {
  const q = (s: unknown) => '"' + String(s ?? "").replace(/"/g, '""') + '"';
  const h = ["Slug", "Cover Image", "Cover Image:alt", "Title", "Meta Description", "Subtitle", "Category", "Tag 1", "Tag 2", "Tag 3", "Content", "Date"];
  const rows = A.map((a) => [a.slug, a.img, a.alt, a.title, a.meta, a.sub, a.cat, ...a.t, a.html, a.date ? a.date + "T00:00:00.000Z" : ""]);
  const l = document.createElement("a");
  l.href = URL.createObjectURL(new Blob([[h.map(q).join(","), ...rows.map((r) => r.map(q).join(","))].join("\n")], { type: "text/csv" }));
  l.download = "blog-export.csv"; l.click();
}
