import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sistema Cabelo",
    short_name: "Agenda",
    description: "Agenda, atendimentos e financeiro do salão.",
    start_url: "/admin/agenda",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#6f2445",
    lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
