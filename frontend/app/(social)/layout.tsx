import type { Metadata } from "next";

/* Social Media workspace. Shares the root layout and stylesheet with the Blog Admin; its styles are
   scoped by <html data-ws="social"> (see styles/studio.css), so switching workspaces is a normal
   client-side navigation. */
export const metadata: Metadata = {
  title: "Boğa — Social Media Admin · Studio demo",
  icons: { icon: "/social-icon.png" },
};

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return children;
}
