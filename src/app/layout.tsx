import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./polish.css";
import "./inventory-mode.css";

export const metadata: Metadata = { title: "Stein für Stein", description: "Deine LEGO-Sets, ihre Teile und die gemeinsame Fehlteileliste.", icons: { icon: "/icon.svg" }, manifest: "/manifest.webmanifest", appleWebApp: { capable: true, title: "Stein für Stein", statusBarStyle: "default" } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de">
      <head>
        {process.env.NODE_ENV === "development" && <Script src="https://unpkg.com/react-scan/dist/auto.global.js" crossOrigin="anonymous" strategy="beforeInteractive" />}
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
        <meta name="theme-color" content="#d92f2f" />
      </head><body>{children}</body></html>;
}
