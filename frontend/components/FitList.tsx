"use client";
import { ReactNode, useLayoutEffect, useRef, useState } from "react";

/**
 * Liste qui affiche exactement le nombre de lignes qui tiennent dans la hauteur disponible de la carte
 * (jamais de vide, jamais de ligne coupée). S'il y a moins de données que de place, `spare` comble le reste
 * avec un bloc utile (suggestion / résumé) plutôt que du blanc.
 */
export default function FitList<T>({ items, rowH, minRows = 3, max = 8, row, spare, footer }: {
  items: T[]; rowH: number; minRows?: number; max?: number;
  row: (item: T, i: number, cls: string) => ReactNode;
  spare?: ReactNode;
  footer: (hidden: number) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(minRows);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const calc = () => setFit(Math.max(minRows, Math.min(max, Math.floor(el.clientHeight / rowH))));
    calc(); const ro = new ResizeObserver(calc); ro.observe(el);
    return () => ro.disconnect();
  }, [rowH, minRows, max]);
  const shown = items.slice(0, fit), hasSpare = items.length < fit;
  const cls = hasSpare ? "shrink-0" : "min-h-0 flex-1";
  return (
    <>
      <div ref={ref} style={{ minHeight: rowH * minRows }} className="relative min-h-0 flex-1">
        <div className="absolute inset-0 flex flex-col overflow-hidden">
          {shown.map((it, i) => row(it, i, cls))}
          {hasSpare && spare && <div className="mt-2 flex min-h-0 flex-1 flex-col">{spare}</div>}
        </div>
      </div>
      {footer(Math.max(0, items.length - shown.length))}
    </>
  );
}
