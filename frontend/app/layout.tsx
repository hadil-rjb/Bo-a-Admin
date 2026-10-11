import "./globals.css";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", weight: ["400", "500", "600"] });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "Boğa — Growth Admin",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

// Thème appliqué avant l'hydratation (clé uxb.t, dark par défaut), comme l'original
const themeScript = `try{var t=JSON.parse(localStorage.getItem("uxb.t"));document.documentElement.setAttribute("data-theme",t||"dark")}catch(e){document.documentElement.setAttribute("data-theme","dark")}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${jakarta.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
