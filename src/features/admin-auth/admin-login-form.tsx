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
        <form onSubmit={loginForm.handleSubmit(onSubmit)}>
          <label>
            E-mail
            <input type="email" autoComplete="email" required {...loginForm.register("email")} />
          </label>
          <label>
            Senha
            <input
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
        {message ? <p role="alert">{message}</p> : null}
      </section>
    </main>
  );
}
