"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  businessHoursInputSchema,
  createDefaultBusinessHoursInput,
  type BusinessHours,
  type BusinessHoursInput,
} from "@/domain/business-hours/business-hours";
import { AdminLoginForm, type AdminLoginFields } from "@/features/admin-auth/admin-login-form";
import { getClientAuth } from "@/features/admin-services/firebase-client";

type Weekday = keyof BusinessHoursInput["weeklyHours"];

const weekdays: Array<{ key: Weekday; label: string }> = [
  { key: "monday", label: "Segunda-feira" },
  { key: "tuesday", label: "Terça-feira" },
  { key: "wednesday", label: "Quarta-feira" },
  { key: "thursday", label: "Quinta-feira" },
  { key: "friday", label: "Sexta-feira" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
];

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Não foi possível concluir a operação.";
}

export function BusinessHoursAdminPage() {
  const [token, setToken] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const businessHoursForm = useForm<BusinessHoursInput>({
    defaultValues: createDefaultBusinessHoursInput(),
  });
  const weeklyHours = useWatch({
    control: businessHoursForm.control,
    defaultValue: createDefaultBusinessHoursInput().weeklyHours,
    name: "weeklyHours",
  });

  async function loadBusinessHours(currentToken: string): Promise<BusinessHours> {
    const response = await fetch("/api/admin/business-hours", {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { businessHours: BusinessHours };
    return data.businessHours;
  }

  async function login(fields: AdminLoginFields) {
    setIsLoading(true);
    setMessage(undefined);
    let hasAuthenticated = false;

    try {
      const credential = await signInWithEmailAndPassword(
        getClientAuth(),
        fields.email,
        fields.password,
      );
      const currentToken = await credential.user.getIdToken(true);
      hasAuthenticated = true;
      const businessHours = await loadBusinessHours(currentToken);

      businessHoursForm.reset(businessHours);
      setToken(currentToken);
    } catch (error) {
      setMessage(
        hasAuthenticated && error instanceof Error
          ? error.message
          : "Não foi possível iniciar a sessão administrativa.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function submitBusinessHours(input: BusinessHoursInput) {
    if (!token) return;

    const validation = businessHoursInputSchema.safeParse(input);
    if (!validation.success) {
      setMessage(validation.error.issues[0]?.message ?? "Revise os horários informados.");
      return;
    }

    setIsLoading(true);
    setMessage(undefined);

    try {
      const response = await fetch("/api/admin/business-hours", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { businessHours: BusinessHours };

      businessHoursForm.reset(data.businessHours);
      setMessage("Expediente atualizado com sucesso.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível atualizar o expediente.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  if (!token) {
    return (
      <AdminLoginForm
        description="Entre para configurar o expediente semanal."
        isLoading={isLoading}
        message={message}
        onSubmit={login}
      />
    );
  }

  return (
    <main className="admin-page">
      <section className="card" aria-labelledby="business-hours-title">
        <nav className="admin-nav" aria-label="Administração">
          <a href="/admin/services">Gerenciar serviços</a>
        </nav>
        <h1 id="business-hours-title">Expediente</h1>
        <p>Defina os dias e horários em que a profissional atende.</p>
        <form onSubmit={businessHoursForm.handleSubmit(submitBusinessHours)}>
          <label>
            Intervalo entre atendimentos (minutos)
            <input
              type="number"
              min={0}
              step={1}
              required
              {...businessHoursForm.register("appointmentIntervalMinutes", {
                min: 0,
                valueAsNumber: true,
              })}
            />
          </label>

          <fieldset className="business-hours-days">
            <legend>Semana de atendimento</legend>
            {weekdays.map(({ key, label }) => {
              const isOpen = weeklyHours[key].isOpen;

              return (
                <fieldset className="business-hours-day" key={key}>
                  <legend>{label}</legend>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      {...businessHoursForm.register(`weeklyHours.${key}.isOpen`)}
                    />
                    Atende neste dia
                  </label>
                  <div className="business-hours-time">
                    <label>
                      Horário inicial
                      <input
                        type="time"
                        disabled={!isOpen}
                        required={isOpen}
                        {...businessHoursForm.register(`weeklyHours.${key}.startLocalTime`)}
                      />
                    </label>
                    <label>
                      Horário final
                      <input
                        type="time"
                        disabled={!isOpen}
                        required={isOpen}
                        {...businessHoursForm.register(`weeklyHours.${key}.endLocalTime`)}
                      />
                    </label>
                  </div>
                </fieldset>
              );
            })}
          </fieldset>

          <button disabled={isLoading} type="submit">
            {isLoading ? "Salvando…" : "Salvar expediente"}
          </button>
        </form>
        {message ? <p role="status">{message}</p> : null}
      </section>
    </main>
  );
}
