"use client";

import { useEffect } from "react";

/**
 * Where a network's sign-in ends (the API redirects here after Connect). It hands the result to the
 * studio window that opened it and closes; without an opener it continues to Settings in this tab.
 */
export default function Connected() {
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const msg = { type: "boga:connected", net: q.get("net"), ok: q.get("ok") === "1", name: q.get("name") || "", error: q.get("error") || "" };
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(msg, location.origin);
      window.close();
    } else {
      try { sessionStorage.setItem("boga.connected", JSON.stringify(msg)); } catch {}
      location.replace("/social-media#/settings");
    }
  }, []);
  return <div className="empty" style={{ minHeight: "100vh" }}><p>Finishing the connection…</p></div>;
}
