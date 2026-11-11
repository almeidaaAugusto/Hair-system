"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  businessHoursInputSchema,
  createDefaultBusinessHoursInput,
  type BusinessHours,
  type BusinessHoursInput,
} from "@/domain/business-hours/business-hours";
import { fetchAdmin } from "@/features/admin-auth/admin-api-client";
import { AdminNavigation } from "@/features/admin-auth/admin-navigation";

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
  const [message, setMessage] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const isFormDisabled = !hasLoaded || isLoading || isSaving;
  const businessHoursForm = useForm<BusinessHoursInput>({
    defaultValues: createDefaultBusinessHoursInput(),
  });
  const { reset: resetBusinessHours } = businessHoursForm;
  const weeklyHours = useWatch({
    control: businessHoursForm.control,
    defaultValue: createDefaultBusinessHoursInput().weeklyHours,
    name: "weeklyHours",
  });

  useEffect(() => {
    let isMounted = true;

    async function loadBusinessHours(): Promise<void> {
      setIsLoading(true);
      setMessage(undefined);
      try {
        const response = await fetchAdmin("/api/admin/business-hours");
        if (!response.ok) throw new Error(await readError(response));
        const data = (await response.json()) as { businessHours: BusinessHours };
        if (isMounted) {
          resetBusinessHours(data.businessHours);
          setHasLoaded(true);
        }
      } catch (error) {
        if (isMounted) {
          setMessage(
            error instanceof Error ? error.message : "Não foi possível carregar o expediente.",
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadBusinessHours();
    return () => {
      isMounted = false;
    };
  }, [loadAttempt, resetBusinessHours]);

  async function submitBusinessHours(input: BusinessHoursInput) {
    if (isFormDisabled) return;

    const validation = businessHoursInputSchema.safeParse(input);
    if (!validation.success) {
      setMessage(validation.error.issues[0]?.message ?? "Revise os horários informados.");
      return;
    }

    setIsSaving(true);
    setMessage(undefined);

    try {
      const response = await fetchAdmin("/api/admin/business-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { businessHours: BusinessHours };

      resetBusinessHours(data.businessHours);
      setMessage("Expediente atualizado com sucesso.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível atualizar o expediente.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="admin-page">
      <section className="card" aria-labelledby="business-hours-title">
        <AdminNavigation />
        <h1 id="business-hours-title">Expediente</h1>
        <p>Defina os dias e horários em que a profissional atende.</p>
        {isLoading ? <p role="status">Carregando expediente…</p> : null}
        {!isLoading && !hasLoaded ? (
          <button onClick={() => setLoadAttempt((attempt) => attempt + 1)} type="button">
            Tentar novamente
          </button>
        ) : null}
        <form
          aria-busy={isLoading || isSaving}
          onSubmit={businessHoursForm.handleSubmit(submitBusinessHours)}
        >
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
              disabled={isFormDisabled}
            />
          </label>

          <fieldset className="business-hours-days" disabled={isFormDisabled}>
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

          <button disabled={isFormDisabled} type="submit">
            {isSaving ? "Salvando…" : "Salvar expediente"}
          </button>
        </form>
        {message ? <p role="status">{message}</p> : null}
      </section>
    </main>
  );
}
