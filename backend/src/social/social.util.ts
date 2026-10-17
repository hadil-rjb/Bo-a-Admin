import { createHash, randomBytes } from "crypto";

/** Fields that belong to the database, not to the client objects. */
const DB_FIELDS = ["_id", "brandId", "order", "hash", "createdAt", "updatedAt"];

export const strip = <T extends Record<string, any>>(doc: T | null | undefined): Record<string, any> | null => {
  if (!doc) return null;
  const out: Record<string, any> = { ...doc };
  DB_FIELDS.forEach((k) => delete out[k]);
  return out;
};

export const hashOf = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex");

/** Same id style as the client (uid()) */
export const newId = (prefix = "") => prefix + randomBytes(5).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 7);
