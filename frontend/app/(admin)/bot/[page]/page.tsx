"use client";
import { useParams } from "next/navigation";
import Icon from "@/components/Icon";
import { Widget } from "@/components/ui";
import { pageCls } from "@/components/table";

const TITLES: Record<string, string> = { overview: "Chatbot Overview", conversations: "Conversations", knowledge: "Knowledge base", settings: "Chatbot Settings" };

export default function BotPage() {
  const { page } = useParams<{ page: string }>();
  return (
    <div className={pageCls}>
      <Widget className="items-center px-6 py-16 text-center">
        <div className="flex size-[52px] items-center justify-center rounded-12 bg-icon text-text-1"><Icon k="chat" size={24} /></div>
        <p className="text-lg font-medium">{TITLES[page] || "Chatbot Admin"} — coming soon</p>
        <p className="max-w-[420px] text-[13px] leading-relaxed text-text-2">The Chatbot Admin workspace is separate from the blog. Conversations, knowledge sources and bot settings will live here.</p>
      </Widget>
    </div>
  );
}
