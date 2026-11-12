import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import type { ReactNode } from "react";

import "./styles.css";

const displayFont = Cormorant_Garamond({
  display: "swap",
  subsets: ["latin", "latin-ext"],
  variable: "--font-display-face",
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

const bodyFont = Jost({
  display: "swap",
  subsets: ["latin", "latin-ext"],
  variable: "--font-body-face",
});

export const metadata: Metadata = {
  title: "Sistema Cabelo",
  description: "Agenda, atendimentos e financeiro do salão.",
  appleWebApp: { capable: true, title: "Agenda", statusBarStyle: "default" },
};

// Keep in sync with --color-primary in styles.css, manifest.ts and icon.svg.
export const viewport: Viewport = {
  themeColor: "#74384b",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
