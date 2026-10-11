import Link from "next/link";
import { ButtonHTMLAttributes, ReactNode } from "react";
import Icon, { IconKey } from "./Icon";

export type BtnVariant = "primary" | "secondary" | "ghost" | "link" | "danger";
export type BtnSize = "md" | "sm" | "icon" | "icon-sm";
const BASE = "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-10 text-sm font-medium no-underline transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
const VARIANT: Record<BtnVariant, string> = {
  primary: "bg-accent text-white hover:bg-[#e60c30] active:bg-[#c90a29]",
  secondary: "border border-border bg-surface text-text-1 shadow-xs hover:bg-icon hover:border-text-3 active:bg-pill",
  ghost: "text-text-2 hover:bg-icon hover:text-text-1 active:bg-pill",
  link: "text-accent hover:bg-accent/10 active:bg-accent/15",
  danger: "bg-[#d92d3a] text-white hover:bg-[#c42633] active:bg-[#a81f2b]",
};
// Un seul gabarit pour tous les boutons (h-10 / px-4). « sm » et « icon » servent uniquement aux listes denses et aux boutons-icônes.
const SIZE: Record<BtnSize, string> = {
  md: "h-10 px-4 [&>svg]:size-[18px]",
  sm: "h-8 px-3 text-[13px] [&>svg]:size-4",
  icon: "size-10 [&>svg]:size-5",
  "icon-sm": "size-8 [&>svg]:size-4",
};
/** Classes d'un bouton — à utiliser aussi sur <Link> pour qu'un lien-bouton ait exactement le même rendu */
export const btn = (v: BtnVariant = "secondary", z: BtnSize = "md", extra = "") => `${BASE} ${VARIANT[v]} ${SIZE[z]} ${extra}`.trim();

type BP = ButtonHTMLAttributes<HTMLButtonElement>;
export const Button = ({ variant = "secondary", size = "md", className = "", ...p }: BP & { variant?: BtnVariant; size?: BtnSize }) => <button type="button" {...p} className={btn(variant, size, className)} />;
export const Cta = ({ className = "", ...p }: BP) => <Button variant="primary" className={className} {...p} />;
export const PillBtn = ({ className = "", ...p }: BP) => <Button variant="secondary" className={className} {...p} />;
export const IconBtn = ({ className = "", ...p }: BP) => <Button variant="secondary" size="icon" className={className} {...p} />;
export const LinkBtn = ({ href, variant = "secondary", size = "md", className = "", children }: { href: string; variant?: BtnVariant; size?: BtnSize; className?: string; children: ReactNode }) => <Link href={href} className={btn(variant, size, className)}>{children}</Link>;
export const Widget = ({ className = "", children }: { className?: string; children: ReactNode }) => (
  <div className={`flex flex-col gap-4 rounded-16 border border-border bg-surface p-4 max-sm:p-3.5 ${className}`}>{children}</div>
);
export const Skeleton = ({ className = "" }: { className?: string }) => (
  <span aria-hidden className={`block animate-pulse rounded-8 bg-pill ${className}`} />
);
export const SkeletonLine = ({ className = "" }: { className?: string }) => <Skeleton className={`h-3 ${className}`} />;
export function Tabs({ items, active, onChange }: { items: string[]; active: number; onChange: (i: number) => void }) {
  return (
    <div className="flex max-w-full gap-1 rounded-10 bg-pill p-1">
      {items.map((t, i) => (
        <div key={t} onClick={() => onChange(i)}
          className={`flex-1 cursor-pointer rounded-6 px-2 py-1.5 text-center text-sm font-medium ${i === active ? "bg-surface text-text-1 shadow-xs" : "text-text-2"}`}>{t}</div>
      ))}
    </div>
  );
}
export const WTitle = ({ icon, children, right }: { icon: IconKey; children: ReactNode; right?: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2 gap-y-2.5">
    <div className="flex min-w-0 flex-1 items-center gap-2 text-base font-medium"><Icon k={icon} size={24} className="text-text-1" />{children}</div>
    {right}
  </div>
);
