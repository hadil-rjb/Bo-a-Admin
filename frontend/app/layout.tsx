import "./globals.css";
import type { Metadata } from "next";
import WorkspaceScope from "@/components/WorkspaceScope";
import { BOOT_SCRIPT } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Boğa — Growth Admin",
  icons: { icon: "/logo.png", shortcut: "/logo.png", apple: "/logo.png" },
};

/** One font set for every workspace: the admin UI (Inter, Plus Jakarta Sans) and the studio's post fonts.
 *  A plain stylesheet link on purpose: the studio inlines it when exporting designs as PNG. */
const FONTS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700&family=Poppins:wght@300;400;500;600;700&family=Cairo:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Tajawal:wght@400;500;700&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-theme="dark" data-ws="blog" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href={FONTS} rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        <WorkspaceScope />
        {children}
      </body>
    </html>
  );
}
