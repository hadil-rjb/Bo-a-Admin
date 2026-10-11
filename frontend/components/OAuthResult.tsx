"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFeedback } from "./feedback";
import { useData } from "@/lib/data";

/** Le backend redirige vers /?connected=1 ou /?error=… après l'OAuth Google */
export default function OAuthResult() {
  const sp = useSearchParams(), router = useRouter();
  const { toast } = useFeedback();
  const { reload } = useData();
  useEffect(() => {
    const err = sp.get("error");
    if (sp.get("connected")) { toast("Search Console connected"); reload().finally(() => router.replace("/settings")); }
    else if (err) { toast(err); router.replace("/settings"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
