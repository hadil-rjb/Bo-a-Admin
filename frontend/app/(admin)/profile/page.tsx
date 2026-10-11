"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Cta, PillBtn } from "@/components/ui";
import { useFeedback } from "@/components/feedback";
import { Acts, Avatar, Field, FieldGrid, PanelHead, Split, Switch, inpCls, taCls } from "@/components/split";
import { api } from "@/lib/api";
import { useData } from "@/lib/data";

const RL: Record<string, string> = { admin: "Owner", editor: "Editor", viewer: "Viewer" };
const NOTIFS: [string, string, string][] = [
  ["editorial", "Editorial reminders", "Upcoming publications, new posts and publishing gaps."],
  ["seo", "SEO alerts", "Missing meta descriptions, alt text and long titles."],
  ["gsc", "Search Console", "Connection status and indexing alerts."],
];

function PwInput({ v, set, ac }: { v: string; set: (s: string) => void; ac: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input className={`${inpCls} pr-16`} type={show ? "text" : "password"} autoComplete={ac} value={v} onChange={(e) => set(e.target.value)} />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-6 px-2 py-1.5 text-xs font-medium text-text-2 hover:text-accent">{show ? "Hide" : "Show"}</button>
    </div>
  );
}

export default function Profile() {
  const { user, reload } = useData();
  const { toast } = useFeedback();
  const router = useRouter();
  const [sec, setSec] = useState("info");
  const [f, setF] = useState({ name: user.name, email: user.email, job: user.job || "", bio: user.bio || "" });
  const [n, setN] = useState({ seo: user.notifications.seo !== false, editorial: user.notifications.editorial !== false, gsc: user.notifications.gsc !== false });
  const [pw, setPw] = useState({ c: "", a: "", b: "" });
  const af = useRef<HTMLInputElement>(null);
  useEffect(() => { const k = new URLSearchParams(location.search).get("s"); if (k) setSec(k); }, []);

  const patch = async (extra: object) => {
    try { await api("/auth/me", { method: "PATCH", body: { name: user.name, email: user.email, job: user.job || "", bio: user.bio || "", avatar: user.avatar || "", notifications: n, ...extra } }); await reload(); return true; }
    catch (e: any) { toast(e.message); return false; }
  };
  const saveInfo = async () => {
    const name = f.name.trim(), email = f.email.trim();
    if (!name) return toast("Name is required");
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Enter a valid email");
    if (await patch({ name, email, job: f.job.trim(), bio: f.bio.trim() })) toast("Profile saved");
  };
  const photo = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return toast("Please choose an image file");
    const r = new FileReader();
    r.onload = () => {
      const i = new Image();
      i.onload = async () => { const s = Math.min(i.width, i.height), c = document.createElement("canvas"); c.width = c.height = 256; c.getContext("2d")!.drawImage(i, (i.width - s) / 2, (i.height - s) / 2, s, s, 0, 0, 256, 256); if (await patch({ avatar: c.toDataURL("image/webp", 0.85) })) toast("Photo updated"); };
      i.src = r.result as string;
    };
    r.readAsDataURL(file);
  };
  const toggle = async (k: keyof typeof n) => { const nn = { ...n, [k]: !n[k] }; setN(nn); if (!(await patch({ notifications: nn }))) setN(n); };
  const savePw = async () => {
    const { c, a, b } = pw;
    if (!c) return toast("Enter your current password");
    if (a.length < 8 || !/[a-z]/.test(a) || !/[A-Z]/.test(a) || !/\d/.test(a)) return toast("New password does not meet the requirements");
    if (a !== b) return toast("Passwords do not match");
    if (a === c) return toast("Choose a password different from the current one");
    try { await api("/auth/password", { method: "POST", body: { currentPassword: c, newPassword: a } }); setPw({ c: "", a: "", b: "" }); toast("Password updated"); } catch (e: any) { toast(e.message || "Could not update password"); }
  };
  const a = pw.a;
  const rules: [string, boolean][] = [["8+ characters", a.length >= 8], ["Upper & lower case", /[a-z]/.test(a) && /[A-Z]/.test(a)], ["A number", /\d/.test(a)], ["A symbol", /[^A-Za-z0-9]/.test(a)], ["Passwords match", !!pw.b && a === pw.b]];
  const s = rules.slice(0, 4).filter((x) => x[1]).length;
  const lvl = ["", "bg-negative", "bg-[#d99a1e]", "bg-[#7fb356]", "bg-positive"];

  return (
    <Split items={[["info", "Profile settings", "user"], ["notif", "Notifications", "bell"], ["sec", "Password & security", "lock"], ["sess", "Session", "logout"]]} cur={sec} onSelect={setSec}>
      {sec === "info" && <>
        <PanelHead title="Profile settings" desc="Your name, photo and public details." right={<span className="rounded-6 bg-positive-bg px-[7px] py-1 text-[10px] font-medium text-positive">{RL[user.role] || "Guest"}</span>} />
        <div className="flex flex-wrap items-center gap-5 border-b border-border-soft pb-[22px]">
          <Avatar name={user.name} src={user.avatar} size={72} />
          <div>
            <b className="text-base font-medium">Upload image</b>
            <p className="mb-2.5 mt-0.5 text-sm text-text-2">PNG, JPG or WebP · square works best</p>
            <div className="flex gap-2"><PillBtn onClick={() => af.current?.click()}><Icon k="upload" />Upload</PillBtn>{user.avatar && <PillBtn onClick={() => patch({ avatar: "" })}>Remove</PillBtn>}</div>
          </div>
          <input ref={af} type="file" accept="image/*" hidden onChange={(e) => { photo(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <FieldGrid>
          <Field full label={<>Full name <span className="text-accent">*</span></>}><input className={inpCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field full label={<>Email <span className="text-accent">*</span></>}><input className={inpCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field full label="Job title"><input className={inpCls} placeholder="e.g. Content Manager" value={f.job} onChange={(e) => setF({ ...f, job: e.target.value })} /></Field>
          <Field full label={<>Biography <span className="font-normal text-text-3">(Optional)</span></>}>
            <textarea className={taCls} maxLength={200} placeholder="Describe yourself…" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
            <div className="mt-1.5 flex justify-between gap-3 text-xs text-text-3"><span>It will be displayed on your profile.</span><span>{f.bio.length}/200</span></div>
          </Field>
        </FieldGrid>
        <Acts><PillBtn onClick={() => setF({ name: user.name, email: user.email, job: user.job || "", bio: user.bio || "" })}>Discard</PillBtn><Cta onClick={saveInfo}>Apply changes</Cta></Acts>
      </>}
      {sec === "notif" && <>
        <PanelHead title="Notifications" desc="Choose what appears in your notification bell." />
        <div>{NOTIFS.map(([k, t, d]) => (
          <div key={k} className="flex items-center gap-4 border-b border-border-soft py-3.5 last:border-0 last:pb-0">
            <div className="flex-1"><b className="text-sm font-medium">{t}</b><p className="mt-0.5 text-xs text-text-3">{d}</p></div>
            <Switch on={n[k as keyof typeof n]} label={t} onClick={() => toggle(k as keyof typeof n)} />
          </div>
        ))}</div>
      </>}
      {sec === "sec" && <>
        <PanelHead title="Password & security" desc="Use at least 8 characters with upper and lower case letters and a number." />
        <FieldGrid>
          <Field full label="Current password"><PwInput v={pw.c} set={(c) => setPw({ ...pw, c })} ac="current-password" /></Field>
          <Field label="New password"><PwInput v={pw.a} set={(x) => setPw({ ...pw, a: x })} ac="new-password" /></Field>
          <Field label="Confirm new password"><PwInput v={pw.b} set={(b) => setPw({ ...pw, b })} ac="new-password" /></Field>
        </FieldGrid>
        <div className="flex items-center gap-3 text-xs text-text-2">
          <div className="flex flex-1 gap-1">{[0, 1, 2, 3].map((i) => <i key={i} className={`h-1.5 flex-1 rounded-full ${i < s ? lvl[s] : "bg-track"}`} />)}</div>
          <span className="min-w-[110px] text-right">{a ? ["Too weak", "Weak", "Fair", "Good", "Strong"][s] : ""}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">{rules.map(([l, ok]) => <span key={l} className={`rounded-6 px-2 py-1 text-[11px] ${ok ? "bg-positive-bg text-positive" : "bg-pill text-text-3"}`}>{ok ? "✓" : "○"} {l}</span>)}</div>
        <Acts><PillBtn onClick={() => setPw({ c: "", a: "", b: "" })}>Discard</PillBtn><Cta onClick={savePw}>Update password</Cta></Acts>
      </>}
      {sec === "sess" && <>
        <PanelHead title="Session" desc="Sign out of the admin on this device." />
        <Acts one><PillBtn onClick={() => { localStorage.removeItem("uxb.token"); router.replace("/login"); }}><Icon k="logout" />Sign out</PillBtn></Acts>
      </>}
    </Split>
  );
}
