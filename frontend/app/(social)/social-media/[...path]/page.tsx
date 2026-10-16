import { redirect } from "next/navigation";

/** /social-media/planner → /social-media#/planner (the studio routes with the URL hash). */
export default async function SocialMediaPath({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  redirect("/social-media#/" + path.map(encodeURIComponent).join("/"));
}
