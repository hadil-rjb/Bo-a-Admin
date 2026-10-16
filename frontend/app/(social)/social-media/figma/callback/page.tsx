"use client";

import { useEffect } from "react";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/+$/, "");

/**
 * Optional Figma redirect URL on the frontend (FIGMA_REDIRECT_URI=<FRONTEND_URL>/social-media/figma/callback):
 * Figma sends the browser here with ?code&state, and this page hands them to the API callback, which exchanges
 * the code (with the same redirect URL) and continues to /social-media/connected.
 */
export default function FigmaCallback() {
  useEffect(() => {
    location.replace(`${API}/social/figma/oauth/callback${location.search}`);
  }, []);
  return <div className="empty" style={{ minHeight: "100vh" }}><p>Connecting Figma…</p></div>;
}
