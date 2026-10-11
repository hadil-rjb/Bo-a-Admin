"use client";
import { useParams } from "next/navigation";
import Icon from "@/components/Icon";
import { Widget } from "@/components/ui";
import { pageCls } from "@/components/table";

const TITLES: Record<string, string> = {
  overview: "Social Media Overview",
  planner: "Social Media Planner",
  settings: "Social Media Settings",
};

export default function SocialMediaPage() {
  const { page } = useParams<{ page: string }>();
  return (
    <div className={pageCls}>
      <Widget className="items-center px-6 py-16 text-center">
        <div className="flex size-[52px] items-center justify-center rounded-12 bg-icon text-text-1"><Icon k="globe" size={24} /></div>
        <p className="text-lg font-medium">{TITLES[page] || "Social Media Admin"} — coming soon</p>
        <p className="max-w-[420px] text-[13px] leading-relaxed text-text-2">The Social Media Admin workspace is coming soon. Social planning, publishing and performance tools will live here.</p>
      </Widget>
    </div>
  );
}
