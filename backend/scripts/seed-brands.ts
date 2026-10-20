// Creates the Social Media brands of data/brands/*.json (brand kit: info, colors, fonts, logos) — idempotent:
// a brand that already exists (same _id) is left as it is, so edits made in the studio are never overwritten.
// Usage: npm run seed:brands            all files
//        npm run seed:brands neomarkets one brand
import "reflect-metadata";
import { connect, model, disconnect } from "mongoose";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import { SocialBrand, SocialBrandSchema } from "../src/social/schemas/brand.schema";

(async () => {
  config();
  await connect(process.env.MONGODB_URI ?? "mongodb://localhost:27017/uxboga");
  const M = model(SocialBrand.name, SocialBrandSchema);
  const dir = "data/brands", only = process.argv[2];
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && (!only || f === `${only}.json`));
  if (!files.length) console.log(only ? `No data/brands/${only}.json` : "No brand files in data/brands");
  for (const f of files) {
    const brand = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (await M.exists({ _id: brand._id })) { console.log(`• ${brand.name} (${brand._id}) already exists: left unchanged`); continue; }
    // new brands go after the existing ones in the brand switcher
    await M.create({ ...brand, order: await M.countDocuments() });
    console.log(`✔ ${brand.name} (${brand._id}) created`);
  }
  await disconnect();
})();
