"use client";
import { useMemo, useState } from "react";
import Icon, { IconKey } from "./Icon";
import Select from "./Select";
import EmptyState from "./EmptyState";
import { Button, LinkBtn } from "./ui";
import { useData } from "@/lib/data";
import { useArticleDrawer } from "./ArticleDrawerHost";

const PERIODS = [["12m", "Last 12 months"], ["this", "This year"], ["last", "Last year"]] as const;
type P = (typeof PERIODS)[number][0];
type Kind = "published" | "drafts" | "scheduled";
const KINDS: { k: Kind; label: string; icon: IconKey; tone: string; bar: string }[] = [
  { k: "published", label: "Published", icon: "fileCheck", tone: "text-accent", bar: "bg-accent" },
  { k: "drafts", label: "Drafts", icon: "penLine", tone: "text-accent-2", bar: "bg-accent-2" },
  { k: "scheduled", label: "Scheduled", icon: "calCheck", tone: "text-accent-3", bar: "bg-accent-3" },
];
const kindOf = (status: string): Kind => (status === "Live" ? "published" : status === "Scheduled" ? "scheduled" : "drafts");
const idx = (y: number, m: number) => y * 12 + m;
const startOf = (p: P, now: Date) => { const y = now.getFullYear(); return p === "12m" ? idx(y, now.getMonth()) - 11 : p === "this" ? idx(y, 0) : idx(y - 1, 0); };
const niceTop = (max: number) => Math.max(3, Math.ceil(max / 3) * 3); // multiple de 3 → 4 repères entiers
const EMPTY: Record<Kind, number> = { published: 0, drafts: 0, scheduled: 0 };

/**
 * Content Overview — mesures du design Figma : carte 16px, titre 16/500, légende 12px, menu 32px,
 * indicateurs (cercle 40px · libellé 11px · valeur 16/500 · badge), graphique 162px à 12 barres empilées.
 * Responsive par « container query » : la carte s'adapte à SA largeur (3 colonnes du dashboard, tablette, mobile).
 */
export default function ContentOverview() {
  const { articles: A } = useData();
  const { openNewArticle } = useArticleDrawer();
  const [period, setPeriod] = useState<P>("12m");

  const d = useMemo(() => {
    const s = startOf(period, new Date());
    const counts = new Map<number, Record<Kind, number>>();
    let undated = 0;
    A.forEach((a) => {
      if (!a.date) { if (kindOf(a.status) === "drafts") undated++; return; }
      const dt = new Date(a.date + "T00:00:00"), k = idx(dt.getFullYear(), dt.getMonth());
      const c = counts.get(k) || { ...EMPTY };
      c[kindOf(a.status)]++; counts.set(k, c);
    });
    const sum = (from: number, k: Kind) => [...Array(12)].reduce((n, _, i) => n + (counts.get(from + i)?.[k] || 0), 0);
    const months = [...Array(12)].map((_, i) => {
      const m = s + i, c = counts.get(m) || EMPTY, dt = new Date(Math.floor(m / 12), m % 12, 1);
      return { ...c, total: c.published + c.drafts + c.scheduled, initial: dt.toLocaleDateString("en", { month: "narrow" }), full: dt.toLocaleDateString("en", { month: "long", year: "numeric" }) };
    });
    const tot = Object.fromEntries(KINDS.map(({ k }) => [k, { cur: sum(s, k), prev: sum(s - 12, k) }])) as Record<Kind, { cur: number; prev: number }>;
    return { months, tot, undated, top: niceTop(Math.max(0, ...months.map((m) => m.total))), empty: months.every((m) => !m.total) };
  }, [A, period]);

  const ticks = [d.top, (d.top * 2) / 3, d.top / 3, 0];
  const delta = (k: Kind) => { const { cur, prev } = d.tot[k]; return prev ? Math.round(((cur - prev) / prev) * 100) : null; };
  const vs = period === "12m" ? "the previous 12 months" : period === "this" ? "last year" : "the year before";

  return (
    <section aria-label="Content overview" className="@container flex flex-col gap-4 rounded-16 border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(10,13,20,.03)] min-[821px]:max-[1200px]:col-span-full min-[1201px]:col-[2/span_2] min-[1201px]:row-start-1">
      {/* En-tête */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-[170px] items-center gap-2 py-1">
          <Icon k="chart" size={24} className="text-text-2" />
          <h2 className="truncate text-base font-medium leading-6">Content Overview</h2>
        </div>
        <ul aria-label="Legend" className="order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-1 @md:order-none @md:w-auto">
          {KINDS.map((x) => <li key={x.k} className="flex items-center gap-1.5 text-xs leading-4"><i className={`size-2 rounded-full ${x.bar}`} />{x.label}</li>)}
        </ul>
        <Select aria-label="Period" variant="outline" size="sm" align="right" value={period} onChange={(v) => setPeriod(v as P)}>
          {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </div>
      <hr className="h-px border-0 bg-border" />

      {!A.length ? (
        <EmptyState icon="chart" title="No articles yet" text="Your published, scheduled and draft articles will be charted here, month by month.">
          <Button variant="primary" onClick={() => openNewArticle()}><Icon k="plus" />Write your first article</Button><LinkBtn href="/calendar?ideas=1">Get AI ideas</LinkBtn>
        </EmptyState>
      ) : <>
      {/* Indicateurs */}
      <div className="flex items-stretch gap-3 @xl:gap-8">
        {KINDS.map((x, i) => {
          const dl = x.k === "scheduled" ? null : delta(x.k);
          return (
            <div key={x.k} className="contents">
              {i > 0 && <div aria-hidden className="w-px self-stretch bg-border @xl:h-10 @xl:self-center" />}
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className={`hidden size-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface shadow-[0_1px_2px_rgba(10,13,20,.03)] @xl:flex ${x.tone}`}><Icon k={x.icon} size={20} /></span>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                  <p className="truncate text-[11px] font-medium uppercase leading-3 tracking-[0.02em] text-text-3">{x.label}</p>
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                    <b className="text-base font-medium leading-6 tabular-nums">{d.tot[x.k].cur}</b>
                    {dl !== null && <span title={`Compared with ${vs}`} className={`rounded-full px-2 py-0.5 text-xs font-medium leading-4 ${dl >= 0 ? "bg-positive-bg text-positive" : "bg-negative-bg text-negative"}`}>{dl >= 0 ? "+" : ""}{dl}%</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <hr className="h-px border-0 bg-border" />

      {/* Graphique : articles par mois */}
      <div className="flex gap-[clamp(8px,3cqw,24px)] [--ph:162px] @max-md:[--ph:140px]" role="group" aria-label="Articles per month">
        <div aria-hidden className="flex h-[var(--ph)] min-w-5 shrink-0 flex-col justify-between text-right text-xs leading-4 tabular-nums text-text-2">
          {ticks.map((t, i) => <span key={i}>{Math.round(t)}</span>)}
        </div>
        <div className="flex min-w-0 flex-1 gap-[clamp(4px,2.4cqw,24px)] pr-2 @max-md:pr-0">
          {d.months.map((m, i) => (
            <div key={i} tabIndex={0} aria-label={`${m.full}: ${m.published} published, ${m.drafts} drafts, ${m.scheduled} scheduled`} className="group relative flex min-w-0 flex-1 flex-col gap-3 outline-none">
              <div className="flex h-[var(--ph)] flex-col gap-0.5">
                <i className="block min-h-0 flex-1 bg-icon transition-colors group-hover:bg-pill group-focus-visible:bg-pill" />
                {KINDS.map((x) => m[x.k] ? <i key={x.k} className={`block shrink ${x.bar}`} style={{ height: `${(m[x.k] / d.top) * 100}%`, minHeight: 3 }} /> : null)}
              </div>
              <span className="text-center text-xs leading-4 text-text-2">{m.initial}</span>
              <div role="tooltip" className={`pointer-events-none absolute top-2 z-10 hidden w-max min-w-[140px] flex-col gap-1 rounded-10 border border-border bg-surface px-3 py-2 text-xs text-text-1 shadow-[0_8px_24px_rgba(0,0,0,.25)] group-hover:flex group-focus-visible:flex ${i < 3 ? "left-0" : i > 8 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
                <b className="font-semibold">{m.full}</b>
                {KINDS.map((x) => <span key={x.k} className="flex items-center gap-2"><i className={`size-2 rounded-full ${x.bar}`} />{x.label}<b className="ml-auto pl-3 font-semibold">{m[x.k]}</b></span>)}
              </div>
            </div>
          ))}
        </div>
      </div>
      </>}
      {A.length > 0 && (d.empty || d.undated > 0) && <p className="-mt-1 text-xs text-text-3">{d.empty ? "No dated articles in this period. " : ""}{d.undated > 0 ? `${d.undated} draft${d.undated === 1 ? " has" : "s have"} no date and ${d.undated === 1 ? "isn’t" : "aren’t"} shown.` : ""}</p>}
    </section>
  );
}
