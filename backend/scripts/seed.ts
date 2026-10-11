// Importe data/articles.json (les 25+ articles du HTML d'origine) — idempotent (upsert par slug)
import "reflect-metadata";
import { connect, model, disconnect } from "mongoose";
import { readFileSync } from "fs";
import { config } from "dotenv";
import { Article, ArticleSchema } from "../src/articles/article.schema";

(async () => {
  config();
  await connect(process.env.MONGODB_URI ?? "mongodb://localhost:27017/uxboga");
  const M = model(Article.name, ArticleSchema);
  const data = JSON.parse(readFileSync("data/articles.json", "utf8"));
  const r = await M.bulkWrite(data.map((a: Article) => ({ updateOne: { filter: { slug: a.slug }, update: { $setOnInsert: a }, upsert: true } })));
  console.log(`✔ ${r.upsertedCount} insérés, ${data.length - r.upsertedCount} déjà présents`);
  await disconnect();
})();
