import Icon, { IconKey } from "./Icon";
/** Compat : index d'icône de l'ancien HTML → icône Lucide */
const MAP: Record<number, IconKey> = {
  0: "search", 1: "download", 3: "search", 4: "search", 5: "search", 6: "search", 7: "arrowR", 8: "desktop", 9: "mobile", 10: "tablet",
  11: "doc", 12: "doc", 13: "doc", 14: "cal", 15: "arrowUR", 16: "arrowR", 17: "alert", 18: "alert", 19: "alert", 20: "alert", 21: "checkCircle", 22: "arrowR",
};
export default function S({ i, size = 20, className = "" }: { i: number; size?: number; className?: string }) {
  return <Icon k={MAP[i] || "doc"} size={size} className={className} />;
}
