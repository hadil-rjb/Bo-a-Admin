/**
 * Public address of this API, from PUBLIC_API_URL.
 *
 * The variable may be set with or without the global "/api" prefix
 * ("https://api.example.com" or "https://api.example.com/api"): both give the same URLs.
 * Networks download post images and call OAuth callbacks on these addresses, so a missing
 * "/api" makes them 404 (e.g. Instagram: "cannot fetch media from this URI").
 */
export const API_PREFIX = "/api";

/** Origin only, without trailing slashes or the /api prefix */
export function publicOrigin(raw: string | undefined, fallback = "http://localhost:4000"): string {
  return (raw || fallback).trim().replace(/\/+$/, "").replace(/\/api$/i, "");
}

/** Base for API routes: origin + "/api" */
export function publicApiBase(raw: string | undefined, fallback?: string): string {
  return publicOrigin(raw, fallback) + API_PREFIX;
}
