import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/features/brand/brand-mark";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${brand.name} | Terapia capilar em ${brand.city}`,
  description: `${brand.role} em ${brand.city}. ${brand.tagline}.`,
};

function InstagramGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="home-cta-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect height="17" rx="5" stroke="currentColor" strokeWidth="1.8" width="17" x="3.5" y="3.5" />
      <circle cx="12" cy="12" r="3.9" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.1" cy="6.9" fill="currentColor" r="1.1" />
    </svg>
  );
}

function StrandsBackdrop() {
  return (
    <svg
      aria-hidden="true"
      className="home-hero-strands"
      fill="none"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 400 600"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M120 -20c160 90 160 190 20 290s-140 210 20 350" />
      <path d="M170 -20c160 90 160 190 20 290s-140 210 20 350" />
      <path d="M220 -20c160 90 160 190 20 290s-140 210 20 350" />
      <path d="M270 -20c160 90 160 190 20 290s-140 210 20 350" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="home">
      <header className="home-header">
        <span className="home-brand">
          <BrandMark className="home-brand-mark" />
          {brand.name}
        </span>
        <Link className="home-admin-link" href="/login">
          Área da profissional
        </Link>
      </header>

      <main className="home-main">
        <section aria-labelledby="home-title" className="home-hero">
          <StrandsBackdrop />
          <div className="home-hero-content">
            <p className="home-eyebrow">Terapia capilar · {brand.city}</p>
            <h1 id="home-title">{brand.name}</h1>
            <p className="home-role">{brand.role}</p>
            <p className="home-tagline">
              <span aria-hidden="true">“</span>
              {brand.tagline}
              <span aria-hidden="true">”</span>
            </p>
            <p className="home-intro">
              Um cuidado atento e sem pressa, do couro cabeludo às pontas, para quem quer fios
              bonitos e saudáveis de verdade.
            </p>
            <div className="home-actions">
              <a
                className="home-cta"
                href={brand.instagramUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <InstagramGlyph />
                Fale comigo no Instagram
              </a>
              <p className="home-cta-note">{brand.instagramHandle}</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="specialties-title" className="home-section">
          <p className="home-eyebrow">Especialidades</p>
          <h2 id="specialties-title">Cuidado que começa na raiz</h2>
          <ul className="home-specialties">
            <li className="home-specialty">
              <span className="home-specialty-index" aria-hidden="true">
                01
              </span>
              <h3>Terapia capilar</h3>
              <p>
                Um olhar cuidadoso para o couro cabeludo, a base de fios fortes e saudáveis. Cada
                etapa é feita com calma, respeitando o tempo e a história do seu cabelo.
              </p>
            </li>
            <li className="home-specialty">
              <span className="home-specialty-index" aria-hidden="true">
                02
              </span>
              <h3>
                Alisamento <span className="home-specialty-detail">Liso Supremo</span>
              </h3>
              <p>
                Especialista em alisamento, a Gabriela trabalha com o Liso Supremo para quem deseja
                fios lisos e alinhados, sem deixar a saúde do cabelo de lado.
              </p>
            </li>
          </ul>
        </section>

        <section aria-labelledby="visit-title" className="home-section home-visit">
          <p className="home-eyebrow">Atendimento</p>
          <h2 id="visit-title">Onde e quando</h2>
          <dl className="home-facts">
            <div>
              <dt>Cidade</dt>
              <dd>{brand.city}</dd>
            </div>
            <div>
              <dt>Dias</dt>
              <dd>{brand.serviceDays}</dd>
            </div>
            <div>
              <dt>Contato</dt>
              <dd>Pelo Instagram</dd>
            </div>
          </dl>
          <p className="home-note">
            Nos destaques do Instagram você conhece mais sobre a terapia, o studio e as clientes.
          </p>
        </section>

        <section aria-labelledby="closing-title" className="home-closing">
          <BrandMark className="home-closing-mark" />
          <h2 id="closing-title">Vamos cuidar do seu cabelo?</h2>
          <p>Mande uma mensagem para a Gabriela e tire suas dúvidas sobre os atendimentos.</p>
          <a
            className="home-cta home-cta-light"
            href={brand.instagramUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <InstagramGlyph />
            Abrir o Instagram
          </a>
        </section>
      </main>

      <footer className="home-footer">
        <p>
          <span>{brand.name}</span> · <span>{brand.role}</span> · <span>{brand.city}</span>
        </p>
      </footer>
    </div>
  );
}
