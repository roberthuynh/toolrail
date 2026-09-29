import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "toolrail",
  description: "State-driven WebMCP tool surfaces, and a checker that shows what an agent sees on your page.",
  metadataBase: new URL("https://webmcp.huynhrobert.com"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="brand" href="/">
            toolrail
          </Link>
          <nav aria-label="Primary">
            <Link href="/demo">Demo</Link>
            <Link href="/check">Checker</Link>
            <a href="https://www.npmjs.com/package/toolrail">npm</a>
            <a href="https://github.com/roberthuynh/toolrail">GitHub</a>
          </nav>
        </header>
        <main className="site-main">{children}</main>
        <footer className="site-footer">
          MIT. Extracted from <a href="https://boardspeak.vercel.app">Boardspeak</a>. Not affiliated with OpenAI or Google.
        </footer>
      </body>
    </html>
  );
}
