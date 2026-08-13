"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import { useForm } from "react-hook-form";

import type { CreateServiceInput, Service } from "@/domain/services/service";
import { getClientAuth } from "@/features/admin-services/firebase-client";

type LoginFields = { email: string; password: string };

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Não foi possível concluir a operação.";
}

export function ServicesAdminPage() {
  const [token, setToken] = useState<string>();
  const [services, setServices] = useState<Service[]>([]);
  const [message, setMessage] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const loginForm = useForm<LoginFields>();
  const serviceForm = useForm<CreateServiceInput>({
    defaultValues: {
      durationMinutes: 60,
      startingPriceCents: 0,
      hasVariablePrice: false,
      requiresEvaluation: false,
      isActive: true,
    },
  });

  async function loadServices(currentToken: string) {
    const response = await fetch("/api/admin/services", {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { services: Service[] };
    setServices(data.services);
  }

  async function login(fields: LoginFields) {
    setIsLoading(true);
    setMessage(undefined);
    try {
      const credential = await signInWithEmailAndPassword(
        getClientAuth(),
        fields.email,
        fields.password,
      );
      const currentToken = await credential.user.getIdToken();
      setToken(currentToken);
      await loadServices(currentToken);
    } catch {
      setMessage("Não foi possível iniciar a sessão administrativa.");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitService(fields: CreateServiceInput) {
    if (!token) return;
    setIsLoading(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/admin/services", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { service: Service };
      setServices((current) =>
        [...current, data.service].sort((a, b) => a.name.localeCompare(b.name)),
      );
      serviceForm.reset({ ...serviceForm.formState.defaultValues, name: "" });
      setMessage("Serviço cadastrado com sucesso.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível cadastrar o serviço.");
    } finally {
      setIsLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="admin-page">
        <section className="card" aria-labelledby="admin-login-title">
          <h1 id="admin-login-title">Administração</h1>
          <p>Entre para cadastrar e consultar serviços.</p>
          <form onSubmit={loginForm.handleSubmit(login)}>
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

  return (
    <main className="admin-page">
      <section className="card" aria-labelledby="services-title">
        <h1 id="services-title">Serviços</h1>
        <form onSubmit={serviceForm.handleSubmit(submitService)}>
          <label>
            Nome
            <input required maxLength={120} {...serviceForm.register("name", { required: true })} />
          </label>
          <label>
            Duração (minutos)
            <input
              type="number"
              min={1}
              max={1440}
              required
              {...serviceForm.register("durationMinutes", { valueAsNumber: true })}
            />
          </label>
          <label>
            Preço inicial (centavos)
            <input
              type="number"
              min={0}
              required
              {...serviceForm.register("startingPriceCents", { valueAsNumber: true })}
            />
          </label>
          <label>
            <input type="checkbox" {...serviceForm.register("hasVariablePrice")} /> Preço variável
          </label>
          <label>
            <input type="checkbox" {...serviceForm.register("requiresEvaluation")} /> Exige
            avaliação
          </label>
          <label>
            <input type="checkbox" {...serviceForm.register("isActive")} /> Serviço ativo
          </label>
          <button disabled={isLoading} type="submit">
            {isLoading ? "Salvando…" : "Cadastrar serviço"}
          </button>
        </form>
        {message ? <p role="status">{message}</p> : null}
        <h2>Serviços cadastrados</h2>
        {services.length === 0 ? (
          <p>Nenhum serviço cadastrado.</p>
        ) : (
          <ul>
            {services.map((service) => (
              <li key={service.id}>
                {service.name} — {service.durationMinutes} min —{" "}
                {service.isActive ? "Ativo" : "Inativo"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
