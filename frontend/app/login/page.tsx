"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import { Cta } from "@/components/ui";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => { if (getToken()) location.replace("/"); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3000); return () => clearTimeout(t); }, [toast]);

  async function go() {
    setBusy(true);
    try {
      const j = await api("/auth/login", { method: "POST", body: { email: email.trim(), password } });
      localStorage.setItem("uxb.token", j.token);
      location.replace("/");
    } catch (e: any) { setToast(e.message || "Login failed"); }
    setBusy(false);
  }
  const inp = "w-full rounded-10 border border-transparent bg-pill px-3 py-2.5 text-sm text-text-1 outline-0 focus:border-accent";
  return (
    <div className="grid min-h-screen place-items-center p-4" onKeyDown={(e) => e.key === "Enter" && go()}>
      <div className="flex w-full max-w-[400px] flex-col gap-4 rounded-16 border border-border bg-surface p-6">
        <div className="size-9 overflow-hidden rounded-10"><Image src="/logo.png" alt="Boğa" width={36} height={36} className="size-full object-cover" /></div>
        <div>
          <h1 className="font-jakarta text-[22px] font-semibold">Boğa Growth Admin</h1>
          <p className="text-sm text-text-2">Sign in to manage your blog and SEO.</p>
        </div>
        <div><label className="mb-1.5 block text-xs font-medium text-text-2">Email</label><input className={inp} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="mb-1.5 block text-xs font-medium text-text-2">Password</label><input className={inp} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Cta onClick={go} disabled={busy} className="justify-center">Sign in</Cta>
      </div>
      <div className={`pointer-events-none fixed bottom-6 left-1/2 z-[99] -translate-x-1/2 rounded-10 bg-text-1 px-4 py-2.5 text-[13px] text-bg transition ${toast ? "opacity-100" : "translate-y-5 opacity-0"}`}>{toast}</div>
    </div>
  );
}
