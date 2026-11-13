"use client";

import { useEffect, useState } from "react";

import type { Appointment } from "@/domain/appointments/appointment";
import { isReminderDue } from "@/domain/appointments/attendance";
import { fetchAdmin } from "@/features/admin-auth/admin-api-client";
import { UserMessageError, toUserMessage } from "@/features/shared/user-message";

import {
  addDays,
  formatLocalTime,
  formatShortDate,
  getAgendaErrorMessage,
} from "./agenda-calendar";
import { getMessageUrl } from "./agenda-messages";

type RemindersPanelProps = {
  today: string;
  reloadKey: number;
  onSend: (appointment: Appointment) => void;
};

type Loaded = { key: string; appointments?: Appointment[]; error?: string };

/**
 * Confirmed appointments starting within the next 24 hours whose reminder was
 * not registered yet (RF-COM-02). Sending opens WhatsApp with the text ready
 * and records the reminder, so it is not sent twice.
 */
export function RemindersPanel({ today, reloadKey, onSend }: RemindersPanelProps) {
  const requestKey = `${today}|${reloadKey}`;
  const [loaded, setLoaded] = useState<Loaded>();

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        const query = new URLSearchParams({ from: today, to: addDays(today, 1) });
        const response = await fetchAdmin(`/api/admin/appointments?${query}`);
        const body = await response.json().catch(() => null);
        if (!response.ok)
          throw new UserMessageError(
            getAgendaErrorMessage(body, "Não foi possível carregar os lembretes."),
          );
        if (isMounted)
          setLoaded({
            key: requestKey,
            appointments: (body as { appointments: Appointment[] }).appointments,
          });
      } catch (error) {
        if (isMounted)
          setLoaded({
            key: requestKey,
            error: toUserMessage(error, "Não foi possível carregar os lembretes."),
          });
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [today, requestKey]);

  // Keep the previous list while refreshing, so the panel does not flicker.
  if (!loaded) return null;
  if (loaded.error)
    return (
      <p className="agenda-hint" role="status">
        Lembretes: {loaded.error}
      </p>
    );
  const now = new Date().toISOString();
  const due = (loaded.appointments ?? []).filter((appointment) => isReminderDue(appointment, now));

  return (
    <section aria-labelledby="reminders-title" className="reminders-panel">
      <h2 id="reminders-title">Lembretes das próximas 24 horas</h2>
      {due.length === 0 ? (
        <p className="agenda-hint">Nenhum lembrete pendente.</p>
      ) : (
        <ul>
          {due.map((appointment) => (
            <li key={appointment.id}>
              <span>
                <strong>
                  {formatShortDate(appointment.localDate)} {formatLocalTime(appointment.startAt)}
                </strong>{" "}
                {appointment.client.name} · {appointment.serviceSnapshot.name}
              </span>
              <a
                className="button-link"
                href={getMessageUrl("reminder", appointment)}
                onClick={() => onSend(appointment)}
                rel="noopener noreferrer"
                target="_blank"
              >
                Enviar lembrete
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
