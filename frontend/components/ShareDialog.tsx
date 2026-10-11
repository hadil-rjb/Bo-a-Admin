"use client";
import Select from "./Select";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { Cta, IconBtn, PillBtn, Skeleton, SkeletonLine, btn } from "./ui";
import { useFeedback } from "./feedback";
import { Pa, inpCls } from "./split";
import { api } from "@/lib/api";
import { useData } from "@/lib/data";
import { since } from "@/lib/seo";

type Member = { id: string; name: string; email: string; role: string; avatar?: string; online?: boolean; lastActiveAt?: string };
type State = { me: { id: string }; members: Member[]; link: { enabled: boolean; token?: string } };
const RN: Record<string, string> = { admin: "Owner", editor: "Editor", viewer: "Viewer" };
const sel = "cursor-pointer rounded-8 border border-border bg-surface px-2.5 py-1.5 text-[13px] font-medium text-text-1 outline-0 focus:border-accent";
const Label = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-center justify-between"><h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">{children}</h4>{right}</div>
);

export default function ShareDialog({ onClose }: { onClose: () => void }) {
  const { user } = useData();
  const { toast, ask } = useFeedback();
  const own = user.role === "admin";
  const [S, setS] = useState<State | null>(null);
  const [inv, setInv] = useState<{ member: Member; tempPassword: string } | null>(null);
  const [f, setF] = useState({ email: "", name: "", role: "editor" });
  const refresh = () => api<State>("/share").then(setS);
  useEffect(() => { refresh().catch((e) => { toast(e.message); onClose(); }); /* eslint-disable-next-line */ }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const link = !!S?.link.enabled;
  const url = link && S?.link.token ? `${location.origin}/?share=${S.link.token}` : "";
  const copy = (txt: string, msg: string) => navigator.clipboard.writeText(txt).then(() => toast(msg), () => toast("Could not copy"));
  const wrap = async (fn: () => Promise<unknown>) => { try { await fn(); await refresh(); } catch (e: any) { toast(e.message); refresh().catch(() => {}); } };

  const invite = async () => {
    const email = f.email.trim(), name = f.name.trim() || email.split("@")[0];
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Enter a valid email");
    try { setInv(await api("/share/members", { method: "POST", body: { name, email, role: f.role } })); setF({ email: "", name: "", role: "editor" }); await refresh(); } catch (e: any) { toast(e.message); }
  };
  const setRole = (m: Member, v: string) => wrap(async () => {
    if (v === "remove") {
      if (!(await ask({ t: "Remove access?", p: `${m.name} will no longer be able to open the admin.`, ok: "Remove", danger: true }))) return;
      await api("/share/members/" + m.id, { method: "DELETE" }); toast("Access removed");
    } else { await api("/share/members/" + m.id, { method: "PATCH", body: { role: v } }); toast("Role updated"); }
  });
  const resetLink = async () => {
    if (!(await ask({ t: "Reset the link?", p: "The current link will stop working immediately.", ok: "Reset", danger: true }))) return;
    wrap(async () => { await api("/share/link", { method: "PUT", body: { regenerate: true } }); toast("New link created"); });
  };
  const setAccess = (on: boolean) => on !== link && wrap(() => api("/share/link", { method: "PUT", body: { enabled: on } }));
  const creds = inv ? `${location.origin}/login\nEmail: ${inv.member.email}\nPassword: ${inv.tempPassword}` : "";

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[20px] border border-border bg-surface shadow-[0_24px_64px_rgba(0,0,0,.4)] sm:w-[min(560px,100%)] sm:rounded-[20px]">
        <div className="flex items-start gap-3 border-b border-border-soft px-5 pb-4 pt-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-12 bg-accent/10 text-accent"><Icon k="users" size={20} /></span>
          <div className="min-w-0 flex-1"><h3 className="font-jakarta text-[17px] font-semibold leading-tight">Share Blog Admin</h3><p className="mt-0.5 text-[13px] text-text-2">Invite teammates or share a read-only link.</p></div>
          <IconBtn aria-label="Close" onClick={onClose}><Icon k="x" /></IconBtn>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          {!S ? <div aria-label="Loading sharing settings" aria-busy="true" className="space-y-5">
            <div className="space-y-3"><SkeletonLine className="w-28" /><div className="flex gap-2"><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-20" /></div></div>
            <div className="space-y-3"><SkeletonLine className="w-32" />{[1, 2, 3].map((x) => <div key={x} className="flex items-center gap-3 rounded-10 border border-border-soft p-3"><Skeleton className="size-9 rounded-full" /><div className="flex-1 space-y-2"><SkeletonLine className="w-1/2" /><SkeletonLine className="w-2/3" /></div><Skeleton className="h-8 w-20 rounded-8" /></div>)}</div>
          </div> : <>
            {own && (
              <section className="flex flex-col gap-2.5">
                <Label>Invite people</Label>
                <div className="flex gap-2 max-[520px]:flex-wrap">
                  <div className="relative min-w-0 flex-1 max-[520px]:basis-full">
                    <Icon k="mail" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
                    <input className={`${inpCls} pl-10`} type="email" placeholder="name@company.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} onKeyDown={(e) => e.key === "Enter" && invite()} />
                  </div>
                  <Select aria-label="Role" variant="outline" value={f.role} onChange={(v) => setF({ ...f, role: v })}><option value="editor">Editor</option><option value="viewer">Viewer</option></Select>
                  <Cta onClick={invite} disabled={!f.email.trim()}>Invite</Cta>
                </div>
                {f.email.trim() && <input className={inpCls} placeholder="Name (optional)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
                <p className="text-xs text-text-3"><b className="font-medium text-text-2">Editors</b> can write and publish · <b className="font-medium text-text-2">Viewers</b> can only read.</p>
              </section>
            )}

            {inv && (
              <div className="rounded-12 border border-positive/30 bg-positive-bg p-3.5">
                <div className="flex items-center gap-2 text-sm font-medium text-positive"><Icon k="checkCircle" size={18} />Access created for {inv.member.name}</div>
                <p className="mb-2 mt-1 text-xs text-text-2">Send these sign-in details — the password is shown only once.</p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-8 border border-border bg-surface p-2.5 font-mono text-xs text-text-1">{creds}</pre>
                <div className="mt-2.5 flex gap-2"><PillBtn onClick={() => copy(creds, "Details copied")}><Icon k="copy" size={15} />Copy details</PillBtn><PillBtn onClick={() => setInv(null)}>Dismiss</PillBtn></div>
              </div>
            )}

            <section className="flex flex-col gap-1">
              <Label right={<span className="rounded-full bg-pill px-2 py-0.5 text-[11px] font-medium text-text-2">{S.members.length}</span>}>People with access</Label>
              <div className="mt-1 overflow-hidden rounded-12 border border-border">
                {S.members.map((u) => {
                  const you = u.id === S.me.id;
                  return (
                    <div key={u.id} className="flex items-center gap-3 border-b border-border-soft px-3 py-2.5 last:border-0">
                      <span className="relative"><Pa name={u.name} id={u.id} src={u.avatar} size={36} />{u.online && <i title="Online now" className="absolute -bottom-px -right-px size-[11px] rounded-full border-2 border-surface bg-positive" />}</span>
                      <div className="min-w-0 flex-1">
                        <b className="flex items-center gap-1.5 text-sm font-medium"><span className="truncate">{u.name}</span>{you && <span className="rounded-full bg-pill px-1.5 py-px text-[10px] font-medium text-text-2">You</span>}</b>
                        <span className="block truncate text-xs text-text-3">{u.email} · {u.online ? <span className="text-positive">Online now</span> : "Last opened " + since(u.lastActiveAt)}</span>
                      </div>
                      {u.role === "admin" || !own ? <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${u.role === "admin" ? "bg-accent/10 text-accent" : "bg-pill text-text-2"}`}>{RN[u.role] || u.role}</span>
                        : <Select aria-label={`Role of ${u.name}`} variant="outline" size="sm" align="right" value={u.role} onChange={(v) => setRole(u, v)}><option value="editor">Editor</option><option value="viewer">Viewer</option><option value="remove">Remove access</option></Select>}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="flex flex-col gap-2.5">
              <Label>General access</Label>
              <div className="rounded-12 border border-border p-3.5">
                <div className="flex items-start gap-3">
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${link ? "bg-positive-bg text-positive" : "bg-pill text-text-2"}`}><Icon k={link ? "globe" : "lock"} size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <b className="text-sm font-medium">{link ? "Anyone with the link" : "Restricted"}</b>
                    <p className="mt-0.5 text-xs leading-relaxed text-text-3">{link ? "Anyone on the internet with the link can view articles and the calendar (no Search Console data)." : "Only people added above can open the admin."}</p>
                  </div>
                </div>
                {own && (
                  <div role="tablist" aria-label="General access" className="mt-3 grid grid-cols-2 gap-1 rounded-10 bg-pill p-1">
                    {([[false, "Restricted", "lock"], [true, "Anyone with the link", "globe"]] as const).map(([v, l, i]) => (
                      <button key={l} role="tab" aria-selected={link === v} onClick={() => setAccess(v)} className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-8 px-2 py-1.5 text-[13px] font-medium ${link === v ? "bg-surface text-text-1 shadow-xs" : "text-text-2"}`}><Icon k={i} size={15} /><span className="truncate">{l}</span></button>
                    ))}
                  </div>
                )}
                {link && url && (
                  <div className="mt-3 flex gap-2">
                    <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${inpCls} min-w-0 flex-1 font-mono !text-xs`} />
                    <PillBtn onClick={() => copy(url, "Link copied")}><Icon k="copy" size={15} />Copy</PillBtn>
                  </div>
                )}
                {own && link && <button onClick={resetLink} className={btn("link", "sm", "mt-2.5")}>Reset link</button>}
              </div>
            </section>
          </>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border-soft bg-icon px-5 py-3.5">
          <PillBtn onClick={() => copy(url || location.origin, "Link copied")}><Icon k="link" size={16} />Copy link</PillBtn>
          <Cta onClick={onClose}>Done</Cta>
        </div>
      </div>
    </div>
  );
}
