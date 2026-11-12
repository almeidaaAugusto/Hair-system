import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./styles.css";

export const metadata: Metadata = {
  title: "Sistema Cabelo",
  description: "Agenda, atendimentos e financeiro do salão.",
  appleWebApp: { capable: true, title: "Agenda", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#6f2445",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
