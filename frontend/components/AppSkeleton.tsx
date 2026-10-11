"use client";
import { Skeleton, SkeletonLine } from "./ui";

const SidebarSkeleton = () => (
  <aside className="fixed left-0 top-0 hidden h-screen w-[272px] flex-col border-r border-border bg-surface p-4 lg:flex">
    <div className="flex items-center gap-3 border-b border-border-soft pb-5">
      <Skeleton className="size-9 rounded-10" />
      <div className="flex-1 space-y-2"><SkeletonLine className="w-16" /><SkeletonLine className="w-28" /></div>
    </div>
    <div className="mt-6 space-y-2">{[1, 2, 3, 4, 5].map((x) => <Skeleton key={x} className="h-9 w-full rounded-8" />)}</div>
  </aside>
);

const WidgetSkeleton = ({ rows = 4, tall = false }: { rows?: number; tall?: boolean }) => (
  <div className={`flex flex-col gap-4 rounded-16 border border-border bg-surface p-4 ${tall ? "min-h-[460px]" : "min-h-[280px]"}`}>
    <div className="flex items-center gap-2"><Skeleton className="size-6 rounded-6" /><SkeletonLine className="w-32" /><Skeleton className="ml-auto h-8 w-20 rounded-8" /></div>
    <Skeleton className={tall ? "h-36" : "h-16"} />
    <div className="space-y-3">{Array.from({ length: rows }, (_, i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-9 rounded-8" /><div className="flex-1 space-y-2"><SkeletonLine className={i % 2 ? "w-3/4" : "w-1/2"} /><SkeletonLine className="w-1/3" /></div><Skeleton className="h-5 w-14 rounded-6" /></div>)}</div>
  </div>
);

export default function AppSkeleton() {
  return (
    <div aria-label="Loading workspace" aria-busy="true" className="flex min-h-screen max-w-[100vw] bg-bg">
      <SidebarSkeleton />
      <main className="w-full flex-1 lg:ml-[272px]">
        <header className="flex items-center gap-3 px-8 py-5 max-sm:px-4">
          <div className="min-w-0 flex-1 space-y-2"><SkeletonLine className="h-5 w-44" /><SkeletonLine className="w-72 max-sm:w-48" /></div>
          <Skeleton className="hidden size-8 rounded-full sm:block" /><Skeleton className="size-10 rounded-10" /><Skeleton className="hidden h-10 w-32 rounded-10 sm:block" />
        </header>
        <div className="grid grid-cols-1 gap-6 px-8 pb-8 max-[1024px]:px-5 max-sm:gap-4 max-sm:px-4 max-sm:pb-5 min-[821px]:grid-cols-2 min-[1201px]:grid-cols-[minmax(0,352px)_minmax(0,1fr)_minmax(0,1fr)]">
          <WidgetSkeleton tall /><WidgetSkeleton /><WidgetSkeleton /><WidgetSkeleton />
        </div>
      </main>
    </div>
  );
}
