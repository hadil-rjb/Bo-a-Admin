"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Importe data/articles.json (les 25+ articles du HTML d'origine) — idempotent (upsert par slug)
require("reflect-metadata");
const mongoose_1 = require("mongoose");
const fs_1 = require("fs");
const dotenv_1 = require("dotenv");
const article_schema_1 = require("../src/articles/article.schema");
(async () => {
    (0, dotenv_1.config)();
    await (0, mongoose_1.connect)(process.env.MONGODB_URI ?? "mongodb://localhost:27017/uxboga");
    const M = (0, mongoose_1.model)(article_schema_1.Article.name, article_schema_1.ArticleSchema);
    const data = JSON.parse((0, fs_1.readFileSync)("data/articles.json", "utf8"));
    const r = await M.bulkWrite(data.map((a) => ({ updateOne: { filter: { slug: a.slug }, update: { $setOnInsert: a }, upsert: true } })));
    console.log(`✔ ${r.upsertedCount} insérés, ${data.length - r.upsertedCount} déjà présents`);
    await (0, mongoose_1.disconnect)();
})();
