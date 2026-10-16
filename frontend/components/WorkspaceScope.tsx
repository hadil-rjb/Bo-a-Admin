"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import { applyWorkspace, workspaceOf } from "@/lib/workspace";

/** Keeps <html data-ws> in sync with client-side navigation, in the same commit as the new page. */
export default function WorkspaceScope() {
  const pathname = usePathname();
  useLayoutEffect(() => applyWorkspace(workspaceOf(pathname)), [pathname]);
  return null;
}
