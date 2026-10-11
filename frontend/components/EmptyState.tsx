import { ReactNode } from "react";
import Icon, { IconKey } from "./Icon";

/** État vide : icône, titre, explication et action — centré dans l'espace restant de la carte */
export default function EmptyState({ icon, title, text, children, tone = "neutral", fill = true }: { icon: IconKey; title: string; text?: ReactNode; children?: ReactNode; tone?: "neutral" | "good" | "bad"; fill?: boolean }) {
  const t = tone === "good" ? "bg-positive-bg text-positive" : tone === "bad" ? "bg-negative-bg text-negative" : "bg-pill text-text-2";
  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 px-2 py-6 text-center ${fill ? "min-h-0 flex-1" : ""}`}>
      <span className={`mb-1 flex size-10 items-center justify-center rounded-full ${t}`}><Icon k={icon} size={20} /></span>
      <b className="text-sm font-medium">{title}</b>
      {text && <p className="max-w-[300px] text-xs leading-relaxed text-text-2">{text}</p>}
      {children && <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}
