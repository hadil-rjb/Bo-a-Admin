"use client";
import { ReactNode } from "react";
import Icon from "./Icon";

export const pageCls = "flex flex-col gap-4 px-8 pb-8 max-[1024px]:px-5 max-[700px]:px-4 max-[700px]:pb-6";
export const fieldCls = "rounded-10 border border-transparent bg-pill px-3 py-[9px] text-sm text-text-1 outline-0 focus:border-accent max-[700px]:min-h-10";
export const cmp = (a: any, b: any, d: number) => {
  const na = a == null || a === "", nb = b == null || b === "";
  if (na || nb) return na && nb ? 0 : na ? 1 : -1;
  return (typeof a === "string" ? a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }) : a - b) * d;
};

export type Sort = { k: string; d: number };
export function Th({ k, label, sort, onSort, cls = "", num = false }: { k: string; label: string; sort: Sort; onSort: (k: string) => void; cls?: string; num?: boolean }) {
  const on = sort.k === k;
  return (
    <th aria-sort={on ? (sort.d > 0 ? "ascending" : "descending") : "none"} className={`h-11 bg-icon p-0 text-left first:pl-5 last:pr-5 max-[700px]:first:pl-4 max-[700px]:last:pr-4 ${cls}`}>
      <button onClick={() => onSort(k)} title={`Sort by ${label}`}
        className={`flex h-11 w-full cursor-pointer items-center gap-1.5 px-4 text-[11px] font-medium uppercase tracking-[0.05em] hover:text-text-1 ${num ? "justify-end" : ""} ${on ? "text-text-1" : "text-text-3"}`}>
        {label}
        <span className="inline-flex flex-col gap-0.5">
          <i className={`block size-0 border-x-4 border-b-[5px] border-x-transparent border-b-current ${on && sort.d > 0 ? "text-accent" : "opacity-30"}`} />
          <i className={`block size-0 border-x-4 border-t-[5px] border-x-transparent border-t-current ${on && sort.d < 0 ? "text-accent" : "opacity-30"}`} />
        </span>
      </button>
    </th>
  );
}
export const Td = ({ children, cls = "", num = false }: { children?: ReactNode; cls?: string; num?: boolean }) => (
  <td className={`border-b border-border-soft px-4 py-3 align-middle text-[13px] text-text-2 first:pl-5 last:pr-5 max-[700px]:first:pl-4 max-[700px]:last:pr-4 ${num ? "whitespace-nowrap text-right tabular-nums text-text-1" : ""} ${cls}`}>{children}</td>
);
export const Table = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto"><table className="w-full border-separate border-spacing-0 text-[13px] [&_tbody>tr:last-child>td]:border-b-0">{children}</table></div>
);
/** Carte de tableau : en-tête, tableau pleine largeur, pied (pagination) — paddings identiques partout (20px, 16px en mobile) */
export const TableCard = ({ head, children }: { head?: ReactNode; children: ReactNode }) => (
  <div className="overflow-hidden rounded-16 border border-border bg-surface">
    {head && <div className="flex flex-wrap items-center gap-3 border-b border-border-soft px-5 py-3.5 max-[700px]:px-4">{head}</div>}
    {children}
  </div>
);
export const Ttl = ({ children }: { children: ReactNode }) => <div className="max-w-[min(440px,45vw)] truncate text-sm font-medium text-text-1">{children}</div>;
export const Sub = ({ children, className = "" }: { children: ReactNode; className?: string }) => <div className={`text-[11px] text-text-3 ${className}`}>{children}</div>;

const bd: Record<string, string> = { Live: "bg-positive-bg text-positive", Scheduled: "bg-accent/[.08] text-accent", Draft: "bg-pill text-text-2" };
export const StatusBadge = ({ s }: { s: string }) => <span className={`shrink-0 rounded-6 px-[7px] py-1 text-[10px] font-medium ${bd[s] || bd.Draft}`}>{s}</span>;

export function Pager({ total, page, onPage, size = 10 }: { total: number; page: number; onPage: (p: number) => void; size?: number }) {
  const pc = Math.ceil(total / size);
  if (total <= size) return null;
  const nums = [...new Set([1, pc, page - 1, page, page + 1])].filter((x) => x >= 1 && x <= pc).sort((a, b) => a - b);
  const btn = "inline-flex h-9 min-w-9 cursor-pointer items-center justify-center gap-1 rounded-10 border px-2.5 text-[13px] font-medium disabled:cursor-default disabled:opacity-40";
  const items: ReactNode[] = []; let last = 0;
  nums.forEach((x) => {
    if (x - last > 1) items.push(<span key={"e" + x} className="w-[22px] text-center text-text-3">…</span>);
    items.push(<button key={x} onClick={() => onPage(x)} className={`${btn} max-[640px]:hidden ${x === page ? "border-border bg-pill text-text-1" : "border-transparent text-text-2 hover:bg-icon hover:text-text-1"}`}>{x}</button>);
    last = x;
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft px-5 py-3 text-[13px] text-text-2 max-[700px]:px-4 max-[640px]:justify-center">
      <span>{(page - 1) * size + 1}–{Math.min(page * size, total)} of {total}</span>
      <div className="flex items-center gap-1">
        <button disabled={page < 2} onClick={() => onPage(page - 1)} aria-label="Previous" className={`${btn} border-transparent text-text-2 hover:bg-icon`}><Icon k="chevL" size={16} /><span className="max-[640px]:hidden">Previous</span></button>
        {items}
        <span className="hidden px-2 max-[640px]:inline">{page} / {pc}</span>
        <button disabled={page >= pc} onClick={() => onPage(page + 1)} aria-label="Next" className={`${btn} border-transparent text-text-2 hover:bg-icon`}><span className="max-[640px]:hidden">Next</span><Icon k="chevR" size={16} /></button>
      </div>
    </div>
  );
}
