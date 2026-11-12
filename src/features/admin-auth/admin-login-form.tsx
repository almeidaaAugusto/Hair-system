"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";

import { BrandMark } from "@/features/brand/brand-mark";
import { brand } from "@/lib/brand";

export type AdminLoginFields = { email: string; password: string };

type AdminLoginFormProps = {
  description: string;
  isLoading: boolean;
  message?: string;
  onSubmit(fields: AdminLoginFields): Promise<void>;
};

export function AdminLoginForm({ description, isLoading, message, onSubmit }: AdminLoginFormProps) {
  const loginForm = useForm<AdminLoginFields>();

  return (
    <main className="admin-page login-page">
      <section className="card login-card" aria-labelledby="admin-login-title">
        <p className="login-brand">
          <BrandMark className="login-brand-mark" />
          {brand.name}
        </p>
        <h1 id="admin-login-title">Administração</h1>
        <p className="login-description">{description}</p>
        <form aria-busy={isLoading} onSubmit={loginForm.handleSubmit(onSubmit)}>
          <label htmlFor="admin-email">
            E-mail
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              required
              {...loginForm.register("email")}
            />
          </label>
          <label htmlFor="admin-password">
            Senha
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              {...loginForm.register("password")}
            />
          </label>
          <button disabled={isLoading} type="submit">
            {isLoading ? "Entrando…" : "Entrar"}
          </button>
        </form>
        {message ? (
          <p className="admin-status" role="alert">
            {message}
          </p>
        ) : null}
      </section>
      <Link className="login-back" href="/">
        Voltar para a página inicial
      </Link>
    </main>
  );
}
