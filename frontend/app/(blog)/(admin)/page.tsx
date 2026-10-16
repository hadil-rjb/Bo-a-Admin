"use client";
import ContentOverview from "@/components/ContentOverview";
import { NeedsAttention, SearchConsole, UpcomingContent } from "@/components/widgets";

export default function Dashboard() {
  return (
    <div className="grid grid-cols-1 gap-6 px-8 pb-8 max-[1024px]:px-5 max-sm:gap-4 max-sm:px-4 max-sm:pb-5 min-[821px]:grid-cols-2 min-[1201px]:grid-cols-[minmax(0,352px)_minmax(0,1fr)_minmax(0,1fr)] min-[1201px]:grid-rows-[auto_1fr]">
      <SearchConsole />
      <ContentOverview />
      <UpcomingContent />
      <NeedsAttention />
    </div>
  );
}
