"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { PillBtn, btn } from "./ui";

type AskOpts = { t: string; p?: string; input?: string; ph?: string; ok?: string; danger?: boolean };
type Ctx = { toast: (m: string) => void; ask: (o: AskOpts) => Promise<string | boolean | null> };
const F = createContext<Ctx | null>(null);
export const useFeedback = () => { const c = useContext(F); if (!c) throw new Error("FeedbackProvider manquant"); return c; };

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [modal, setModal] = useState<(AskOpts & { done: (v: string | boolean | null) => void }) | null>(null);
  const [val, setVal] = useState("");
  const toast = useCallback((m: string) => { setMsg(m); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(""), 2400); }, []);
  const ask = useCallback((o: AskOpts) => new Promise<string | boolean | null>((done) => { setVal(o.input ?? ""); setModal({ ...o, done }); }), []);
  const close = (v: string | boolean | null) => { modal?.done(v); setModal(null); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <F.Provider value={{ toast, ask }}>
      {children}
      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && close(null)}>
          <div className="flex w-[min(420px,100%)] flex-col gap-3 rounded-16 border border-border bg-surface p-5 shadow-[0_20px_50px_rgba(0,0,0,.35)]">
            <h3 className="text-base font-semibold" dangerouslySetInnerHTML={{ __html: modal.t }} />
            {modal.p && <p className="text-sm text-text-2" dangerouslySetInnerHTML={{ __html: modal.p }} />}
            {modal.input != null && <input autoFocus value={val} placeholder={modal.ph} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && close(val)} className="w-full rounded-10 border border-transparent bg-pill px-3 py-2.5 text-sm outline-0 focus:border-accent" />}
            <div className="flex justify-end gap-2">
              <PillBtn onClick={() => close(null)}>Cancel</PillBtn>
              <button onClick={() => close(modal.input != null ? val : true)} className={btn(modal.danger ? "danger" : "primary")}>{modal.ok || "OK"}</button>
            </div>
          </div>
        </div>
      )}
      <div className={`pointer-events-none fixed bottom-6 left-1/2 z-[99] -translate-x-1/2 rounded-10 bg-text-1 px-4 py-2.5 text-[13px] text-bg transition ${msg ? "opacity-100" : "translate-y-5 opacity-0"}`}>{msg}</div>
    </F.Provider>
  );
}
