import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sistema Cabelo",
    short_name: "Agenda",
    description: "Agenda, atendimentos e financeiro do salão.",
    start_url: "/admin/agenda",
    scope: "/",
    display: "standalone",
    // Keep in sync with --color-background / --color-primary in styles.css.
    background_color: "#fbf7f3",
    theme_color: "#74384b",
    lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
