"use client";
import { Children, ReactElement, ReactNode, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";

type Opt = { value: string; label: ReactNode; disabled?: boolean };
type OptProps = { value?: string | number; disabled?: boolean; children?: ReactNode };

/** Lit les <option> passées en enfants (comme un <select> natif) */
function parse(children: ReactNode): Opt[] {
  const out: Opt[] = [];
  Children.toArray(children).forEach((c) => {
    if (!isValidElement(c)) return;
    const el = c as ReactElement<OptProps>;
    if (el.type === "option") {
      const ch = el.props.children;
      const text = Children.toArray(ch).map((x) => (typeof x === "string" || typeof x === "number" ? String(x) : "")).join("");
      out.push({ value: el.props.value !== undefined ? String(el.props.value) : text, label: ch, disabled: el.props.disabled });
    } else if (el.props.children) out.push(...parse(el.props.children));
  });
  return out;
}

const TRIGGER = {
  field: { md: "h-10 rounded-10 border border-transparent bg-pill pl-3 pr-2.5 hover:bg-icon", sm: "h-8 rounded-8 border border-transparent bg-pill pl-2.5 pr-1.5 hover:bg-icon" },
  outline: { md: "h-10 rounded-10 border border-border bg-surface pl-3 pr-2.5 shadow-xs hover:bg-icon", sm: "h-8 rounded-8 border border-border bg-surface pl-2.5 pr-1.5 shadow-xs hover:bg-icon" },
};

/**
 * Liste déroulante : bouton + flèche animée + menu (portail, ne se fait jamais rogner),
 * coche sur l'option choisie, clavier (↑ ↓ Entrée Échap Début Fin, saisie d'une lettre), ouverture vers le haut si pas de place.
 */
export default function Select({ value, onChange, children, placeholder = "Select…", variant = "field", size = "md", align = "left", disabled, className = "", ...aria }: {
  value: string; onChange: (v: string) => void; children: ReactNode; placeholder?: string; variant?: "field" | "outline"; size?: "md" | "sm";
  align?: "left" | "right"; disabled?: boolean; className?: string; "aria-label"?: string; title?: string;
}) {
  const opts = useMemo(() => parse(children), [children]);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxH: number } | null>(null);
  const cur = opts.find((o) => o.value === value);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect(); if (!r) return;
    const width = Math.max(r.width, 176), want = Math.min(opts.length * 38 + 12, 288);
    const below = innerHeight - r.bottom - 12, above = r.top - 12, up = below < Math.min(want, 160) && above > below;
    const left = align === "right" ? Math.max(8, r.right - width) : Math.max(8, Math.min(r.left, innerWidth - width - 8));
    setPos({ left, width, ...(up ? { bottom: innerHeight - r.top + 6 } : { top: r.bottom + 6 }), maxH: Math.max(120, Math.min(288, up ? above : below)) });
  }, [opts.length, align]);

  const show = () => { if (disabled) return; place(); setAct(Math.max(0, opts.findIndex((o) => o.value === value))); setOpen(true); };
  const close = (focus = true) => { setOpen(false); if (focus) btn.current?.focus(); };
  const pick = (o: Opt) => { if (o.disabled) return; onChange(o.value); close(); };

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { const n = e.target as Node; if (!list.current?.contains(n) && !btn.current?.contains(n)) setOpen(false); };
    const scroll = (e: Event) => { if (!list.current?.contains(e.target as Node)) setOpen(false); };
    const resize = () => setOpen(false);
    document.addEventListener("mousedown", down); window.addEventListener("scroll", scroll, true); window.addEventListener("resize", resize);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", resize); };
  }, [open]);
  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>(`[data-i="${act}"]`)?.scrollIntoView({ block: "nearest" }); }, [act, open]);

  const move = (d: number) => { let i = act; for (let n = 0; n < opts.length; n++) { i = (i + d + opts.length) % opts.length; if (!opts[i].disabled) break; } setAct(i); };
  const key = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); } return; }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Home") { e.preventDefault(); setAct(0); }
    else if (e.key === "End") { e.preventDefault(); setAct(opts.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts[act] && pick(opts[act]); }
    else if (e.key.length === 1) { const i = opts.findIndex((o, j) => j > act && !o.disabled && String(typeof o.label === "string" ? o.label : o.value).toLowerCase().startsWith(e.key.toLowerCase())); if (i >= 0) setAct(i); }
  };

  return (
    <>
      <button ref={btn} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled}
        onClick={() => (open ? close(false) : show())} onKeyDown={key} {...aria}
        className={`inline-flex min-w-0 cursor-pointer select-none items-center justify-between gap-2 text-left text-sm text-text-1 outline-0 transition-colors focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50 ${TRIGGER[variant][size]} ${open ? "!border-accent" : ""} ${className}`}>
        <span className={`min-w-0 flex-1 truncate ${cur ? "" : "text-text-3"}`}>{cur ? cur.label : placeholder}</span>
        <Icon k="chevD" size={size === "sm" ? 18 : 18} className={`text-text-3 transition-transform duration-200 ${open ? "rotate-180 text-text-1" : ""}`} />
      </button>
      {open && pos && createPortal(
        <div ref={list} id={id} role="listbox" style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width, maxHeight: pos.maxH }}
          className="fixed z-[120] max-w-[min(360px,calc(100vw-16px))] overflow-y-auto rounded-12 border border-border bg-surface p-1 shadow-[0_12px_32px_rgba(15,23,42,.18),0_2px_6px_rgba(15,23,42,.08)]">
          {opts.map((o, i) => {
            const sel = o.value === value;
            return (
              <div key={o.value + i} data-i={i} role="option" aria-selected={sel} aria-disabled={o.disabled}
                onMouseEnter={() => !o.disabled && setAct(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}
                className={`flex items-center gap-2 rounded-8 px-2.5 py-2 text-sm ${o.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"} ${i === act && !o.disabled ? "bg-icon" : ""} ${sel ? "font-medium text-text-1" : "text-text-2"}`}>
                <span className="min-w-0 flex-1 whitespace-normal break-words">{o.label}</span>
                {sel && <Icon k="check" size={16} className="text-accent" />}
              </div>
            );
          })}
          {!opts.length && <div className="px-2.5 py-2 text-sm text-text-3">No options</div>}
        </div>, document.body)}
    </>
  );
}
