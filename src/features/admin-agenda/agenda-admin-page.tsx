"use client";

import { useEffect, useRef, useState } from "react";

import type { Appointment, TimeBlock } from "@/domain/appointments/appointment";
import { fetchAdmin } from "@/features/admin-auth/admin-api-client";
import { UserMessageError, toUserMessage } from "@/features/shared/user-message";
import { AdminNavigation } from "@/features/admin-auth/admin-navigation";
import { formatBrazilianReal } from "@/features/admin-services/money";

import {
  formatAgendaTitle,
  formatLocalTime,
  formatPhone,
  formatShortDate,
  getAgendaErrorMessage,
  getAgendaRange,
  getTodayLocalDate,
  getWhatsAppUrl,
  groupByLocalDate,
  listDates,
  shiftAgendaDate,
  type AgendaView,
} from "./agenda-calendar";
import { getPaymentStatus, isReminderDue } from "@/domain/appointments/attendance";

import { appointmentStatusLabels, describePayment, isAppointmentStarted } from "./agenda-finance";
import { exceptionLabels, getAppointmentExceptions } from "./booking-exceptions";
import { DAY_CHECK_INTERVAL_MS, advanceDay } from "./day-tracking";
import { AppointmentForm, AttendanceForm, BlockForm, RescheduleForm } from "./agenda-forms";
import { getMessageUrl } from "./agenda-messages";
import { RemindersPanel } from "./reminders-panel";
import { FinancialSummaryPanel } from "./financial-summary";

type AgendaData = { appointments: Appointment[]; timeBlocks: TimeBlock[] };
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AgendaData };
type Panel = "appointment" | "block" | undefined;

const viewLabels: Record<AgendaView, string> = { day: "Dia", week: "Semana", month: "Mês" };

function isVisible(record: Appointment | TimeBlock, showCancelled: boolean): boolean {
  return showCancelled || record.status !== "cancelled";
}

type DayAgendaProps = {
  appointments: Appointment[];
  timeBlocks: TimeBlock[];
  busyId?: string;
  onCancelAppointment: (appointment: Appointment) => void;
  onCancelBlock: (block: TimeBlock) => void;
  onNoShow: (appointment: Appointment) => void;
  onAttendanceSaved: (appointment: Appointment, mode: "complete" | "payment") => void;
  onRescheduled: (appointment: Appointment) => void;
  onReminderSent: (appointment: Appointment) => void;
  onClientConfirmed: (appointment: Appointment) => void;
};

function DayAgenda({
  appointments,
  timeBlocks,
  busyId,
  onCancelAppointment,
  onCancelBlock,
  onNoShow,
  onAttendanceSaved,
  onRescheduled,
  onReminderSent,
  onClientConfirmed,
}: DayAgendaProps) {
  const [panel, setPanel] = useState<{
    id: string;
    mode: "complete" | "payment" | "reschedule";
  }>();
  const entries = [
    ...appointments.map((record) => ({ kind: "appointment" as const, record })),
    ...timeBlocks.map((record) => ({ kind: "block" as const, record })),
  ].sort((a, b) => a.record.startAt.localeCompare(b.record.startAt));

  if (entries.length === 0) return <p className="agenda-empty">Nenhum atendimento neste dia.</p>;

  return (
    <ul className="agenda-list">
      {entries.map((entry) => {
        const cancelled = entry.record.status === "cancelled";
        if (entry.kind === "block") {
          const block = entry.record;
          return (
            <li
              className={`agenda-item agenda-block${cancelled ? " is-cancelled" : ""}`}
              key={block.id}
            >
              <div>
                <p className="agenda-time">
                  {formatLocalTime(block.startAt)}–{formatLocalTime(block.endAt)}
                </p>
                <h3>Horário bloqueado</h3>
                {block.reason ? <p>{block.reason}</p> : null}
                {cancelled ? <span className="agenda-badge">Bloqueio cancelado</span> : null}
              </div>
              {!cancelled ? (
                <div className="service-item-actions">
                  <button
                    className="secondary-button"
                    disabled={busyId === block.id}
                    onClick={() => onCancelBlock(block)}
                    type="button"
                  >
                    {busyId === block.id ? "Liberando…" : "Liberar horário"}
                  </button>
                </div>
              ) : null}
            </li>
          );
        }
        const appointment = entry.record;
        const service = appointment.serviceSnapshot;
        const status = appointment.status;
        const confirmed = status === "confirmed";
        const started = isAppointmentStarted(appointment);
        const payment = describePayment(appointment);
        const editing = panel?.id === appointment.id ? panel.mode : undefined;
        const busy = busyId === appointment.id;
        const reminderDue = isReminderDue(appointment, new Date().toISOString());
        return (
          <li
            className={`agenda-item agenda-item-${status.replace("_", "-")}${cancelled ? " is-cancelled" : ""}`}
            key={appointment.id}
          >
            <div className="agenda-item-main">
              <div>
                <p className="agenda-time">
                  {formatLocalTime(appointment.startAt)}–{formatLocalTime(appointment.endAt)}
                </p>
                <h3>{appointment.client.name}</h3>
                <p>
                  {service.name} · {service.durationMinutes} min ·{" "}
                  {service.hasVariablePrice ? "a partir de " : ""}
                  {formatBrazilianReal(service.startingPriceCents)}
                </p>
                <p className="agenda-hint">
                  {formatPhone(appointment.client.phone)} ·{" "}
                  {appointment.source === "whatsapp" ? "WhatsApp" : "Manual"} · livre às{" "}
                  {formatLocalTime(appointment.occupiedUntilAt)}
                </p>
                <div className="service-indicators">
                  <span className={`agenda-badge status-${status.replace("_", "-")}`}>
                    {appointmentStatusLabels[status]}
                  </span>
                  {payment ? (
                    <span
                      className={`agenda-badge payment-${getPaymentStatus(appointment).replace("_", "-")}`}
                    >
                      {payment}
                    </span>
                  ) : null}
                  {getAppointmentExceptions(appointment).map((exception) => (
                    <span className="agenda-badge payment-not-recorded" key={exception}>
                      {exceptionLabels[exception]}
                    </span>
                  ))}
                  {reminderDue ? (
                    <span className="agenda-badge payment-not-recorded">Lembrete pendente</span>
                  ) : null}
                  {appointment.reminderSentAt ? (
                    <span className="agenda-badge">
                      Lembrete enviado{" "}
                      {formatShortDate(getTodayLocalDate(new Date(appointment.reminderSentAt)))} às{" "}
                      {formatLocalTime(appointment.reminderSentAt)}
                    </span>
                  ) : null}
                  {appointment.clientConfirmedAt ? (
                    <span className="agenda-badge payment-paid">Presença confirmada</span>
                  ) : null}
                </div>
              </div>
              {!editing ? (
                <div className="service-item-actions">
                  {confirmed && started ? (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => setPanel({ id: appointment.id, mode: "complete" })}
                        type="button"
                      >
                        Concluir
                      </button>
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => onNoShow(appointment)}
                        type="button"
                      >
                        Faltou
                      </button>
                    </>
                  ) : null}
                  {status === "completed" ? (
                    <button
                      className={appointment.payment ? "secondary-button" : undefined}
                      onClick={() => setPanel({ id: appointment.id, mode: "payment" })}
                      type="button"
                    >
                      {appointment.payment ? "Editar pagamento" : "Registrar pagamento"}
                    </button>
                  ) : null}
                  {confirmed && !started ? (
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => setPanel({ id: appointment.id, mode: "reschedule" })}
                      type="button"
                    >
                      Reagendar
                    </button>
                  ) : null}
                  {confirmed && !appointment.clientConfirmedAt && !started ? (
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => onClientConfirmed(appointment)}
                      type="button"
                    >
                      Cliente confirmou
                    </button>
                  ) : null}
                  {confirmed ? (
                    <button
                      className="danger-button"
                      disabled={busy}
                      onClick={() => onCancelAppointment(appointment)}
                      type="button"
                    >
                      {busy ? "Salvando…" : "Cancelar"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div
              aria-label={`Mensagens para ${appointment.client.name}`}
              className="agenda-messages"
              role="group"
            >
              <span className="agenda-hint">WhatsApp:</span>
              {confirmed && !started ? (
                <a
                  className="link-button"
                  href={getMessageUrl("confirmation", appointment)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Confirmação
                </a>
              ) : null}
              {confirmed && !started ? (
                <a
                  className="link-button"
                  href={getMessageUrl("reminder", appointment)}
                  onClick={() => {
                    if (!appointment.reminderSentAt) onReminderSent(appointment);
                  }}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {appointment.reminderSentAt ? "Lembrete (de novo)" : "Enviar lembrete"}
                </a>
              ) : null}
              {status === "completed" ? (
                <a
                  className="link-button"
                  href={getMessageUrl("post-service", appointment)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Pós-atendimento
                </a>
              ) : null}
              <a
                className="link-button"
                href={getWhatsAppUrl(appointment.client.phone)}
                rel="noopener noreferrer"
                target="_blank"
              >
                Abrir conversa
              </a>
            </div>
            {editing === "reschedule" ? (
              <RescheduleForm
                appointment={appointment}
                onCancel={() => setPanel(undefined)}
                onSaved={(saved) => {
                  setPanel(undefined);
                  onRescheduled(saved);
                }}
              />
            ) : null}
            {editing === "complete" || editing === "payment" ? (
              <AttendanceForm
                appointment={appointment}
                mode={editing}
                onCancel={() => setPanel(undefined)}
                onSaved={(saved) => {
                  setPanel(undefined);
                  onAttendanceSaved(saved, editing);
                }}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

type RangeAgendaProps = {
  dates: string[];
  anchorDate: string;
  today: string;
  appointmentsByDate: Map<string, Appointment[]>;
  blocksByDate: Map<string, TimeBlock[]>;
  onOpenDay: (date: string) => void;
};

function WeekAgenda({
  dates,
  today,
  appointmentsByDate,
  blocksByDate,
  onOpenDay,
}: RangeAgendaProps) {
  return (
    <div className="agenda-week">
      {dates.map((date) => {
        const appointments = appointmentsByDate.get(date) ?? [];
        const blocks = blocksByDate.get(date) ?? [];
        return (
          <section aria-label={formatShortDate(date)} className="agenda-week-day" key={date}>
            <button
              aria-current={date === today ? "date" : undefined}
              className="agenda-day-link"
              onClick={() => onOpenDay(date)}
              type="button"
            >
              {formatShortDate(date)}
            </button>
            {appointments.length === 0 && blocks.length === 0 ? (
              <p className="agenda-hint">Livre</p>
            ) : (
              <ul>
                {[...appointments, ...blocks]
                  .sort((a, b) => a.startAt.localeCompare(b.startAt))
                  .map((record) => (
                    <li
                      className={record.status === "cancelled" ? "is-cancelled" : undefined}
                      key={record.id}
                    >
                      <strong>{formatLocalTime(record.startAt)}</strong>{" "}
                      {"client" in record
                        ? `${record.client.name} · ${record.serviceSnapshot.name}`
                        : (record.reason ?? "Bloqueado")}
                      {record.status === "completed" ? " · concluído" : null}
                      {record.status === "no_show" ? " · faltou" : null}
                    </li>
                  ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

const weekdayHeaders = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function MonthAgenda({
  dates,
  anchorDate,
  today,
  appointmentsByDate,
  blocksByDate,
  onOpenDay,
}: RangeAgendaProps) {
  const month = anchorDate.slice(0, 7);
  return (
    <div className="agenda-month" role="grid">
      <div className="agenda-month-row" role="row">
        {weekdayHeaders.map((weekday) => (
          <div className="agenda-month-header" key={weekday} role="columnheader">
            {weekday}
          </div>
        ))}
      </div>
      {Array.from({ length: dates.length / 7 }, (_, week) => (
        <div className="agenda-month-row" key={week} role="row">
          {dates.slice(week * 7, week * 7 + 7).map((date) => {
            const appointments = appointmentsByDate.get(date)?.length ?? 0;
            const blocks = blocksByDate.get(date)?.length ?? 0;
            return (
              <div key={date} role="gridcell">
                <button
                  aria-current={date === today ? "date" : undefined}
                  aria-label={`${formatShortDate(date)}: ${appointments} atendimento(s), ${blocks} bloqueio(s)`}
                  className={`agenda-month-day${date.startsWith(month) ? "" : " is-outside"}`}
                  onClick={() => onOpenDay(date)}
                  type="button"
                >
                  <span className="agenda-month-number">{Number(date.slice(8))}</span>
                  {appointments > 0 ? (
                    <span className="agenda-count">
                      {appointments}
                      <span className="agenda-count-label"> atend.</span>
                    </span>
                  ) : null}
                  {blocks > 0 ? (
                    <span className="agenda-count is-block">
                      {blocks}
                      <span className="agenda-count-label"> bloq.</span>
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function AgendaAdminPage() {
  const [day, setDay] = useState(() => {
    const current = getTodayLocalDate();
    return { today: current, selectedDate: current };
  });
  const { today, selectedDate: date } = day;
  const [view, setView] = useState<AgendaView>("day");
  const busyRef = useRef(false);
  function setDate(selected: string) {
    setDay((previous) => ({ ...previous, selectedDate: selected }));
  }

  // The installed app can stay open for days: re-read "today" when she comes
  // back to it and periodically, so the day (and the 24h reminders) never go stale.
  useEffect(() => {
    const syncDay = () => setDay((previous) => advanceDay(previous, getTodayLocalDate()));
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncDay();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", syncDay);
    const timer = window.setInterval(syncDay, DAY_CHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", syncDay);
      window.clearInterval(timer);
    };
  }, []);
  const [reloadKey, setReloadKey] = useState(0);
  const [panel, setPanel] = useState<Panel>();
  const [message, setMessage] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [showCancelled, setShowCancelled] = useState(false);
  const { from, to } = getAgendaRange(view, date);
  const range = { from, to };
  // Results are tagged with the request they answer; anything else is still loading.
  const rangeKey = `${from}|${to}`;
  const requestKey = `${rangeKey}|${reloadKey}`;
  const [loaded, setLoaded] = useState<{ key: string; rangeKey: string; state: LoadState }>();
  // A reload of the same period keeps the current list on screen (and any open
  // form); only a new period starts from the loading state.
  const isRefreshing =
    loaded?.key !== requestKey && loaded?.rangeKey === rangeKey && loaded.state.status === "ready";
  const state: LoadState =
    loaded?.key === requestKey || isRefreshing ? loaded!.state : { status: "loading" };

  useEffect(() => {
    let isMounted = true;
    const setState = (next: LoadState) => {
      if (isMounted) setLoaded({ key: requestKey, rangeKey, state: next });
    };
    void (async () => {
      try {
        const query = new URLSearchParams({ from, to });
        const response = await fetchAdmin(`/api/admin/appointments?${query}`);
        if (!response.ok)
          throw new UserMessageError(
            getAgendaErrorMessage(
              await response.json().catch(() => null),
              "Não foi possível carregar a agenda.",
            ),
          );
        const data = (await response.json()) as AgendaData;
        setState({ status: "ready", data });
      } catch (error) {
        setState({
          status: "error",
          message: toUserMessage(error, "Não foi possível carregar a agenda."),
        });
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [from, to, rangeKey, requestKey]);

  function reload() {
    setReloadKey((key) => key + 1);
  }

  function openDay(selected: string) {
    setDate(selected);
    setView("day");
  }

  async function runAction(url: string, id: string, success: string, confirmation?: string) {
    if (busyRef.current) return;
    if (confirmation && !window.confirm(confirmation)) return;
    busyRef.current = true;
    setBusyId(id);
    setMessage(undefined);
    try {
      const response = await fetchAdmin(url, { method: "POST" });
      if (!response.ok)
        throw new UserMessageError(
          getAgendaErrorMessage(
            await response.json().catch(() => null),
            "Não foi possível concluir a operação.",
          ),
        );
      setMessage(success);
      reload();
    } catch (error) {
      setMessage(toUserMessage(error, "Não foi possível concluir a operação."));
    } finally {
      busyRef.current = false;
      setBusyId(undefined);
    }
  }

  const data = state.status === "ready" ? state.data : undefined;
  const appointments =
    data?.appointments.filter((record) => isVisible(record, showCancelled)) ?? [];
  const timeBlocks = data?.timeBlocks.filter((record) => isVisible(record, showCancelled)) ?? [];
  const appointmentsByDate = groupByLocalDate(appointments);
  const blocksByDate = groupByLocalDate(timeBlocks);
  const rangeProps = {
    dates: listDates(range),
    anchorDate: date,
    today,
    appointmentsByDate,
    blocksByDate,
    onOpenDay: openDay,
  };

  return (
    <main className="admin-page">
      <section aria-labelledby="agenda-title" className="card agenda-card">
        <AdminNavigation />
        <div className="services-heading">
          <div>
            <h1 id="agenda-title">Agenda</h1>
            <p>Atendimentos e bloqueios no horário de Brasília.</p>
          </div>
          {!panel ? (
            <div className="service-item-actions">
              <button onClick={() => setPanel("appointment")} type="button">
                Novo agendamento
              </button>
              <button className="secondary-button" onClick={() => setPanel("block")} type="button">
                Bloquear horário
              </button>
            </div>
          ) : null}
        </div>

        {message ? (
          <p aria-live="polite" role="status">
            {message}
          </p>
        ) : null}

        {panel === "appointment" ? (
          <AppointmentForm
            defaultDate={date}
            onCancel={() => setPanel(undefined)}
            onCreated={(appointment) => {
              setPanel(undefined);
              setMessage(
                `Agendamento confirmado: ${appointment.client.name}, ${formatShortDate(appointment.localDate)} às ${formatLocalTime(appointment.startAt)}.`,
              );
              setDate(appointment.localDate);
              reload();
            }}
          />
        ) : null}
        {panel === "block" ? (
          <BlockForm
            defaultDate={date}
            onCancel={() => setPanel(undefined)}
            onCreated={(block) => {
              setPanel(undefined);
              setMessage(`Horário bloqueado em ${formatShortDate(block.localDate)}.`);
              setDate(block.localDate);
              reload();
            }}
          />
        ) : null}

        <RemindersPanel
          onSend={(appointment) =>
            runAction(
              `/api/admin/appointments/${encodeURIComponent(appointment.id)}/reminder-sent`,
              appointment.id,
              `Lembrete de ${appointment.client.name} registrado como enviado.`,
            )
          }
          reloadKey={reloadKey}
          today={today}
        />

        <div className="agenda-toolbar">
          <div aria-label="Visualização" className="agenda-views" role="group">
            {(Object.keys(viewLabels) as AgendaView[]).map((option) => (
              <button
                aria-pressed={view === option}
                className={view === option ? undefined : "secondary-button"}
                key={option}
                onClick={() => setView(option)}
                type="button"
              >
                {viewLabels[option]}
              </button>
            ))}
          </div>
          <div aria-label="Navegação de datas" className="agenda-nav" role="group">
            <button
              aria-label="Período anterior"
              className="secondary-button"
              onClick={() => setDate(shiftAgendaDate(view, date, -1))}
              type="button"
            >
              ‹
            </button>
            <button className="secondary-button" onClick={() => setDate(today)} type="button">
              Hoje
            </button>
            <button
              aria-label="Próximo período"
              className="secondary-button"
              onClick={() => setDate(shiftAgendaDate(view, date, 1))}
              type="button"
            >
              ›
            </button>
            <label className="agenda-date-picker">
              <span className="visually-hidden">Ir para a data</span>
              <input
                onChange={(event) => {
                  if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setDate(event.target.value);
                }}
                type="date"
                value={date}
              />
            </label>
          </div>
        </div>

        <div className="agenda-period">
          <h2>{formatAgendaTitle(view, date)}</h2>
          <label className="checkbox-label">
            <input
              checked={showCancelled}
              onChange={(event) => setShowCancelled(event.target.checked)}
              type="checkbox"
            />{" "}
            Mostrar cancelados
          </label>
        </div>

        {state.status === "loading" ? <p role="status">Carregando agenda…</p> : null}
        {isRefreshing ? (
          <p className="agenda-hint" role="status">
            Atualizando…
          </p>
        ) : null}
        {state.status === "error" ? (
          <div className="agenda-error" role="alert">
            <p>{state.message}</p>
            <button className="secondary-button" onClick={reload} type="button">
              Tentar novamente
            </button>
          </div>
        ) : null}
        {state.status === "ready" && view === "day" ? (
          <DayAgenda
            appointments={appointments}
            busyId={busyId}
            onCancelAppointment={(appointment) =>
              runAction(
                `/api/admin/appointments/${encodeURIComponent(appointment.id)}/cancel`,
                appointment.id,
                "Atendimento cancelado. O horário foi liberado.",
                `Cancelar o atendimento de ${appointment.client.name} às ${formatLocalTime(appointment.startAt)}? O horário volta a ficar disponível.`,
              )
            }
            onCancelBlock={(block) =>
              runAction(
                `/api/admin/time-blocks/${encodeURIComponent(block.id)}/cancel`,
                block.id,
                "Bloqueio removido. O horário foi liberado.",
                `Liberar o bloqueio das ${formatLocalTime(block.startAt)}?`,
              )
            }
            onNoShow={(appointment) =>
              runAction(
                `/api/admin/appointments/${encodeURIComponent(appointment.id)}/no-show`,
                appointment.id,
                "Falta registrada.",
                `Registrar que ${appointment.client.name} faltou ao atendimento das ${formatLocalTime(appointment.startAt)}? O registro fica no histórico e não entra no total recebido.`,
              )
            }
            onRescheduled={(appointment) => {
              setMessage(
                `${appointment.client.name} reagendada para ${formatShortDate(appointment.localDate)} às ${formatLocalTime(appointment.startAt)}.`,
              );
              setDate(appointment.localDate);
              reload();
            }}
            onReminderSent={(appointment) =>
              runAction(
                `/api/admin/appointments/${encodeURIComponent(appointment.id)}/reminder-sent`,
                appointment.id,
                `Lembrete de ${appointment.client.name} registrado como enviado.`,
              )
            }
            onClientConfirmed={(appointment) =>
              runAction(
                `/api/admin/appointments/${encodeURIComponent(appointment.id)}/client-confirmation`,
                appointment.id,
                `Presença de ${appointment.client.name} confirmada.`,
              )
            }
            onAttendanceSaved={(appointment, mode) => {
              setMessage(
                mode === "complete"
                  ? `Atendimento de ${appointment.client.name} concluído.`
                  : `Pagamento de ${appointment.client.name} registrado.`,
              );
              reload();
            }}
            timeBlocks={timeBlocks}
          />
        ) : null}
        {state.status === "ready" && view === "week" ? <WeekAgenda {...rangeProps} /> : null}
        {state.status === "ready" && view === "month" ? <MonthAgenda {...rangeProps} /> : null}
        {state.status === "ready" ? (
          <FinancialSummaryPanel
            appointments={
              view === "month"
                ? state.data.appointments.filter((record) =>
                    record.localDate.startsWith(date.slice(0, 7)),
                  )
                : state.data.appointments
            }
            periodLabel={view === "day" ? "no dia" : view === "week" ? "na semana" : "no mês"}
          />
        ) : null}
      </section>
    </main>
  );
}
