"use client";

import { useForm } from "react-hook-form";

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
    <main className="admin-page">
      <section className="card" aria-labelledby="admin-login-title">
        <h1 id="admin-login-title">Administração</h1>
        <p>{description}</p>
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
    </main>
  );
}
